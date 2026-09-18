/* Emails a website enquiry to the BYJH inboxes through Resend.
   Env: RESEND_API_KEY (required), CONTACT_TO (comma-separated), CONTACT_FROM. */
const TYPES = { journey: 'A journey', 'custom-build': 'A custom build', general: 'General enquiry' };

const clean = (value, max) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(503).json({ error: 'Email sending is not configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (body.company) return res.status(200).json({ ok: true }); // honeypot: pretend success

  const name = clean(body.name, 100);
  const email = clean(body.email, 254);
  const message = String(body.message ?? '').trim().slice(0, 5000);
  const type = TYPES[body.type] ? body.type : 'general';
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10) {
    return res.status(400).json({ error: 'Please complete the required fields' });
  }

  const lines = [`Name: ${name}`, `Email: ${email}`, `Phone: ${clean(body.phone, 40) || 'Not provided'}`];
  if (type === 'journey') {
    lines.push('', `Vehicle: ${clean(body.vehicle, 60) || 'Help me choose'}`,
      `Date: ${clean(body.date, 20) || 'To be confirmed'}`,
      `Starting location: ${clean(body.pickup, 200) || 'To be confirmed'}`,
      `Duration: ${clean(body.duration, 40) || 'To be confirmed'}`);
  }
  lines.push('', 'Message:', message);

  const to = (process.env.CONTACT_TO || 'info@byjh.co.uk,remmie@byjh.co.uk')
    .split(',').map(s => s.trim()).filter(Boolean);
  const from = process.env.CONTACT_FROM || 'BYJH Website <enquiries@byjh.co.uk>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to, reply_to: email,
      subject: `BYJH enquiry — ${TYPES[type]} — ${name}`,
      text: lines.join('\n')
    })
  });
  if (!response.ok) return res.status(502).json({ error: 'Could not send the enquiry' });
  return res.status(200).json({ ok: true });
};
