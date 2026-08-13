import { supabase } from "@/lib/supabase"

export type Student = {
  id: string
  name: string
  gender: string
  coach_id: string | null
}

export type Stats = { total: number; prs: number; streak: number; mes: number }

export type Aviso = {
  id: string
  tipo: string
  titulo: string
  texto: string
  created_at: string
  lido: boolean
}

export type Divisao = { id: string; nome: string | null; ordem: number }

export type StudentData = {
  student: Student | null
  stats: Stats
  avisos: Aviso[]
  divisoes: Divisao[]
  freq: { done: number; meta: number }
}

const EMPTY: StudentData = {
  student: null,
  stats: { total: 0, prs: 0, streak: 0, mes: 0 },
  avisos: [],
  divisoes: [],
  freq: { done: 0, meta: 4 },
}

function computeStats(hi: { data_treino: string; is_pr: boolean }[]): Stats {
  const dias = [...new Set(hi.map((h) => h.data_treino))].sort()
  const prs = hi.filter((h) => h.is_pr).length
  const mesKey = new Date().toISOString().slice(0, 7)
  const mes = dias.filter((d) => d.slice(0, 7) === mesKey).length
  const set = new Set(dias)
  const cur = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (!set.has(iso(cur))) cur.setDate(cur.getDate() - 1)
  let streak = 0
  while (set.has(iso(cur))) {
    streak++
    cur.setDate(cur.getDate() - 1)
  }
  return { total: dias.length, prs, streak, mes }
}

export async function loadStudentData(userId: string): Promise<StudentData> {
  const { data: sr } = await supabase
    .from("assess_students")
    .select("id,name,gender,coach_id")
    .eq("user_id", userId)
    .limit(1)
  const student = (sr && sr[0]) as Student | undefined
  if (!student) return EMPTY

  const [{ data: hi }, { data: dv }, { data: av }] = await Promise.all([
    supabase
      .from("train_historico")
      .select("data_treino,is_pr")
      .eq("student_id", student.id),
    supabase
      .from("train_divisao")
      .select("id,nome,ordem")
      .eq("student_id", student.id)
      .order("ordem"),
    supabase
      .from("train_avisos")
      .select("id,tipo,titulo,texto,created_at,lido")
      .eq("student_id", student.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  const hist = (hi || []) as { data_treino: string; is_pr: boolean }[]
  const stats = computeStats(hist)
  const divisoes = (dv || []) as Divisao[]

  const monday = new Date()
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const mk = monday.toISOString().slice(0, 10)
  const done = new Set(hist.filter((h) => h.data_treino >= mk).map((h) => h.data_treino)).size

  return {
    student,
    stats,
    avisos: (av || []) as Aviso[],
    divisoes,
    freq: { done, meta: divisoes.length || 4 },
  }
}

export { EMPTY as EMPTY_STUDENT_DATA }
