// GET /api/export      → full dashboard state as a CSV download
// One row per Zulassungsstelle (all 508), including status, reasoning, user
// notes, conversation summary, and the full conversation text.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

const COLS = [
  'leadId', 'landkreis', 'bundesland', 'email', 'phone', 'lat', 'lon',
  'status', 'classification_source', 'reasoning_note', 'user_notes',
  'status_updated_at', 'last_viewed', 'has_unread',
  'first_reply_date_csv', 'first_reply_body_csv',
  'total_messages', 'inbound_count', 'outbound_count',
  'last_message_date', 'last_message_direction',
  'conversation_full',
];

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  // Always quote — RFC 4180 — and escape inner quotes
  return '"' + s.replace(/"/g, '""') + '"';
}

function flattenConversation(msgs) {
  return msgs.map(m => {
    const dir = (m.direction || 'unknown').toUpperCase();
    const date = m.date || '';
    const sub = m.subject ? `Subject: ${m.subject}\n` : '';
    return `[${dir} · ${m.channel || 'EMAIL'} · ${date}]\n${sub}${m.body || ''}`;
  }).join('\n\n---\n\n');
}

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestGet = async ({ env, request }) => {
  // 1. Static data.json — fetch from same origin
  const url = new URL(request.url);
  const dataRes = await fetch(`${url.protocol}//${url.host}/data.json`);
  const data = await dataRes.json();

  // 2. KV state
  const [ovRaw, notesRaw, viewedRaw] = await Promise.all([
    env.OVERRIDES.get('overrides:v1'),
    env.OVERRIDES.get('notes:v1'),
    env.OVERRIDES.get('viewed:v1'),
  ]);
  const overrides = ovRaw ? JSON.parse(ovRaw) : {};
  const notes     = notesRaw ? JSON.parse(notesRaw) : {};
  const viewed    = viewedRaw ? JSON.parse(viewedRaw) : {};

  // 3. Per-lead msgs:* — list + parallel reads
  const list = await env.OVERRIDES.list({ prefix: 'msgs:', limit: 1000 });
  const msgEntries = await Promise.all(list.keys.map(async k => {
    const raw = await env.OVERRIDES.get(k.name);
    return [k.name.slice('msgs:'.length), raw ? JSON.parse(raw) : []];
  }));
  const msgs = Object.fromEntries(msgEntries);

  // 4. Build CSV
  const lines = [COLS.map(csvCell).join(',')];
  for (const r of data) {
    const ov = overrides[r.id];
    const note = notes[r.id];
    const v = viewed[r.id] || '';
    const m = msgs[r.id] || [];

    const status = ov?.status || r.status || '(no reply)';
    const source = ov ? (ov.autoClassified ? 'auto' : 'manual') : 'original_csv';
    const reasoning = ov?.note || r.note || '';

    const lastInbound = m.filter(x => x.direction === 'inbound').pop();
    const lastMsg = m[m.length - 1];
    const lastViewedDate = v;
    const hasUnread = !!(lastInbound && (!lastViewedDate || lastInbound.date > lastViewedDate));

    const inboundCount  = m.filter(x => x.direction === 'inbound').length;
    const outboundCount = m.filter(x => x.direction === 'outbound').length;

    const row = [
      r.id, r.landkreis, r.bundesland, r.email, r.phone, r.lat, r.lon,
      status, source, reasoning, note?.text || '',
      ov?.updatedAt || '', lastViewedDate, hasUnread ? 'true' : 'false',
      r.replyDate || '', r.reply || '',
      m.length, inboundCount, outboundCount,
      lastMsg?.date || '', lastMsg?.direction || '',
      flattenConversation(m),
    ];
    lines.push(row.map(csvCell).join(','));
  }
  const csv = lines.join('\n');

  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      ...cors,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="zlg_export_${date}.csv"`,
    },
  });
};
