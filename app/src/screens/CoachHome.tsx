import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { loadCoachData, type CoachData } from "@/lib/coach"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { MagicCard } from "@/components/fx/magic-card"
import { NumberTicker } from "@/components/fx/number-ticker"

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

  const filtered = data.students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Painel do treinador</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{data.coachName}</h1>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Sair
        </button>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <MagicCard className="p-4 text-center">
          <div className="text-3xl font-black text-primary">
            <NumberTicker value={data.students.length} />
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase text-muted-foreground">Alunos</div>
        </MagicCard>
        <MagicCard className="p-4 text-center">
          <div className="text-3xl font-black text-emerald-500">
            <NumberTicker value={data.students.length} />
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase text-muted-foreground">Ativos</div>
        </MagicCard>
        <MagicCard className="p-4 text-center">
          <div className="text-3xl font-black text-amber-500">
            <NumberTicker value={0} />
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase text-muted-foreground">Pendências</div>
        </MagicCard>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar aluno…"
        className="mb-3"
      />

      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Seus alunos</p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {data.students.length === 0
              ? "Você ainda não tem alunos. Gere um código de acesso no app atual para cadastrá-los."
              : "Nenhum aluno com esse nome."}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((s) => (
            <MagicCard key={s.id} className="cursor-pointer">
              <div className="flex items-center gap-3 p-3.5">
                <Avatar className="size-11">
                  {s.photo_url && <AvatarImage src={s.photo_url} alt="" />}
                  <AvatarFallback className="bg-secondary font-bold">{initials(s.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{s.goal || "Sem objetivo definido"}</p>
                </div>
                <span className="text-muted-foreground">›</span>
              </div>
            </MagicCard>
          ))}
        </div>
      )}
    </div>
  )
}
