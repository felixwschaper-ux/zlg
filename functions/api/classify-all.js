// POST /api/classify-all
// One-shot: re-classify every lead that has a stored inbound message.
// Skips leads with no inbound. Skips if ANTHROPIC_API_KEY isn't set.
// Returns a per-lead summary.

const cors = { 'Access-Control-Allow-Origin': '*' };

const STATUSES = new Set([
  'Yes', 'No', 'No (§76 exception possible)', 'Follow-up question',
  'Unclear', 'Auto-reply', 'Forwarded', '(no reply)',
]);

const SYSTEM_PROMPT = `You classify replies from German vehicle registration offices (Zulassungsstellen) regarding whether a self-employed transfer driver — without a vehicle dealership in their trade registration (kein Kfz-Handel) — would be issued a red dealer plate (rotes Dauerkennzeichen).

Pick exactly ONE status from this list:
- "Yes" — office would issue the plate
- "No" — clear refusal (typical: cites §41 FZV, says only Kfz-Händler/Werkstatt/Hersteller qualify)
- "No (§76 exception possible)" — refusal under §41 BUT mentions §76 FZV exception possible via state authority
- "Follow-up question" — office asks for more info before deciding (location, business address, etc.)
- "Unclear" — generic info, link to website, standard document list, no case-specific stance
- "Auto-reply" — automated receipt confirmation, no human content
- "Forwarded" — email forwarded to a colleague/other office
- "(no reply)" — no actual reply content

Output STRICT JSON: {"status": "<one of the above>", "reason": "<one short sentence in English>"}. No other text.`;

async function classifyOne(env, leadId, conversation) {
  const transcript = conversation.map(m =>
    `[${(m.direction || 'unknown').toUpperCase()} · ${m.channel || ''} · ${m.date || ''}]\n${m.subject ? 'Subject: ' + m.subject + '\n' : ''}${m.body || ''}`
  ).join('\n\n---\n\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'Conversation:\n\n' + transcript }],
    }),
  });
  const data = await r.json();
  if (!r.ok) return { ok: false, error: data };
  const text = data.content?.[0]?.text || '';
  let parsed;
  try { parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text); }
  catch { return { ok: false, error: 'parse failed: ' + text.slice(0, 200) }; }
  if (!STATUSES.has(parsed.status))
    return { ok: false, error: 'invalid status: ' + parsed.status };
  return { ok: true, status: parsed.status, reason: parsed.reason || '' };
}

export const onRequestPost = async ({ env }) => {
  if (!env.ANTHROPIC_API_KEY)
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500, headers: cors });

  // List all msgs:* keys
  const list = await env.OVERRIDES.list({ prefix: 'msgs:' });
  const overridesKey = 'overrides:v1';
  const overrides = JSON.parse((await env.OVERRIDES.get(overridesKey)) || '{}');

  const results = [];
  for (const k of list.keys) {
    const leadId = k.name.slice('msgs:'.length);
    const msgs = JSON.parse((await env.OVERRIDES.get(k.name)) || '[]');
    const hasInbound = msgs.some(m => m.direction === 'inbound');
    if (!hasInbound) { results.push({ leadId, skipped: 'no inbound' }); continue; }

    const out = await classifyOne(env, leadId, msgs);
    if (!out.ok) { results.push({ leadId, error: out.error }); continue; }

    overrides[leadId] = {
      status: out.status,
      note: '[auto] ' + out.reason,
      updatedAt: new Date().toISOString(),
      autoClassified: true,
    };
    results.push({ leadId, status: out.status, reason: out.reason });
  }
  await env.OVERRIDES.put(overridesKey, JSON.stringify(overrides));
  return Response.json({
    ok: true,
    total: results.length,
    classified: results.filter(r => r.status).length,
    skipped: results.filter(r => r.skipped).length,
    errors: results.filter(r => r.error).length,
    results,
  }, { headers: cors });
};
