import { supabase } from "@/lib/supabase"

export type Periodizacao = {
  id: string
  nome: string | null
  inicio: string | null
  vencimento: string | null
  meta_treinos_semana: number | null
  valor_mensalidade: number | null
  ativo: boolean
}

export async function loadPeriodizacao(studentId: string): Promise<Periodizacao | null> {
  const { data } = await supabase
    .from("train_periodizacao")
    .select("id,nome,inicio,vencimento,meta_treinos_semana,valor_mensalidade,ativo")
    .eq("student_id", studentId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
  return (data && data[0]) ? (data[0] as Periodizacao) : null
}

export async function loadHistoricoPeriodizacao(studentId: string): Promise<Periodizacao[]> {
  const { data } = await supabase
    .from("train_periodizacao")
    .select("id,nome,inicio,vencimento,meta_treinos_semana,valor_mensalidade,ativo")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
  return (data || []) as Periodizacao[]
}

export async function savePeriodizacao(
  studentId: string,
  p: {
    nome: string
    inicio: string | null
    vencimento: string | null
    meta_treinos_semana: number | null
    valor_mensalidade: number | null
  }
): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser()
  const coachId = u?.user?.id
  if (!coachId) return false
  // desativa a anterior e cria a nova ativa
  await supabase.from("train_periodizacao").update({ ativo: false }).eq("student_id", studentId).eq("ativo", true)
  const { error } = await supabase.from("train_periodizacao").insert({
    coach_id: coachId,
    student_id: studentId,
    nome: p.nome,
    inicio: p.inicio,
    vencimento: p.vencimento,
    meta_treinos_semana: p.meta_treinos_semana,
    valor_mensalidade: p.valor_mensalidade,
    ativo: true,
  })
  return !error
}

export function diasRestantes(venc: string | null): number | null {
  if (!venc) return null
  const d = Math.ceil((new Date(venc + "T00:00:00").getTime() - Date.now()) / 86400000)
  return d
}
