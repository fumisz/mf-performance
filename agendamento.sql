-- ============================================================
-- MF Performance — Agendamento de avaliações
-- Rode este SQL uma vez no Supabase (SQL Editor > New query > Run).
-- Cria a tabela de horários + as funções que a página pública usa.
-- ============================================================

-- 1) Tabela de horários da agenda do treinador
create table if not exists public.assess_slots (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles(id) on delete cascade,
  starts_at    timestamptz not null,
  duration_min int  not null default 60,
  status       text not null default 'open',   -- 'open' | 'booked'
  student_id   uuid,
  student_name text,
  created_at   timestamptz not null default now()
);

create index if not exists assess_slots_coach_idx on public.assess_slots (coach_id, starts_at);

-- 2) Segurança (RLS): cada treinador só enxerga/gerencia a própria agenda.
--    O aluno NÃO acessa a tabela direto — usa as funções abaixo.
alter table public.assess_slots enable row level security;

drop policy if exists slots_coach_all on public.assess_slots;
create policy slots_coach_all on public.assess_slots
  for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- 3) Função pública: lista os horários livres de um treinador
--    (usada pela página que o aluno abre pelo link).
create or replace function public.assess_open_slots(p_coach uuid, p_student uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand   text;
  v_student text;
  v_slots   json;
begin
  select name into v_brand from public.profiles where id = p_coach;

  if p_student is not null then
    select name into v_student
      from public.assess_students
     where id = p_student and coach_id = p_coach;
  end if;

  select coalesce(json_agg(
           json_build_object('id', id, 'starts_at', starts_at, 'duration_min', duration_min)
           order by starts_at), '[]'::json)
    into v_slots
    from public.assess_slots
   where coach_id = p_coach and status = 'open' and starts_at >= now();

  return json_build_object(
    'brand', coalesce(v_brand, 'MF Performance'),
    'student_name', v_student,
    'slots', v_slots
  );
end;
$$;

-- 4) Função pública: o aluno confirma um horário (marca como 'booked').
--    Só funciona se o horário ainda estiver livre (evita agendamento duplo).
create or replace function public.assess_book_slot(p_slot uuid, p_name text, p_student uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.assess_slots;
begin
  update public.assess_slots
     set status = 'booked', student_name = p_name, student_id = p_student
   where id = p_slot and status = 'open'
   returning * into v_row;

  if not found then
    return json_build_object('ok', false, 'message', 'Este horário não está mais disponível.');
  end if;

  return json_build_object('ok', true, 'starts_at', v_row.starts_at, 'duration_min', v_row.duration_min);
end;
$$;

-- 5) Liberar as duas funções para o aluno (não logado) e para o treinador.
grant execute on function public.assess_open_slots(uuid, uuid) to anon, authenticated;
grant execute on function public.assess_book_slot(uuid, text, uuid)  to anon, authenticated;

-- Pronto. Agora o link ?agendar=<seu_id> funciona entre dispositivos.
