-- ============================================================
-- MF Performance — Check-in diário + Ciclo menstrual (aluno)
-- Rode uma vez (SQL Editor > Run). Requer login-aluno.sql aplicado.
-- ============================================================

-- ---------- Check-in diário de auto-regulação ----------
create table if not exists public.train_checkin (
  id         text primary key,                 -- studentId_YYYY-MM-DD
  student_id uuid not null references public.assess_students(id) on delete cascade,
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  data       date not null default current_date,
  sono int, fadiga int, estresse int, dor int, humor int,
  total int, sinal text
);
create index if not exists train_checkin_idx on public.train_checkin(student_id, data);
alter table public.train_checkin enable row level security;
drop policy if exists checkin_coach on public.train_checkin;
create policy checkin_coach on public.train_checkin
  for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());
drop policy if exists checkin_self on public.train_checkin;
create policy checkin_self on public.train_checkin
  for select to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

create or replace function public.checkin_salvar(p_sono int, p_fadiga int, p_estresse int, p_dor int, p_humor int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_s record; v_key text; v_total int; v_sinal text;
begin
  select id, coach_id into v_s from public.assess_students where user_id = auth.uid() limit 1;
  if v_s.id is null then return jsonb_build_object('ok', false); end if;
  v_total := coalesce(p_sono,0)+coalesce(p_fadiga,0)+coalesce(p_estresse,0)+coalesce(p_dor,0)+coalesce(p_humor,0);
  v_sinal := case when v_total <= 9 then 'Verde' when v_total <= 14 then 'Amarelo' else 'Vermelho' end;
  v_key := v_s.id::text || '_' || to_char(current_date,'YYYY-MM-DD');
  insert into public.train_checkin (id, student_id, coach_id, data, sono, fadiga, estresse, dor, humor, total, sinal)
  values (v_key, v_s.id, v_s.coach_id, current_date, p_sono, p_fadiga, p_estresse, p_dor, p_humor, v_total, v_sinal)
  on conflict (id) do update set sono=excluded.sono, fadiga=excluded.fadiga, estresse=excluded.estresse,
    dor=excluded.dor, humor=excluded.humor, total=excluded.total, sinal=excluded.sinal;
  return jsonb_build_object('ok', true, 'total', v_total, 'sinal', v_sinal);
end; $$;
grant execute on function public.checkin_salvar(int,int,int,int,int) to authenticated;

-- ---------- Ciclo menstrual (educativo — não altera prescrição) ----------
create table if not exists public.train_ciclo (
  student_id           uuid primary key references public.assess_students(id) on delete cascade,
  coach_id             uuid not null references public.profiles(id) on delete cascade,
  data_ultima          date,
  duracao_ciclo        int not null default 28,
  duracao_sangramento  int not null default 5,
  updated_at           timestamptz not null default now()
);
alter table public.train_ciclo enable row level security;
drop policy if exists ciclo_coach on public.train_ciclo;
create policy ciclo_coach on public.train_ciclo
  for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());
drop policy if exists ciclo_self on public.train_ciclo;
create policy ciclo_self on public.train_ciclo
  for select to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

create or replace function public.ciclo_salvar(p_data date, p_dur int, p_sang int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_s record;
begin
  select id, coach_id into v_s from public.assess_students where user_id = auth.uid() limit 1;
  if v_s.id is null then return jsonb_build_object('ok', false); end if;
  insert into public.train_ciclo (student_id, coach_id, data_ultima, duracao_ciclo, duracao_sangramento, updated_at)
  values (v_s.id, v_s.coach_id, p_data, coalesce(p_dur,28), coalesce(p_sang,5), now())
  on conflict (student_id) do update set data_ultima=excluded.data_ultima,
    duracao_ciclo=excluded.duracao_ciclo, duracao_sangramento=excluded.duracao_sangramento, updated_at=now();
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.ciclo_salvar(date,int,int) to authenticated;

-- Pronto. Check-in com semáforo (Verde/Amarelo/Vermelho) e Ciclo com anel de fases.
