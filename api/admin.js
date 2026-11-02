const crypto = require('crypto');
const { sb, esc, page, env } = require('../lib/util');
function authed(req) {
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const pw = Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':');
  const a = crypto.createHash('sha256').update(pw).digest(), b = crypto.createHash('sha256').update(env('ADMIN_KEY')).digest();
  return crypto.timingSafeEqual(a, b);
}
const f = (v) => v ? new Date(v).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—';
module.exports = async (req, res) => {
  try {
    if (!authed(req)) { res.statusCode = 401; res.setHeader('WWW-Authenticate', 'Basic realm="admin"'); return res.end('Authentication required'); }
    const [st, ev] = await Promise.all([
      sb('recipient_status?select=*&order=name'),
      sb('events?select=created_at,type,detail,ip,country,city,ua,recipients(name)&order=created_at.desc&limit=100'),
    ]);
    const colour = { 'VIEWED': '#0B6B2E', 'OPENED LINK - NOT VERIFIED': '#9F6F0A', 'NOT OPENED': '#A61C1C' };
    const rows = st.map((r) => `<tr><td>${esc(r.name)}<br><small>${esc(r.org || '')} ${esc(r.email)}</small></td><td style="color:${colour[r.status]};font-weight:700">${esc(r.status)}</td><td>${f(r.first_link_open)}</td><td>${f(r.first_verified)}</td><td>${f(r.last_viewed)}</td><td>${r.views}</td><td>${r.max_seconds}s</td><td>${r.failed_codes}</td><td>${r.tamper_attempts}</td></tr>`).join('');
    const evr = ev.map((e) => `<tr><td>${f(e.created_at)}</td><td>${esc(e.recipients && e.recipients.name || '—')}</td><td>${esc(e.type)}</td><td>${esc(e.detail ? JSON.stringify(e.detail) : '')}</td><td>${esc(e.ip)} ${esc(e.city || '')} ${esc(e.country || '')}</td><td><small>${esc(e.ua)}</small></td></tr>`).join('');
    const html = page('Viewing report', '').replace('<div class="c"></div>', `<div style="max-width:1200px;width:100%;overflow:auto;background:#fff;padding:1rem;user-select:text"><h1>Letter viewing report</h1><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:.85rem"><tr><th>Recipient</th><th>Status</th><th>Link first opened</th><th>Verified</th><th>Last viewed</th><th>Views</th><th>Max time</th><th>Wrong codes</th><th>Print/copy attempts</th></tr>${rows}</table><h2>Latest 100 events</h2><table border="1" cellpadding="5" style="border-collapse:collapse;width:100%;font-size:.8rem"><tr><th>When</th><th>Who</th><th>Event</th><th>Detail</th><th>IP / place</th><th>Device</th></tr>${evr}</table></div>`);
    res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(html);
  } catch (e) { console.error(e); res.statusCode = 500; res.end('Error'); }
};
