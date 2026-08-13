import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { MagicCard } from "@/components/fx/magic-card"
import { NumberTicker } from "@/components/fx/number-ticker"
import { BentoGrid } from "@/components/fx/bento"
import { ShimmerButton } from "@/components/fx/shimmer-button"
import { useState } from "react"

export function StudentConta() {
  const [push, setPush] = useState(false)
  const [agua, setAgua] = useState(true)

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Minha conta</h1>

      <Card className="mb-4 border-white/10">
        <CardContent className="flex items-center gap-4 p-5">
          <Avatar className="size-14 ring-2 ring-violet-500/40">
            <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-lg font-bold text-white">
              LA
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-bold">Laryssa Araujo</p>
            <p className="text-sm text-muted-foreground">Aluna · MF Performance</p>
          </div>
        </CardContent>
      </Card>

      <BentoGrid className="mb-4 grid-cols-3 sm:grid-cols-3">
        <MagicCard className="p-4 text-center">
          <div className="text-3xl font-black text-violet-300">
            <NumberTicker value={24} />
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase text-muted-foreground">Treinos</div>
        </MagicCard>
        <MagicCard className="p-4 text-center">
          <div className="text-3xl font-black text-fuchsia-300">
            <NumberTicker value={7} />
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase text-muted-foreground">Recordes</div>
        </MagicCard>
        <MagicCard className="p-4 text-center">
          <div className="text-3xl font-black text-emerald-300">
            <NumberTicker value={3} />
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase text-muted-foreground">Sequência</div>
        </MagicCard>
      </BentoGrid>

      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Notificações</p>
      <Card className="mb-4 border-white/10">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔔</span>
            <div className="flex-1">
              <p className="font-semibold">Avisos no celular</p>
              <p className="text-sm text-muted-foreground">Receba avisos do treinador</p>
            </div>
            <Switch checked={push} onCheckedChange={setPush} />
          </div>
          <div className="my-4 h-px bg-border" />
          <div className="flex items-center gap-3">
            <span className="text-xl">💧</span>
            <div className="flex-1">
              <p className="font-semibold">Lembrete de beber água</p>
              <p className="text-sm text-muted-foreground">Toques ao longo do dia</p>
            </div>
            <Switch checked={agua} onCheckedChange={setAgua} />
          </div>
        </CardContent>
      </Card>

      <ShimmerButton className="from-secondary to-secondary text-foreground shadow-none">
        Sair da conta
      </ShimmerButton>
    </div>
  )
}
