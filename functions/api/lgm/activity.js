// GET /api/lgm/activity
// Returns { leadId: { count, lastDate, lastDirection } } for all leads
// that have webhook-stored messages. Used by the frontend to show
// activity badges on the main table.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions = () => new Response(null, { headers: cors });

export const onRequestGet = async ({ env }) => {
  const viewedRaw = await env.OVERRIDES.get('viewed:v1');
  const viewed = viewedRaw ? JSON.parse(viewedRaw) : {};

  const out = {};
  let cursor;
  for (let page = 0; page < 10; page++) {
    const list = await env.OVERRIDES.list({ prefix: 'msgs:', cursor });
    const entries = await Promise.all(list.keys.map(async k => {
      const raw = await env.OVERRIDES.get(k.name);
      const msgs = raw ? JSON.parse(raw) : [];
      if (!msgs.length) return null;
      const last = msgs[msgs.length - 1];
      const leadId = k.name.slice('msgs:'.length);
      // Find the most recent INBOUND date for unread comparison
      const lastInbound = msgs.filter(m => m.direction === 'inbound').pop();
      const lastViewed = viewed[leadId] || null;
      const unread = !!(lastInbound && (!lastViewed || lastInbound.date > lastViewed));
      return [leadId, {
        count: msgs.length,
        lastDate: last.date,
        lastDirection: last.direction,
        inboundCount: msgs.filter(m => m.direction === 'inbound').length,
        lastInboundDate: lastInbound ? lastInbound.date : null,
        lastViewed,
        unread,
      }];
    }));
    for (const e of entries) if (e) out[e[0]] = e[1];
    if (list.list_complete) break;
    cursor = list.cursor;
  }
  return Response.json(out, { headers: cors });
};
