import { useEffect, useState } from "react"
import { loadWorkout, registrarSerie, type Exercicio } from "@/lib/workout"
import { ExDemo } from "@/components/ex-demo"
import type { Divisao } from "@/lib/student"
import { ShimmerButton } from "@/components/fx/shimmer-button"

export function StudentWorkout({
  divisao,
  coachId,
  studentId,
  onBack,
}: {
  divisao: Divisao
  coachId: string
  studentId: string
  onBack: () => void
}) {
  const [exs, setExs] = useState<Exercicio[] | null>(null)
  const [demo, setDemo] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [carga, setCarga] = useState<Record<string, string>>({})
  const [reps, setReps] = useState<Record<string, string>>({})
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    loadWorkout(divisao.id).then(setExs)
  }, [divisao.id])

  const key = (ei: number, si: number) => `${ei}_${si}`

  const salvarSerie = async (ex: Exercicio, ei: number, si: number) => {
    const k = key(ei, si)
    const c = parseFloat(carga[k] || "")
    const r = parseInt(reps[k] || "")
    setDone((d) => ({ ...d, [k]: true }))
    if (!isNaN(c) && !isNaN(r)) {
      try {
        await registrarSerie({
          coachId,
          studentId,
          divisaoId: divisao.id,
          ex,
          indice: si + 1,
          carga: c,
          reps: r,
          isPr: false,
        })
      } catch {
        /* ignora erro de rede */
      }
    }
    if (navigator.vibrate) navigator.vibrate(20)
  }

  const totalSets = (exs || []).reduce((a, e) => a + e.qtd_series, 0)
  const doneSets = Object.values(done).filter(Boolean).length

  if (finished) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <div className="text-6xl">💪</div>
        <h2 className="mt-3 text-2xl font-black">TREINO CONCLUÍDO!</h2>
        <p className="mt-1 text-muted-foreground">
          {doneSets} série{doneSets === 1 ? "" : "s"} registrada{doneSets === 1 ? "" : "s"}
        </p>
        <button
          onClick={onBack}
          className="mt-6 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground"
        >
          Voltar ao início
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 pb-28 pt-6">
        <button onClick={onBack} className="mb-4 text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ Voltar
        </button>
        <h1 className="text-2xl font-extrabold tracking-tight">{divisao.nome || "Treino"}</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          {doneSets}/{totalSets} séries · registre carga e repetições
        </p>

        {exs === null ? (
          <div className="flex justify-center py-16">
            <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : exs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 py-14 text-center text-muted-foreground">
            Este treino ainda não tem exercícios.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {exs.map((ex, ei) => (
              <div key={ex.id} className="rounded-2xl border border-white/10 bg-card/60 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{ex.nome}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {ex.grupo ? `${ex.grupo} · ` : ""}
                      {ex.qtd_series}× {ex.faixa_reps || ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setDemo((d) => ({ ...d, [ex.id]: !d[ex.id] }))}
                    className="shrink-0 rounded-full bg-primary/15 px-3 py-1.5 text-[13px] font-semibold text-primary"
                  >
                    ▶ {demo[ex.id] ? "Ocultar" : "Ver"}
                  </button>
                </div>

                {demo[ex.id] && (
                  <div className="mt-3">
                    <ExDemo url={ex.video_url} nome={ex.nome} />
                  </div>
                )}

                <div className="mt-3 flex flex-col gap-2">
                  {Array.from({ length: ex.qtd_series }).map((_, si) => {
                    const k = key(ei, si)
                    const isDone = done[k]
                    return (
                      <div
                        key={si}
                        className={`flex items-center gap-2 rounded-xl border p-2 ${
                          isDone ? "border-emerald-500/40 bg-emerald-500/10" : "border-border/60"
                        }`}
                      >
                        <span className="w-6 text-center text-sm font-bold text-muted-foreground">{si + 1}</span>
                        <input
                          inputMode="decimal"
                          value={carga[k] || ""}
                          onChange={(e) => setCarga((c) => ({ ...c, [k]: e.target.value }))}
                          placeholder="kg"
                          className="w-full rounded-lg bg-secondary/60 px-2.5 py-2 text-center text-sm outline-none"
                        />
                        <input
                          inputMode="numeric"
                          value={reps[k] || ""}
                          onChange={(e) => setReps((r) => ({ ...r, [k]: e.target.value }))}
                          placeholder="reps"
                          className="w-full rounded-lg bg-secondary/60 px-2.5 py-2 text-center text-sm outline-none"
                        />
                        <button
                          onClick={() => salvarSerie(ex, ei, si)}
                          className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                            isDone ? "bg-emerald-500 text-white" : "bg-primary/20 text-primary"
                          }`}
                        >
                          ✓
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {exs && exs.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md p-4">
          <ShimmerButton onClick={() => setFinished(true)}>Finalizar treino</ShimmerButton>
        </div>
      )}
    </div>
  )
}
