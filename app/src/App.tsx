import { lazy, Suspense, useEffect, useState } from "react"
import type { CSSProperties } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { loadCoachRole } from "@/lib/coach"
import { getAccent } from "@/lib/util"
import { Login } from "@/screens/Login"

// Code-splitting: cada app carrega só quando precisa (mais leve na abertura)
const StudentApp = lazy(() => import("@/StudentApp").then((m) => ({ default: m.StudentApp })))
const CoachHome = lazy(() => import("@/screens/CoachHome").then((m) => ({ default: m.CoachHome })))

function Spinner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex min-h-screen items-center justify-center bg-background ${className}`}>
      <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [role, setRole] = useState<string | null | undefined>(undefined)
  const [accent, setAccentState] = useState<string>("#7c3aed")

  useEffect(() => {
    if (session && role === "coach") setAccentState(getAccent(session.user.id))
  }, [session, role])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null)
      setRole(undefined)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let alive = true
    loadCoachRole(session.user.id).then((r) => alive && setRole(r ?? "student"))
    return () => {
      alive = false
    }
  }, [session])

  if (session === undefined) return <Spinner className="theme-aluno dark" />
  if (!session) return <Login />
  if (role === undefined) return <Spinner className="theme-aluno dark" />

  if (role === "coach") {
    const brand = { "--primary": accent, "--ring": accent } as CSSProperties
    return (
      <div className="theme-coach dark min-h-screen bg-background text-foreground" style={brand}>
        <Suspense fallback={<Spinner className="theme-coach dark" />}>
          <CoachHome userId={session.user.id} accent={accent} onAccent={setAccentState} />
        </Suspense>
      </div>
    )
  }

  return (
    <Suspense fallback={<Spinner className="theme-aluno dark" />}>
      <StudentApp userId={session.user.id} />
    </Suspense>
  )
}
