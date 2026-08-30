import { supabase } from "@/lib/supabase"

export type Student = {
  id: string
  name: string
  gender: string
  coach_id: string | null
  user_id?: string | null
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

/** Evolução real de carga do exercício mais treinado (para o gráfico do Progresso). */
export type Evolucao = { exercicio: string; pontos: { data: string; carga: number }[]; variacao: number | null }

export type Ciclo = {
  nome: string | null
  inicio: string | null
  vencimento: string | null
  meta_treinos_semana: number | null
}

export type StudentData = {
  student: Student | null
  stats: Stats
  avisos: Aviso[]
  divisoes: Divisao[]
  freq: { done: number; meta: number }
  evolucao: Evolucao | null
  /** melhor carga já registrada por exercício — usado para detectar recorde */
  recordes: Record<string, number>
  ciclo: Ciclo | null
}

const EMPTY: StudentData = {
  student: null,
  stats: { total: 0, prs: 0, streak: 0, mes: 0 },
  avisos: [],
  divisoes: [],
  freq: { done: 0, meta: 4 },
  evolucao: null,
  recordes: {},
  ciclo: null,
}

type Hist = { data_treino: string; is_pr: boolean; carga: number | null; exercicio_nome: string | null }

function computeStats(hi: Hist[]): Stats {
  const dias = [...new Set(hi.map((h) => h.data_treino))].sort()
  const prs = hi.filter((h) => h.is_pr).length
  const mesKey = new Date().toISOString().slice(0, 7)
  const mes = dias.filter((d) => d.slice(0, 7) === mesKey).length
  const set = new Set(dias)
  const cur = new Date()
  const iso = (d: Date) => d.toLocaleDateString("en-CA")
  if (!set.has(iso(cur))) cur.setDate(cur.getDate() - 1)
  let streak = 0
  while (set.has(iso(cur))) {
    streak++
    cur.setDate(cur.getDate() - 1)
  }
  return { total: dias.length, prs, streak, mes }
}

function computeRecordes(hi: Hist[]): Record<string, number> {
  const r: Record<string, number> = {}
  for (const h of hi) {
    if (!h.exercicio_nome || h.carga == null) continue
    if (!(h.exercicio_nome in r) || h.carga > r[h.exercicio_nome]) r[h.exercicio_nome] = h.carga
  }
  return r
}

/** Pega o exercício com mais dias treinados e monta a curva de carga máxima por dia. */
function computeEvolucao(hi: Hist[]): Evolucao | null {
  const porEx = new Map<string, Map<string, number>>()
  for (const h of hi) {
    if (!h.exercicio_nome || h.carga == null) continue
    if (!porEx.has(h.exercicio_nome)) porEx.set(h.exercicio_nome, new Map())
    const dias = porEx.get(h.exercicio_nome)!
    const atual = dias.get(h.data_treino)
    if (atual == null || h.carga > atual) dias.set(h.data_treino, h.carga)
  }
  let melhor: { nome: string; dias: Map<string, number> } | null = null
  for (const [nome, dias] of porEx) {
    if (dias.size < 2) continue
    if (!melhor || dias.size > melhor.dias.size) melhor = { nome, dias }
  }
  if (!melhor) return null
  const pontos = [...melhor.dias.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([data, carga]) => ({ data, carga }))
  const ini = pontos[0].carga
  const fim = pontos[pontos.length - 1].carga
  return {
    exercicio: melhor.nome,
    pontos,
    variacao: ini > 0 ? Math.round(((fim - ini) / ini) * 100) : null,
  }
}

export async function loadStudentData(userId: string): Promise<StudentData> {
  const { data: sr } = await supabase
    .from("assess_students")
    .select("id,name,gender,coach_id,user_id")
    .eq("user_id", userId)
    .limit(1)
  const student = (sr && sr[0]) as Student | undefined
  if (!student) return EMPTY
  return loadForStudent(student)
}

export async function loadForStudent(student: Student): Promise<StudentData> {
  const [{ data: hi }, { data: dv }, { data: av }, { data: pz }] = await Promise.all([
    supabase
      .from("train_historico")
      .select("data_treino,is_pr,carga,exercicio_nome")
      .eq("student_id", student.id)
      .order("data_treino", { ascending: false })
      .limit(1000),
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
    supabase
      .from("train_periodizacao")
      .select("nome,inicio,vencimento,meta_treinos_semana")
      .eq("student_id", student.id)
      .eq("ativo", true)
      .order("created_at", { ascending: false })
      .limit(1),
  ])

  const hist = (hi || []) as Hist[]
  const stats = computeStats(hist)
  const divisoes = (dv || []) as Divisao[]
  const ciclo = ((pz || [])[0] as Ciclo | undefined) ?? null

  const monday = new Date()
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const mk = monday.toLocaleDateString("en-CA")
  const done = new Set(hist.filter((h) => h.data_treino >= mk).map((h) => h.data_treino)).size

  return {
    student,
    stats,
    avisos: (av || []) as Aviso[],
    divisoes,
    freq: { done, meta: ciclo?.meta_treinos_semana || divisoes.length || 4 },
    evolucao: computeEvolucao(hist),
    recordes: computeRecordes(hist),
    ciclo,
  }
}

/** Marca como lidos os avisos que o aluno acabou de abrir. */
export async function marcarAvisosLidos(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  const { error } = await supabase.from("train_avisos").update({ lido: true }).in("id", ids)
  return !error
}

/** Aluno que criou a conta sem código: vincula depois, pela tela de acesso. */
export async function vincularPorCodigo(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("aluno_link", { p_code: code.trim().toUpperCase() })
  if (error) return false
  return Boolean((data as { linked?: boolean } | null)?.linked)
}

export { EMPTY as EMPTY_STUDENT_DATA }
