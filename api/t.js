// Receives tracking beacons from the letter page.
const num = (v, max) => Math.max(0, Math.min(Math.floor(+v || 0), max));
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 204;
  try {
    if (req.method !== 'POST') return res.end();
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = null; } }
    if (!b || !/^[a-z0-9]{10,32}$/.test(b.sid || '')) return res.end();
    const h = req.headers;
    let city = h['x-vercel-ip-city'] || ''; try { city = decodeURIComponent(city); } catch (_) {}
    const tamper = {};
    for (const k of Object.keys(b.tamper || {}).slice(0, 12)) tamper[String(k).slice(0, 24)] = num(b.tamper[k], 1000);
    const row = {
      sid: b.sid,
      ref: String(b.ref || '').replace(/[^\w .@-]/g, '').slice(0, 40) || null,
      started_at: new Date(Math.min(+b.t0 || Date.now(), Date.now())).toISOString(),
      last_seen: new Date().toISOString(),
      unlocked: !!b.unlocked, fails: num(b.fails, 1000), seconds: num(b.seconds, 86400), max_scroll: num(b.scroll, 100),
      tamper, ip: ((h['x-forwarded-for'] || '').split(',')[0] || '').trim() || null,
      country: h['x-vercel-ip-country'] || null, city: city.slice(0, 80) || null, ua: (h['user-agent'] || '').slice(0, 300),
    };
    console.log('LETTER_TRACK ' + JSON.stringify(row));
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const r = await fetch(process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/sessions?on_conflict=sid', {
        method: 'POST',
        headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row),
      });
      if (!r.ok) console.error('supabase', r.status, await r.text());
    }
  } catch (e) { console.error(e); }
  res.end();
};
