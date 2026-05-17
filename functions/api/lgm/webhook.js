// POST /api/lgm/webhook
// LGM-registered inbox event receiver. Stores incoming messages per leadId in KV
// and triggers auto-recategorization (via /api/classify) on inbound replies.
//
// Real LGM payload shape (verified via webhook capture):
//   {
//     messageChannel: "EMAIL",
//     messageBody:    "<html...>",
//     messageSubject: "Re: ...",
//     messageId:      "6a09…",
//     conversationId: "6a06…",
//     leadId:         "6a037…",
//     identityId:     "692d…",       // our LGM identity → outbound from us
//     createdAt:      1779032656979,  // unix ms
//     sent: bool, received: bool,    // direction signals
//     attachments: [],
//     lead: { id, firstName, lastName, ... }
//   }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const OUR_IDENTITY_IDS = new Set([
  '692ddbdd81719c886d5da2ce', // Andreas Hjarksson (campaign identity)
]);

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}

function extract(payload) {
  const leadId = payload.leadId || payload.lead?.id || null;
  const channel = payload.messageChannel || payload.channel || 'EMAIL';
  const subject = stripHtml(payload.messageSubject || payload.subject || payload.subjectHtml || '');
  const body = stripHtml(
    payload.messageBody || payload.body || payload.contentHtml || payload.content || payload.text || ''
  );

  // Date: prefer Unix-ms createdAt, fallback to ISO strings
  let date;
  if (typeof payload.createdAt === 'number') date = new Date(payload.createdAt).toISOString();
  else if (typeof payload.date === 'number') date = new Date(payload.date).toISOString();
  else date = payload.date || payload.sentAt || payload.repliedAt || new Date().toISOString();

  // Direction: prefer explicit signals, then identity match, then default
  let direction;
  if (payload.received === true) direction = 'inbound';
  else if (payload.sent === true) direction = 'outbound';
  else if (payload.direction) direction = String(payload.direction).toLowerCase();
  else if (payload.fromLead) direction = 'inbound';
  else if (payload.identityId && OUR_IDENTITY_IDS.has(payload.identityId)) direction = 'outbound';
  else direction = 'outbound';

  return {
    leadId, direction, channel, date, subject, body,
    messageId: payload.messageId || null,
    conversationId: payload.conversationId || null,
  };
}

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestPost = async ({ request, env }) => {
  let payload;
  try { payload = await request.json(); }
  catch { return new Response('invalid JSON', { status: 400, headers: cors }); }

  const msg = extract(payload);
  const { leadId, direction, channel, date, subject, body, messageId } = msg;

  // Rolling log (last 50 with full payload)
  const log = JSON.parse((await env.OVERRIDES.get('webhook:log')) || '[]');
  log.push({ at: new Date().toISOString(), leadId, payload });
  await env.OVERRIDES.put('webhook:log', JSON.stringify(log.slice(-50)));
  await env.OVERRIDES.put('webhook:lastFullPayload', JSON.stringify({
    at: new Date().toISOString(), payload,
  }));

  if (!leadId) {
    return Response.json({ ok: true, note: 'no leadId in payload, logged only' }, { headers: cors });
  }

  // Append (or update by messageId) to per-lead store
  const msgsKey = 'msgs:' + leadId;
  const msgs = JSON.parse((await env.OVERRIDES.get(msgsKey)) || '[]');
  const entry = { direction, channel, date, subject, body, messageId };
  let isNew = true;
  if (messageId) {
    const i = msgs.findIndex(m => m.messageId === messageId);
    if (i >= 0) { msgs[i] = { ...msgs[i], ...entry }; isNew = false; }
  }
  if (isNew) msgs.push(entry);
  msgs.sort((a, b) => new Date(a.date) - new Date(b.date));
  await env.OVERRIDES.put(msgsKey, JSON.stringify(msgs));

  // Auto-classify only on inbound messages (and only the first time we see them)
  if (direction === 'inbound' && body && isNew) {
    const url = new URL(request.url);
    fetch(`${url.protocol}//${url.host}/api/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, conversation: msgs }),
    }).catch(() => {});
  }

  return Response.json({ ok: true, leadId, direction, stored: msgs.length, isNew }, { headers: cors });
};

// GET to inspect recent events (debug)
export const onRequestGet = async ({ env }) => {
  const log = JSON.parse((await env.OVERRIDES.get('webhook:log')) || '[]');
  return Response.json({ count: log.length, recent: log.slice(-20) }, { headers: cors });
};
