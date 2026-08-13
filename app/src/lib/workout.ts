import { supabase } from "@/lib/supabase"

export type Exercicio = {
  id: string // id da serie_prescrita
  exercicio_id: string | null
  nome: string
  grupo: string | null
  video_url: string | null
  tipo_serie: string
  qtd_series: number
  faixa_reps: string | null
  intervalo: number | null
}

type Row = {
  id: string
  exercicio_id: string | null
  exercicio_nome: string | null
  tipo_serie: string | null
  qtd_series: number | null
  faixa_reps: string | null
  intervalo_seg_min: number | null
  train_exercicios: { nome: string | null; video_url: string | null; grupo_muscular: string | null } | null
}

export async function loadWorkout(divisaoId: string): Promise<Exercicio[]> {
  const { data } = await supabase
    .from("train_serie_prescrita")
    .select(
      "id,exercicio_id,exercicio_nome,tipo_serie,qtd_series,faixa_reps,intervalo_seg_min,train_exercicios(nome,video_url,grupo_muscular)"
    )
    .eq("divisao_id", divisaoId)
    .order("ordem")
  const rows = (data || []) as unknown as Row[]
  return rows.map((r) => ({
    id: r.id,
    exercicio_id: r.exercicio_id,
    nome: r.exercicio_nome || r.train_exercicios?.nome || "Exercício",
    grupo: r.train_exercicios?.grupo_muscular ?? null,
    video_url: r.train_exercicios?.video_url ?? null,
    tipo_serie: r.tipo_serie || "Valida",
    qtd_series: r.qtd_series || 3,
    faixa_reps: r.faixa_reps,
    intervalo: r.intervalo_seg_min,
  }))
}

export async function registrarSerie(params: {
  coachId: string
  studentId: string
  divisaoId: string
  ex: Exercicio
  indice: number
  carga: number
  reps: number
  isPr: boolean
}) {
  const { coachId, studentId, divisaoId, ex, indice, carga, reps, isPr } = params
  await supabase.from("train_historico").insert({
    coach_id: coachId,
    student_id: studentId,
    divisao_id: divisaoId,
    exercicio_id: ex.exercicio_id,
    exercicio_nome: ex.nome,
    data_treino: new Date().toLocaleDateString("en-CA"),
    indice_serie: indice,
    tipo_serie: ex.tipo_serie,
    carga,
    reps,
    is_pr: isPr,
  })
}
