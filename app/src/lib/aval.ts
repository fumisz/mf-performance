import { supabase } from "@/lib/supabase"

export type Avaliacao = {
  id: string
  date: string
  peso?: number
  altura?: number
  gordura?: number
  massa_magra?: number
  cintura?: number
  quadril?: number
  braco?: number
  coxa?: number
  pa_sys?: number
  pa_dia?: number
  obs?: string
}

type Row = { id: string; date: string; obs: string | null; data: Record<string, unknown> | null }

export async function loadAvaliacoes(studentId: string): Promise<Avaliacao[]> {
  const { data } = await supabase
    .from("assessments")
    .select("id,date,obs,data")
    .eq("student_id", studentId)
    .order("date")
  return ((data || []) as Row[]).map((r) => ({
    id: r.id,
    date: r.date,
    obs: r.obs ?? undefined,
    ...(r.data as Partial<Avaliacao>),
  }))
}

export async function addAvaliacao(
  studentId: string,
  date: string,
  fields: Omit<Avaliacao, "id" | "date">
): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser()
  const coachId = u?.user?.id
  if (!coachId) return false
  const { obs, ...data } = fields
  const { error } = await supabase.from("assessments").insert({
    student_id: studentId,
    coach_id: coachId,
    date,
    obs: obs ?? null,
    data,
  })
  return !error
}

export async function delAvaliacao(id: string) {
  await supabase.from("assessments").delete().eq("id", id)
}

export function imc(a: Avaliacao): number | null {
  if (!a.peso || !a.altura) return null
  const h = a.altura / 100
  return Math.round((a.peso / (h * h)) * 10) / 10
}
