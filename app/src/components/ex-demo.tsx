function ytEmbed(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/)
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null
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
    return (
      <video
        src={url}
        autoPlay
        loop
        muted
        playsInline
        className="w-full rounded-xl bg-black"
      />
    )
  }

  // gif / png / jpg / webp ou qualquer imagem
  return <img src={url} alt={nome} className="w-full rounded-xl bg-black object-contain" />
}
