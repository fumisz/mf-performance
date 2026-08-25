import { useEffect, useState } from "react"
import type { CoachStudent as Student } from "@/lib/coach"
import { loadStudentExtra, gerarCodigo, enviarAviso, type StudentExtra } from "@/lib/coach"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CoachStudentView } from "@/screens/CoachStudentView"
import { CoachFicha } from "@/screens/CoachFicha"

function initials(n: string) {
  return n.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase()
}

export function CoachStudent({ student, onBack }: { student: Student; onBack: () => void }) {
  const [extra, setExtra] = useState<StudentExtra | null>(null)
  const [verComo, setVerComo] = useState(false)
  const [ficha, setFicha] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [codeBusy, setCodeBusy] = useState(false)

  const [titulo, setTitulo] = useState("")
  const [texto, setTexto] = useState("")
  const [tipo, setTipo] = useState("lembrete")
  const [sendBusy, setSendBusy] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    loadStudentExtra(student.id).then(setExtra)
  }, [student.id])

  const onGerar = async () => {
    setCodeBusy(true)
    const c = await gerarCodigo(student.id)
    setCodeBusy(false)
    setCode(c ?? "erro")
  }

  const onEnviar = async () => {
    if (!titulo.trim() || !texto.trim()) return
    setSendBusy(true)
    const ok = await enviarAviso(student.id, titulo, texto, tipo)
    setSendBusy(false)
    if (ok) {
      setSent(true)
      setTitulo("")
      setTexto("")
      setTimeout(() => setSent(false), 2500)
    }
  }

  const modelos = [
    { t: "Treino de hoje te espera", x: "Bora fechar mais um treino? Não esqueça de registrar as cargas.", tipo: "lembrete" },
    { t: "Mandou muito bem!", x: "Vi sua evolução na semana. Continua assim!", tipo: "parabens" },
    { t: "Sua reavaliação está chegando", x: "Semana que vem faremos sua reavaliação.", tipo: "aviso" },
  ]

  if (verComo) return <CoachStudentView student={student} onBack={() => setVerComo(false)} />
  if (ficha) return <CoachFicha student={student} onBack={() => { setFicha(false); loadStudentExtra(student.id).then(setExtra) }} />

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(124,58,237,0.16),transparent_70%)]" />
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-6">
        <button onClick={onBack} className="mb-5 text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ Alunos
        </button>
        <button
          onClick={() => setFicha(true)}
          className="mb-5 ml-3 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
        >
          🏋️ Montar treino
        </button>
        <button
          onClick={() => setVerComo(true)}
          className="mb-5 ml-2 rounded-lg border border-border/70 bg-card/40 px-3 py-1.5 text-sm font-medium text-primary hover:bg-card/70"
        >
          👁 Visão do aluno
        </button>

        <header className="mb-8 flex items-center gap-3.5">
          <div className="flex size-14 items-center justify-center overflow-hidden rounded-full bg-secondary text-base font-semibold">
            {student.photo_url ? (
              <img src={student.photo_url} alt="" className="size-full object-cover" />
            ) : (
              initials(student.name)
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{student.name}</h1>
            <p className="text-sm text-muted-foreground">{student.goal || "Sem objetivo definido"}</p>
          </div>
        </header>

        {/* resumo */}
        <section className="mb-8 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/70 bg-card/40 px-4 py-3.5">
            <div className="text-sm text-muted-foreground">Treinos na ficha</div>
            <div className="mt-0.5 text-xl font-semibold">{extra ? extra.divisoes.length : "—"}</div>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/40 px-4 py-3.5">
            <div className="text-sm text-muted-foreground">Última avaliação</div>
            <div className="mt-0.5 text-xl font-semibold">
              {extra?.ultimaAvaliacao
                ? new Date(extra.ultimaAvaliacao + "T00:00:00").toLocaleDateString("pt-BR")
                : "—"}
            </div>
          </div>
        </section>

        {/* código de acesso */}
        <section className="mb-8">
          <h2 className="mb-2 text-[15px] font-semibold">Acesso do aluno</h2>
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            {code ? (
              <div className="text-center">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Código</div>
                <div className="font-mono text-3xl font-bold tracking-[0.3em]">{code}</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Envie ao aluno. Ele cria a conta como aluno e digita esse código.
                </p>
              </div>
            ) : (
              <button
                onClick={onGerar}
                disabled={codeBusy}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {codeBusy ? "Gerando…" : "Gerar código de acesso"}
              </button>
            )}
          </div>
        </section>

        {/* enviar aviso */}
        <section>
          <h2 className="mb-2 text-[15px] font-semibold">Enviar aviso</h2>
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            {sent && (
              <div className="mb-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-400">
                Aviso enviado para {student.name.split(" ")[0]}.
              </div>
            )}
            <div className="mb-3 flex flex-wrap gap-2">
              {modelos.map((m) => (
                <button
                  key={m.t}
                  onClick={() => {
                    setTitulo(m.t)
                    setTexto(m.x)
                    setTipo(m.tipo)
                  }}
                  className="rounded-full border border-border/70 bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {m.t}
                </button>
              ))}
            </div>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Título</Label>
                <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Treino de hoje te espera" />
              </div>
              <div className="grid gap-1.5">
                <Label>Mensagem</Label>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={3}
                  placeholder="Escreva a mensagem…"
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <button
                onClick={onEnviar}
                disabled={sendBusy || !titulo.trim() || !texto.trim()}
                className="rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {sendBusy ? "Enviando…" : "Enviar aviso"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
