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

// Lê tanto o formato novo (peso/altura/gordura…) quanto o do app antigo
// (weight/height/bio_fat/bio_lean/bp_sys…), pra as avaliações já salvas aparecerem.
function normalizar(d: Record<string, unknown>): Partial<Avaliacao> {
  const n = (v: unknown): number | undefined => {
    const x = typeof v === "string" ? parseFloat(v) : (v as number)
    return typeof x === "number" && !isNaN(x) ? x : undefined
  }
  return {
    peso: n(d.peso) ?? n(d.weight),
    altura: n(d.altura) ?? n(d.height),
    gordura: n(d.gordura) ?? n(d.bio_fat) ?? n(d.jp) ?? n(d.fat),
    massa_magra: n(d.massa_magra) ?? n(d.bio_lean) ?? n(d.lean),
    cintura: n(d.cintura) ?? n(d.waist) ?? n(d.circ_waist),
    quadril: n(d.quadril) ?? n(d.hip) ?? n(d.circ_hip),
    braco: n(d.braco) ?? n(d.arm) ?? n(d.circ_arm),
    coxa: n(d.coxa) ?? n(d.thigh) ?? n(d.circ_thigh),
    pa_sys: n(d.pa_sys) ?? n(d.bp_sys),
    pa_dia: n(d.pa_dia) ?? n(d.bp_dia),
  }
}

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
    ...normalizar((r.data || {}) as Record<string, unknown>),
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
