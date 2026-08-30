import { useEffect, useState } from "react"
import { loadDieta, type Dieta } from "@/lib/dieta"
import { Card, CardContent } from "@/components/ui/card"

function Macro({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="flex-1 text-center">
      <div className={`text-xl font-black ${color}`}>{Math.round(value)}</div>
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">
        {label} <span className="opacity-60">{unit}</span>
      </div>
    </div>
  )
}

export function StudentDieta({
  userId,
  onBack,
  vazioTexto = "Você ainda não tem um plano alimentar ativo. Fale com seu treinador.",
  mostrarVoltar = true,
}: {
  userId: string | null
  onBack: () => void
  vazioTexto?: string
  /** false quando a tela já está dentro da barra "Visão do aluno" */
  mostrarVoltar?: boolean
}) {
  const [dieta, setDieta] = useState<Dieta | null | undefined>(undefined)

  useEffect(() => {
    if (!userId) return setDieta(null)
    loadDieta(userId).then(setDieta)
  }, [userId])

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6">
      {mostrarVoltar && (
        <button onClick={onBack} className="mb-4 text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ Voltar
        </button>
      )}
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Minha dieta</h1>

      {dieta === undefined ? (
        <div className="flex justify-center py-16">
          <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : !dieta ? (
        <Card className="mt-4 border-white/10">
          <CardContent className="p-8 text-center text-muted-foreground">
            {vazioTexto}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">{dieta.titulo}</p>

          <Card className="mb-5 border-white/10 bg-gradient-to-br from-emerald-600/20 to-card/60">
            <CardContent className="p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-emerald-300">Total do dia</p>
              <div className="flex">
                <Macro label="kcal" value={dieta.totais.kcal} unit="" color="text-emerald-300" />
                <Macro label="Proteína" value={dieta.totais.protein} unit="g" color="text-violet-300" />
                <Macro label="Carbo" value={dieta.totais.carb} unit="g" color="text-amber-300" />
                <Macro label="Gordura" value={dieta.totais.fat} unit="g" color="text-rose-300" />
              </div>
              {dieta.aguaMl ? (
                <p className="mt-3 text-center text-sm text-muted-foreground">💧 Meta de água: {(dieta.aguaMl / 1000).toFixed(1)} L</p>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            {dieta.refeicoes.map((r) => {
              const t = r.itens.reduce((a, i) => a + i.kcal, 0)
              return (
                <Card key={r.id} className="border-white/10">
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-bold">
                        {r.nome}
                        {r.hora && <span className="ml-2 text-[12px] font-medium text-muted-foreground">{r.hora}</span>}
                      </p>
                      <span className="shrink-0 text-[13px] font-semibold text-emerald-300">{Math.round(t)} kcal</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {r.itens.map((i) => (
                        <div key={i.id} className="flex items-baseline justify-between gap-2 text-sm">
                          <span>
                            {i.nome} {i.qtd && <span className="text-muted-foreground">· {i.qtd}</span>}
                            {i.prep && (
                              <span className="block text-[12px] italic text-muted-foreground/80">{i.prep}</span>
                            )}
                          </span>
                          <span className="shrink-0 text-[12px] text-muted-foreground">{Math.round(i.kcal)} kcal</span>
                        </div>
                      ))}
                      {r.itens.length === 0 && <p className="text-sm text-muted-foreground">Sem itens.</p>}
                      {r.notas && <p className="mt-1 text-[12px] italic text-muted-foreground">{r.notas}</p>}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {dieta.notas && (
            <Card className="mt-4 border-white/10">
              <CardContent className="p-4">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Observações</p>
                <p className="text-sm text-muted-foreground">{dieta.notas}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
