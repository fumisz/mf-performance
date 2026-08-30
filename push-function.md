# Notificações no celular (Web Push) — já está tudo ligado

Não há nada a configurar. A tabela, as funções, a Edge Function e o
agendador do lembrete de água **já estão no ar** neste projeto.

> **iPhone**: só funciona se o app for adicionado à Tela de Início
> (Safari → Compartilhar → "Adicionar à Tela de Início") e aberto por lá.
> Android/Chrome funciona direto.

## Como usar

- **Treinador** — *Meu perfil / marca* → **Ativar avisos neste aparelho**.
  Passa a receber na tela do celular quando um aluno fecha o treino, com a
  divisão, o número de séries, o volume e os recordes. Vale por aparelho:
  ative em cada celular que você usa.
- **Aluno** — aba *Conta* → **Avisos no celular** (recebe os seus avisos) e
  **Lembrete de beber água** (o automático abaixo).

## Lembrete de água

Sai sozinho às **10h, 14h e 18h** (Brasília), só para quem ligou o lembrete
e **ainda não bateu a meta do dia** — quem já bateu não é incomodado.

Agendado no banco (`pg_cron` + `pg_net`), no job `mfp-lembrete-agua`.
Para conferir ou mudar o horário:

```sql
select jobname, schedule, active from cron.job;
-- mudar para 9h, 13h e 17h de Brasília (12, 16 e 20 UTC):
select cron.alter_job((select jobid from cron.job where jobname='mfp-lembrete-agua'),
                      schedule := '0 12,16,20 * * *');
```

## Onde ficam as chaves

As chaves VAPID estão **dentro da Edge Function**, que vive no projeto
Supabase (só quem administra o projeto lê). Não estão neste repositório,
que é público. Se um dia quiser movê-las para *secrets*
(`VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`), a função dá
preferência ao secret automaticamente — não precisa mexer no código.

A chave **pública** fica no `index.html` (`VAPID_PUBLIC`), como manda o
padrão: ela é pública por natureza.
