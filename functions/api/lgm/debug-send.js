// Probe-only: tries different /inbox/email body shapes to discover the schema.
// DELETE after smoke testing is done.
const cors = { 'Access-Control-Allow-Origin': '*' };
const LGM_BASE = 'https://apiv2.lagrowthmachine.com/flow';

const SHAPES = [
  { name: 'message_object_subject_contentHtml',
    body: { message: { subject: 'TEST', contentHtml: '<p>x</p>' } } },
  { name: 'message_object_subjectHtml_contentHtml',
    body: { message: { subjectHtml: 'TEST', contentHtml: '<p>x</p>' } } },
  { name: 'message_object_subject_html',
    body: { message: { subject: 'TEST', html: '<p>x</p>' } } },
  { name: 'message_object_subject_text',
    body: { message: { subject: 'TEST', text: 'x' } } },
  { name: 'message_object_subject_body',
    body: { message: { subject: 'TEST', body: 'x' } } },
  { name: 'flat_subject_contentHtml',
    body: { subject: 'TEST', contentHtml: '<p>x</p>' } },
  { name: 'flat_subjectHtml_contentHtml',
    body: { subjectHtml: 'TEST', contentHtml: '<p>x</p>' } },
  { name: 'message_object_only_contentHtml',
    body: { message: { contentHtml: '<p>x</p>' } } },
];

export const onRequestGet = async ({ env }) => {
  const FAKE_LEAD = '000000000000000000000000'; // hopefully nonexistent → won't actually send
  const base = {
    identityId: '692ddbdd81719c886d5da2ce',
    memberId: '69d4ec91c1fb94f4e64096ca',
    leadId: FAKE_LEAD,
  };
  const results = [];
  for (const shape of SHAPES) {
    const body = { ...base, ...shape.body };
    const r = await fetch(`${LGM_BASE}/inbox/email?apikey=${env.LGM_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    results.push({ shape: shape.name, status: r.status, response: json });
  }
  return Response.json(results, { headers: cors });
};
