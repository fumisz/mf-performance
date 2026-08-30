import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MagicCard } from "@/components/fx/magic-card"
import { NumberTicker } from "@/components/fx/number-ticker"
import { GradientText } from "@/components/fx/gradient-text"
import { ShimmerButton } from "@/components/fx/shimmer-button"
import { BentoGrid } from "@/components/fx/bento"
import { motion } from "motion/react"
import type { Variants } from "motion/react"
import { useStudent } from "@/lib/student-context"
import type { Divisao } from "@/lib/student"

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"
}

const fade: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.06 * i, ease: "easeOut", duration: 0.6 },
  }),
}

export function StudentHome({ onStart, onDieta }: { onStart?: (d: Divisao) => void; onDieta?: () => void }) {
  const d = useStudent()
  const nome = d.student?.name?.split(" ")[0] ?? "Atleta"
  const iniciais = (d.student?.name ?? "MF")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
  const stats = [
    { label: "Treinos", value: d.stats.total, color: "text-violet-300" },
    { label: "Recordes", value: d.stats.prs, color: "text-fuchsia-300" },
    { label: "Este mês", value: d.stats.mes, color: "text-emerald-300" },
    { label: "Sequência", value: d.stats.streak, color: "text-amber-300" },
  ]
  const done = d.freq.done
  const meta = d.freq.meta
  const proximo = d.divisoes[0]?.nome ?? "Seu treino"
  const falta = Math.max(0, meta - done)
  const badges = [
    { em: "🎯", lb: "1º treino", got: d.stats.total >= 1 },
    { em: "🔥", lb: "7 dias", got: d.stats.streak >= 7 },
    { em: "💪", lb: "10 treinos", got: d.stats.total >= 10 },
    { em: "🏆", lb: "1º recorde", got: d.stats.prs >= 1 },
    { em: "⭐", lb: "25 treinos", got: d.stats.total >= 25 },
    { em: "👑", lb: "50 treinos", got: d.stats.total >= 50 },
  ]

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-6">
      {/* header */}
      <motion.div
        custom={0}
        initial="hidden"
        animate="show"
        variants={fade}
        className="mb-5 flex items-center gap-3"
      >
        <Avatar className="size-12 ring-2 ring-violet-500/40">
          <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 font-bold text-white">
            {iniciais}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{saudacao()}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">
            <GradientText>{nome}</GradientText>
          </h1>
        </div>
        {d.stats.streak > 0 && (
          <Badge className="gap-1 border-amber-500/40 bg-amber-500/15 text-amber-300">
            <span className="animate-[fx-float_1.4s_ease-in-out_infinite]">🔥</span> {d.stats.streak}{" "}
            {d.stats.streak === 1 ? "dia" : "dias"}
          </Badge>
        )}
      </motion.div>

      {/* stats bento */}
      <motion.div custom={1} initial="hidden" animate="show" variants={fade}>
        <BentoGrid className="mb-5">
          {stats.map((s) => (
            <MagicCard key={s.label} className="p-4 text-center">
              <div className={`text-3xl font-black ${s.color}`}>
                <NumberTicker value={s.value} />
              </div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {s.label}
              </div>
            </MagicCard>
          ))}
        </BentoGrid>
      </motion.div>

      {/* próximo treino */}
      <motion.div custom={2} initial="hidden" animate="show" variants={fade}>
        <MagicCard className="mb-5 border-violet-500/30 bg-gradient-to-br from-violet-700/40 to-fuchsia-800/20 p-5">
          <p className="text-xs uppercase tracking-widest text-violet-200">Próximo treino</p>
          <h2 className="mb-4 mt-1 text-xl font-black">{proximo.toUpperCase()}</h2>
          <ShimmerButton onClick={() => d.divisoes[0] && onStart?.(d.divisoes[0])} disabled={!d.divisoes[0]}>
            ▶ Iniciar treino
          </ShimmerButton>
          {d.divisoes.length > 1 && (
            <div className="mt-3 flex flex-col gap-2">
              {d.divisoes.slice(1).map((dv) => (
                <button
                  key={dv.id}
                  onClick={() => onStart?.(dv)}
                  className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2.5 text-left text-sm font-semibold"
                >
                  <span>{dv.nome || "Divisão"}</span>
                  <span className="text-white/50">›</span>
                </button>
              ))}
            </div>
          )}
        </MagicCard>
      </motion.div>

      {/* desafio da semana */}
      <motion.div custom={3} initial="hidden" animate="show" variants={fade}>
        <Card className="mb-5 border-white/10">
          <CardContent className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Desafio da semana
              </p>
              <span className="text-sm font-bold text-violet-300">
                {done}/{meta}
              </span>
            </div>
            <Progress value={meta ? (done / meta) * 100 : 0} className="h-2.5" />
            <p className="mt-3 text-sm text-muted-foreground">
              {falta > 0 ? (
                <>
                  Falta <b className="text-foreground">{falta} treino{falta > 1 ? "s" : ""}</b> pra bater sua meta. Bora! 💪
                </>
              ) : (
                <>Meta da semana batida! 🎉 Orgulho do seu compromisso.</>
              )}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* minha dieta */}
      <motion.div custom={4} initial="hidden" animate="show" variants={fade}>
        <button
          onClick={onDieta}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-card p-4 text-left transition hover:border-emerald-500/40"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-lg">🥗</span>
          <div className="flex-1">
            <p className="font-bold">Minha dieta</p>
            <p className="text-sm text-muted-foreground">Plano alimentar e macros do dia</p>
          </div>
          <span className="text-muted-foreground">›</span>
        </button>
      </motion.div>

      {/* conquistas */}
      <motion.div custom={5} initial="hidden" animate="show" variants={fade}>
        <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Conquistas</p>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {badges.map((b) => (
            <div
              key={b.lb}
              className={`flex w-20 shrink-0 flex-col items-center rounded-2xl border p-3 text-center ${
                b.got
                  ? "border-violet-500/30 bg-card"
                  : "border-white/5 bg-card/40 opacity-40 grayscale"
              }`}
            >
              <span className="text-2xl">{b.em}</span>
              <span className="mt-1.5 text-[10px] font-semibold leading-tight text-muted-foreground">
                {b.lb}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
