import { useEffect, useState } from "react"
import { loadAvaliacoes, imc, type Avaliacao } from "@/lib/aval"
import { Card, CardContent } from "@/components/ui/card"

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR")
}

function Stat({ label, value, unit, delta, down }: { label: string; value?: number | null; unit?: string; delta?: number | null; down?: boolean }) {
  if (value == null) return null
  const good = delta != null && (down ? delta < 0 : delta > 0)
  return (
    <Card className="border-white/10">
      <CardContent className="p-4 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-black">
          {value}
          {unit && <span className="text-sm font-semibold text-muted-foreground"> {unit}</span>}
        </div>
        {delta != null && delta !== 0 && (
          <div className={`text-[12px] font-bold ${good ? "text-emerald-400" : "text-rose-400"}`}>
            {delta > 0 ? "▲ +" : "▼ "}
            {Math.abs(Math.round(delta * 10) / 10)} {unit}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function StudentAval({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const [avs, setAvs] = useState<Avaliacao[] | null>(null)

  useEffect(() => {
    loadAvaliacoes(studentId).then(setAvs)
  }, [studentId])

  if (avs === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  const last = avs[avs.length - 1]
  const prev = avs[avs.length - 2]
  const pesos = avs.map((a) => a.peso).filter((v): v is number => v != null)
  const maxP = pesos.length ? Math.max(...pesos) : 1
  const minP = pesos.length ? Math.min(...pesos) : 0

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6">
      <button onClick={onBack} className="mb-4 text-sm font-medium text-muted-foreground hover:text-foreground">
        ‹ Voltar
      </button>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Minha avaliação</h1>

      {!last ? (
        <Card className="mt-4 border-white/10">
          <CardContent className="p-8 text-center text-muted-foreground">
            Você ainda não tem uma avaliação física registrada. Fale com seu treinador.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="mb-5 text-sm text-muted-foreground">Última: {fmtDate(last.date)}</p>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <Stat label="Peso" value={last.peso} unit="kg" delta={prev?.peso != null && last.peso != null ? last.peso - prev.peso : null} down />
            <Stat label="% Gordura" value={last.gordura} unit="%" delta={prev?.gordura != null && last.gordura != null ? last.gordura - prev.gordura : null} down />
            <Stat label="IMC" value={imc(last)} />
            <Stat label="Massa magra" value={last.massa_magra} unit="kg" delta={prev?.massa_magra != null && last.massa_magra != null ? last.massa_magra - prev.massa_magra : null} />
          </div>

          {pesos.length > 1 && (
            <Card className="mb-5 border-white/10">
              <CardContent className="p-5">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Evolução do peso</p>
                <div className="flex h-24 items-end gap-1.5">
                  {avs
                    .filter((a) => a.peso != null)
                    .map((a) => {
                      const h = maxP === minP ? 100 : 20 + ((a.peso! - minP) / (maxP - minP)) * 80
                      return (
                        <div key={a.id} className="flex flex-1 flex-col items-center gap-1">
                          <div className="w-full rounded-t bg-gradient-to-t from-violet-600 to-fuchsia-400" style={{ height: `${h}%` }} />
                          <span className="text-[9px] text-muted-foreground">{a.peso}</span>
                        </div>
                      )
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {(last.cintura || last.quadril || last.braco || last.coxa) && (
            <Card className="mb-5 border-white/10">
              <CardContent className="p-5">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Medidas (cm)</p>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  {last.cintura != null && <div className="flex justify-between"><span className="text-muted-foreground">Cintura</span><b>{last.cintura}</b></div>}
                  {last.quadril != null && <div className="flex justify-between"><span className="text-muted-foreground">Quadril</span><b>{last.quadril}</b></div>}
                  {last.braco != null && <div className="flex justify-between"><span className="text-muted-foreground">Braço</span><b>{last.braco}</b></div>}
                  {last.coxa != null && <div className="flex justify-between"><span className="text-muted-foreground">Coxa</span><b>{last.coxa}</b></div>}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
