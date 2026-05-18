// GET  /api/viewed              → { leadId: lastViewedISO }
// PUT  /api/viewed              → body { leadId } → marks as viewed=now
// PUT  /api/viewed?all=true     → marks all currently-known leads as viewed=now
//
// "Viewed" is per-team, not per-user (shared KV). When anyone opens a lead, it
// counts as viewed for everyone. This is intentional given there's no auth.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const KEY = 'viewed:v1';

async function readAll(env) {
  const raw = await env.OVERRIDES.get(KEY);
  return raw ? JSON.parse(raw) : {};
}

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestGet = async ({ env }) => {
  return Response.json(await readAll(env), { headers: cors });
};

export const onRequestPut = async ({ request, env }) => {
  const url = new URL(request.url);
  const markAll = url.searchParams.get('all') === 'true';
  const now = new Date().toISOString();
  const all = await readAll(env);

  if (markAll) {
    // Mark every lead that currently has stored messages
    const list = await env.OVERRIDES.list({ prefix: 'msgs:', limit: 1000 });
    for (const k of list.keys) all[k.name.slice('msgs:'.length)] = now;
    await env.OVERRIDES.put(KEY, JSON.stringify(all));
    return Response.json({ ok: true, markedAll: list.keys.length, at: now }, { headers: cors });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response('invalid JSON', { status: 400, headers: cors }); }
  const { leadId } = body || {};
  if (!leadId) return new Response('leadId required', { status: 400, headers: cors });

  all[leadId] = now;
  await env.OVERRIDES.put(KEY, JSON.stringify(all));
  return Response.json({ ok: true, leadId, at: now }, { headers: cors });
};
