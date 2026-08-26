import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── Auto-atualização: se sair versão nova no ar, recarrega sozinho ──
// (resolve o "não atualizou": o index.html é buscado sem cache e, se o
//  bundle mudou, a página recarrega automaticamente)
const bundleAtual = (document.querySelector('script[type="module"]') as HTMLScriptElement | null)?.src || ''
async function checarAtualizacao() {
  try {
    const html = await (await fetch('./index.html', { cache: 'no-store' })).text()
    const m = html.match(/assets\/index-[\w-]+\.js/)
    if (m && bundleAtual && !bundleAtual.includes(m[0])) location.reload()
  } catch {
    /* offline: ignora */
  }
}
setInterval(checarAtualizacao, 60_000)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checarAtualizacao()
})

// ── Service worker (instalável + HTML sempre fresco) ──
if ('serviceWorker' in navigator) {
  // Remove qualquer SW cujo escopo NÃO seja o do app novo (ex.: o SW do app
  // antigo na raiz, que cobria /preview/ e servia versao velha)
  navigator.serviceWorker.getRegistrations().then((rs) => {
    rs.forEach((r) => {
      if (!r.scope.includes('/preview/')) r.unregister()
    })
  }).catch(() => {})

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.update()
      setInterval(() => reg.update(), 60_000)
    }).catch(() => {})
  })
}
