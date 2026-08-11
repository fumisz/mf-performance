# Notificações no celular (Web Push) — passo a passo

As notificações aparecem na **barra do celular** (mesmo com o app fechado) via Web Push.
Precisa de 3 coisas: rodar o SQL, publicar a Edge Function e (para água) agendar o cron.

> ⚠️ **iPhone**: só funciona se o aluno **adicionar o app à Tela de Início** (Safari → Compartilhar → "Adicionar à Tela de Início") e abrir por lá. Android/Chrome funciona direto.

---

## 1. Rodar os SQL (SQL Editor > Run)
Nesta ordem, se ainda não rodou:
1. `treino.sql`
2. `login-aluno.sql`
3. `avisos.sql`
4. `push.sql`  ← novo (tabela de inscrições + lembrete de água)

## 2. Chaves VAPID (já geradas para você)
```
VAPID_PUBLIC  = BC_YqtYUqpgqbKzuUwiyj6v4ymbNO6RYhJ5XYm7fhYnKob0eW2yLU-kNbf0gzrjfbJRRqysClA2gBLxJJpHSd1s
VAPID_PRIVATE = 8wAvkreePHKwgbIaA_SuTCvBB8qVVpw_pqg5hcjBYTU
```
A **pública** já está dentro do app (`index.html`). A **privada** é secreta — só vai nos secrets abaixo.

## 3. Publicar a Edge Function "push"
Dashboard do Supabase → **Edge Functions** → **Create a function** → nome **`push`** →
cole o conteúdo de `functions/push/index.ts` → **Deploy**.

Depois, em **Edge Functions → push → Secrets** (ou Project Settings → Edge Functions), adicione:

| Secret | Valor |
|---|---|
| `VAPID_PUBLIC` | BC_YqtYUqpgqbKzuUwiyj6v4ymbNO6RYhJ5XYm7fhYnKob0eW2yLU-kNbf0gzrjfbJRRqysClA2gBLxJJpHSd1s |
| `VAPID_PRIVATE` | 8wAvkreePHKwgbIaA_SuTCvBB8qVVpw_pqg5hcjBYTU |
| `VAPID_SUBJECT` | mailto:seu-email@exemplo.com |
| `SB_URL` | https://kpxiqtxgjaroijbuwkzm.supabase.co |
| `SB_ANON_KEY` | (sua anon key — Project Settings → API) |
| `SB_SERVICE_ROLE_KEY` | (sua service_role key — Project Settings → API) |

> Não uso os nomes `SUPABASE_URL`/`SUPABASE_*` porque o Supabase reserva esses. Por isso `SB_`.

Pronto: quando o treinador toca no 🔔 (ou "Avisar todos"), o app chama a função e a
notificação aparece na barra do aluno.

## 4. Lembrete de água (agendado)
Precisa das extensões **pg_cron** e **pg_net** (Dashboard → Database → Extensions → ativar as duas).
Depois rode no SQL Editor (troque `SUA_SERVICE_ROLE_KEY`; horários em **UTC**, Brasil = UTC-3):

```sql
-- 4 lembretes/dia: 9h, 12h, 15h, 18h (Brasília) = 12,15,18,21 UTC
select cron.schedule('agua-mfp','0 12,15,18,21 * * *', $$
  select net.http_post(
    url := 'https://kpxiqtxgjaroijbuwkzm.functions.supabase.co/push',
    headers := jsonb_build_object('Content-Type','application/json',
               'Authorization','Bearer SUA_SERVICE_ROLE_KEY'),
    body := jsonb_build_object('mode','agua')
  );
$$);
```

Para remover depois: `select cron.unschedule('agua-mfp');`

## 5. Testar
1. Abra o app do aluno → aba **Conta** → ligue **"Avisos no celular"** (aceite a permissão).
2. No app do treinador, toque no 🔔 do aluno e envie.
3. A notificação deve aparecer na barra do celular.

Se não chegar: confira os Secrets, veja **Edge Functions → push → Logs**, e no iPhone confirme
que o app foi aberto pela Tela de Início.
