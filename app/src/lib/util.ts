// Força atualização: limpa caches + service worker e recarrega sem cache
export async function forcarAtualizacao() {
  try {
    const ks = await caches.keys()
    await Promise.all(ks.map((k) => caches.delete(k)))
  } catch {
    /* ignora */
  }
  try {
    const rs = await navigator.serviceWorker?.getRegistrations?.()
    if (rs) await Promise.all(rs.map((r) => r.unregister()))
  } catch {
    /* ignora */
  }
  location.replace(location.pathname + "?_=" + Date.now())
}

const ACCENTS = ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#e11d48", "#ea580c", "#d97706", "#db2777"]
export const PALETA = ACCENTS

export function getAccent(coachId?: string): string {
  try {
    return localStorage.getItem("mfp_accent_" + (coachId || "")) || ACCENTS[0]
  } catch {
    return ACCENTS[0]
  }
}

export function setAccent(coachId: string, color: string) {
  try {
    localStorage.setItem("mfp_accent_" + coachId, color)
  } catch {
    /* ignora */
  }
}
