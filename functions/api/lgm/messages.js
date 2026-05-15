// GET /api/lgm/messages?leadId=X
// Returns: { campaignTemplate, messages: [...] }
// - campaignTemplate: the outbound message that was originally sent (cached from /campaigns/:id/messages)
// - messages: stored per-lead history from webhook events (in chronological order)
//
// Historical pre-webhook replies live in data.json (CSV export); the frontend
// merges them in. This endpoint covers everything that arrived after the
// webhook was registered.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const LGM_BASE = 'https://apiv2.lagrowthmachine.com/flow';
const LGM_CAMPAIGN_ID = '6a038563270ef1fdc805b6d9'; // Zulassungsstellen

async function getCampaignTemplate(env) {
  const cached = await env.OVERRIDES.get('lgm:tpl:' + LGM_CAMPAIGN_ID);
  if (cached) return JSON.parse(cached);
  const r = await fetch(`${LGM_BASE}/campaigns/${LGM_CAMPAIGN_ID}/messages?apikey=${env.LGM_API_KEY}`);
  if (!r.ok) return null;
  const data = await r.json();
  const msgs = data.data || [];
  // Use the first (order=0) message as the template
  const tpl = msgs[0] || null;
  if (tpl) {
    const simplified = {
      type: 'outbound',
      channel: tpl.channel || 'GOOGLE',
      subject: stripHtml(tpl.subjectHtml || ''),
      body: stripHtml(tpl.contentHtml || ''),
      isTemplate: true,
    };
    await env.OVERRIDES.put('lgm:tpl:' + LGM_CAMPAIGN_ID, JSON.stringify(simplified), {
      expirationTtl: 60 * 60 * 24 * 7,
    });
    return simplified;
  }
  return null;
}

function stripHtml(s) {
  return String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}

async function getStoredMessages(env, leadId) {
  const raw = await env.OVERRIDES.get('msgs:' + leadId);
  return raw ? JSON.parse(raw) : [];
}

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const leadId = url.searchParams.get('leadId');
  if (!leadId) return new Response('leadId required', { status: 400, headers: cors });
  if (!env.LGM_API_KEY)
    return Response.json({ error: 'LGM_API_KEY not configured' }, { status: 500, headers: cors });

  try {
    const [tpl, msgs] = await Promise.all([
      getCampaignTemplate(env),
      getStoredMessages(env, leadId),
    ]);
    return Response.json({ leadId, campaignTemplate: tpl, messages: msgs }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502, headers: cors });
  }
};
