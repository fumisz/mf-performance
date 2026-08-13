import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { loadCoachRole } from "@/lib/coach"
import { Login } from "@/screens/Login"
import { StudentApp } from "@/StudentApp"
import { CoachHome } from "@/screens/CoachHome"

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
    return (
      <div className="min-h-screen bg-background text-foreground">
        <CoachHome userId={session.user.id} />
      </div>
    )
  }

  return <StudentApp userId={session.user.id} />
}
