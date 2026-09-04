-- ============================================================
--  MF Performance — Fechar as tabelas de bastidor
--  Cole no SQL Editor do Supabase e RUN. Pode rodar de novo à vontade.
-- ============================================================
--
-- O QUE ESTAVA ERRADO
-- train_historico_backup_dup guarda as linhas de histórico de treino que saíram
-- na desduplicação (coluna `como_estava`: aluno, exercício, carga, repetições,
-- data). Ela nasceu no schema `public` com RLS DESLIGADA e com grant para o
-- papel `anon`.
--
-- A chave publicável do projeto vive no config.js, e o repositório do app é
-- PÚBLICO. Ou seja: qualquer pessoa que abrisse o repositório podia ler essa
-- tabela — e também escrever e apagar. São 9 linhas, mas são dados de treino
-- de alunos reais.
--
-- Quem apontou foi o próprio verificador do Supabase, com nível ERROR
-- ("RLS Disabled in Public"). Vale rodar esse verificador de vez em quando:
-- ele pega tabela de bastidor esquecida, que é justamente a que ninguém olha.
--
-- O QUE ESTE ARQUIVO FAZ
-- Fecha o acesso. NÃO apaga nada — backup só serve se estiver lá.
-- Sem nenhuma policy, RLS ligada bloqueia todo mundo menos o service_role, que
-- é quem administra o projeto (e é por onde o backup seria consultado, se um
-- dia precisar). É o mesmo desenho que _limpeza_20260923 já tinha.

alter table if exists public.train_historico_backup_dup enable row level security;
revoke all on public.train_historico_backup_dup from anon, authenticated;

-- Esta já tinha RLS ligada, mas os grants continuavam abertos. Tirar os dois
-- não muda nada para o app — ele nunca leu nenhuma das duas — e fecha a porta.
revoke all on public._limpeza_20260923 from anon, authenticated;

-- ── Conferir depois de rodar ──
-- Espera-se rls_ligada = true e grants_publicos = 0 nas duas.
--
--   select c.relname, c.relrowsecurity as rls_ligada,
--     (select count(*) from information_schema.role_table_grants g
--       where g.table_schema='public' and g.table_name=c.relname
--         and g.grantee in ('anon','authenticated')) as grants_publicos
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
--   where c.relname in ('train_historico_backup_dup','_limpeza_20260923');
