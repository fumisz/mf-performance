import { useEffect, useState } from "react"

function ytEmbed(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/)
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null
}

// Anima os 2 frames do free-exercise-db (0.jpg / 1.jpg) como um gif
function AnimGif({ base, nome }: { base: string; nome: string }) {
  const f0 = base
  const f1 = base.replace("/0.jpg", "/1.jpg")
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setOn((v) => !v), 650)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="overflow-hidden rounded-xl bg-white">
      <img src={on ? f1 : f0} alt={nome} className="mx-auto block max-h-72 w-full object-contain" />
      {/* pré-carrega o segundo frame */}
      <img src={f1} alt="" className="hidden" aria-hidden />
    </div>
  )
}

export function ExDemo({ url, nome }: { url: string | null; nome: string }) {
  if (!url) {
    const q = encodeURIComponent(nome + " execução exercício")
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-4 text-center">
        <p className="text-sm text-muted-foreground">Sem demonstração cadastrada.</p>
        <a
          href={`https://www.youtube.com/results?search_query=${q}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-sm font-semibold text-primary"
        >
          Buscar no YouTube ↗
        </a>
      </div>
    )
  }

  if (url.includes("free-exercise-db")) return <AnimGif base={url} nome={nome} />

  const yt = ytEmbed(url)
  if (yt) {
    return (
      <div className="relative w-full overflow-hidden rounded-xl" style={{ paddingBottom: "56%" }}>
        <iframe
          src={yt}
          title={nome}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      </div>
    )
  }

  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
    return <video src={url} autoPlay loop muted playsInline className="w-full rounded-xl bg-black" />
  }

  return <img src={url} alt={nome} className="w-full rounded-xl bg-white object-contain" />
}
