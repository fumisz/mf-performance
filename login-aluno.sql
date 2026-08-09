-- ============================================================
-- MF Performance — Login do ALUNO por CÓDIGO (v2)
-- Rode uma vez no Supabase (SQL Editor > Run). Requer treino.sql aplicado.
-- O treinador gera um CÓDIGO por aluno; o aluno cria conta e digita esse
-- código para vincular. Sem depender de e-mail igual.
-- ============================================================

-- 1) Coluna de vínculo + código de acesso por aluno
alter table public.assess_students add column if not exists user_id     uuid;
alter table public.assess_students add column if not exists access_code text;
create index if not exists assess_students_user_idx on public.assess_students(user_id);
create unique index if not exists assess_students_code_idx
  on public.assess_students(access_code) where access_code is not null;

-- 2) Treinador gera/regenera o código de acesso de um aluno seu
create or replace function public.aluno_gerar_codigo(p_student uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  update public.assess_students
     set access_code = v_code
   where id = p_student and coach_id = auth.uid();
  if not found then return null; end if;
  return v_code;
end; $$;
grant execute on function public.aluno_gerar_codigo(uuid) to authenticated;

-- 3) Aluno logado vincula a conta ao cadastro pelo CÓDIGO (idempotente)
drop function if exists public.aluno_link();
create or replace function public.aluno_link(p_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.assess_students where user_id = auth.uid() limit 1;
  if v_id is not null then
    return jsonb_build_object('linked', true, 'student_id', v_id);
  end if;
  if p_code is not null and length(trim(p_code)) > 0 then
    update public.assess_students
       set user_id = auth.uid()
     where access_code = upper(trim(p_code)) and user_id is null
     returning id into v_id;
  end if;
  return jsonb_build_object('linked', v_id is not null, 'student_id', v_id);
end; $$;
grant execute on function public.aluno_link(text) to authenticated;

-- 4) RLS — o aluno lê só o que é dele; registra só o próprio histórico de treino
drop policy if exists as_students_self on public.assess_students;
create policy as_students_self on public.assess_students
  for select to authenticated using ( user_id = auth.uid() );

drop policy if exists assessments_self on public.assessments;
create policy assessments_self on public.assessments
  for select to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

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

drop policy if exists train_hist_self_read on public.train_historico;
create policy train_hist_self_read on public.train_historico
  for select to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

drop policy if exists train_hist_self_write on public.train_historico;
create policy train_hist_self_write on public.train_historico
  for insert to authenticated
  with check ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

-- Fluxo: coach abre o aluno -> "Gerar código de acesso" -> manda o código.
-- Aluno cria conta (Sou aluno) e digita o código -> vinculado. Sem e-mail igual.
