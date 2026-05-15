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
      const j2 = await r2.json();
      out.messagesShape = {
        topKeys: Object.keys(j2),
        count: j2?.data?.length,
        firstMessageKeys: j2?.data?.[0] ? Object.keys(j2.data[0]) : null,
        firstMessage: j2?.data?.[0] ?? null,
        secondMessage: j2?.data?.[1] ?? null,
        // Find first reply (REPLY type or different direction)
        firstReply: j2?.data?.find(m => m.isReply || m.direction === 'inbound' || m.fromLead) ?? null,
      };
    }
    const cached = await env.OVERRIDES.get('lgm:campaignIds');
    out.cached = cached;
  } catch (e) {
    out.error = String(e.message || e);
  }
  return Response.json(out, { headers: cors });
};
