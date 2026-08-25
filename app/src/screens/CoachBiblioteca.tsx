import { useEffect, useMemo, useState } from "react"
import { loadBiblioteca, type LibExercicio } from "@/lib/coach"
import { ExDemo } from "@/components/ex-demo"
import { Input } from "@/components/ui/input"

export function CoachBiblioteca({ onBack }: { onBack: () => void }) {
  const [lib, setLib] = useState<LibExercicio[] | null>(null)
  const [q, setQ] = useState("")
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    loadBiblioteca().then(setLib)
  }, [])

  const grupos = useMemo(() => {
    const filtered = (lib || []).filter((e) => e.nome.toLowerCase().includes(q.toLowerCase()))
    const map = new Map<string, LibExercicio[]>()
    for (const e of filtered) {
      if (!map.has(e.grupo)) map.set(e.grupo, [])
      map.get(e.grupo)!.push(e)
    }
    // "Técnica avançada" por último
    return [...map.entries()].sort((a, b) =>
      a[0] === "Técnica avançada" ? 1 : b[0] === "Técnica avançada" ? -1 : a[0].localeCompare(b[0])
    )
  }, [lib, q])

  const totalComVideo = (lib || []).filter((e) => e.video_url).length

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(124,58,237,0.16),transparent_70%)]" />
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-6">
        <button onClick={onBack} className="mb-4 text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ Voltar
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">Biblioteca de exercícios</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          {lib ? `${lib.length} exercícios · ${totalComVideo} com vídeo` : "Carregando…"}
        </p>

        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar exercício…"
          className="mb-5 h-10 rounded-lg border-border/70 bg-card/40"
        />

        {grupos.map(([grupo, exs]) => (
          <section key={grupo} className="mb-6">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {grupo} <span className="ml-1 opacity-60">{exs.length}</span>
            </h2>
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card/30">
              {exs.map((e, i) => {
                const isOpen = open === e.id
                return (
                  <div key={e.id} className={i > 0 ? "border-t border-border/60" : ""}>
                    <button
                      onClick={() => setOpen(isOpen ? null : e.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-card/70"
                    >
                      <span
                        className={`inline-flex size-6 items-center justify-center rounded-md text-xs ${
                          e.video_url ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {e.video_url ? "▶" : "—"}
                      </span>
                      <span className="flex-1 text-[15px] font-medium">{e.nome}</span>
                      <span className="text-muted-foreground/60">{isOpen ? "▾" : "›"}</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4">
                        <ExDemo url={e.video_url} nome={e.nome} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
