# Notificações no celular (Web Push) — o que falta fazer

A tabela, as funções e a Edge Function **já estão no ar**. Falta só cadastrar
as chaves VAPID como *secrets*, porque secret ninguém coloca em arquivo de
repositório — este repositório é **público**.

> **iPhone**: só funciona se o app for adicionado à Tela de Início
> (Safari → Compartilhar → "Adicionar à Tela de Início") e aberto por lá.
> Android/Chrome funciona direto.

## Passo único: cadastrar os secrets

No Supabase → **Edge Functions → push → Secrets**, adicione:

| Secret | Valor |
|---|---|
| `VAPID_PUBLIC` | `BP1GyX7qbDDD1o643pIru_CHS6jenWACj4u8h8aOEPKMJ3LsGnavo70yYbeB1ymSMvWoqgtq7i7qf7c0Fszu6vw` |
| `VAPID_PRIVATE` | *(a chave privada foi enviada em conversa — nunca coloque aqui)* |
| `VAPID_SUBJECT` | `mailto:seu-email@exemplo.com` |

A URL e as chaves do projeto **não precisam ser cadastradas**: o Supabase já
injeta `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no
ambiente da função.

## Como usar

- **Treinador**: *Meu perfil / marca* → **Ativar avisos neste aparelho**.
  Passa a receber na tela do celular quando um aluno fecha o treino, com a
  divisão, o número de séries, o volume e os recordes. Vale por aparelho.
- **Aluno**: aba *Conta* → **Avisos no celular**. Recebe os avisos que você
  manda pelo perfil dele.

## Lembrete de água (opcional)

Para o lembrete automático, agende no SQL Editor:

```sql
select cron.schedule('agua-mfp','0 12,16,20 * * *', $$
  select net.http_post(
    url := 'https://kpxiqtxgjaroijbuwkzm.supabase.co/functions/v1/push',
    headers := jsonb_build_object('content-type','application/json',
               'authorization','Bearer <SERVICE_ROLE_KEY>'),
    body := '{"mode":"agua"}'::jsonb);
$$);
```

## Se algum dia vazar a chave privada

Gere um par novo, troque `VAPID_PUBLIC` no `index.html` e o secret
`VAPID_PRIVATE`. As inscrições antigas param de funcionar e cada pessoa
precisa ativar de novo — por isso vale trocar logo, enquanto há poucas.
