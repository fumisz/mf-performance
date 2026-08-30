import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { MagicCard } from "@/components/fx/magic-card"
import { NumberTicker } from "@/components/fx/number-ticker"
import { BentoGrid } from "@/components/fx/bento"
import { BarChart } from "@/components/bar-chart"
import { useStudent } from "@/lib/student-context"

function diaCurto(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

export function StudentProgress({ onAval }: { onAval?: () => void }) {
  const { stats, freq, evolucao, ciclo } = useStudent()
  const pct = freq.meta ? Math.round((freq.done / freq.meta) * 100) : 0

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Meu progresso</h1>

      <Card className="mb-4 border-white/10">
        <CardContent className="p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Frequência semanal</p>
          <p className="mt-1 text-2xl font-extrabold">
            {freq.done} <span className="text-sm font-semibold text-muted-foreground">de {freq.meta} treinos</span>
          </p>
          <Progress value={pct} className="mt-2 h-2.5" />
          {ciclo?.nome && (
            <p className="mt-3 text-[13px] text-muted-foreground">
              Ciclo atual: <b className="text-foreground">{ciclo.nome}</b>
              {ciclo.vencimento
                ? ` · até ${new Date(ciclo.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}`
                : ""}
            </p>
          )}
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

      <button
        onClick={onAval}
        className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-card p-4 text-left transition hover:border-primary/40"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-lg">📋</span>
        <div className="flex-1">
          <p className="font-bold">Minha avaliação física</p>
          <p className="text-sm text-muted-foreground">Peso, % de gordura, medidas e evolução</p>
        </div>
        <span className="text-muted-foreground">›</span>
      </button>

      <Card className="mb-4 border-white/10">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs uppercase tracking-widest text-muted-foreground">
              {evolucao ? `Evolução de carga · ${evolucao.exercicio}` : "Evolução de carga"}
            </p>
            {evolucao?.variacao != null && (
              <span
                className={`shrink-0 text-sm font-bold ${
                  evolucao.variacao >= 0 ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {evolucao.variacao >= 0 ? "+" : ""}
                {evolucao.variacao}%
              </span>
            )}
          </div>
          {!evolucao ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Registre a carga dos seus treinos e a evolução aparece aqui.
            </p>
          ) : (
            <BarChart pontos={evolucao.pontos.map((p) => ({ valor: p.carga, rotulo: diaCurto(p.data) }))} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
