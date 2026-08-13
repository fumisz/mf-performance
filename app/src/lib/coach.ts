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

export type StudentExtra = {
  divisoes: { id: string; nome: string | null }[]
  ultimaAvaliacao: string | null
}

export async function loadStudentExtra(studentId: string): Promise<StudentExtra> {
  const [{ data: dv }, { data: av }] = await Promise.all([
    supabase.from("train_divisao").select("id,nome").eq("student_id", studentId).order("ordem"),
    supabase
      .from("assessments")
      .select("date")
      .eq("student_id", studentId)
      .order("date", { ascending: false })
      .limit(1),
  ])
  return {
    divisoes: (dv || []) as { id: string; nome: string | null }[],
    ultimaAvaliacao: (av && av[0]?.date) ?? null,
  }
}

export async function gerarCodigo(studentId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("aluno_gerar_codigo", { p_student: studentId })
  if (error) return null
  return (data as string) ?? null
}

export async function enviarAviso(
  studentId: string,
  titulo: string,
  texto: string,
  tipo: string
): Promise<boolean> {
  const { error } = await supabase.rpc("aviso_enviar", {
    p_student: studentId,
    p_titulo: titulo,
    p_texto: texto,
    p_tipo: tipo,
  })
  return !error
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
