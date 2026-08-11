const CACHE='mfp-v47';
const ASSETS=[
  './','./index.html','./config.js','./manifest.json',
  './lib/react.js','./lib/react-dom.js','./lib/babel.js',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'
];
self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(ASSETS.map(a=>c.add(a)))));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
// ── Web Push: mostra a notificação na barra do sistema ──
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{};}catch(_){d={titulo:'MF Performance',texto:e.data&&e.data.text()};}
  const titulo=d.titulo||'MF Performance';
  const opts={
    body:d.texto||'',
    icon:'./icons/icon-192.png',
    badge:'./icons/icon-192.png',
    tag:d.tag||('mfp-'+Date.now()),
    data:{url:d.url||'./'},
    vibrate:[80,40,80]
  };
  e.waitUntil(self.registration.showNotification(titulo,opts));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'./';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{
    for(const w of ws){if('focus'in w)return w.focus();}
    if(clients.openWindow)return clients.openWindow(url);
  }));
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  // Nunca cachear chamadas de API (Supabase) — sempre rede
  if(url.origin!==location.origin || url.hostname.endsWith('supabase.co')) return;
  // HTML e config: network-first (pega atualizações na hora)
  const isDoc=req.mode==='navigate'||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/config.js')||url.pathname==='/'||url.pathname.endsWith('/');
  if(isDoc){
    e.respondWith(fetch(req).then(res=>{const c=res.clone();caches.open(CACHE).then(ca=>ca.put(req,c)).catch(()=>{});return res;})
      .catch(()=>caches.match(req).then(h=>h||caches.match('./index.html'))));
    return;
  }
  // Estáticos: cache-first
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{const c=res.clone();caches.open(CACHE).then(ca=>ca.put(req,c)).catch(()=>{});return res;})));
});
