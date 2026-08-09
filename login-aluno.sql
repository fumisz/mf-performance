-- ============================================================
-- MF Performance — Login do ALUNO (vínculo + acesso próprio)
-- Rode uma vez no Supabase (SQL Editor > Run). Requer treino.sql já aplicado.
-- O aluno cria conta com o CÓDIGO DO TREINADOR (profiles.coach_code);
-- o gatilho handle_new_user já cria o perfil role='student'.
-- Aqui a gente liga esse login ao cadastro que o coach fez (assess_students)
-- e libera o aluno a ver só os PRÓPRIOS dados e registrar o próprio treino.
-- ============================================================

-- 1) Coluna de vínculo login → cadastro do aluno
alter table public.assess_students add column if not exists user_id uuid;
create index if not exists assess_students_user_idx on public.assess_students(user_id);

-- 2) Função: o aluno logado vincula seu cadastro pelo e-mail (idempotente)
create or replace function public.aluno_link()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text; v_id uuid;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then return jsonb_build_object('linked', false); end if;
  update public.assess_students s
     set user_id = auth.uid()
   where s.user_id is null and lower(s.email) = lower(v_email)
   returning s.id into v_id;
  if v_id is null then
    select id into v_id from public.assess_students where user_id = auth.uid() limit 1;
  end if;
  return jsonb_build_object('linked', v_id is not null, 'student_id', v_id, 'email', v_email);
end; $$;
grant execute on function public.aluno_link() to authenticated;

-- 3) RLS — o aluno lê só o que é dele; escreve só o próprio histórico de treino.
--    (As políticas do coach continuam valendo; políticas permissivas somam via OR.)

-- Cadastro do próprio aluno
drop policy if exists as_students_self on public.assess_students;
create policy as_students_self on public.assess_students
  for select to authenticated using ( user_id = auth.uid() );

-- Avaliações do próprio aluno
drop policy if exists assessments_self on public.assessments;
create policy assessments_self on public.assessments
  for select to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

-- Ficha de treino do próprio aluno
drop policy if exists train_divisao_self on public.train_divisao;
create policy train_divisao_self on public.train_divisao
  for select to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

drop policy if exists train_serie_self on public.train_serie_prescrita;
create policy train_serie_self on public.train_serie_prescrita
  for select to authenticated
  using ( divisao_id in (
    select d.id from public.train_divisao d
      join public.assess_students s on s.id = d.student_id
     where s.user_id = auth.uid()) );

-- Histórico: o aluno lê e registra o próprio
drop policy if exists train_hist_self_read on public.train_historico;
create policy train_hist_self_read on public.train_historico
  for select to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

drop policy if exists train_hist_self_write on public.train_historico;
create policy train_hist_self_write on public.train_historico
  for insert to authenticated
  with check ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

-- Pronto. O aluno cria conta com o código do treinador, o e-mail do login
-- precisa ser IGUAL ao e-mail que o coach cadastrou na ficha do aluno.
