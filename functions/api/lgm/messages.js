// GET /api/lgm/messages?leadId=X
// Returns the LGM message thread for a lead. Caches per-lead in KV (24h TTL).
// Strategy: pull all messages for the lead's campaigns, filter to leadId, sort by date.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const LGM_BASE = 'https://apiv2.lagrowthmachine.com/flow';
const CACHE_TTL = 60 * 60 * 24; // 24h

async function lgm(env, path, params = {}) {
  const url = new URL(LGM_BASE + path);
  url.searchParams.set('apikey', env.LGM_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`LGM ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

// Discover the campaign(s) we care about. We cache the campaignId list in KV
// so we only call /campaigns once. The user can override via env.LGM_CAMPAIGN_IDS
// (comma-separated) if they want to pin specific ones.
async function getCampaignIds(env) {
  if (env.LGM_CAMPAIGN_IDS) return env.LGM_CAMPAIGN_IDS.split(',').map(s => s.trim());
  const cached = await env.OVERRIDES.get('lgm:campaignIds');
  if (cached) return JSON.parse(cached);
  const data = await lgm(env, '/campaigns', { skip: 0, limit: 100 });
  const ids = (data.campaigns || []).map(c => c.id);
  await env.OVERRIDES.put('lgm:campaignIds', JSON.stringify(ids), { expirationTtl: CACHE_TTL });
  return ids;
}

async function fetchCampaignMessages(env, campaignId) {
  const cacheKey = `lgm:msgs:${campaignId}`;
  const cached = await env.OVERRIDES.get(cacheKey);
  if (cached) return JSON.parse(cached);
  // The endpoint shape isn't fully documented, so we accept either {messages:[…]}
  // or an array directly. Each message expected to have leadId, content, channel, date, direction.
  const data = await lgm(env, `/campaigns/${campaignId}/messages`);
  const msgs = Array.isArray(data) ? data : (data.messages || data.data || []);
  await env.OVERRIDES.put(cacheKey, JSON.stringify(msgs), { expirationTtl: 60 * 30 }); // 30 min
  return msgs;
}

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestGet = async ({ request, env }) => {
  if (!env.LGM_API_KEY)
    return Response.json({ error: 'LGM_API_KEY not configured' }, { status: 500, headers: cors });

  const url = new URL(request.url);
  const leadId = url.searchParams.get('leadId');
  if (!leadId) return new Response('leadId required', { status: 400, headers: cors });

  try {
    const campaignIds = await getCampaignIds(env);
    const all = [];
    for (const cid of campaignIds) {
      try {
        const msgs = await fetchCampaignMessages(env, cid);
        for (const m of msgs) {
          // Different LGM responses use different keys — try the common ones.
          const mLeadId = m.leadId || m.lead?.id || m.lead_id;
          if (mLeadId === leadId) all.push({ ...m, _campaignId: cid });
        }
      } catch (e) {
        // Skip campaigns that fail (e.g. permission), continue with others.
      }
    }
    all.sort((a, b) => {
      const da = new Date(a.date || a.sentAt || a.createdAt || 0).getTime();
      const db = new Date(b.date || b.sentAt || b.createdAt || 0).getTime();
      return da - db;
    });
    return Response.json({ leadId, count: all.length, messages: all }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502, headers: cors });
  }
};
