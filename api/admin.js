const crypto = require('crypto');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const when = (v) => v ? new Date(v).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—';
const mins = (s) => s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's';
module.exports = async (req, res) => {
  const key = process.env.ADMIN_KEY || '';
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  const pw = m ? Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':') : '';
  if (!key || !crypto.timingSafeEqual(sha(pw), sha(key))) { res.statusCode = 401; res.setHeader('WWW-Authenticate', 'Basic realm="report"'); return res.end('Authentication required'); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.end('<h2>Storage not configured</h2><p>Set SUPABASE_URL and SUPABASE_SERVICE_KEY (and run supabase/schema.sql). Until then, tracking lines tagged <code>LETTER_TRACK</code> are in the Vercel runtime logs.</p>');
  }
  try {
    const r = await fetch(process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/sessions?select=*&order=last_seen.desc&limit=500',
      { headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY } });
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    const status = (s) => s.unlocked ? ['READ', '#0B6B2E'] : s.fails ? ['WRONG PASSWORD', '#A61C1C'] : ['OPENED, NOT UNLOCKED', '#9F6F0A'];
    const seen = new Set(rows.map((s) => (s.ref || '').toLowerCase()));
    const missing = (process.env.RECIPIENTS || '').split(',').map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()));
    const body = rows.map((s) => { const [t, c] = status(s); return `<tr><td>${esc(s.ref || '—')}</td><td style="color:${c};font-weight:700">${t}</td><td>${when(s.started_at)}</td><td>${when(s.last_seen)}</td><td>${mins(s.seconds)}</td><td>${s.max_scroll}%</td><td>${s.fails}</td><td>${esc(s.tamper && Object.keys(s.tamper).length ? JSON.stringify(s.tamper) : '')}</td><td>${esc(s.ip)}<br>${esc(s.city || '')} ${esc(s.country || '')}</td><td><small>${esc(s.ua)}</small></td></tr>`; }).join('');
    res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><meta name=robots content=noindex><title>Viewing report</title><body style="font:14px Arial;padding:1rem"><h2>Letter viewing report</h2>${missing.length ? `<p style="color:#A61C1C;font-weight:700">NOT OPENED: ${esc(missing.join(', '))}</p>` : ''}<div style="overflow:auto"><table border=1 cellpadding=6 style="border-collapse:collapse"><tr><th>Link tag</th><th>Status</th><th>First seen</th><th>Last seen</th><th>Reading time</th><th>Scrolled</th><th>Wrong pw</th><th>Print/copy attempts</th><th>IP / place</th><th>Device</th></tr>${body}</table></div></body>`);
  } catch (e) { console.error(e); res.statusCode = 500; res.end('Error loading report'); }
};
