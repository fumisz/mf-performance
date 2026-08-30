// MF Performance — Edge Function "push"
// Envia Web Push (a notificação que aparece na tela do celular).
//
// Secrets necessários (Edge Functions → push → Secrets):
//   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (mailto:seu@email)
// A URL e as chaves do projeto vêm prontas do ambiente do Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("SB_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SB_ANON_KEY")!;

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:contato@mfperformance.app",
  Deno.env.get("VAPID_PUBLIC")!,
  Deno.env.get("VAPID_PRIVATE")!,
);

const admin = createClient(URL, SERVICE);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

async function enviar(subs: any[], payload: any) {
  let ok = 0;
  const data = JSON.stringify(payload);
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        data,
      );
      ok++;
    } catch (e: any) {
      // inscrição expirada ou revogada pelo aparelho → limpa
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await admin.from("train_push").delete().eq("endpoint", s.endpoint);
      }
    }
  }));
  return ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get("authorization") || "";

    // ── Modo cron: lembrete de água (chamado pelo pg_cron com service role) ──
    if (body.mode === "agua") {
      if (!authHeader.includes(SERVICE)) return json({ error: "forbidden" }, 403);
      const { data: prefs } = await admin.from("train_lembrete")
        .select("student_id").eq("agua_ativo", true);
      const ids = (prefs || []).map((p: any) => p.student_id);
      if (!ids.length) return json({ sent: 0 });
      const { data: subs } = await admin.from("train_push")
        .select("*").eq("papel", "aluno").in("student_id", ids);
      const sent = await enviar(subs || [], {
        titulo: "Hora de beber água",
        texto: "Dá uma pausa e toma um gole. Sua meta de hidratação agradece.",
        tag: "agua", url: "./",
      });
      return json({ sent });
    }

    // Daqui para baixo tudo depende de quem está logado
    const asUser = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await asUser.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    // ── Aluno terminou o treino: avisa o treinador dele ──
    if (body.mode === "treino-concluido") {
      const { data: resumo } = await asUser.rpc("treino_resumo_hoje");
      const coachId = resumo?.coach_id;
      if (!coachId) return json({ sent: 0 });

      const nome = String(resumo.aluno || "Seu aluno").split(" ")[0];
      const series = Number(resumo.series || 0);
      const prs = Number(resumo.recordes || 0);
      const ton = Number(resumo.volume || 0) / 1000;
      const divisao = typeof body.divisao === "string" ? body.divisao.slice(0, 40) : "";

      const partes = [];
      if (divisao) partes.push(divisao);
      if (series) partes.push(series + (series === 1 ? " série" : " séries"));
      if (ton >= 0.1) partes.push(ton.toFixed(1).replace(".", ",") + " t");
      if (prs) partes.push(prs + (prs === 1 ? " recorde" : " recordes"));

      const { data: subs } = await admin.from("train_push")
        .select("*").eq("papel", "treinador").eq("coach_id", coachId);
      const sent = await enviar(subs || [], {
        titulo: nome + " terminou o treino",
        texto: partes.join(" · ") || "Treino concluído agora.",
        tag: "treino-" + userId,
        url: "./",
      });
      return json({ sent });
    }

    // ── Treinador manda aviso para um aluno (ou para todos) ──
    const { titulo, texto, tipo, student_id, all } = body;
    const payload = { titulo, texto, tag: tipo || "aviso", url: "./" };
    let q = admin.from("train_push").select("*").eq("papel", "aluno").eq("coach_id", userId);
    if (!all) q = q.eq("student_id", student_id);
    const { data: subs } = await q;
    const sent = await enviar(subs || [], payload);
    return json({ sent });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
