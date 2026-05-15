// GET  /api/overrides           → { leadId: { status, note, updatedAt } }
// PUT  /api/overrides           → body { leadId, status, note? } — upserts one override

const KEY = 'overrides:v1';

async function readAll(env) {
  const raw = await env.OVERRIDES.get(KEY);
  return raw ? JSON.parse(raw) : {};
}

async function writeAll(env, all) {
  await env.OVERRIDES.put(KEY, JSON.stringify(all));
}

const VALID_STATUS = new Set([
  'Yes', 'No', 'No (§76 exception possible)', 'Follow-up question',
  'Unclear', 'Auto-reply', 'Forwarded', '(no reply)',
]);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestGet = async ({ env }) => {
  const all = await readAll(env);
  return Response.json(all, { headers: cors });
};

export const onRequestPut = async ({ request, env }) => {
  let body;
  try { body = await request.json(); }
  catch { return new Response('Invalid JSON', { status: 400, headers: cors }); }

  const { leadId, status, note } = body || {};
  if (!leadId || typeof leadId !== 'string')
    return new Response('leadId required', { status: 400, headers: cors });
  if (!VALID_STATUS.has(status))
    return new Response('invalid status', { status: 400, headers: cors });

  const all = await readAll(env);
  all[leadId] = {
    status,
    note: typeof note === 'string' ? note : (all[leadId]?.note ?? ''),
    updatedAt: new Date().toISOString(),
  };
  await writeAll(env, all);
  return Response.json({ ok: true, override: all[leadId] }, { headers: cors });
};
