// Builds the password-protected viewer (index.html) holding one or more letters as tabs.
//
// Usage:
//   PASSWORD='...' node tools/encrypt.mjs "id|Tab label|Tab sub-label|path/to/letter.html" [more tabs...] > index.html
// e.g.
//   PASSWORD='HV0053' node tools/encrypt.mjs \
//     "orig|Original letter|2 Nov 2026|letter_v111.html" \
//     "cons|Consolidated letter|9 Nov 2026|letter_v116.html" > index.html
//
// The first tab opens by default. With a single tab no tab bar is shown.
import { webcrypto as c } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pw = process.env.PASSWORD, specs = process.argv.slice(2);
if (!pw || !specs.length) { console.error('Set PASSWORD and pass at least one "id|label|sub|path" tab'); process.exit(1); }
const tabs = specs.map((s) => {
  const [id, label, sub, ...rest] = s.split('|');
  const file = rest.join('|');
  if (!id || !label || !file) { console.error('Bad tab spec: ' + s); process.exit(1); }
  return { id, label, sub, html: fs.readFileSync(file, 'utf8') };
});

const ITER = 600000, enc = new TextEncoder();
const salt = c.getRandomValues(new Uint8Array(16)), iv = c.getRandomValues(new Uint8Array(12));
const base = await c.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
const key = await c.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = Buffer.from(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ tabs })))).toString('base64');
const b64 = (u) => Buffer.from(u).toString('base64');

const tpl = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'viewer.template.html'), 'utf8');
process.stdout.write(tpl
  .replace('@@SALT@@', () => b64(salt)).replace('@@IV@@', () => b64(iv))
  .replace('@@CT@@', () => ct).replace('@@ITER@@', () => String(ITER)));
