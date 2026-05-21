// GET  /api/notes              → { leadId: { text, updatedAt } }
// PUT  /api/notes               → body { leadId, text }  (upserts; empty text deletes)
//
// User-authored ops notes per Zulassungsstelle (separate from the auto-classify
// "reasoning" stored on the override). Shared per-team via KV.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const KEY = 'notes:v1';

async function readAll(env) {
  const raw = await env.OVERRIDES.get(KEY);
  return raw ? JSON.parse(raw) : {};
}

async function writeAll(env, all) {
  await env.OVERRIDES.put(KEY, JSON.stringify(all));
}

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestGet = async ({ env }) => {
  return Response.json(await readAll(env), { headers: cors });
};

export const onRequestPut = async ({ request, env }) => {
  let body;
  try { body = await request.json(); }
  catch { return new Response('invalid JSON', { status: 400, headers: cors }); }
  const { leadId } = body || {};
  if (!leadId) return new Response('leadId required', { status: 400, headers: cors });

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const all = await readAll(env);

  if (!text) {
    // Empty text = delete
    delete all[leadId];
    await writeAll(env, all);
    return Response.json({ ok: true, leadId, deleted: true }, { headers: cors });
  }

  all[leadId] = { text, updatedAt: new Date().toISOString() };
  await writeAll(env, all);
  return Response.json({ ok: true, leadId, note: all[leadId] }, { headers: cors });
};
