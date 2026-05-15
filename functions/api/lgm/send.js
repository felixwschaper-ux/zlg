// POST /api/lgm/send
// Body: { leadId, message, subject? }
// Sends an email reply via LGM's /flow/inbox/email using the campaign identity + Felix's member.
//
// PUBLIC endpoint — anyone with the URL can trigger sends. If SHARED_PASSWORD env
// var is set, requests must include header X-Auth: <password>.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Auth',
};

const LGM_BASE = 'https://apiv2.lagrowthmachine.com/flow';
// Campaign identity = Andreas Hjarksson; sending member = felix schaper
const DEFAULT_IDENTITY_ID = '692ddbdd81719c886d5da2ce';
const DEFAULT_MEMBER_ID = '69d4ec91c1fb94f4e64096ca';

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestPost = async ({ request, env }) => {
  if (env.SHARED_PASSWORD && request.headers.get('X-Auth') !== env.SHARED_PASSWORD)
    return new Response('unauthorized', { status: 401, headers: cors });
  if (!env.LGM_API_KEY)
    return Response.json({ error: 'LGM_API_KEY not configured' }, { status: 500, headers: cors });

  let body;
  try { body = await request.json(); }
  catch { return new Response('invalid JSON', { status: 400, headers: cors }); }

  const { leadId, message, subject } = body || {};
  if (!leadId) return new Response('leadId required', { status: 400, headers: cors });
  if (!message) return new Response('message required', { status: 400, headers: cors });

  const identityId = env.LGM_IDENTITY_ID || DEFAULT_IDENTITY_ID;
  const memberId = env.LGM_MEMBER_ID || DEFAULT_MEMBER_ID;

  const payload = { identityId, memberId, leadId, message, source: 'api' };
  if (subject) payload.subject = subject;

  const r = await fetch(`${LGM_BASE}/inbox/email?apikey=${env.LGM_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!r.ok) {
    return Response.json({ error: 'LGM send failed', status: r.status, response: json }, {
      status: 502, headers: cors,
    });
  }

  // Mirror outbound message into our per-lead store so the thread reflects it immediately
  const msgsKey = 'msgs:' + leadId;
  const msgs = JSON.parse((await env.OVERRIDES.get(msgsKey)) || '[]');
  msgs.push({
    direction: 'outbound',
    channel: 'EMAIL',
    date: new Date().toISOString(),
    subject: subject || '',
    body: message,
  });
  await env.OVERRIDES.put(msgsKey, JSON.stringify(msgs));

  return Response.json({ ok: true, lgmResponse: json }, { headers: cors });
};
