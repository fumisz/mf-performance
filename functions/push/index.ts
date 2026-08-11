// MF Performance — Edge Function "push"
// Envia Web Push (notificação na barra do celular).
// Deploy: Supabase Dashboard > Edge Functions > "push" (cole este arquivo).
// Secrets necessários: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (mailto:seu@email)
//                      SB_URL, SB_SERVICE_ROLE_KEY, SB_ANON_KEY
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const URL = Deno.env.get("SB_URL")!;
const SERVICE = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SB_ANON_KEY")!;
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
      // Inscrição expirada/inválida → remove
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

    // --- Modo cron: lembrete de água (chamado pelo pg_cron com service role) ---
    if (body.mode === "agua") {
      const auth = req.headers.get("authorization") || "";
      if (!auth.includes(SERVICE)) return new Response("forbidden", { status: 403, headers: cors });
      const { data: prefs } = await admin.from("train_lembrete")
        .select("student_id").eq("agua_ativo", true);
      const ids = (prefs || []).map((p: any) => p.student_id);
      if (!ids.length) return new Response(JSON.stringify({ sent: 0 }), { headers: cors });
      const { data: subs } = await admin.from("train_push").select("*").in("student_id", ids);
      const sent = await enviar(subs || [], {
        titulo: "💧 Hora de beber água",
        texto: "Dá uma pausa e toma um gole. Sua meta de hidratação agradece!",
        tag: "agua", url: "./",
      });
      return new Response(JSON.stringify({ sent }), { headers: cors });
    }

    // --- Modo treinador: enviar aviso (autoriza pelo JWT do coach) ---
    const authHeader = req.headers.get("authorization") || "";
    const asUser = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await asUser.auth.getUser();
    const coachId = u?.user?.id;
    if (!coachId) return new Response("unauthorized", { status: 401, headers: cors });

    const { titulo, texto, tipo, student_id, all } = body;
    const payload = { titulo, texto, tag: tipo || "aviso", url: "./" };

    let q = admin.from("train_push").select("*").eq("coach_id", coachId);
    if (!all) q = q.eq("student_id", student_id);
    const { data: subs } = await q;
    const sent = await enviar(subs || [], payload);
    return new Response(JSON.stringify({ sent }), { headers: cors });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: cors });
  }
});
