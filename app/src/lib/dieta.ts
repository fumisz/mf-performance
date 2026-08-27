import { supabase } from "@/lib/supabase"

const n0 = (v: unknown) => {
  const x = typeof v === "string" ? parseFloat(v) : (v as number)
  return typeof x === "number" && !isNaN(x) ? x : 0
}

export type DietaItem = { id: string; nome: string; qtd: string; kcal: number; protein: number; carb: number; fat: number }
export type DietaRefeicao = { id: string; nome: string; itens: DietaItem[] }
export type Dieta = {
  titulo: string
  notas: string | null
  aguaMl: number | null
  refeicoes: DietaRefeicao[]
  totais: { kcal: number; protein: number; carb: number; fat: number }
}

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

  const refeicoes: DietaRefeicao[] = (meals || []).map((m: Record<string, unknown>) => ({
    id: m.id as string,
    nome: (m.name as string) || (m.title as string) || "Refeição",
    itens: items
      .filter((i) => i.meal_id === m.id)
      .map((i) => ({
        id: i.id as string,
        nome: (i.name as string) || (i.food_name as string) || (i.descricao as string) || "Item",
        qtd: (i.qty as string) || (i.quantity as string) || (i.amount as string) || (i.medida as string) || "",
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
    titulo: (plan.title as string) || "Meu plano alimentar",
    notas: (plan.notes as string) || null,
    aguaMl: (plan.water_goal_ml as number) ?? null,
    refeicoes,
    totais,
  }
}
