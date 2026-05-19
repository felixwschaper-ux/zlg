// POST /api/classify
// Body: { leadId, conversation: [{direction, body, ...}] }
// Calls Claude to re-classify the conversation, then writes the result to KV overrides.
// No-op if ANTHROPIC_API_KEY isn't configured.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const STATUSES = [
  'Yes', 'No', 'No (§76 exception possible)', 'Follow-up question',
  'Unclear', 'Auto-reply', 'Forwarded', '(no reply)',
];

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

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestPost = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY)
    return Response.json({ skipped: 'ANTHROPIC_API_KEY not set' }, { headers: cors });

  let body;
  try { body = await request.json(); }
  catch { return new Response('invalid JSON', { status: 400, headers: cors }); }

  const { leadId, conversation } = body || {};
  if (!leadId || !Array.isArray(conversation))
    return new Response('leadId + conversation required', { status: 400, headers: cors });

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
  if (!r.ok)
    return Response.json({ error: 'Anthropic API failed', status: r.status, data }, { status: 502, headers: cors });

  const text = data.content?.[0]?.text || '';
  let parsed;
  try { parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text); }
  catch { return Response.json({ error: 'failed to parse JSON', text }, { status: 502, headers: cors }); }

  const status = parsed.status;
  const reason = parsed.reason || '';
  if (!STATUSES.includes(status))
    return Response.json({ error: 'invalid status', returned: status }, { status: 502, headers: cors });

  // Write to overrides KV — but PRESERVE manual overrides (autoClassified !== true)
  const overridesKey = 'overrides:v1';
  const all = JSON.parse((await env.OVERRIDES.get(overridesKey)) || '{}');
  const existing = all[leadId];
  if (existing && existing.autoClassified !== true) {
    return Response.json({ ok: true, leadId, skipped: 'manual override preserved' }, { headers: cors });
  }
  all[leadId] = {
    status,
    note: '[auto] ' + reason,
    updatedAt: new Date().toISOString(),
    autoClassified: true,
  };
  await env.OVERRIDES.put(overridesKey, JSON.stringify(all));

  return Response.json({ ok: true, leadId, status, reason }, { headers: cors });
};
