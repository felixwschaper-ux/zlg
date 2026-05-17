// POST /api/lgm/rebuild-msgs
// One-time admin: clears all msgs:* entries and rebuilds them by replaying
// webhook:log entries through the current extract() logic.
// Safe to delete after first run.

const cors = { 'Access-Control-Allow-Origin': '*' };

const OUR_IDENTITY_IDS = new Set(['692ddbdd81719c886d5da2ce']);

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
  let date;
  if (typeof payload.createdAt === 'number') date = new Date(payload.createdAt).toISOString();
  else if (typeof payload.date === 'number') date = new Date(payload.date).toISOString();
  else date = payload.date || payload.sentAt || payload.repliedAt || new Date().toISOString();
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

export const onRequestPost = async ({ env }) => {
  const log = JSON.parse((await env.OVERRIDES.get('webhook:log')) || '[]');

  // List all msgs:* keys and delete them
  const list = await env.OVERRIDES.list({ prefix: 'msgs:' });
  for (const k of list.keys) await env.OVERRIDES.delete(k.name);

  // Replay log → rebuild msgs:* with dedupe by messageId
  const byLead = new Map();
  for (const entry of log) {
    if (!entry.payload) continue;
    const m = extract(entry.payload);
    if (!m.leadId) continue;
    const arr = byLead.get(m.leadId) || [];
    const dup = m.messageId && arr.findIndex(x => x.messageId === m.messageId);
    if (m.messageId && dup >= 0) arr[dup] = m;
    else arr.push({ direction: m.direction, channel: m.channel, date: m.date,
                   subject: m.subject, body: m.body, messageId: m.messageId });
    byLead.set(m.leadId, arr);
  }
  // Sort + write
  let wrote = 0;
  for (const [leadId, arr] of byLead.entries()) {
    arr.sort((a, b) => new Date(a.date) - new Date(b.date));
    await env.OVERRIDES.put('msgs:' + leadId, JSON.stringify(arr));
    wrote++;
  }
  return Response.json({
    ok: true,
    deletedKeys: list.keys.length,
    replayedEvents: log.length,
    leadsRebuilt: wrote,
  }, { headers: cors });
};
