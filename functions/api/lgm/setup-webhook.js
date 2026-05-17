// POST /api/lgm/setup-webhook              — register (deletes any existing first)
// DELETE /api/lgm/setup-webhook            — delete all our webhooks
// GET /api/lgm/setup-webhook               — list current
// Scopes the registration to the Zulassungsstellen campaign only so we don't
// receive noise from other LGM campaigns.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const LGM_BASE = 'https://apiv2.lagrowthmachine.com/flow';
const ZLG_CAMPAIGN_ID = '6a038563270ef1fdc805b6d9';

async function listWebhooks(env) {
  const r = await fetch(`${LGM_BASE}/inboxWebhooks?apikey=${env.LGM_API_KEY}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function deleteWebhook(env, id) {
  const r = await fetch(`${LGM_BASE}/inboxWebhooks/${id}?apikey=${env.LGM_API_KEY}`, { method: 'DELETE' });
  return { id, status: r.status, ok: r.ok };
}

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestGet = async ({ env }) => {
  return Response.json(await listWebhooks(env), { headers: cors });
};

export const onRequestDelete = async ({ env }) => {
  const all = await listWebhooks(env);
  const results = [];
  for (const w of all) results.push(await deleteWebhook(env, w.id));
  return Response.json({ deleted: results }, { headers: cors });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.LGM_API_KEY)
    return Response.json({ error: 'LGM_API_KEY not configured' }, { status: 500, headers: cors });

  const url = new URL(request.url);
  const webhookUrl = `${url.protocol}//${url.host}/api/lgm/webhook`;

  // Delete any existing registrations pointing at us (force clean re-register)
  const existing = await listWebhooks(env);
  const deletes = [];
  for (const w of existing) {
    if (w.url === webhookUrl) deletes.push(await deleteWebhook(env, w.id));
  }

  // Register, scoped to the ZLG campaign only
  const r = await fetch(`${LGM_BASE}/inboxWebhooks?apikey=${env.LGM_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      name: 'ZLG dashboard inbox events',
      campaigns: [ZLG_CAMPAIGN_ID],
    }),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return Response.json({ ok: r.ok, status: r.status, deletedExisting: deletes, response: json, webhookUrl }, {
    status: r.ok ? 200 : 502, headers: cors,
  });
};
