import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { loadCoachData, addStudent, type CoachData, type CoachStudent as Student } from "@/lib/coach"
import { forcarAtualizacao, setAccent, PALETA } from "@/lib/util"

const CoachStudent = lazy(() => import("@/screens/CoachStudent").then((m) => ({ default: m.CoachStudent })))
const CoachBiblioteca = lazy(() => import("@/screens/CoachBiblioteca").then((m) => ({ default: m.CoachBiblioteca })))
const CoachAlunos = lazy(() => import("@/screens/CoachAlunos").then((m) => ({ default: m.CoachAlunos })))

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  )
}

function initials(n: string) {
  return n.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase()
}

type View = "dash" | "alunos" | "biblioteca"

export function CoachHome({
  userId,
  accent,
  onAccent,
}: {
  userId: string
  accent: string
  onAccent: (c: string) => void
}) {
  const [data, setData] = useState<CoachData | null>(null)
  const [view, setView] = useState<View>("dash")
  const [sel, setSel] = useState<Student | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [cfgOpen, setCfgOpen] = useState(false)

  const reload = () => loadCoachData(userId).then(setData)
  useEffect(() => {
    let alive = true
    loadCoachData(userId).then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [userId])

  const ativosIds = useMemo(() => new Set(data?.ativosIds ?? []), [data])

  if (!data) return <Spinner />

  if (sel)
    return (
      <Suspense fallback={<Spinner />}>
        <CoachStudent student={sel} onBack={() => setSel(null)} />
      </Suspense>
    )
  if (view === "biblioteca")
    return (
      <Suspense fallback={<Spinner />}>
        <CoachBiblioteca onBack={() => setView("dash")} />
      </Suspense>
    )
  if (view === "alunos")
    return (
      <Suspense fallback={<Spinner />}>
        <CoachAlunos students={data.students} ativosIds={ativosIds} onSelect={setSel} onBack={() => setView("dash")} />
      </Suspense>
    )

  const total = data.students.length
  const inativos = total - data.ativos
  const engaj = total ? Math.round((data.ativos / total) * 1000) / 10 : 0

  const novoAluno = async () => {
    const nome = window.prompt("Nome do novo aluno:")
    if (!nome || !nome.trim()) return
    const ok = await addStudent(nome.trim())
    if (ok) reload()
    else alert("Não foi possível adicionar.")
  }

  const appUrl = "https://fumisz.github.io/mf-performance/preview/"

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(124,58,237,0.16),transparent_70%)]" />
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-7">
        {/* header */}
        <header className="mb-7 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-black text-white">
            {initials(data.coachName)}
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Painel</p>
            <h1 className="text-xl font-semibold tracking-tight">{data.coachName}</h1>
          </div>
          <button
            onClick={() => setCfgOpen(true)}
            className="rounded-lg border border-border/70 bg-card/40 px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            ⚙️
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            Sair
          </button>
        </header>

        <p className="mb-3 text-[15px] font-semibold">Seus alunos</p>

        {/* Adicionar + Link */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <button
            onClick={novoAluno}
            className="flex flex-col gap-2 rounded-2xl bg-gradient-to-br from-violet-600 to-violet-700 p-4 text-left text-white shadow-lg shadow-violet-900/30"
          >
            <span className="text-2xl">＋</span>
            <span className="font-semibold leading-tight">Adicionar aluno</span>
          </button>
          <button
            onClick={() => setLinkOpen(true)}
            className="flex flex-col gap-2 rounded-2xl bg-gradient-to-br from-cyan-600 to-cyan-700 p-4 text-left text-white shadow-lg shadow-cyan-900/30"
          >
            <span className="text-2xl">🔗</span>
            <span className="font-semibold leading-tight">Link de cadastro</span>
          </button>
        </div>

        {/* Botão Alunos (abre a lista) */}
        <button
          onClick={() => setView("alunos")}
          className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-primary/25 to-card/60 p-4 text-left backdrop-blur"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-white/10 text-xl">👥</span>
          <div className="flex-1">
            <p className="font-semibold">Alunos</p>
            <div className="mt-1 flex gap-2 text-[12px] font-bold">
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">Ativos: {data.ativos}</span>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-400">Inativos: {inativos}</span>
            </div>
          </div>
          <span className="text-xl text-muted-foreground">›</span>
        </button>

        {/* Retenção */}
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-border/70 bg-card/40 p-4">
          <span className="text-lg">📈</span>
          <span className="flex-1 font-semibold text-primary">Retenção</span>
          <span className="text-sm font-bold text-muted-foreground">{engaj}% de engajamento</span>
        </div>

        {/* Biblioteca */}
        <button
          onClick={() => setView("biblioteca")}
          className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card/40 p-4 text-left transition hover:bg-card/70"
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">▶</span>
          <div className="flex-1">
            <p className="font-medium">Biblioteca de exercícios</p>
            <p className="text-[13px] text-muted-foreground">Vídeos + técnicas avançadas</p>
          </div>
          <span className="text-muted-foreground/50">›</span>
        </button>
      </div>

      {cfgOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5" onClick={() => setCfgOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Configurações</h3>
              <button onClick={() => setCfgOpen(false)} className="text-muted-foreground">✕</button>
            </div>
            <p className="mb-2 text-sm font-medium">Cor do relatório</p>
            <div className="mb-5 flex flex-wrap gap-2.5">
              {PALETA.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setAccent(userId, c)
                    onAccent(c)
                  }}
                  className="size-9 rounded-full ring-offset-2 ring-offset-card transition"
                  style={{ background: c, boxShadow: accent === c ? `0 0 0 2px ${c}` : "none" }}
                  aria-label={c}
                />
              ))}
            </div>
            <button
              onClick={forcarAtualizacao}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
            >
              ↻ Atualizar app (forçar)
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Limpa o cache e recarrega a versão mais nova.</p>
          </div>
        </div>
      )}

      {linkOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5"
          onClick={() => setLinkOpen(false)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Link de cadastro</h3>
              <button onClick={() => setLinkOpen(false)} className="text-muted-foreground">✕</button>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Envie este link ao aluno. Ele cria a conta como <b>Aluno</b> e usa o <b>código de acesso</b> que você gera no perfil dele.
            </p>
            <div className="mb-3 break-all rounded-lg bg-secondary/60 p-2.5 text-[13px]">{appUrl}</div>
            <button
              onClick={() => navigator.clipboard?.writeText(appUrl)}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Copiar link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
