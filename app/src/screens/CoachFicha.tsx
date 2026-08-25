import { useEffect, useState } from "react"
import type { CoachStudent as Student } from "@/lib/coach"
import { loadBiblioteca, type LibExercicio } from "@/lib/coach"
import {
  loadDivisoes,
  addDivisao,
  delDivisao,
  loadPrescricoes,
  addExercicio,
  updatePrescricao,
  delPrescricao,
  type Divisao,
  type Prescricao,
} from "@/lib/ficha"
import { Input } from "@/components/ui/input"

export function CoachFicha({ student, onBack }: { student: Student; onBack: () => void }) {
  const [divs, setDivs] = useState<Divisao[] | null>(null)
  const [sel, setSel] = useState<Divisao | null>(null)

  const reloadDivs = () => loadDivisoes(student.id).then(setDivs)
  useEffect(() => {
    reloadDivs()
  }, [student.id])

  const novaDivisao = async () => {
    const sugestao = String.fromCharCode(65 + (divs?.length ?? 0)) // A, B, C...
    const nome = window.prompt("Nome do treino (ex.: A — Inferiores):", `${sugestao} — `)
    if (!nome || !nome.trim()) return
    await addDivisao(student.id, nome.trim(), divs?.length ?? 0)
    reloadDivs()
  }

  if (sel) return <DivisaoEditor divisao={sel} onBack={() => setSel(null)} />

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(124,58,237,0.16),transparent_70%)]" />
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <button onClick={onBack} className="mb-4 text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ Voltar
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">Ficha de treino</h1>
        <p className="mb-5 text-sm text-muted-foreground">{student.name}</p>

        {divs === null ? (
          <Spin />
        ) : (
          <div className="mb-4 flex flex-col gap-2.5">
            {divs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/40">
                <button onClick={() => setSel(d)} className="flex flex-1 items-center gap-3 px-4 py-3.5 text-left">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 font-bold text-primary">
                    {(d.nome || "?").trim()[0]}
                  </span>
                  <span className="flex-1 font-medium">{d.nome || "Divisão"}</span>
                  <span className="text-muted-foreground/50">›</span>
                </button>
                <button
                  onClick={async () => {
                    if (confirm("Excluir este treino?")) {
                      await delDivisao(d.id)
                      reloadDivs()
                    }
                  }}
                  className="px-3 text-muted-foreground hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={novaDivisao}
          className="w-full rounded-xl border border-dashed border-primary/40 py-3 text-sm font-semibold text-primary hover:bg-primary/10"
        >
          ＋ Novo treino (A, B, C…)
        </button>
      </div>
    </div>
  )
}

function DivisaoEditor({ divisao, onBack }: { divisao: Divisao; onBack: () => void }) {
  const [presc, setPresc] = useState<Prescricao[] | null>(null)
  const [picker, setPicker] = useState(false)

  const reload = () => loadPrescricoes(divisao.id).then(setPresc)
  useEffect(() => {
    reload()
  }, [divisao.id])

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(124,58,237,0.16),transparent_70%)]" />
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <button onClick={onBack} className="mb-4 text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ Treinos
        </button>
        <h1 className="mb-5 text-2xl font-semibold tracking-tight">{divisao.nome || "Divisão"}</h1>

        {presc === null ? (
          <Spin />
        ) : presc.length === 0 ? (
          <div className="mb-4 rounded-xl border border-dashed border-border/70 py-12 text-center text-sm text-muted-foreground">
            Nenhum exercício ainda.
          </div>
        ) : (
          <div className="mb-4 flex flex-col gap-2.5">
            {presc.map((p) => (
              <div key={p.id} className="rounded-xl border border-border/70 bg-card/40 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{p.nome}</p>
                    {p.grupo && <p className="text-[12px] text-muted-foreground">{p.grupo}</p>}
                  </div>
                  <button
                    onClick={async () => {
                      await delPrescricao(p.id)
                      reload()
                    }}
                    className="text-muted-foreground hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    Séries
                    <input
                      type="number"
                      defaultValue={p.qtd_series}
                      min={1}
                      onBlur={(e) => updatePrescricao(p.id, { qtd_series: parseInt(e.target.value) || 3 })}
                      className="w-14 rounded-lg bg-secondary/60 px-2 py-1.5 text-center text-sm outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    Reps
                    <input
                      defaultValue={p.faixa_reps || ""}
                      placeholder="8-12"
                      onBlur={(e) => updatePrescricao(p.id, { faixa_reps: e.target.value })}
                      className="w-20 rounded-lg bg-secondary/60 px-2 py-1.5 text-center text-sm outline-none"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setPicker(true)}
          className="w-full rounded-xl border border-dashed border-primary/40 py-3 text-sm font-semibold text-primary hover:bg-primary/10"
        >
          ＋ Adicionar exercício
        </button>
      </div>

      {picker && (
        <ExercicioPicker
          onClose={() => setPicker(false)}
          onPick={async (ex) => {
            await addExercicio(divisao.id, { id: ex.id, nome: ex.nome }, presc?.length ?? 0)
            await reload()
          }}
        />
      )}
    </div>
  )
}

function ExercicioPicker({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (ex: LibExercicio) => Promise<void>
}) {
  const [lib, setLib] = useState<LibExercicio[] | null>(null)
  const [q, setQ] = useState("")

  useEffect(() => {
    loadBiblioteca().then(setLib)
  }, [])

  const filtered = (lib || [])
    .filter((e) => e.grupo !== "Técnica avançada")
    .filter((e) => e.nome.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
        <button onClick={onClose} className="text-sm font-medium text-muted-foreground">
          ✕
        </button>
        <span className="font-semibold">Adicionar exercício</span>
      </div>
      <div className="p-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar exercício…"
          className="h-10 rounded-lg border-border/70 bg-card/40"
          autoFocus
        />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {lib === null ? (
          <Spin />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/70">
            {filtered.map((e, i) => (
              <button
                key={e.id}
                onClick={async () => {
                  await onPick(e)
                  onClose()
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-card/70 ${
                  i > 0 ? "border-t border-border/60" : ""
                }`}
              >
                <span className="flex-1 text-[15px] font-medium">{e.nome}</span>
                <span className="text-[12px] text-muted-foreground">{e.grupo}</span>
                <span className="text-primary">＋</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Spin() {
  return (
    <div className="flex justify-center py-14">
      <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  )
}
