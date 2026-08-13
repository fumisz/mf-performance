import { supabase } from "@/lib/supabase"

export type CoachStudent = {
  id: string
  name: string
  goal: string | null
  gender: string | null
  photo_url: string | null
}

export type CoachData = {
  coachName: string
  students: CoachStudent[]
}

export async function loadCoachRole(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle()
  return (data?.role as string) ?? null
}

export async function loadCoachData(userId: string): Promise<CoachData> {
  const [{ data: prof }, { data: st }] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", userId).maybeSingle(),
    supabase
      .from("assess_students")
      .select("id,name,goal,gender,photo_url")
      .eq("coach_id", userId)
      .order("name"),
  ])
  return {
    coachName: (prof?.name as string) ?? "Treinador",
    students: (st || []) as CoachStudent[],
  }
}
