import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { loadCoachData, type CoachData, type CoachStudent as Student } from "@/lib/coach"
import { Input } from "@/components/ui/input"
import { CoachStudent } from "@/screens/CoachStudent"

function initials(n: string) {
  return n.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase()
}

function Stat({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/40 px-4 py-3.5">
      <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-0.5 text-[13px] font-medium text-muted-foreground">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</div>}
    </div>
  )
}

export function CoachHome({ userId }: { userId: string }) {
  const [data, setData] = useState<CoachData | null>(null)
  const [q, setQ] = useState("")
  const [sel, setSel] = useState<Student | null>(null)

  useEffect(() => {
    let alive = true
    loadCoachData(userId).then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [userId])

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  if (sel) return <CoachStudent student={sel} onBack={() => setSel(null)} />

  const total = data.students.length
  const filtered = data.students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="min-h-screen">
      {/* leve luz estática no topo, sem animação */}
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(124,58,237,0.16),transparent_70%)]" />

      <div className="mx-auto max-w-3xl px-5 pb-24 pt-8">
        {/* header */}
        <header className="mb-8 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-foreground">
            {initials(data.coachName)}
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Painel
            </p>
            <h1 className="text-[19px] font-semibold tracking-tight">{data.coachName}</h1>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            Sair
          </button>
        </header>

        {/* stats */}
        <section className="mb-10 grid grid-cols-3 gap-3">
          <Stat value={total} label="Alunos" hint="na carteira" />
          <Stat value={total} label="Ativos" hint="últimos 30 dias" />
          <Stat value={0} label="A reavaliar" hint="nenhum pendente" />
        </section>

        {/* alunos */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">Alunos</h2>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="h-9 w-44 rounded-lg border-border/70 bg-card/40 text-sm"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "Nenhum aluno ainda. Gere um código de acesso para cadastrar o primeiro."
                : "Nenhum resultado."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card/30">
            {filtered.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setSel(s)}
                className={`flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-card/70 ${
                  i > 0 ? "border-t border-border/60" : ""
                }`}
              >
                <div className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-secondary text-[13px] font-semibold text-muted-foreground">
                  {s.photo_url ? (
                    <img src={s.photo_url} alt="" className="size-full object-cover" />
                  ) : (
                    initials(s.name)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{s.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {s.goal || "Sem objetivo definido"}
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Ativo
                </span>
                <span className="text-muted-foreground/50">›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
