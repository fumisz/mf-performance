import { lazy, Suspense, useEffect, useState } from "react"
import { motion } from "motion/react"
import { supabase } from "@/lib/supabase"
import { loadStudentData, EMPTY_STUDENT_DATA, type StudentData } from "@/lib/student"
import { StudentContext } from "@/lib/student-context"
import { StudentNav, type Tab } from "@/components/student-nav"
import { StudentHome } from "@/screens/StudentHome"
import { StudentProgress } from "@/screens/StudentProgress"
import { StudentAvisos } from "@/screens/StudentAvisos"
import { StudentConta } from "@/screens/StudentConta"
import type { Divisao } from "@/lib/student"

const StudentWorkout = lazy(() => import("@/screens/StudentWorkout").then((m) => ({ default: m.StudentWorkout })))
const StudentAval = lazy(() => import("@/screens/StudentAval").then((m) => ({ default: m.StudentAval })))

export function StudentApp({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>("home")
  const [data, setData] = useState<StudentData>(EMPTY_STUDENT_DATA)
  const [loading, setLoading] = useState(true)
  const [workout, setWorkout] = useState<Divisao | null>(null)
  const [avalOpen, setAvalOpen] = useState(false)

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

  const unread = data.avisos.filter((a) => !a.lido).length

  const screen =
    tab === "prog" ? (
      <StudentProgress onAval={() => setAvalOpen(true)} />
    ) : tab === "avisos" ? (
      <StudentAvisos />
    ) : tab === "conta" ? (
      <StudentConta />
    ) : (
      <StudentHome onStart={setWorkout} />
    )

  if (avalOpen && data.student) {
    return (
      <div className="theme-aluno dark min-h-screen bg-background text-foreground">
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center">
              <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
            </div>
          }
        >
          <StudentAval studentId={data.student.id} onBack={() => setAvalOpen(false)} />
        </Suspense>
      </div>
    )
  }

  if (workout && data.student) {
    return (
      <StudentContext.Provider value={data}>
        <div className="theme-aluno dark min-h-screen bg-background text-foreground">
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center">
                <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
              </div>
            }
          >
            <StudentWorkout
              divisao={workout}
              coachId={data.student.coach_id ?? ""}
              studentId={data.student.id}
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
        {loading ? (
          <div className="flex min-h-screen items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {screen}
            </motion.div>
            <StudentNav tab={tab} onTab={setTab} unread={unread} />
          </>
        )}
      </div>
    </StudentContext.Provider>
  )
}
