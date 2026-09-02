const CACHE='mfp-2026.09.29';
// Tudo que o app precisa para ABRIR sem rede. A biblioteca do Supabase entrou
// aqui: antes vinha da jsdelivr, e como o worker so guardava o proprio dominio,
// no modo aviao ela nao carregava e o app morria na tela de configuracao.
const ASSETS=[
  './','./index.html','./config.js','./manifest.json',
  './app.js?v=2026.09.29','./lib/fontes.css',
  './lib/react.js','./lib/react-dom.js','./lib/supabase.js',
  './lib/fontes/inter-latin.woff2',
  './lib/fontes/inter-latin-ext.woff2',
  './lib/fontes/cormorant-latin-ext.woff2',
  './lib/fontes/cormorant-latin.woff2',
  './lib/fontes/playfair-latin-ext.woff2',
  './lib/fontes/playfair-latin.woff2',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'
];
// De fora do dominio: guarda depois de carregar uma vez. Fonte e desenho de
// exercicio nao mudam, entao servir do cache e sempre certo — e e o que faz o
// app ficar igual offline em vez de perder a tipografia e as demonstracoes.
// so os desenhos de exercicio vem de fora agora; as fontes moram em lib/fontes
const DE_FORA=/^https:\/\/cdn\.jsdelivr\.net\//;
self.addEventListener('install',e=>{
  self.skipWaiting();
  // cache:'reload' obriga a buscar na rede: sem isso o navegador podia
  // guardar de novo a copia velha que ja estava no cache HTTP dele
  e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(
    ASSETS.map(a=>c.add(new Request(a,{cache:'reload'}))))));
});

// a pagina pede para o worker novo assumir na hora, sem esperar fechar as abas
// e tambem agenda o aviso do fim do descanso (o celular fica no bolso, a aba
// congela, e so o worker consegue tocar a notificacao)
let descanso=null;
self.addEventListener('message',e=>{
  const d=e.data||{};
  if(d.tipo==='ASSUMIR') self.skipWaiting();
  if(d.tipo==='DESCANSO-CANCELAR'){
    descanso=null;
    self.registration.getNotifications({tag:'mfp-descanso'}).then(ns=>ns.forEach(n=>n.close())).catch(()=>{});
  }
  if(d.tipo==='DESCANSO'){
    const id=Date.now();descanso=id;
    const falta=Math.max(0,(d.em||0)-Date.now());
    // waitUntil segura o worker de pe ate a hora — e o que faz o aviso sair
    // mesmo com o app fechado no bolso
    e.waitUntil(new Promise(pronto=>setTimeout(pronto,falta)).then(()=>{
      if(descanso!==id)return;            // ele pulou ou concluiu antes
      descanso=null;
      return self.registration.showNotification('Descanso terminado',{
        body:d.nome?'Hora da próxima série — '+d.nome:'Hora da próxima série.',
        icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',
        tag:'mfp-descanso',renotify:true,requireInteraction:false,
        data:{url:'./'},vibrate:[120,60,120,60,200]});
    }));
  }
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
  if(url.hostname.endsWith('supabase.co')) return;
  // Fontes e desenhos: cache-first, e guarda o que vier novo
  if(url.origin!==location.origin){
    if(!DE_FORA.test(req.url)) return;
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{
      // resposta opaca (no-cors) tambem serve: o navegador consegue exibir
      if(res&&(res.ok||res.type==='opaque')){const c=res.clone();caches.open(CACHE).then(ca=>ca.put(req,c)).catch(()=>{});}
      return res;
    }).catch(()=>caches.match(req))));
    return;
  }
  // HTML e config: network-first (pega atualizações na hora)
  const isDoc=req.mode==='navigate'||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/config.js')||url.pathname==='/'||url.pathname.endsWith('/');
  if(isDoc){
    // Sempre da rede ignorando o cache HTTP do navegador — sem isso o navegador
    // podia devolver o index.html velho e o app "nao atualizava"
    e.respondWith(fetch(req.url,{cache:'no-store'}).then(res=>{const c=res.clone();caches.open(CACHE).then(ca=>ca.put(req,c)).catch(()=>{});return res;})
      .catch(()=>caches.match(req).then(h=>h||caches.match('./index.html'))));
    return;
  }
  // Estáticos: cache-first
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{const c=res.clone();caches.open(CACHE).then(ca=>ca.put(req,c)).catch(()=>{});return res;})));
});
