const crypto = require('crypto');
const nodemailer = require('nodemailer');

const env = (k) => { const v = process.env[k]; if (!v) throw new Error('Missing env ' + k); return v; };

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(env('SUPABASE_URL').replace(/\/$/, '') + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: env('SUPABASE_SERVICE_KEY'),
      Authorization: 'Bearer ' + env('SUPABASE_SERVICE_KEY'),
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error('Supabase ' + res.status + ': ' + (await res.text()));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

function client(req) {
  const h = req.headers;
  const dec = (v) => { try { return decodeURIComponent(v || ''); } catch (_) { return v || ''; } };
  return {
    ip: ((h['x-forwarded-for'] || '').split(',')[0] || '').trim() || null,
    country: h['x-vercel-ip-country'] || null,
    city: dec(h['x-vercel-ip-city']) || null,
    ua: (h['user-agent'] || '').slice(0, 300),
  };
}

async function logEvent(req, recipient_id, type, detail) {
  try { await sb('events', { method: 'POST', body: { recipient_id: recipient_id || null, type, detail: detail || null, ...client(req) } }); }
  catch (e) { console.error('logEvent failed', e.message); }
}

const hmac = (s) => crypto.createHmac('sha256', env('SESSION_SECRET')).update(s).digest('base64url');
const hashCode = (code, rid) => hmac('otp:' + rid + ':' + code);

function makeSession(rid, ttlSec) {
  const p = Buffer.from(JSON.stringify({ r: rid, e: Math.floor(Date.now() / 1000) + ttlSec })).toString('base64url');
  return p + '.' + hmac('sess:' + p);
}
function readSession(req) {
  const m = /(?:^|;\s*)lv=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const [p, sig] = m[1].split('.');
  if (!p || !sig) return null;
  const good = hmac('sess:' + p);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.e > Date.now() / 1000 ? o.r : null; } catch (_) { return null; }
}

let tx;
async function mail(to, subject, text) {
  tx = tx || nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: env('GMAIL_USER'), pass: env('GMAIL_APP_PASSWORD') } });
  await tx.sendMail({ from: `"SHIRE Taxi" <${env('GMAIL_USER')}>`, to, subject, text });
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const maskEmail = (e) => { const [u, d] = e.split('@'); return u.slice(0, 1) + '***@' + d; };

function page(title, inner) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>
body{margin:0;background:#EDE4CC;font:16px/1.55 Calibri,Carlito,"Segoe UI",Arial,sans-serif;color:#1F1B14;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:1rem;-webkit-user-select:none;user-select:none}
.c{background:#FFFDF5;border-top:6px solid #0A3A2B;max-width:440px;width:100%;padding:1.8rem;box-shadow:0 2px 14px rgba(0,0,0,.15)}
h1{font-size:1.2rem;margin:0 0 .8rem;color:#0A3A2B}button,input{font:inherit;padding:.65rem .8rem;width:100%;box-sizing:border-box;margin-top:.7rem}
button{background:#0A3A2B;color:#fff;border:0;cursor:pointer}input{border:1px solid #DCCFA2;letter-spacing:.3em;text-align:center;font-size:1.3rem}
.e{color:#A61C1C}.m{color:#6B6452;font-size:.85rem;margin-top:1rem}</style></head><body><div class="c">${inner}</div></body></html>`;
}

module.exports = { sb, client, logEvent, hashCode, makeSession, readSession, mail, esc, maskEmail, page, env };
