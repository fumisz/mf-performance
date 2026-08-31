-- ============================================================
--  MF PERFORMANCE — Endurecimento de segurança (RLS + grants)
--  Cole TUDO no SQL Editor do Supabase e clique RUN.
--  Idempotente: pode rodar quantas vezes quiser.
--
--  Objetivo: garantir que
--   (1) cada treinador só acessa os PRÓPRIOS alunos/avaliações;
--   (2) usuários anônimos (sem login) não tocam em nada;
--   (3) a lista de códigos de acesso não vaza para ninguém;
--   (4) funções de admin só rodam para o admin.
-- ============================================================

-- ---------- 1. RLS obrigatório nas tabelas do Performance ----------
alter table public.assess_students enable row level security;
alter table public.assessments     enable row level security;
alter table public.assess_students force row level security;   -- vale até para o dono da tabela
alter table public.assessments     force row level security;

-- Políticas: o treinador só enxerga/edita o que é dele (coach_id = auth.uid()).
drop policy if exists as_students_all on public.assess_students;
create policy as_students_all on public.assess_students for all
  to authenticated
  using ( coach_id = auth.uid() ) with check ( coach_id = auth.uid() );

drop policy if exists assessments_all on public.assessments;
create policy assessments_all on public.assessments for all
  to authenticated
  using ( coach_id = auth.uid() ) with check ( coach_id = auth.uid() );

-- ---------- 2. Anônimo (sem login) não acessa dados de alunos ----------
revoke all on public.assess_students from anon;
revoke all on public.assessments     from anon;
grant  all on public.assess_students to authenticated;   -- RLS ainda filtra por coach
grant  all on public.assessments     to authenticated;

-- ---------- 3. Códigos de acesso: ninguém lê direto ----------
-- RLS ligada e SEM política => acesso direto negado a todos.
-- O cadastro (trigger handle_new_user) e o painel admin usam funções
-- SECURITY DEFINER, que passam por cima da RLS de forma controlada.
alter table public.coach_invites enable row level security;
alter table public.coach_invites force row level security;
revoke all on public.coach_invites from anon, authenticated;

-- ---------- 4. Funções de admin: fora do alcance do anônimo ----------
-- (elas já checam is_admin() internamente; isto é só uma camada a mais)
do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'admin\_%'
  loop
    execute format('revoke execute on function %s from anon;', f);
  end loop;
end $$;

-- ============================================================
--  5. AUDITORIA — rode e confira os resultados (não altera nada)
-- ------------------------------------------------------------
--  a) Toda tabela sensível deve aparecer com rowsecurity = true:
--     select relname, relrowsecurity
--       from pg_class where relname in
--       ('profiles','assess_students','assessments','coach_invites');
--
--  b) A tabela profiles NÃO pode ter política de SELECT liberando tudo.
--     Cada usuário deve ler só o próprio perfil. Verifique as políticas:
--     select tablename, policyname, cmd, qual
--       from pg_policies where tablename='profiles';
--     -> o SELECT deve conter algo como (id = auth.uid()); se aparecer
--        "true" ou não houver política, os e-mails de todos vazam.
--        Nesse caso, aplique o bloco 6 abaixo COM CUIDADO (compartilhado
--        com o app Nutrition).
--
--  c) Teste real de vazamento (logado como um treinador comum, no app):
--     select count(*) from public.profiles;   -- deve retornar só 1 (o seu)
-- ============================================================

-- ============================================================
--  6. OPCIONAL — corrigir profiles se a auditoria (b/c) mostrar vazamento.
--     >>> Só descomente se o teste (c) retornar MAIS de 1 linha. <<<
--     Mantém: cada um lê/edita o próprio perfil; o dono do sistema (admin)
--     continua enxergando tudo via funções admin_* (SECURITY DEFINER).
-- ------------------------------------------------------------
-- alter table public.profiles enable row level security;
-- drop policy if exists profiles_self_select on public.profiles;
-- create policy profiles_self_select on public.profiles for select
--   to authenticated using ( id = auth.uid() OR public.is_admin() );
-- drop policy if exists profiles_self_update on public.profiles;
-- create policy profiles_self_update on public.profiles for update
--   to authenticated using ( id = auth.uid() ) with check ( id = auth.uid() );
--  ATENÇÃO: se o app Nutrition precisar que o treinador leia o perfil dos
--  alunos dele, acrescente ao SELECT:  OR coach_id = auth.uid()
-- ============================================================

-- ============================================================
-- Pente fino de seguranca (aplicado como migracoes
-- mfp_seguranca_storage_e_codigo_de_acesso e
-- mfp_seguranca_video_feedback_do_treinador)
--
-- 1) assess-videos: a politica de INSERT aceitava QUALQUER anonimo, sem teto
--    de tamanho e sem tipo. Agora exige uma avaliacao tecnica aberta daquele
--    treinador (ou o proprio treinador na pasta dele), so aceita video/audio
--    e tem teto de 200 MB. A leitura passou a ser so do treinador dono.
-- 2) photos: a politica de SELECT valia para qualquer um, inclusive deslogado,
--    o que permitia LISTAR o bucket inteiro. Agora e so o dono da pasta; as
--    URLs ja salvas continuam abrindo porque o bucket segue publico.
--    O envio tambem passou a ser so na propria pasta.
-- 3) Codigo de acesso do aluno: era de 6 caracteres e nunca vencia. Agora sao
--    8, valem 14 dias (coluna access_code_em) e o codigo e apagado no uso.
-- 4) Fichas e periodizacoes modelo deixaram de ser legiveis por quem nao esta
--    logado.
-- ============================================================
