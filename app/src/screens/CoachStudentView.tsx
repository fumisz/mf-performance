import { lazy, Suspense, useEffect, useState } from "react"
import type { CoachStudent as Student } from "@/lib/coach"
import { loadForStudent, EMPTY_STUDENT_DATA, type StudentData, type Divisao } from "@/lib/student"
import { StudentContext } from "@/lib/student-context"
import { StudentNav, type Tab } from "@/components/student-nav"
import { StudentHome } from "@/screens/StudentHome"
import { StudentProgress } from "@/screens/StudentProgress"
import { StudentAvisos } from "@/screens/StudentAvisos"
import { StudentConta } from "@/screens/StudentConta"

const StudentWorkout = lazy(() => import("@/screens/StudentWorkout").then((m) => ({ default: m.StudentWorkout })))
const StudentAval = lazy(() => import("@/screens/StudentAval").then((m) => ({ default: m.StudentAval })))
const StudentDieta = lazy(() => import("@/screens/StudentDieta").then((m) => ({ default: m.StudentDieta })))

function Carregando() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  )
}

/**
 * Visão do aluno: o treinador vê exatamente o app que o aluno vê — as mesmas
 * telas, os mesmos dados —, só que sem poder registrar nada no lugar dele.
 */
export function CoachStudentView({ student, onBack }: { student: Student; onBack: () => void }) {
  const [data, setData] = useState<StudentData>(EMPTY_STUDENT_DATA)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("home")
  const [workout, setWorkout] = useState<Divisao | null>(null)
  const [avalOpen, setAvalOpen] = useState(false)
  const [dietaOpen, setDietaOpen] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadForStudent({
      id: student.id,
      name: student.name,
      gender: student.gender ?? "",
      coach_id: null,
      user_id: student.user_id,
    }).then((d) => {
      if (!alive) return
      setData(d)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [student.id, student.name, student.gender, student.user_id])

  const barra = (titulo: string, voltar: () => void) => (
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-background/90 px-4 py-2.5 backdrop-blur">
      <button onClick={voltar} className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ‹ Voltar
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{titulo}</span>
      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
        Só leitura
      </span>
    </div>
  )

  const primeiro = student.name.split(" ")[0]

  if (workout) {
    return (
      <div className="theme-aluno dark min-h-screen bg-background text-foreground">
        {barra(`Treino de ${primeiro}`, () => setWorkout(null))}
        <Suspense fallback={<Carregando />}>
          <StudentWorkout
            divisao={workout}
            coachId=""
            studentId={student.id}
            recordes={data.recordes}
            readOnly
            mostrarVoltar={false}
            onBack={() => setWorkout(null)}
          />
        </Suspense>
      </div>
    )
  }

  if (avalOpen) {
    return (
      <div className="theme-aluno dark min-h-screen bg-background text-foreground">
        {barra(`Avaliação de ${primeiro}`, () => setAvalOpen(false))}
        <Suspense fallback={<Carregando />}>
          <StudentAval studentId={student.id} mostrarVoltar={false} onBack={() => setAvalOpen(false)} />
        </Suspense>
      </div>
    )
  }

  if (dietaOpen) {
    return (
      <div className="theme-aluno dark min-h-screen bg-background text-foreground">
        {barra(`Dieta de ${primeiro}`, () => setDietaOpen(false))}
        <Suspense fallback={<Carregando />}>
          <StudentDieta
            userId={student.user_id}
            mostrarVoltar={false}
            onBack={() => setDietaOpen(false)}
            vazioTexto={
              student.user_id
                ? "Este aluno ainda não tem um plano alimentar ativo no MF Nutrition."
                : "Este aluno ainda não vinculou a conta do app, então não há dieta para mostrar."
            }
          />
        </Suspense>
      </div>
    )
  }

  const screen =
    tab === "prog" ? (
      <StudentProgress onAval={() => setAvalOpen(true)} />
    ) : tab === "avisos" ? (
      <StudentAvisos />
    ) : tab === "conta" ? (
      <StudentConta readOnly />
    ) : (
      <StudentHome onStart={setWorkout} onDieta={() => setDietaOpen(true)} />
    )

  return (
    <StudentContext.Provider value={data}>
      <div className="theme-aluno dark min-h-screen bg-background text-foreground">
        {barra(`Visão do aluno · ${primeiro}`, onBack)}

        {!student.user_id && (
          <div className="mx-auto max-w-md px-4 pt-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-300">
              {primeiro} ainda não vinculou a conta. Gere um código de acesso no perfil dele para ele entrar no app.
            </div>
          </div>
        )}

        {loading ? (
          <Carregando />
        ) : (
          <>
            {screen}
            <StudentNav tab={tab} onTab={setTab} unread={data.avisos.filter((a) => !a.lido).length} />
          </>
        )}
      </div>
    </StudentContext.Provider>
  )
}
