// MF Performance — Análise automática por IA da Avaliação Técnica
// Supabase Edge Function (Deno). Recebe { assessId }, lê a avaliação técnica
// do treinador autenticado (RLS aplica), compara com a anterior do mesmo aluno
// e pede à Claude um resumo comparativo. Retorna { ok, summary }.
//
// Segredos necessários (Supabase → Project Settings → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY   sua chave da API da Anthropic
// (SUPABASE_URL e SUPABASE_ANON_KEY já existem no ambiente das functions.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EX_LABEL: Record<string, string> = {
  agachamento: "Agachamento Livre", leg_press: "Leg Press", supino: "Supino",
  remada: "Remada", desenvolvimento: "Desenvolvimento", terra: "Levantamento Terra",
  afundo: "Afundo", stiff: "Stiff",
};
const label = (k: string) => EX_LABEL[k] || k;

function describe(a: any): string {
  const ex = a?.exercises || [];
  const an = a?.analysis || {};
  const lines: string[] = [];
  for (const e of ex) {
    const x = an[e.key];
    if (!x) continue;
    const parts: string[] = [];
    if (x.score != null) parts.push(`nota ${x.score}/10`);
    if (Array.isArray(x.errors) && x.errors.length) parts.push(`erros: ${x.errors.join(", ")}`);
    if (x.corrections) parts.push(`a corrigir: ${x.corrections}`);
    if (x.positives) parts.push(`pontos fortes: ${x.positives}`);
    if (x.notes) parts.push(`obs: ${x.notes}`);
    if (parts.length) lines.push(`- ${label(e.key)}: ${parts.join("; ")}`);
  }
  return lines.length ? lines.join("\n") : "(sem análise registrada)";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { assessId } = await req.json();
    if (!assessId) return json({ ok: false, message: "assessId ausente." }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Avaliação atual (RLS garante que é do treinador logado)
    const { data: cur, error } = await supabase.from("assess_tech").select("*").eq("id", assessId).single();
    if (error || !cur) return json({ ok: false, message: "Avaliação não encontrada." }, 404);

    // Avaliação anterior do mesmo aluno (para comparação)
    const { data: prevList } = await supabase.from("assess_tech").select("*")
      .eq("student_id", cur.student_id).lt("created_at", cur.created_at)
      .order("created_at", { ascending: false }).limit(1);
    const prev = (prevList && prevList[0]) || null;

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ ok: false, message: "ANTHROPIC_API_KEY não configurada." }, 500);

    const prompt = [
      "Você é um profissional de educação física analisando a execução técnica de exercícios de um aluno, a partir das notas e observações registradas por outro profissional.",
      "",
      `AVALIAÇÃO ATUAL (${(cur.title || "atual")}):`,
      describe(cur),
      "",
      prev ? `AVALIAÇÃO ANTERIOR (${(prev.title || "anterior")}):\n${describe(prev)}` : "(não há avaliação anterior para comparar)",
      "",
      "Escreva um resumo técnico em português do Brasil, de 3 a 5 frases, em tom profissional e direto (sem emojis, sem markdown).",
      prev
        ? "Compare com a avaliação anterior: destaque a evolução técnica, o que melhorou e o que ainda precisa de trabalho."
        : "Descreva os principais pontos fortes e os pontos a corrigir, com recomendações práticas.",
      "Deixe claro, ao final, que é uma análise de apoio e não substitui a avaliação do profissional.",
    ].join("\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return json({ ok: false, message: "Erro da IA: " + t.slice(0, 300) }, 502);
    }
    const data = await res.json();
    if (data.stop_reason === "refusal") return json({ ok: false, message: "A IA recusou gerar este resumo." }, 200);
    const summary = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    return json({ ok: true, summary });
  } catch (e) {
    return json({ ok: false, message: "Falha: " + (e?.message || String(e)) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}
