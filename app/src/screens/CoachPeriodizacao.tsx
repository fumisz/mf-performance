import { useEffect, useState } from "react"
import type { CoachStudent as Student } from "@/lib/coach"
import {
  loadPeriodizacao,
  loadHistoricoPeriodizacao,
  savePeriodizacao,
  diasRestantes,
  type Periodizacao,
} from "@/lib/periodizacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function fmt(d: string | null) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—"
}

export function CoachPeriodizacao({ student, onBack }: { student: Student; onBack: () => void }) {
  const [atual, setAtual] = useState<Periodizacao | null>(null)
  const [hist, setHist] = useState<Periodizacao[]>([])
  const [loaded, setLoaded] = useState(false)
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ nome: "", inicio: "", vencimento: "", meta: "3", valor: "" })

  const reload = async () => {
    const [a, h] = await Promise.all([loadPeriodizacao(student.id), loadHistoricoPeriodizacao(student.id)])
    setAtual(a)
    setHist(h)
    setLoaded(true)
  }
  useEffect(() => {
    reload()
  }, [student.id])

  const abrirEdit = () => {
    setF({
      nome: atual?.nome || "",
      inicio: atual?.inicio || new Date().toLocaleDateString("en-CA"),
      vencimento: atual?.vencimento || "",
      meta: String(atual?.meta_treinos_semana ?? 3),
      valor: atual?.valor_mensalidade != null ? String(atual.valor_mensalidade) : "",
    })
    setEdit(true)
  }

  const salvar = async () => {
    if (!f.nome.trim()) return alert("Dê um nome ao ciclo (ex.: Hipertrofia).")
    setBusy(true)
    const ok = await savePeriodizacao(student.id, {
      nome: f.nome.trim(),
      inicio: f.inicio || null,
      vencimento: f.vencimento || null,
      meta_treinos_semana: parseInt(f.meta) || null,
      valor_mensalidade: f.valor ? parseFloat(f.valor) : null,
    })
    setBusy(false)
    if (ok) {
      setEdit(false)
      reload()
    } else alert("Erro ao salvar.")
  }

  const dr = diasRestantes(atual?.vencimento ?? null)

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(124,58,237,0.16),transparent_70%)]" />
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <button onClick={onBack} className="mb-4 text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ Voltar
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">Periodização</h1>
        <p className="mb-5 text-sm text-muted-foreground">{student.name}</p>

        {!loaded ? (
          <div className="flex justify-center py-14">
            <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : edit ? (
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Nome do ciclo</Label>
                <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Hipertrofia" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Início</Label>
                  <Input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Vencimento</Label>
                  <Input type="date" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Treinos / semana</Label>
                  <Input type="number" value={f.meta} onChange={(e) => setF({ ...f, meta: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Mensalidade (R$)</Label>
                  <Input type="number" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="—" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={salvar} disabled={busy} className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                  {busy ? "Salvando…" : "Salvar ciclo"}
                </button>
                <button onClick={() => setEdit(false)} className="rounded-lg border border-border/70 px-4 text-sm text-muted-foreground">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {atual ? (
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-primary/20 to-card/60 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Ciclo atual</p>
                    <h2 className="text-xl font-bold">{atual.nome}</h2>
                  </div>
                  {dr != null && (
                    <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${dr < 0 ? "bg-red-500/15 text-red-400" : dr <= 7 ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                      {dr < 0 ? `vencido há ${-dr}d` : `${dr}d restantes`}
                    </span>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Início</span><br /><b>{fmt(atual.inicio)}</b></div>
                  <div><span className="text-muted-foreground">Vencimento</span><br /><b>{fmt(atual.vencimento)}</b></div>
                  <div><span className="text-muted-foreground">Treinos/semana</span><br /><b>{atual.meta_treinos_semana ?? "—"}</b></div>
                  <div><span className="text-muted-foreground">Mensalidade</span><br /><b>{atual.valor_mensalidade != null ? `R$ ${atual.valor_mensalidade}` : "—"}</b></div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 py-12 text-center text-sm text-muted-foreground">
                Nenhuma periodização ativa.
              </div>
            )}

            <button onClick={abrirEdit} className="mt-4 w-full rounded-xl border border-dashed border-primary/40 py-3 text-sm font-semibold text-primary hover:bg-primary/10">
              {atual ? "Novo ciclo / renovar" : "＋ Criar periodização"}
            </button>

            {hist.length > 1 && (
              <div className="mt-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Histórico</p>
                <div className="overflow-hidden rounded-xl border border-border/70 bg-card/30">
                  {hist.map((h, i) => (
                    <div key={h.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-border/60" : ""}`}>
                      <div>
                        <p className="font-medium">{h.nome}{h.ativo ? " · ativo" : ""}</p>
                        <p className="text-[13px] text-muted-foreground">{fmt(h.inicio)} → {fmt(h.vencimento)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
