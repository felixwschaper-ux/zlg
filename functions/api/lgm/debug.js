// GET /api/lgm/debug — inspect LGM API state. Lists campaigns + cached state.
const cors = { 'Access-Control-Allow-Origin': '*' };
const LGM_BASE = 'https://apiv2.lagrowthmachine.com/flow';

export const onRequestGet = async ({ request, env }) => {
  if (!env.LGM_API_KEY) return Response.json({ error: 'no key' }, { status: 500, headers: cors });
  const url = new URL(request.url);
  const reset = url.searchParams.get('reset');
  if (reset) {
    await env.OVERRIDES.delete('lgm:campaignIds');
  }
  const out = { steps: [] };
  try {
    const r = await fetch(`${LGM_BASE}/campaigns?apikey=${env.LGM_API_KEY}&skip=0&limit=25`);
    const text = await r.text();
    out.steps.push({ step: 'GET /campaigns', status: r.status, bodyPreview: text.slice(0, 500) });
    let json;
    try { json = JSON.parse(text); } catch {}
    out.campaignsTotal = json?.total ?? null;
    out.campaignsReturned = json?.campaigns?.length ?? null;
    out.firstCampaign = json?.campaigns?.[0] ?? null;
    if (json?.campaigns?.[0]?.id) {
      const cid = json.campaigns[0].id;
      const r2 = await fetch(`${LGM_BASE}/campaigns/${cid}/messages?apikey=${env.LGM_API_KEY}`);
      const text2 = await r2.text();
      out.steps.push({ step: `GET /campaigns/${cid}/messages`, status: r2.status, bodyPreview: text2.slice(0, 800) });
    }
    const cached = await env.OVERRIDES.get('lgm:campaignIds');
    out.cached = cached;
  } catch (e) {
    out.error = String(e.message || e);
  }
  return Response.json(out, { headers: cors });
};
