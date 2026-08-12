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

const stats = [
  { label: "Treinos", value: 24, color: "text-violet-300" },
  { label: "Recordes", value: 7, color: "text-fuchsia-300" },
  { label: "Este mês", value: 9, color: "text-emerald-300" },
  { label: "Sequência", value: 3, color: "text-amber-300" },
]

const badges = [
  { em: "🎯", lb: "1º treino", got: true },
  { em: "🔥", lb: "7 dias", got: false },
  { em: "💪", lb: "10 treinos", got: true },
  { em: "🏆", lb: "1º recorde", got: true },
  { em: "⭐", lb: "25 treinos", got: false },
  { em: "👑", lb: "50 treinos", got: false },
]

const fade: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.06 * i, ease: "easeOut", duration: 0.6 },
  }),
}

export function StudentHome() {
  const done = 3
  const meta = 4

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-16 pt-6">
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
            LA
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Boa noite</p>
          <h1 className="text-2xl font-extrabold tracking-tight">
            <GradientText>Laryssa</GradientText>
          </h1>
        </div>
        <Badge className="gap-1 border-amber-500/40 bg-amber-500/15 text-amber-300">
          <span className="animate-[fx-float_1.4s_ease-in-out_infinite]">🔥</span> 3 dias
        </Badge>
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
          <h2 className="mb-4 mt-1 text-xl font-black">A — MEMBROS INFERIORES</h2>
          <ShimmerButton>▶ Iniciar treino</ShimmerButton>
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
            <Progress value={(done / meta) * 100} className="h-2.5" />
            <p className="mt-3 text-sm text-muted-foreground">
              Falta <b className="text-foreground">1 treino</b> pra bater sua meta. Bora! 💪
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* conquistas */}
      <motion.div custom={4} initial="hidden" animate="show" variants={fade}>
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
