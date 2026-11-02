const { logEvent, readSession } = require('../lib/util');
const ALLOWED = new Set(['heartbeat', 'tamper']);
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const rid = readSession(req);
    if (req.method !== 'POST' || !rid) { res.statusCode = 204; return res.end(); }
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = {}; } }
    if (b && ALLOWED.has(b.t)) {
      const d = b.d || {};
      await logEvent(req, rid, b.t, { seconds: Math.min(+d.seconds || 0, 86400), scroll: Math.min(+d.scroll || 0, 100), what: String(d.what || '').slice(0, 40) });
    }
  } catch (e) { console.error(e); }
  res.statusCode = 204; res.end();
};
