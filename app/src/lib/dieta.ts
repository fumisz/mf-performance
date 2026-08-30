import { supabase } from "@/lib/supabase"

const n0 = (v: unknown) => {
  const x = typeof v === "string" ? parseFloat(v) : (v as number)
  return typeof x === "number" && !isNaN(x) ? x : 0
}

export type DietaItem = {
  id: string
  nome: string
  qtd: string
  prep: string | null
  kcal: number
  protein: number
  carb: number
  fat: number
}
export type DietaRefeicao = { id: string; nome: string; hora: string | null; notas: string | null; itens: DietaItem[] }
export type Dieta = {
  titulo: string
  notas: string | null
  aguaMl: number | null
  refeicoes: DietaRefeicao[]
  totais: { kcal: number; protein: number; carb: number; fat: number }
}

// O plano alimentar vem do MF Nutrition: meal_plans.student_id é o id do
// usuário (auth), não o id do cadastro em assess_students.
export async function loadDieta(studentUserId: string): Promise<Dieta | null> {
  const { data: plan } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("student_id", studentUserId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!plan) return null

  const { data: meals } = await supabase.from("meals").select("*").eq("plan_id", plan.id).order("order_index")
  const mealIds = (meals || []).map((m: Record<string, unknown>) => m.id as string)
  let items: Record<string, unknown>[] = []
  if (mealIds.length) {
    const ri = await supabase.from("meal_items").select("*").in("meal_id", mealIds).order("order_index")
    items = (ri.data || []) as Record<string, unknown>[]
  }

  const txt = (...vs: unknown[]) => {
    for (const v of vs) if (typeof v === "string" && v.trim()) return v.trim()
    return ""
  }

  const refeicoes: DietaRefeicao[] = (meals || []).map((m: Record<string, unknown>) => ({
    id: m.id as string,
    nome: txt(m.name, m.title) || "Refeição",
    hora: txt(m.time) ? txt(m.time).slice(0, 5) : null,
    notas: txt(m.notes) || null,
    itens: items
      .filter((i) => i.meal_id === m.id)
      .map((i) => ({
        id: i.id as string,
        // no banco do Nutrition a coluna do alimento chama-se "food"
        nome: txt(i.food, i.name, i.food_name, i.descricao) || "Item",
        qtd: txt(i.qty, i.quantity, i.amount, i.medida),
        prep: txt(i.prep) || null,
        kcal: n0(i.kcal),
        protein: n0(i.protein),
        carb: n0(i.carb),
        fat: n0(i.fat),
      })),
  }))

  const totais = refeicoes
    .flatMap((r) => r.itens)
    .reduce(
      (a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carb: a.carb + i.carb, fat: a.fat + i.fat }),
      { kcal: 0, protein: 0, carb: 0, fat: 0 }
    )

  return {
    titulo: txt(plan.title) || "Meu plano alimentar",
    notas: txt(plan.notes) || null,
    aguaMl: (plan.water_goal_ml as number) ?? null,
    refeicoes,
    totais,
  }
}
