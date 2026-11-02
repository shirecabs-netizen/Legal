const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sb, logEvent, hashCode, makeSession, readSession, mail, esc, maskEmail, page, env } = require('../lib/util');

const SESSION_TTL = 2 * 60 * 60; // 2 hours
const TOKEN_RE = /^[a-f0-9]{20,64}$/;

const BEACON = `<script>(function(){
var t0=Date.now(),act=0,max=0,last=Date.now();
function send(t,d){try{var b=JSON.stringify({t:t,d:d||{}});if(navigator.sendBeacon){navigator.sendBeacon('/api/event',new Blob([b],{type:'application/json'}));}else{fetch('/api/event',{method:'POST',body:b,keepalive:true,headers:{'Content-Type':'application/json'}});}}catch(_){}}
function sc(){var h=document.documentElement,p=Math.round(100*(window.scrollY+window.innerHeight)/Math.max(h.scrollHeight,1));if(p>max)max=p;}
window.addEventListener('scroll',sc,{passive:true});sc();
['mousemove','keydown','touchstart','scroll','click'].forEach(function(e){document.addEventListener(e,function(){last=Date.now();},{passive:true,capture:true});});
setInterval(function(){if(!document.hidden&&Date.now()-last<30000)act+=15;send('heartbeat',{seconds:act,scroll:max});},15000);
document.addEventListener('visibilitychange',function(){if(document.hidden)send('heartbeat',{seconds:act,scroll:max});});
window.addEventListener('pagehide',function(){send('heartbeat',{seconds:act,scroll:max});});
['copy','cut','contextmenu','dragstart'].forEach(function(e){document.addEventListener(e,function(){send('tamper',{what:e});},true);});
window.addEventListener('beforeprint',function(){send('tamper',{what:'print'});});
document.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase(),c=e.ctrlKey||e.metaKey;
if((c&&['p','s','u','c','x','a'].indexOf(k)>-1)||e.key==='F12'||k==='printscreen'||(c&&e.shiftKey&&['i','j','c'].indexOf(k)>-1))send('tamper',{what:'key:'+(c?'ctrl+':'')+(e.shiftKey?'shift+':'')+k});},true);
})();</script>`;

function send(res, code, html, extra) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const k in extra || {}) res.setHeader(k, extra[k]);
  res.end(html);
}

function step1(r, rec, err) {
  return page('Secure document', `<h1>Secure document</h1>
<p>Access is by invitation only. We will email a one-time verification code to <strong>${esc(maskEmail(rec.email))}</strong>.</p>
${err ? `<p class="e">${esc(err)}</p>` : ''}
<form method="POST" action="/"><input type="hidden" name="r" value="${esc(r)}"><input type="hidden" name="action" value="send"><button>Email me a code</button></form>
<p class="m">Your access, including time, device and approximate location, is recorded.</p>`);
}
function step2(r, rec, err) {
  return page('Enter code', `<h1>Enter your code</h1>
<p>A 6-digit code was sent to <strong>${esc(maskEmail(rec.email))}</strong>. It expires in 10 minutes.</p>
${err ? `<p class="e">${esc(err)}</p>` : ''}
<form method="POST" action="/"><input type="hidden" name="r" value="${esc(r)}"><input type="hidden" name="action" value="verify">
<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus><button>Verify</button></form>
<form method="POST" action="/"><input type="hidden" name="r" value="${esc(r)}"><input type="hidden" name="action" value="send"><button style="background:#6B6452">Send a new code</button></form>`);
}
const denied = () => page('Not available', '<h1>Not available</h1><p>This document is available by invitation only.</p>');

async function getRecipient(token) {
  if (!TOKEN_RE.test(token || '')) return null;
  const rows = await sb('recipients?select=id,name,email,active&active=eq.true&token=eq.' + token + '&limit=1');
  return rows && rows[0] || null;
}

function serveLetter(res) {
  let html = fs.readFileSync(path.join(process.cwd(), 'private', 'letter.html'), 'utf8');
  html = html.includes('</body>') ? html.replace('</body>', BEACON + '</body>') : html + BEACON;
  send(res, 200, html);
}

module.exports = async (req, res) => {
  try {
    env('SUPABASE_URL'); env('SESSION_SECRET'); // fail closed if misconfigured
    const url = new URL(req.url, 'http://x');
    const body = req.method === 'POST' ? (req.body || {}) : {};
    const token = String(body.r || url.searchParams.get('r') || '');

    // 1. valid session cookie -> letter
    const sessRid = readSession(req);
    if (sessRid && req.method === 'GET') {
      const rows = await sb('recipients?select=id&active=eq.true&id=eq.' + sessRid + '&limit=1');
      if (rows && rows[0]) { await logEvent(req, sessRid, 'letter_viewed'); return serveLetter(res); }
    }

    // 2. otherwise need a valid personal link
    const rec = await getRecipient(token);
    if (!rec) { await logEvent(req, null, 'denied', { reason: token ? 'bad_token' : 'no_token' }); return send(res, 403, denied()); }

    if (req.method === 'GET') {
      await logEvent(req, rec.id, 'link_opened');
      return send(res, 200, step1(token, rec));
    }

    if (body.action === 'send') {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const recent = await sb('otp?select=id&recipient_id=eq.' + rec.id + '&created_at=gte.' + since);
      if (recent.length >= 3) { await logEvent(req, rec.id, 'code_ratelimited'); return send(res, 429, step2(token, rec, 'Too many codes requested. Please wait a few minutes.')); }
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await sb('otp', { method: 'POST', body: { recipient_id: rec.id, code_hash: hashCode(code, rec.id), expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() } });
      await mail(rec.email, 'Your verification code', `Your one-time verification code is ${code}\n\nIt expires in 10 minutes. If you did not request it, ignore this email.`);
      await logEvent(req, rec.id, 'code_sent');
      return send(res, 200, step2(token, rec));
    }

    if (body.action === 'verify') {
      const code = String(body.code || '').trim();
      const rows = await sb('otp?select=id,code_hash,attempts&recipient_id=eq.' + rec.id + '&used=eq.false&expires_at=gte.' + new Date().toISOString() + '&order=created_at.desc&limit=1');
      const o = rows && rows[0];
      if (!o || o.attempts >= 5) { await logEvent(req, rec.id, 'code_failed', { reason: o ? 'locked' : 'none_or_expired' }); return send(res, 200, step1(token, rec, 'That code has expired. Please request a new one.')); }
      const a = Buffer.from(hashCode(code, rec.id)), b = Buffer.from(o.code_hash);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        await sb('otp?id=eq.' + o.id, { method: 'PATCH', body: { attempts: o.attempts + 1 } });
        await logEvent(req, rec.id, 'code_failed', { reason: 'wrong_code' });
        return send(res, 200, step2(token, rec, 'Incorrect code.'));
      }
      await sb('otp?id=eq.' + o.id, { method: 'PATCH', body: { used: true } });
      await logEvent(req, rec.id, 'code_verified');
      try { await mail(process.env.NOTIFY_EMAIL || env('GMAIL_USER'), `Letter opened: ${rec.name}`, `${rec.name} (${rec.email}) verified and opened the letter at ${new Date().toISOString()}.`); } catch (e) { console.error('notify failed', e.message); }
      res.statusCode = 303;
      res.setHeader('Set-Cookie', `lv=${makeSession(rec.id, SESSION_TTL)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`);
      res.setHeader('Location', '/');
      return res.end();
    }

    return send(res, 400, denied());
  } catch (e) {
    console.error(e);
    return send(res, 500, page('Unavailable', '<h1>Temporarily unavailable</h1><p>Please try again shortly.</p>'));
  }
};
