// GET /api/lgm/debug?leadId=X — probe several LGM endpoints to find conversation data.
const cors = { 'Access-Control-Allow-Origin': '*' };
const LGM_BASE = 'https://apiv2.lagrowthmachine.com/flow';

async function probe(env, path, params = {}) {
  const url = new URL(LGM_BASE + path);
  url.searchParams.set('apikey', env.LGM_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const r = await fetch(url.toString());
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return {
      url: path + '?' + new URLSearchParams(params).toString(),
      status: r.status,
      topKeys: json ? Object.keys(json) : null,
      preview: typeof json === 'object' && json !== null
        ? JSON.stringify(json).slice(0, 1500)
        : text.slice(0, 1500),
    };
  } catch (e) {
    return { url: path, error: String(e.message || e) };
  }
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.LGM_API_KEY) return Response.json({ error: 'no key' }, { status: 500, headers: cors });
  const url = new URL(request.url);
  const leadId = url.searchParams.get('leadId') || '6a03775bf85d48337ee2e5dd'; // Bad Salzungen
  const cid = '6a038563270ef1fdc805b6d9'; // Zulassungsstellen campaign

  const probes = [
    probe(env, `/campaigns/${cid}/stats`),
    probe(env, `/campaigns/${cid}/leads/stats`),
    probe(env, `/campaigns/${cid}`),
    probe(env, `/lead/${leadId}`),
    probe(env, `/conversation`, { leadId }),
    probe(env, `/conversation/${leadId}`),
    probe(env, `/conversations/${leadId}`),
    probe(env, `/audiences`, { skip: 0, limit: 5 }),
    probe(env, `/audiences/6a037656d6e1d9810a3d5d48/detail`),
    probe(env, `/identities`),
    probe(env, `/members`),
  ];
  const results = await Promise.all(probes);
  return Response.json({ leadId, cid, probes: results }, { headers: cors });
};
