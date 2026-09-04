// MF Performance — Edge Function "push"
// Envia Web Push (a notificação que aparece na tela do celular).
//
// ⚠ ESTA CÓPIA NÃO TEM AS CHAVES, E É DE PROPÓSITO.
// O repositório do app é PÚBLICO. A função que está no ar vive dentro do
// projeto Supabase (só quem administra o projeto lê) e carrega a chave privada
// VAPID e o token do agendador escritas nela. Aqui elas não podem aparecer.
//
// Então ANTES de subir este arquivo por cima do que está no ar, cadastre em
// Edge Functions → push → Secrets:
//     VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, CRON_TOKEN
// Sem isso a função sobe e para de mandar notificação: o webpush recusa sem a
// chave privada, e o agendador do banco leva 403 no lembrete de água e treino.
//
// Este arquivo existe para o repositório contar a mesma história do que roda —
// ele já ficou seis versões atrasado, sem os modos "mensagem", "dor" e
// "treino", e quem redeployasse por ele desligaria três avisos sem perceber.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:fumismatheus@gmail.com";

// Senha combinada entre o agendador do banco e esta função, para o lembrete
// automático rodar sem expor a service role key no SQL do cron.
const CRON_TOKEN = Deno.env.get("CRON_TOKEN")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(URL, SERVICE);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-cron-token",
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

// O agendador do banco não faz login: ele prova quem é com o token combinado.
function doCron(req: Request, body: any, authHeader: string) {
  const token = req.headers.get("x-cron-token") || body.token || "";
  return (!!CRON_TOKEN && token === CRON_TOKEN) || authHeader.includes(SERVICE);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get("authorization") || "";

    // ── Lembrete de água, disparado pelo agendador do banco ──
    if (body.mode === "agua") {
      if (!doCron(req, body, authHeader)) return json({ error: "forbidden" }, 403);
      const { data: prefs } = await admin.from("train_lembrete")
        .select("student_id").eq("agua_ativo", true);
      const ids = (prefs || []).map((p: any) => p.student_id);
      if (!ids.length) return json({ sent: 0 });

      // não incomoda quem já bateu a meta do dia
      const { data: hoje } = await admin.from("train_hidratacao")
        .select("student_id,total_ml").in("student_id", ids)
        .eq("data", new Date().toISOString().slice(0, 10));
      const bebido: Record<string, number> = {};
      (hoje || []).forEach((h: any) => { bebido[h.student_id] = Number(h.total_ml || 0); });

      const { data: alunos } = await admin.from("assess_students")
        .select("id,user_id").in("id", ids);
      const metas: Record<string, number> = {};
      for (const a of alunos || []) {
        if (!a.user_id) continue;
        const { data: p } = await admin.from("meal_plans")
          .select("water_goal_ml").eq("student_id", a.user_id).eq("active", true)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        metas[a.id] = Number(p?.water_goal_ml || 0);
      }
      const faltando = ids.filter((id: string) => {
        const meta = metas[id] || 0;
        return meta <= 0 || (bebido[id] || 0) < meta;
      });
      if (!faltando.length) return json({ sent: 0, motivo: "todos bateram a meta" });

      const { data: subs } = await admin.from("train_push")
        .select("*").eq("papel", "aluno").in("student_id", faltando);
      const sent = await enviar(subs || [], {
        titulo: "Hora de beber água",
        texto: "Dá uma pausa e toma um gole. Sua meta de hidratação agradece.",
        tag: "agua", url: "./",
      });
      return json({ sent, alvo: faltando.length });
    }

    // ── Lembrete de treino, disparado pelo agendador do banco ──
    // Quem decide o alvo é o banco (lembrete_treino_alvos): já vem sem quem
    // treinou hoje, sem quem bateu a meta da semana, e com a divisão que vem
    // no rodízio — o aviso diz o que ele tem para fazer, não só "vá treinar".
    if (body.mode === "treino") {
      if (!doCron(req, body, authHeader)) return json({ error: "forbidden" }, 403);
      const periodo = ["manha", "tarde", "noite"].includes(body.periodo) ? body.periodo : "noite";

      const { data: alvos, error } = await admin.rpc("lembrete_treino_alvos", { p_periodo: periodo });
      if (error) return json({ error: error.message }, 500);
      if (!alvos || !alvos.length) return json({ sent: 0, motivo: "ninguem para lembrar" });

      const ids = alvos.map((a: any) => a.student_id);
      const { data: subs } = await admin.from("train_push")
        .select("*").eq("papel", "aluno").in("student_id", ids);
      if (!subs || !subs.length) return json({ sent: 0, alvo: ids.length, motivo: "ninguem com push ligado" });

      // uma mensagem por aluno: o nome dele e a divisão dele
      const porAluno: Record<string, any> = {};
      alvos.forEach((a: any) => { porAluno[a.student_id] = a; });

      let sent = 0;
      for (const s of subs) {
        const a = porAluno[s.student_id];
        if (!a) continue;
        const nome = String(a.primeiro_nome || "").trim();
        const div = String(a.proxima_divisao || "").trim();
        sent += await enviar([s], {
          titulo: nome ? nome + ", seu treino de hoje" : "Seu treino de hoje",
          texto: div ? "Hoje é " + div + ". Abre o app e bora." : "Ainda dá tempo de fechar o dia. Abre o app e bora.",
          tag: "treino-lembrete", url: "./",
        });
      }
      return json({ sent, alvo: ids.length, periodo });
    }

    // Daqui para baixo tudo depende de quem está logado
    const asUser = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await asUser.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    // ── Mensagem nova na conversa: o outro lado recebe no celular ──
    // Quem envia só passa o id; o texto vem do banco (conversa_para_aviso), que
    // ainda confere se quem pediu participa daquela conversa. Assim ninguém usa
    // o push do app para mandar mensagem arbitrária para outra pessoa.
    if (body.mode === "mensagem") {
      const id = typeof body.id === "string" && body.id ? body.id : null;
      if (!id) return json({ sent: 0 });
      const { data: m } = await asUser.rpc("conversa_para_aviso", { p_id: id });
      if (!m?.ok) return json({ sent: 0 });

      let subs: any, payload: any;
      if (m.de_aluno) {
        // aluno escreveu → avisa o treinador
        const nome = String(m.aluno || "Seu aluno").split(" ")[0];
        ({ data: subs } = await admin.from("train_push")
          .select("*").eq("papel", "treinador").eq("coach_id", m.coach_id));
        payload = { titulo: nome + " te mandou uma mensagem", texto: String(m.texto || ""),
                    tag: "conversa-" + m.student_id, url: "./" };
      } else {
        // treinador escreveu → avisa o aluno
        ({ data: subs } = await admin.from("train_push")
          .select("*").eq("papel", "aluno").eq("student_id", m.student_id));
        payload = { titulo: String(m.treinador || "Seu treinador"), texto: String(m.texto || ""),
                    tag: "conversa-" + m.student_id, url: "./" };
      }
      const sent = await enviar(subs || [], payload);
      return json({ sent });
    }

    // ── Aluno relatou dor no fim do treino: o treinador recebe na hora ──
    // O texto vem do banco (feedback_dor_recente), nunca do aparelho do aluno:
    // assim ninguém consegue forjar uma mensagem para o treinador. O id evita
    // pegar o feedback errado quando ele manda dois seguidos.
    if (body.mode === "dor") {
      const id = typeof body.id === "string" && body.id ? body.id : null;
      const { data: f } = await asUser.rpc("feedback_dor_recente", { p_id: id });
      if (!f?.ok) return json({ sent: 0 });
      const dor = Number(f.dor || 0);
      if (dor < 4) return json({ sent: 0, motivo: "dor baixa" });
      if (!f.coach_id) return json({ sent: 0 });

      const nome = String(f.aluno || "Seu aluno").split(" ")[0];
      const div = String(f.divisao || "").trim();
      const nota = String(f.nota || "").trim();
      const partes = [];
      partes.push("Dor " + dor + "/5");
      if (div) partes.push(div);
      if (nota) partes.push("“" + nota + "”");

      const { data: subs } = await admin.from("train_push")
        .select("*").eq("papel", "treinador").eq("coach_id", f.coach_id);
      const sent = await enviar(subs || [], {
        titulo: nome + " relatou dor no treino",
        texto: partes.join(" · "),
        tag: "dor-" + userId,
        url: "./",
      });
      return json({ sent });
    }

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
