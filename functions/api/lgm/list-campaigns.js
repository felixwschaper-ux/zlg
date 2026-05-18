const cors = { 'Access-Control-Allow-Origin': '*' };
const LGM_BASE = 'https://apiv2.lagrowthmachine.com/flow';

export const onRequestGet = async ({ env }) => {
  const all = [];
  for (let skip = 0; skip < 500; skip += 25) {
    const r = await fetch(`${LGM_BASE}/campaigns?apikey=${env.LGM_API_KEY}&skip=${skip}&limit=25`);
    const d = await r.json();
    const page = d.campaigns || [];
    all.push(...page.map(c => ({
      id: c.id, name: c.name, status: c.status,
      audienceName: c.audience?.name,
      audienceSize: c.audience?.size,
      leadsCount: c.leadsCount,
      replyRatePercent: c.replyRatePercent,
      createdAt: c.createdAt,
    })));
    if (page.length < 25) break;
  }
  // Filter for likely-ZLG-related
  const zlg = all.filter(c =>
    /zulass|kennzeichen|kfz|dauer|händler|haendler/i.test(c.name) ||
    /zulass|kennzeichen|kfz/i.test(c.audienceName || '')
  );
  return Response.json({ total: all.length, zlgRelated: zlg, all }, { headers: cors });
};
