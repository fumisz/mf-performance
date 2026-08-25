const CACHE = 'mfp-app-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Só mexe no mesmo domínio (Supabase e afins vão direto pra rede)
  if (url.origin !== location.origin) return

  const isDoc =
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html')

  if (isDoc) {
    // HTML sempre da rede, ignorando cache HTTP do navegador (versão fresca)
    e.respondWith(
      fetch(req.url, { cache: 'no-store' })
        .then((r) => {
          const c = r.clone()
          caches.open(CACHE).then((ca) => ca.put(req, c)).catch(() => {})
          return r
        })
        .catch(() => caches.match(req).then((h) => h || caches.match('./index.html')))
    )
    return
  }

  // Assets com hash no nome são imutáveis: cache-first
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          const c = r.clone()
          caches.open(CACHE).then((ca) => ca.put(req, c)).catch(() => {})
          return r
        })
    )
  )
})
