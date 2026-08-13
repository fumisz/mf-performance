import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { MagicCard } from "@/components/fx/magic-card"
import { NumberTicker } from "@/components/fx/number-ticker"
import { BentoGrid } from "@/components/fx/bento"
import { useStudent } from "@/lib/student-context"

const evol = [40, 42.5, 45, 45, 47.5, 50, 52.5]

export function StudentProgress() {
  const { stats, freq } = useStudent()
  const max = Math.max(...evol)
  const pct = freq.meta ? Math.round((freq.done / freq.meta) * 100) : 0
  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Meu progresso</h1>

      <Card className="mb-4 border-white/10">
        <CardContent className="p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Frequência semanal
          </p>
          <p className="mt-1 text-2xl font-extrabold">
            {freq.done}{" "}
            <span className="text-sm font-semibold text-muted-foreground">de {freq.meta} treinos</span>
          </p>
          <Progress value={pct} className="mt-2 h-2.5" />
        </CardContent>
      </Card>

      <BentoGrid className="mb-4 grid-cols-3 sm:grid-cols-3">
        <MagicCard className="p-4 text-center">
          <div className="text-3xl font-black text-violet-300">
            <NumberTicker value={stats.total} />
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase text-muted-foreground">Treinos</div>
        </MagicCard>
        <MagicCard className="p-4 text-center">
          <div className="text-3xl font-black text-fuchsia-300">
            <NumberTicker value={stats.prs} />
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase text-muted-foreground">Recordes</div>
        </MagicCard>
        <MagicCard className="p-4 text-center">
          <div className="text-3xl font-black text-emerald-300">
            <NumberTicker value={stats.streak} />
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase text-muted-foreground">Sequência</div>
        </MagicCard>
      </BentoGrid>

      <Card className="mb-4 border-white/10">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Evolução de carga · Agachamento
            </p>
            <span className="text-sm font-bold text-emerald-300">+31%</span>
          </div>
          <div className="flex h-24 items-end gap-1.5">
            {evol.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-violet-600 to-fuchsia-400"
                  style={{ height: `${(v / max) * 100}%` }}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
