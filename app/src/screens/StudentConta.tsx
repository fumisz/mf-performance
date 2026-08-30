import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { MagicCard } from "@/components/fx/magic-card"
import { NumberTicker } from "@/components/fx/number-ticker"
import { BentoGrid } from "@/components/fx/bento"
import { ShimmerButton } from "@/components/fx/shimmer-button"
import { useState } from "react"
import { useStudent } from "@/lib/student-context"
import { supabase } from "@/lib/supabase"
import { forcarAtualizacao } from "@/lib/util"

function lerPref(k: string, padrao: boolean) {
  try {
    const v = localStorage.getItem(k)
    return v == null ? padrao : v === "1"
  } catch {
    return padrao
  }
}
function gravarPref(k: string, v: boolean) {
  try {
    localStorage.setItem(k, v ? "1" : "0")
  } catch {
    /* ignora */
  }
}

export function StudentConta({ readOnly = false }: { readOnly?: boolean }) {
  const { student, stats } = useStudent()
  const [push, setPush] = useState(() => lerPref("mfp_pref_push", false))
  const [agua, setAgua] = useState(() => lerPref("mfp_pref_agua", true))
  const nome = student?.name ?? "Aluno(a)"
  const iniciais = nome.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase()

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Minha conta</h1>

      <Card className="mb-4 border-white/10">
        <CardContent className="flex items-center gap-4 p-5">
          <Avatar className="size-14 ring-2 ring-violet-500/40">
            <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-lg font-bold text-white">
              {iniciais}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-bold">{nome}</p>
            <p className="text-sm text-muted-foreground">
              {student?.gender === "F" ? "Aluna" : "Aluno"} · MF Performance
            </p>
          </div>
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

      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Notificações</p>
      <Card className="mb-4 border-white/10">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔔</span>
            <div className="flex-1">
              <p className="font-semibold">Avisos no celular</p>
              <p className="text-sm text-muted-foreground">Receba avisos do treinador</p>
            </div>
            <Switch
              checked={push}
              disabled={readOnly}
              onCheckedChange={(v) => {
                setPush(v)
                gravarPref("mfp_pref_push", v)
              }}
            />
          </div>
          <div className="my-4 h-px bg-border" />
          <div className="flex items-center gap-3">
            <span className="text-xl">💧</span>
            <div className="flex-1">
              <p className="font-semibold">Lembrete de beber água</p>
              <p className="text-sm text-muted-foreground">Toques ao longo do dia</p>
            </div>
            <Switch
              checked={agua}
              disabled={readOnly}
              onCheckedChange={(v) => {
                setAgua(v)
                gravarPref("mfp_pref_agua", v)
              }}
            />
          </div>
        </CardContent>
      </Card>

      {!readOnly && (
        <>
          <button
            onClick={forcarAtualizacao}
            className="mb-3 w-full rounded-xl border border-white/10 bg-card py-3 text-sm font-semibold text-muted-foreground"
          >
            ↻ Atualizar app
          </button>
          <ShimmerButton
            className="from-secondary to-secondary text-foreground shadow-none"
            onClick={() => supabase.auth.signOut()}
          >
            Sair da conta
          </ShimmerButton>
        </>
      )}
    </div>
  )
}
