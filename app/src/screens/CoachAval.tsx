import { useEffect, useState } from "react"
import type { CoachStudent as Student } from "@/lib/coach"
import { loadAvaliacoes, addAvaliacao, delAvaliacao, imc, type Avaliacao } from "@/lib/aval"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const CAMPOS: [keyof Avaliacao, string, string][] = [
  ["peso", "Peso", "kg"],
  ["altura", "Altura", "cm"],
  ["gordura", "% Gordura", "%"],
  ["massa_magra", "Massa magra", "kg"],
  ["cintura", "Cintura", "cm"],
  ["quadril", "Quadril", "cm"],
  ["braco", "Braço", "cm"],
  ["coxa", "Coxa", "cm"],
  ["pa_sys", "PA sistólica", "mmHg"],
  ["pa_dia", "PA diastólica", "mmHg"],
]

function today() {
  return new Date().toLocaleDateString("en-CA")
}

export function CoachAval({ student, onBack }: { student: Student; onBack: () => void }) {
  const [avs, setAvs] = useState<Avaliacao[] | null>(null)
  const [form, setForm] = useState<Record<string, string>>({ date: today() })
  const [busy, setBusy] = useState(false)
  const [okMsg, setOkMsg] = useState(false)

  const reload = () => loadAvaliacoes(student.id).then((r) => setAvs(r.slice().reverse()))
  useEffect(() => {
    reload()
  }, [student.id])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const salvar = async () => {
    const fields: Record<string, number> = {}
    for (const [k] of CAMPOS) {
      const v = parseFloat(form[k as string])
      if (!isNaN(v)) fields[k as string] = v
    }
    if (Object.keys(fields).length === 0) return alert("Preencha ao menos um campo.")
    setBusy(true)
    const ok = await addAvaliacao(student.id, form.date || today(), fields)
    setBusy(false)
    if (ok) {
      setForm({ date: today() })
      setOkMsg(true)
      setTimeout(() => setOkMsg(false), 2000)
      reload()
    } else alert("Erro ao salvar.")
  }

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(124,58,237,0.16),transparent_70%)]" />
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <button onClick={onBack} className="mb-4 text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ Voltar
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">Avaliação física</h1>
        <p className="mb-5 text-sm text-muted-foreground">{student.name}</p>

        {/* histórico */}
        {avs && avs.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Histórico</p>
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card/30">
              {avs.map((a, i) => (
                <div key={a.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border/60" : ""}`}>
                  <div className="flex-1">
                    <p className="font-medium">{new Date(a.date + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {a.peso ? `${a.peso}kg` : "—"}
                      {a.gordura != null ? ` · ${a.gordura}% gord.` : ""}
                      {imc(a) != null ? ` · IMC ${imc(a)}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm("Excluir esta avaliação?")) {
                        await delAvaliacao(a.id)
                        reload()
                      }
                    }}
                    className="text-muted-foreground hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* nova avaliação */}
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nova avaliação</p>
        <div className="rounded-xl border border-border/70 bg-card/40 p-4">
          <div className="mb-3 grid gap-1.5">
            <Label>Data</Label>
            <Input type="date" value={form.date || ""} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {CAMPOS.map(([k, label, unit]) => (
              <div key={k as string} className="grid gap-1.5">
                <Label className="text-[13px]">
                  {label} <span className="text-muted-foreground">({unit})</span>
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form[k as string] || ""}
                  onChange={(e) => set(k as string, e.target.value)}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
          {okMsg && (
            <div className="mt-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-400">
              Avaliação salva! Já aparece no app do aluno.
            </div>
          )}
          <button
            onClick={salvar}
            disabled={busy}
            className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Salvando…" : "Salvar avaliação"}
          </button>
        </div>
      </div>
    </div>
  )
}
