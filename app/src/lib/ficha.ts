import { supabase } from "@/lib/supabase"

export type Divisao = { id: string; nome: string | null; ordem: number }
export type Prescricao = {
  id: string
  exercicio_id: string | null
  nome: string
  grupo: string | null
  qtd_series: number
  faixa_reps: string | null
  ordem: number
}

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

export async function loadDivisoes(studentId: string): Promise<Divisao[]> {
  const { data } = await supabase
    .from("train_divisao")
    .select("id,nome,ordem")
    .eq("student_id", studentId)
    .order("ordem")
  return (data || []) as Divisao[]
}

export async function addDivisao(studentId: string, nome: string, ordem: number): Promise<boolean> {
  const coach = await uid()
  if (!coach) return false
  const { error } = await supabase
    .from("train_divisao")
    .insert({ coach_id: coach, student_id: studentId, nome, ordem })
  return !error
}

export async function delDivisao(id: string) {
  await supabase.from("train_divisao").delete().eq("id", id)
}

type Row = {
  id: string
  exercicio_id: string | null
  exercicio_nome: string | null
  qtd_series: number | null
  faixa_reps: string | null
  ordem: number | null
  train_exercicios: { nome: string | null; grupo_muscular: string | null } | null
}

export async function loadPrescricoes(divisaoId: string): Promise<Prescricao[]> {
  const { data } = await supabase
    .from("train_serie_prescrita")
    .select("id,exercicio_id,exercicio_nome,qtd_series,faixa_reps,ordem,train_exercicios(nome,grupo_muscular)")
    .eq("divisao_id", divisaoId)
    .order("ordem")
  return ((data || []) as unknown as Row[]).map((r) => ({
    id: r.id,
    exercicio_id: r.exercicio_id,
    nome: r.exercicio_nome || r.train_exercicios?.nome || "Exercício",
    grupo: r.train_exercicios?.grupo_muscular ?? null,
    qtd_series: r.qtd_series || 3,
    faixa_reps: r.faixa_reps,
    ordem: r.ordem || 0,
  }))
}

export async function addExercicio(
  divisaoId: string,
  ex: { id: string; nome: string },
  ordem: number
): Promise<boolean> {
  const coach = await uid()
  if (!coach) return false
  const { error } = await supabase.from("train_serie_prescrita").insert({
    coach_id: coach,
    divisao_id: divisaoId,
    exercicio_id: ex.id,
    exercicio_nome: ex.nome,
    tipo_serie: "Valida",
    qtd_series: 3,
    faixa_reps: "8-12",
    ordem,
  })
  return !error
}

export async function updatePrescricao(id: string, patch: { qtd_series?: number; faixa_reps?: string }) {
  await supabase.from("train_serie_prescrita").update(patch).eq("id", id)
}

export async function delPrescricao(id: string) {
  await supabase.from("train_serie_prescrita").delete().eq("id", id)
}
