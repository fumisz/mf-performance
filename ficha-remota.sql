-- ============================================================
-- MF Performance — Ficha de avaliação remota (consultoria online)
-- Rode este SQL uma vez no Supabase (SQL Editor > New query > Run).
-- Cria a tabela das fichas enviadas pelo aluno + as funções da página pública.
-- ============================================================

-- 1) Tabela das fichas remotas (o aluno preenche pelo link; o treinador importa)
create table if not exists public.assess_intakes (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles(id) on delete cascade,
  student_id   uuid,
  student_name text,
  status       text not null default 'pending',   -- 'pending' | 'imported' | 'archived'
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists assess_intakes_coach_idx
  on public.assess_intakes (coach_id, status, created_at desc);

-- 2) Segurança (RLS): cada treinador vê/gerencia apenas as próprias fichas.
--    O aluno não acessa a tabela direto — envia pela função abaixo.
alter table public.assess_intakes enable row level security;

drop policy if exists intakes_coach_all on public.assess_intakes;
create policy intakes_coach_all on public.assess_intakes
  for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- 3) Função pública: dados para montar a página (marca do treinador + nome do aluno se houver)
create or replace function public.assess_intake_info(p_coach uuid, p_student uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_brand text; v_student text;
begin
  select name into v_brand from public.profiles where id = p_coach;
  if p_student is not null then
    select name into v_student from public.assess_students
     where id = p_student and coach_id = p_coach;
  end if;
  return json_build_object('brand', coalesce(v_brand, 'MF Performance'), 'student_name', v_student);
end;
$$;

-- 4) Função pública: o aluno envia a ficha preenchida.
create or replace function public.assess_submit_intake(p_coach uuid, p_name text, p_data jsonb, p_student uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  -- trava simples anti-spam: coach precisa existir
  if not exists (select 1 from public.profiles where id = p_coach) then
    return json_build_object('ok', false, 'message', 'Treinador inválido.');
  end if;

  insert into public.assess_intakes (coach_id, student_id, student_name, data, status)
  values (p_coach, p_student, p_name, coalesce(p_data, '{}'::jsonb), 'pending');

  return json_build_object('ok', true);
end;
$$;

-- 5) Liberar as funções para o aluno (não logado) e para o treinador.
grant execute on function public.assess_intake_info(uuid, uuid)          to anon, authenticated;
grant execute on function public.assess_submit_intake(uuid, text, jsonb, uuid) to anon, authenticated;

-- Pronto. O link ?ficha=<seu_id> passa a funcionar.
