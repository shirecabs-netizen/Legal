// Usage: PASSWORD='...' node tools/encrypt.mjs path/to/letter.html > index.html
import { webcrypto as c } from 'node:crypto';
import fs from 'node:fs';
const pw = process.env.PASSWORD, src = process.argv[2];
if (!pw || !src) { console.error('Set PASSWORD and pass the source HTML path'); process.exit(1); }
const ITER = 600000, enc = new TextEncoder();
const salt = c.getRandomValues(new Uint8Array(16)), iv = c.getRandomValues(new Uint8Array(12));
const base = await c.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
const key = await c.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = Buffer.from(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, fs.readFileSync(src))).toString('base64');
const b64 = (u) => Buffer.from(u).toString('base64');
process.stdout.write(`<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive,nosnippet"><title>Letter Before Claim | HV0053 / DG66 YLA</title>
<style>
*{box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;background:#EDE4CC;color:#1F1B14;font:16px/1.55 Calibri,Carlito,"Segoe UI",Arial,sans-serif}
.c{background:#FFFDF5;border-top:6px solid #0A3A2B;max-width:420px;width:100%;padding:1.8rem;box-shadow:0 2px 14px rgba(0,0,0,.15)}
h1{font-size:1.2rem;margin:0 0 .6rem;color:#0A3A2B}input,button{font:inherit;width:100%;padding:.7rem .8rem;margin-top:.7rem}
input{border:1px solid #DCCFA2;-webkit-user-select:text;user-select:text}button{background:#0A3A2B;color:#fff;border:0;cursor:pointer}
.e{color:#A61C1C;min-height:1.4em;margin:.6rem 0 0}@media print{body>*{display:none!important}}
</style></head><body>
<form class="c" id="f" autocomplete="off"><h1>Protected document</h1><p>Enter the password you were given to open this letter.</p>
<input type="password" id="p" placeholder="Password" required autofocus><button id="b">Unlock</button><p class="e" id="e" role="alert"></p></form>
<script>
(function(){
var S="${b64(salt)}",I="${b64(iv)}",C="${ct}",N=${ITER};
var u=function(s){return Uint8Array.from(atob(s),function(x){return x.charCodeAt(0)})};
document.addEventListener('contextmenu',function(e){e.preventDefault()});
window.addEventListener('beforeprint',function(){document.body.style.display='none'});
document.getElementById('f').addEventListener('submit',async function(ev){
  ev.preventDefault();var e=document.getElementById('e'),b=document.getElementById('b');e.textContent='';b.disabled=true;b.textContent='Unlocking…';
  try{
    var k=await crypto.subtle.importKey('raw',new TextEncoder().encode(document.getElementById('p').value),'PBKDF2',false,['deriveKey']);
    var key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:u(S),iterations:N,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['decrypt']);
    var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:u(I)},key,u(C));
    var html=new TextDecoder().decode(pt);document.open();document.write(html);document.close();
  }catch(x){e.textContent='Incorrect password.';b.disabled=false;b.textContent='Unlock';document.getElementById('p').select();}
});
})();
</script></body></html>
`);
