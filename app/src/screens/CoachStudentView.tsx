import { useEffect, useState } from "react"
import type { CoachStudent as Student } from "@/lib/coach"
import { loadForStudent, EMPTY_STUDENT_DATA, type StudentData } from "@/lib/student"
import { StudentContext } from "@/lib/student-context"
import { StudentHome } from "@/screens/StudentHome"
import { StudentProgress } from "@/screens/StudentProgress"
import { StudentAvisos } from "@/screens/StudentAvisos"

type Tab = "home" | "prog" | "avisos"

export function CoachStudentView({ student, onBack }: { student: Student; onBack: () => void }) {
  const [data, setData] = useState<StudentData>(EMPTY_STUDENT_DATA)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("home")

  useEffect(() => {
    loadForStudent({
      id: student.id,
      name: student.name,
      gender: student.gender ?? "",
      coach_id: null,
    }).then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [student.id, student.name, student.gender])

  const screen = tab === "prog" ? <StudentProgress /> : tab === "avisos" ? <StudentAvisos /> : <StudentHome />

  return (
    <StudentContext.Provider value={data}>
      <div className="theme-aluno dark min-h-screen bg-background text-foreground">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-background/90 px-4 py-2.5 backdrop-blur">
          <button onClick={onBack} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            ‹ Voltar
          </button>
          <span className="text-sm font-semibold">Visão do aluno · {student.name.split(" ")[0]}</span>
        </div>

        {loading ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : (
          <>
            {screen}
            <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md items-stretch justify-around border-t border-white/10 bg-background/85 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur-xl">
              {(
                [
                  ["home", "🏠", "Início"],
                  ["prog", "📈", "Progresso"],
                  ["avisos", "🔔", "Avisos"],
                ] as [Tab, string, string][]
              ).map(([id, ic, lb]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10.5px] font-bold ${
                    tab === id ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <span className={`text-xl ${tab === id ? "" : "opacity-60 grayscale"}`}>{ic}</span>
                  {lb}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </StudentContext.Provider>
  )
}
