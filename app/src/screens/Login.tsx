import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ShimmerButton } from "@/components/fx/shimmer-button"
import { GradientText } from "@/components/fx/gradient-text"

export function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [role, setRole] = useState<"coach" | "aluno">("aluno")
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [email, setEmail] = useState("")
  const [pass, setPass] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!email || !pass) return setMsg({ ok: false, text: "Preencha e-mail e senha." })
    setBusy(true)
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
        if (error) throw error
      } else {
        if (!name.trim()) throw new Error("Informe seu nome.")
        if (!code.trim()) throw new Error("Informe o código de acesso.")
        if (role === "aluno") localStorage.setItem("mfp_aluno_code", code.trim().toUpperCase())
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: pass,
          options: { data: { role: role === "aluno" ? "student" : "coach", name: name.trim(), coach_code: code.trim().toUpperCase() } },
        })
        if (error) throw error
        if (data.user && !data.session) {
          setMsg({ ok: true, text: "Conta criada! Confirme pelo e-mail e faça login." })
          setMode("login")
        }
      }
    } catch (err) {
      const t = err instanceof Error ? err.message : "Erro ao entrar."
      setMsg({ ok: false, text: /invalid login/i.test(t) ? "E-mail ou senha incorretos." : t })
    }
    setBusy(false)
  }

  const seg = (active: boolean) =>
    `flex-1 rounded-lg py-2.5 text-sm font-bold transition ${
      active ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
    }`

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#181228] to-[#07040d] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-1 text-center text-[15px] font-semibold tracking-[0.35em] text-violet-200">
          MF PERFORMANCE
        </div>
        <p className="mb-6 text-center font-serif text-sm italic text-violet-300/70">
          <GradientText>Saúde, treino e nutrição num app só</GradientText>
        </p>
        <Card className="border-white/10 bg-card/70 backdrop-blur-xl">
          <CardContent className="p-6">
            <div className="mb-3 flex gap-1 rounded-xl bg-secondary/60 p-1">
              <button type="button" className={seg(role === "coach")} onClick={() => setRole("coach")}>
                Sou treinador
              </button>
              <button type="button" className={seg(role === "aluno")} onClick={() => setRole("aluno")}>
                Sou aluno
              </button>
            </div>
            <div className="mb-4 flex gap-1 rounded-xl bg-secondary/60 p-1">
              <button type="button" className={seg(mode === "login")} onClick={() => setMode("login")}>
                Entrar
              </button>
              <button type="button" className={seg(mode === "signup")} onClick={() => setMode("signup")}>
                Criar conta
              </button>
            </div>

            {msg && (
              <div
                className={`mb-3 rounded-lg px-3 py-2 text-sm ${
                  msg.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
                }`}
              >
                {msg.text}
              </div>
            )}

            <form onSubmit={submit} className="flex flex-col gap-3">
              {mode === "signup" && (
                <>
                  <div className="grid gap-1.5">
                    <Label>Nome</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Código de acesso</Label>
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder={role === "aluno" ? "Código do seu treinador" : "Código de treinador"}
                      className="uppercase tracking-widest"
                    />
                  </div>
                </>
              )}
              <div className="grid gap-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
              </div>
              <div className="grid gap-1.5">
                <Label>Senha</Label>
                <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••" />
              </div>
              <ShimmerButton type="submit" className="mt-1" disabled={busy}>
                {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
              </ShimmerButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
