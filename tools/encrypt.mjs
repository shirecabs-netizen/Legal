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
<noscript><style>#f{display:none!important}</style><div class="c"><h1>JavaScript is required</h1><p>This document cannot be displayed because JavaScript is turned off or blocked in your browser.</p><p>To view it: enable JavaScript for this site (or disable any script-blocking extension such as NoScript, uBlock or Brave Shields for <strong>legal.shire.taxi</strong>), then reload the page.</p></div></noscript>
<div class="c" id="unsupported" style="display:none"><h1>Browser not supported</h1><p>This document needs a current browser (Chrome, Edge, Firefox or Safari) opened over a secure (https) connection, with JavaScript enabled. Please update your browser or switch to one of these, then reload.</p></div>
<form class="c" id="f" autocomplete="off"><h1>Protected document</h1><p>Enter the password you were given to open this letter.</p>
<input type="password" id="p" placeholder="Password" required autofocus><button id="b">Unlock</button><p class="e" id="e" role="alert"></p></form>
<script>
(function(){
var S="${b64(salt)}",I="${b64(iv)}",C="${ct}",N=${ITER};
if(!(window.crypto&&crypto.subtle&&window.TextDecoder&&window.Uint8Array)){document.getElementById('f').style.display='none';document.getElementById('unsupported').style.display='block';return;}
var u=function(s){return Uint8Array.from(atob(s),function(x){return x.charCodeAt(0)})};
var rnd=function(){var a=new Uint8Array(9);crypto.getRandomValues(a);return Array.prototype.map.call(a,function(x){return (x%36).toString(36)}).join('')+Date.now().toString(36)};
var ref='';try{ref=(new URLSearchParams(location.search).get('r')||'').slice(0,40)}catch(_){}
var st={sid:rnd(),ref:ref,t0:Date.now(),unlocked:false,fails:0,seconds:0,scroll:0,tamper:{}};
function send(){try{var b=JSON.stringify(st);if(navigator.sendBeacon)navigator.sendBeacon('/api/t',new Blob([b],{type:'application/json'}));else fetch('/api/t',{method:'POST',body:b,keepalive:true,headers:{'Content-Type':'application/json'}});}catch(_){}}
/* runs inside the unlocked letter: reading time, scroll depth, tamper attempts */
function track(st){
  var last=Date.now(),act=st.seconds||0;
  function send(){try{var b=JSON.stringify(st);if(navigator.sendBeacon)navigator.sendBeacon('/api/t',new Blob([b],{type:'application/json'}));else fetch('/api/t',{method:'POST',body:b,keepalive:true,headers:{'Content-Type':'application/json'}});}catch(_){}}
  function sc(){var h=document.documentElement,p=Math.round(100*(window.scrollY+window.innerHeight)/Math.max(h.scrollHeight,1));if(p>st.scroll)st.scroll=Math.min(p,100);}
  function tam(w){st.tamper[w]=(st.tamper[w]||0)+1;send();}
  window.addEventListener('scroll',sc,{passive:true});sc();
  ['mousemove','keydown','touchstart','scroll','click'].forEach(function(e){document.addEventListener(e,function(){last=Date.now();},{passive:true,capture:true});});
  setInterval(function(){if(!document.hidden&&Date.now()-last<30000){act+=10;st.seconds=act;}sc();send();},10000);
  document.addEventListener('visibilitychange',function(){if(document.hidden)send();});
  window.addEventListener('pagehide',send);
  ['copy','cut','contextmenu','dragstart'].forEach(function(e){document.addEventListener(e,function(){tam(e);},true);});
  window.addEventListener('beforeprint',function(){tam('print');});
  document.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase(),c=e.ctrlKey||e.metaKey;
    if((c&&['p','s','u','c','x','a'].indexOf(k)>-1)||e.key==='F12'||k==='printscreen'||(c&&e.shiftKey&&['i','j','c'].indexOf(k)>-1))tam('key');},true);
  send();
}
document.addEventListener('contextmenu',function(e){e.preventDefault()});
window.addEventListener('beforeprint',function(){document.body.style.display='none'});
send();
document.getElementById('f').addEventListener('submit',async function(ev){
  ev.preventDefault();var e=document.getElementById('e'),b=document.getElementById('b');e.textContent='';b.disabled=true;b.textContent='Unlocking\u2026';
  try{
    var k=await crypto.subtle.importKey('raw',new TextEncoder().encode(document.getElementById('p').value),'PBKDF2',false,['deriveKey']);
    var key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:u(S),iterations:N,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['decrypt']);
    var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:u(I)},key,u(C));
    var html=new TextDecoder().decode(pt);
    st.unlocked=true;
    document.open();document.write(html);document.close();
    var s=document.createElement('script');s.text='('+track.toString()+')('+JSON.stringify(st)+')';document.body.appendChild(s);
  }catch(x){st.fails++;send();e.textContent='Incorrect password.';b.disabled=false;b.textContent='Unlock';document.getElementById('p').select();}
});
})();
</script></body></html>
`);
