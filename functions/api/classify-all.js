// POST /api/classify-all?offset=N&limit=M
// Processes a batch of leads with stored inbound messages.
// Default limit=15, runs Claude calls in parallel.
// Returns nextOffset if more work remains (or null when done).

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
  if (!r.ok) return { leadId, error: data?.error?.message || JSON.stringify(data).slice(0, 200) };
  const text = data.content?.[0]?.text || '';
  let parsed;
  try { parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text); }
  catch { return { leadId, error: 'parse failed' }; }
  if (!STATUSES.has(parsed.status))
    return { leadId, error: 'invalid status: ' + parsed.status };
  return { leadId, status: parsed.status, reason: parsed.reason || '' };
}

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestPost = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY)
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500, headers: cors });

  const url = new URL(request.url);
  const offset = Number(url.searchParams.get('offset') || 0);
  const limit  = Number(url.searchParams.get('limit')  || 15);

  // Find all lead IDs that have an inbound message — read msgs:* in one list call
  const list = await env.OVERRIDES.list({ prefix: 'msgs:', limit: 1000 });
  const allLeads = [];
  // Read all msgs in parallel
  const reads = await Promise.all(list.keys.map(async k => {
    const raw = await env.OVERRIDES.get(k.name);
    const msgs = raw ? JSON.parse(raw) : [];
    return { leadId: k.name.slice('msgs:'.length), msgs };
  }));
  for (const r of reads) {
    if (r.msgs.some(m => m.direction === 'inbound')) allLeads.push(r);
  }
  // Stable ordering by leadId so offset works across calls
  allLeads.sort((a, b) => a.leadId.localeCompare(b.leadId));

  const batch = allLeads.slice(offset, offset + limit);
  if (batch.length === 0) {
    return Response.json({ ok: true, done: true, total: allLeads.length }, { headers: cors });
  }

  // Run Claude calls in parallel
  const results = await Promise.all(batch.map(b => classifyOne(env, b.leadId, b.msgs)));

  // Write all override updates
  const overridesKey = 'overrides:v1';
  const overrides = JSON.parse((await env.OVERRIDES.get(overridesKey)) || '{}');
  for (const r of results) {
    if (r.status) {
      overrides[r.leadId] = {
        status: r.status,
        note: '[auto] ' + r.reason,
        updatedAt: new Date().toISOString(),
        autoClassified: true,
      };
    }
  }
  await env.OVERRIDES.put(overridesKey, JSON.stringify(overrides));

  const nextOffset = offset + batch.length;
  const done = nextOffset >= allLeads.length;
  return Response.json({
    ok: true,
    processed: batch.length,
    classified: results.filter(r => r.status).length,
    errors: results.filter(r => r.error).length,
    nextOffset: done ? null : nextOffset,
    total: allLeads.length,
    results,
  }, { headers: cors });
};
