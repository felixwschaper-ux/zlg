// POST /api/lgm/webhook
// LGM-registered inbox event receiver. Stores incoming messages per leadId in KV
// and triggers auto-recategorization via the /api/classify endpoint.
//
// Payload shape isn't fully documented; we accept any shape and try to extract
// the relevant fields. Whole payload is stored for debugging.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}

function extract(payload) {
  // Try common shapes — LGM may send {event, lead, message} or flat fields.
  const lead = payload.lead || payload.leadInfo || {};
  const msg = payload.message || payload.event || payload;
  const leadId = payload.leadId || lead.id || msg.leadId || null;
  const direction = (msg.direction || (msg.fromLead ? 'inbound' : null) ||
                     (payload.event === 'REPLY' || payload.eventType === 'REPLY' ? 'inbound' : 'outbound'));
  const channel = msg.channel || payload.channel || 'EMAIL';
  const date = msg.date || msg.sentAt || msg.repliedAt || msg.createdAt || payload.date || new Date().toISOString();
  const subject = stripHtml(msg.subject || msg.subjectHtml || '');
  const body = stripHtml(msg.content || msg.contentHtml || msg.body || msg.text || msg.message || '');
  return { leadId, direction, channel, date, subject, body, raw: payload };
}

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestPost = async ({ request, env }) => {
  let payload;
  try { payload = await request.json(); }
  catch { return new Response('invalid JSON', { status: 400, headers: cors }); }

  const { leadId, direction, channel, date, subject, body } = extract(payload);

  // Always log the raw event (last 50 with full payload)
  const logKey = 'webhook:log';
  const log = JSON.parse((await env.OVERRIDES.get(logKey)) || '[]');
  log.push({ at: new Date().toISOString(), leadId, payload });
  await env.OVERRIDES.put(logKey, JSON.stringify(log.slice(-50)));

  // Keep the last full payload separately for quick shape inspection
  await env.OVERRIDES.put('webhook:lastFullPayload', JSON.stringify({
    at: new Date().toISOString(), payload,
  }));

  if (!leadId) {
    return Response.json({ ok: true, note: 'no leadId in payload, logged only' }, { headers: cors });
  }

  // Append to per-lead message store
  const msgsKey = 'msgs:' + leadId;
  const msgs = JSON.parse((await env.OVERRIDES.get(msgsKey)) || '[]');
  msgs.push({ direction, channel, date, subject, body });
  msgs.sort((a, b) => new Date(a.date) - new Date(b.date));
  await env.OVERRIDES.put(msgsKey, JSON.stringify(msgs));

  // Trigger auto-classification on inbound messages (don't await — fire & forget)
  if (direction === 'inbound' && body) {
    const url = new URL(request.url);
    const classifyUrl = `${url.protocol}//${url.host}/api/classify`;
    fetch(classifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, conversation: msgs }),
    }).catch(() => {});
  }

  return Response.json({ ok: true, leadId, stored: msgs.length }, { headers: cors });
};

// GET to inspect last received events (for debugging webhook setup)
export const onRequestGet = async ({ env }) => {
  const log = JSON.parse((await env.OVERRIDES.get('webhook:log')) || '[]');
  return Response.json({ count: log.length, recent: log.slice(-20) }, { headers: cors });
};
