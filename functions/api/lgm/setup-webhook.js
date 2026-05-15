// POST /api/lgm/setup-webhook
// One-time helper: registers this Pages site as the inbox event webhook in LGM.
// Call once after deploy: curl -X POST https://<your-site>/api/lgm/setup-webhook
// Idempotent — checks for existing registration first.

const cors = { 'Access-Control-Allow-Origin': '*' };
const LGM_BASE = 'https://apiv2.lagrowthmachine.com/flow';

export const onRequestPost = async ({ request, env }) => {
  if (!env.LGM_API_KEY)
    return Response.json({ error: 'LGM_API_KEY not configured' }, { status: 500, headers: cors });

  const url = new URL(request.url);
  const webhookUrl = `${url.protocol}//${url.host}/api/lgm/webhook`;

  // Check existing
  const existing = await (await fetch(`${LGM_BASE}/inboxWebhooks?apikey=${env.LGM_API_KEY}`)).json();
  const already = (Array.isArray(existing) ? existing : []).find(w => w.url === webhookUrl);
  if (already) return Response.json({ ok: true, alreadyRegistered: true, webhook: already }, { headers: cors });

  // Register
  const r = await fetch(`${LGM_BASE}/inboxWebhooks?apikey=${env.LGM_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      name: 'ZLG dashboard inbox events',
      type: 'INBOX_EVENT',
      campaigns: ['all'],
    }),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return Response.json({ ok: r.ok, status: r.status, response: json, webhookUrl }, {
    status: r.ok ? 200 : 502, headers: cors,
  });
};

// GET to see what's registered
export const onRequestGet = async ({ env }) => {
  const r = await fetch(`${LGM_BASE}/inboxWebhooks?apikey=${env.LGM_API_KEY}`);
  return Response.json(await r.json(), { headers: cors });
};
