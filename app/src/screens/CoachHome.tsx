import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { supabase } from "@/lib/supabase"
import { loadCoachData, type CoachData } from "@/lib/coach"
import { Input } from "@/components/ui/input"
import { MagicCard } from "@/components/fx/magic-card"
import { NumberTicker } from "@/components/fx/number-ticker"
import { GradientText } from "@/components/fx/gradient-text"
import { AuroraBackground } from "@/components/fx/aurora-background"
import { BorderBeam } from "@/components/fx/border-beam"

function initials(n: string) {
  return n.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase()
}

export function CoachHome({ userId }: { userId: string }) {
  const [data, setData] = useState<CoachData | null>(null)
  const [q, setQ] = useState("")

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
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const total = data.students.length
  const filtered = data.students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="relative min-h-screen">
      <AuroraBackground />

      <div className="mx-auto max-w-2xl px-4 pb-20 pt-7">
        {/* header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-6 flex items-center gap-3"
        >
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-black text-white shadow-lg shadow-violet-500/30">
            {initials(data.coachName)}
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              Painel do treinador
            </p>
            <h1 className="text-2xl font-black tracking-tight">
              <GradientText>{data.coachName}</GradientText>
            </h1>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-xl border border-border bg-card/50 px-3.5 py-2 text-sm font-semibold text-muted-foreground backdrop-blur transition hover:text-foreground"
          >
            Sair
          </button>
        </motion.div>

        {/* hero bento */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: "easeOut" }}
          className="mb-3 grid grid-cols-3 gap-3"
        >
          <div className="relative col-span-2 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/30 via-card/60 to-card/60 p-6 backdrop-blur-xl">
            <BorderBeam />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200">
              Sua carteira
            </p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-6xl font-black leading-none tracking-tight">
                <NumberTicker value={total} />
              </span>
              <span className="mb-1.5 text-sm font-semibold text-muted-foreground">
                aluno{total === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Acompanhe treino, avaliação e evolução de cada um num só lugar.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <MagicCard color="34,197,94" className="flex-1 p-4">
              <div className="text-2xl font-black text-emerald-400">
                <NumberTicker value={total} />
              </div>
              <div className="mt-0.5 text-[10.5px] font-semibold uppercase text-muted-foreground">
                Ativos
              </div>
            </MagicCard>
            <MagicCard color="245,158,11" className="flex-1 p-4">
              <div className="text-2xl font-black text-amber-400">
                <NumberTicker value={0} />
              </div>
              <div className="mt-0.5 text-[10.5px] font-semibold uppercase text-muted-foreground">
                Pendências
              </div>
            </MagicCard>
          </div>
        </motion.div>

        {/* busca */}
        <div className="relative mb-4 mt-5">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            ⌕
          </span>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar aluno…"
            className="h-11 rounded-xl border-white/10 bg-card/50 pl-9 backdrop-blur"
          />
        </div>

        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Seus alunos
          </p>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
            {filtered.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-card/50 p-10 text-center backdrop-blur">
            <div className="mb-2 text-4xl">🫥</div>
            <p className="text-muted-foreground">
              {total === 0
                ? "Você ainda não tem alunos. Gere um código de acesso para cadastrá-los."
                : "Nenhum aluno com esse nome."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.4, ease: "easeOut" }}
              >
                <MagicCard className="cursor-pointer bg-card/50 backdrop-blur transition hover:-translate-y-0.5">
                  <div className="flex items-center gap-3.5 p-3.5">
                    <div className="rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 p-[2px]">
                      <div className="flex size-11 items-center justify-center rounded-full bg-card text-sm font-bold">
                        {s.photo_url ? (
                          <img src={s.photo_url} alt="" className="size-full rounded-full object-cover" />
                        ) : (
                          initials(s.name)
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{s.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {s.goal || "Sem objetivo definido"}
                      </p>
                    </div>
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
                      <span className="size-1.5 rounded-full bg-emerald-400" /> Ativo
                    </span>
                    <span className="text-lg text-muted-foreground">›</span>
                  </div>
                </MagicCard>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
