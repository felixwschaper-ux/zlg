const cors = { 'Access-Control-Allow-Origin': '*' };
const LGM_BASE = 'https://apiv2.lagrowthmachine.com/flow';
const CID = '6a038563270ef1fdc805b6d9';

export const onRequestGet = async ({ env }) => {
  const r = await fetch(`${LGM_BASE}/campaigns/${CID}/stats?apikey=${env.LGM_API_KEY}`);
  return Response.json(await r.json(), { headers: cors });
};
