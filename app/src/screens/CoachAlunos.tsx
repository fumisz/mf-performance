import { useState } from "react"
import type { CoachStudent as Student } from "@/lib/coach"
import { Input } from "@/components/ui/input"

function initials(n: string) {
  return n.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase()
}

export function CoachAlunos({
  students,
  ativosIds,
  onSelect,
  onBack,
}: {
  students: Student[]
  ativosIds: Set<string>
  onSelect: (s: Student) => void
  onBack: () => void
}) {
  const [q, setQ] = useState("")
  const [filtro, setFiltro] = useState<"todos" | "ativos" | "inativos">("todos")

  const filtered = students
    .filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
    .filter((s) =>
      filtro === "ativos" ? ativosIds.has(s.id) : filtro === "inativos" ? !ativosIds.has(s.id) : true
    )

  const chip = (k: typeof filtro, label: string, n: number) => (
    <button
      onClick={() => setFiltro(k)}
      className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
        filtro === k ? "bg-primary text-primary-foreground" : "bg-card/50 text-muted-foreground"
      }`}
    >
      {label} <span className="opacity-70">{n}</span>
    </button>
  )

  const ativos = students.filter((s) => ativosIds.has(s.id)).length

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(124,58,237,0.16),transparent_70%)]" />
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <button onClick={onBack} className="mb-4 text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ Voltar
        </button>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">Alunos</h1>

        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar aluno…"
          className="mb-3 h-10 rounded-lg border-border/70 bg-card/40"
        />
        <div className="mb-4 flex gap-2">
          {chip("todos", "Todos", students.length)}
          {chip("ativos", "Ativos", ativos)}
          {chip("inativos", "Inativos", students.length - ativos)}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 py-14 text-center text-sm text-muted-foreground">
            Nenhum aluno aqui.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card/30">
            {filtered.map((s, i) => {
              const ativo = ativosIds.has(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(s)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-card/70 ${
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
                  <span
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      ativo ? "bg-emerald-500/12 text-emerald-400" : "bg-amber-500/12 text-amber-400"
                    }`}
                  >
                    <span className={`size-1.5 rounded-full ${ativo ? "bg-emerald-400" : "bg-amber-400"}`} />
                    {ativo ? "Ativo" : "Inativo"}
                  </span>
                  <span className="text-muted-foreground/50">›</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
