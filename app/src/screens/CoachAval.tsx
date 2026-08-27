import { useEffect, useMemo, useState } from "react"
import type { CoachStudent as Student } from "@/lib/coach"
import { loadAvaliacoes, saveAvaliacaoData, delAvaliacao, loadStudentDob, imc, type Avaliacao } from "@/lib/aval"
import { SF_PROTOCOLS, SF_LABELS, sfSites, sfBodyFat, classifyFat } from "@/lib/skinfold"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function today() {
  return new Date().toLocaleDateString("en-CA")
}
function idade(dob: string | null): number {
  if (!dob) return 0
  return Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000)
}
function n(v: string): number | undefined {
  const x = parseFloat(v)
  return isNaN(x) ? undefined : x
}

const BASICOS: [string, string, string][] = [
  ["weight", "Peso", "kg"],
  ["height", "Altura", "cm"],
  ["bp_sys", "PA sistólica", "mmHg"],
  ["bp_dia", "PA diastólica", "mmHg"],
]
const MEDIDAS: [string, string][] = [
  ["waist", "Cintura"],
  ["hip", "Quadril"],
  ["arm", "Braço"],
  ["thigh", "Coxa"],
]

export function CoachAval({ student, onBack }: { student: Student; onBack: () => void }) {
  const [avs, setAvs] = useState<Avaliacao[] | null>(null)
  const [dob, setDob] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({ date: today() })
  const [proto, setProto] = useState("jp7")
  const [busy, setBusy] = useState(false)
  const [okMsg, setOkMsg] = useState(false)

  const gender = student.gender === "F" ? "F" : "M"
  const reload = () => loadAvaliacoes(student.id).then((r) => setAvs(r.slice().reverse()))
  useEffect(() => {
    reload()
    loadStudentDob(student.id).then(setDob)
  }, [student.id])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const sites = sfSites(proto, gender)
  const gorduraCalc = useMemo(() => {
    const vals: Record<string, number | undefined> = {}
    sites.forEach((k) => (vals[k] = n(form[k] || "")))
    return sfBodyFat(gender, idade(dob), vals, proto)
  }, [form, proto, gender, dob, sites])

  const gorduraFinal = n(form.bio_fat || "") ?? gorduraCalc ?? undefined
  const fatCls = classifyFat(gender, gorduraFinal ?? null)

  const salvar = async () => {
    const data: Record<string, number> = {}
    ;[...BASICOS.map((b) => b[0]), ...MEDIDAS.map((m) => m[0]), "bio_lean"].forEach((k) => {
      const v = n(form[k] || "")
      if (v != null) data[k] = v
    })
    sites.forEach((k) => {
      const v = n(form[k] || "")
      if (v != null) data[k] = v
    })
    if (gorduraFinal != null) data.bio_fat = gorduraFinal
    if (Object.keys(data).length === 0) return alert("Preencha ao menos um campo.")
    setBusy(true)
    const ok = await saveAvaliacaoData(student.id, form.date || today(), data)
    setBusy(false)
    if (ok) {
      setForm({ date: today() })
      setOkMsg(true)
      setTimeout(() => setOkMsg(false), 2200)
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

        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nova avaliação</p>
        <div className="flex flex-col gap-4">
          {/* básicos */}
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="mb-3 grid gap-1.5">
              <Label>Data</Label>
              <Input type="date" value={form.date || ""} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {BASICOS.map(([k, label, unit]) => (
                <div key={k} className="grid gap-1.5">
                  <Label className="text-[13px]">
                    {label} <span className="text-muted-foreground">({unit})</span>
                  </Label>
                  <Input type="number" inputMode="decimal" value={form[k] || ""} onChange={(e) => set(k, e.target.value)} placeholder="—" />
                </div>
              ))}
            </div>
          </div>

          {/* dobras */}
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="mb-3 grid gap-1.5">
              <Label>Protocolo de dobras</Label>
              <select
                value={proto}
                onChange={(e) => setProto(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {Object.entries(SF_PROTOCOLS).map(([k, p]) => (
                  <option key={k} value={k}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {sites.map((k) => (
                <div key={k} className="grid gap-1.5">
                  <Label className="text-[13px] capitalize">{SF_LABELS[k]} (mm)</Label>
                  <Input type="number" inputMode="decimal" value={form[k] || ""} onChange={(e) => set(k, e.target.value)} placeholder="—" />
                </div>
              ))}
            </div>
            {gorduraCalc != null && (
              <div className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
                % Gordura ({SF_PROTOCOLS[proto].short}): <b>{gorduraCalc}%</b>
                {fatCls ? ` — ${fatCls.l}` : ""}
              </div>
            )}
          </div>

          {/* medidas + massa magra + gordura manual */}
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="grid grid-cols-2 gap-3">
              {MEDIDAS.map(([k, label]) => (
                <div key={k} className="grid gap-1.5">
                  <Label className="text-[13px]">{label} (cm)</Label>
                  <Input type="number" inputMode="decimal" value={form[k] || ""} onChange={(e) => set(k, e.target.value)} placeholder="—" />
                </div>
              ))}
              <div className="grid gap-1.5">
                <Label className="text-[13px]">Massa magra (kg)</Label>
                <Input type="number" inputMode="decimal" value={form.bio_lean || ""} onChange={(e) => set("bio_lean", e.target.value)} placeholder="—" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[13px]">% Gordura manual</Label>
                <Input type="number" inputMode="decimal" value={form.bio_fat || ""} onChange={(e) => set("bio_fat", e.target.value)} placeholder="bioimpedância" />
              </div>
            </div>
          </div>

          {okMsg && (
            <div className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-400">
              Avaliação salva! Já aparece no app do aluno (e no app completo).
            </div>
          )}
          <button
            onClick={salvar}
            disabled={busy}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Salvando…" : "Salvar avaliação"}
          </button>
        </div>
      </div>
    </div>
  )
}
