import { MagicCard } from "@/components/fx/magic-card"
import { useStudent } from "@/lib/student-context"

const ICON: Record<string, string> = {
  parabens: "🏆",
  lembrete: "⏰",
  aviso: "📣",
  treino: "🏋️",
}

function tempoRel(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "agora"
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`
  const dd = Math.floor(s / 86400)
  if (dd < 7) return `há ${dd} dia${dd > 1 ? "s" : ""}`
  return new Date(iso).toLocaleDateString("pt-BR")
}

export function StudentAvisos() {
  const { avisos } = useStudent()
  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Avisos</h1>
      {avisos.length === 0 && (
        <MagicCard className="p-8 text-center">
          <div className="mb-2 text-3xl">🔔</div>
          <p className="text-muted-foreground">Nenhum aviso por aqui ainda.</p>
        </MagicCard>
      )}
      <div className="flex flex-col gap-3">
        {avisos.map((a) => (
          <MagicCard
            key={a.id}
            className={a.lido ? "" : "border-primary/40"}
          >
            <div className="flex gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-lg">
                {ICON[a.tipo] ?? "📣"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="pr-4 font-bold leading-snug">{a.titulo}</p>
                <p className="mt-1 text-sm leading-snug text-muted-foreground">{a.texto}</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground/70">{tempoRel(a.created_at)}</p>
              </div>
              {!a.lido && <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" />}
            </div>
          </MagicCard>
        ))}
      </div>
    </div>
  )
}
