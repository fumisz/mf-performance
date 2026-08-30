import { lazy, Suspense, useEffect, useState } from "react"
import { motion } from "motion/react"
import { supabase } from "@/lib/supabase"
import {
  loadStudentData,
  marcarAvisosLidos,
  vincularPorCodigo,
  EMPTY_STUDENT_DATA,
  type StudentData,
} from "@/lib/student"
import { StudentContext } from "@/lib/student-context"
import { StudentNav, type Tab } from "@/components/student-nav"
import { StudentHome } from "@/screens/StudentHome"
import { StudentProgress } from "@/screens/StudentProgress"
import { StudentAvisos } from "@/screens/StudentAvisos"
import { StudentConta } from "@/screens/StudentConta"
import { Input } from "@/components/ui/input"
import { ShimmerButton } from "@/components/fx/shimmer-button"
import type { Divisao } from "@/lib/student"

const StudentWorkout = lazy(() => import("@/screens/StudentWorkout").then((m) => ({ default: m.StudentWorkout })))
const StudentAval = lazy(() => import("@/screens/StudentAval").then((m) => ({ default: m.StudentAval })))
const StudentDieta = lazy(() => import("@/screens/StudentDieta").then((m) => ({ default: m.StudentDieta })))

function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  )
}

/** Aluno logado que ainda não está ligado a nenhum treinador. */
function Vincular({ onOk }: { onOk: () => void }) {
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async () => {
    if (!code.trim()) return setErro("Digite o código que o treinador te enviou.")
    setBusy(true)
    setErro(null)
    const ok = await vincularPorCodigo(code)
    setBusy(false)
    if (ok) onOk()
    else setErro("Código inválido ou já usado. Peça um novo ao seu treinador.")
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-2 text-center text-4xl">🔗</div>
      <h1 className="mb-1 text-center text-2xl font-extrabold tracking-tight">Falta vincular sua conta</h1>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Seu treinador gera um código de acesso no perfil dele. Digite aqui para liberar seus treinos, avaliações e dieta.
      </p>
      {erro && <div className="mb-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{erro}</div>}
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="CÓDIGO"
        className="mb-3 h-12 text-center text-lg tracking-[0.3em]"
      />
      <ShimmerButton onClick={enviar} disabled={busy}>
        {busy ? "Vinculando…" : "Vincular conta"}
      </ShimmerButton>
      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-5 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Sair da conta
      </button>
    </div>
  )
}

export function StudentApp({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>("home")
  const [data, setData] = useState<StudentData>(EMPTY_STUDENT_DATA)
  const [loading, setLoading] = useState(true)
  const [workout, setWorkout] = useState<Divisao | null>(null)
  const [avalOpen, setAvalOpen] = useState(false)
  const [dietaOpen, setDietaOpen] = useState(false)

  const reload = () => {
    loadStudentData(userId).then(setData)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      // vincula por código (aluno recém-cadastrado)
      try {
        const code = localStorage.getItem("mfp_aluno_code")
        if (code) {
          const { data: lk } = await supabase.rpc("aluno_link", { p_code: code })
          if (lk && lk.linked) localStorage.removeItem("mfp_aluno_code")
        }
      } catch {
        /* ignora */
      }
      const d = await loadStudentData(userId)
      if (alive) {
        setData(d)
        setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [userId])

  // ao abrir a aba de avisos, marca os não lidos como lidos
  useEffect(() => {
    if (tab !== "avisos") return
    const naoLidos = data.avisos.filter((a) => !a.lido).map((a) => a.id)
    if (naoLidos.length === 0) return
    marcarAvisosLidos(naoLidos).then((ok) => {
      if (ok) {
        setData((d) => ({ ...d, avisos: d.avisos.map((a) => ({ ...a, lido: true })) }))
      }
    })
  }, [tab, data.avisos])

  const unread = data.avisos.filter((a) => !a.lido).length

  const screen =
    tab === "prog" ? (
      <StudentProgress onAval={() => setAvalOpen(true)} />
    ) : tab === "avisos" ? (
      <StudentAvisos />
    ) : tab === "conta" ? (
      <StudentConta />
    ) : (
      <StudentHome onStart={setWorkout} onDieta={() => setDietaOpen(true)} />
    )

  if (loading) {
    return (
      <div className="theme-aluno dark min-h-screen bg-background text-foreground">
        <Carregando />
      </div>
    )
  }

  // conta criada mas ainda sem cadastro vinculado: sem isso o app abria vazio
  if (!data.student) {
    return (
      <div className="theme-aluno dark min-h-screen bg-background text-foreground">
        <Vincular
          onOk={() => {
            setLoading(true)
            loadStudentData(userId).then((d) => {
              setData(d)
              setLoading(false)
            })
          }}
        />
      </div>
    )
  }

  if (dietaOpen) {
    return (
      <div className="theme-aluno dark min-h-screen bg-background text-foreground">
        <Suspense fallback={<Carregando />}>
          <StudentDieta userId={userId} onBack={() => setDietaOpen(false)} />
        </Suspense>
      </div>
    )
  }

  if (avalOpen) {
    return (
      <div className="theme-aluno dark min-h-screen bg-background text-foreground">
        <Suspense fallback={<Carregando />}>
          <StudentAval studentId={data.student.id} onBack={() => setAvalOpen(false)} />
        </Suspense>
      </div>
    )
  }

  if (workout) {
    return (
      <StudentContext.Provider value={data}>
        <div className="theme-aluno dark min-h-screen bg-background text-foreground">
          <Suspense fallback={<Carregando />}>
            <StudentWorkout
              divisao={workout}
              coachId={data.student.coach_id ?? ""}
              studentId={data.student.id}
              recordes={data.recordes}
              onBack={() => {
                setWorkout(null)
                reload()
              }}
            />
          </Suspense>
        </div>
      </StudentContext.Provider>
    )
  }

  return (
    <StudentContext.Provider value={data}>
      <div className="theme-aluno dark min-h-screen bg-background text-foreground">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {screen}
        </motion.div>
        <StudentNav tab={tab} onTab={setTab} unread={unread} />
      </div>
    </StudentContext.Provider>
  )
}
