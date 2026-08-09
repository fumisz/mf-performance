-- ============================================================
-- MF Performance — Hidratação do aluno
-- Rode uma vez (SQL Editor > Run). Requer treino.sql + login-aluno.sql.
-- 1 registro por aluno por dia (id determinístico) + função de incremento.
-- ============================================================

create table if not exists public.train_hidratacao (
  id         text primary key,                    -- studentId_YYYY-MM-DD
  student_id uuid not null references public.assess_students(id) on delete cascade,
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  data       date not null default current_date,
  total_ml   int  not null default 0
);
create index if not exists train_hidratacao_idx on public.train_hidratacao(student_id, data);

alter table public.train_hidratacao enable row level security;

-- Treinador vê a hidratação dos seus alunos
drop policy if exists hidra_coach on public.train_hidratacao;
create policy hidra_coach on public.train_hidratacao
  for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Aluno lê a própria
drop policy if exists hidra_self on public.train_hidratacao;
create policy hidra_self on public.train_hidratacao
  for select to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

-- Aluno registra água (incremento atômico, sem leitura prévia — sem race)
create or replace function public.hidratar(p_ml int)
returns int language plpgsql security definer set search_path = public as $$
declare v_s record; v_key text; v_total int;
begin
  select id, coach_id into v_s from public.assess_students where user_id = auth.uid() limit 1;
  if v_s.id is null then return null; end if;
  v_key := v_s.id::text || '_' || to_char(current_date,'YYYY-MM-DD');
  insert into public.train_hidratacao (id, student_id, coach_id, data, total_ml)
  values (v_key, v_s.id, v_s.coach_id, current_date, greatest(p_ml,0))
  on conflict (id) do update
    set total_ml = greatest(public.train_hidratacao.total_ml + excluded.total_ml, 0)
  returning total_ml into v_total;
  return v_total;
end; $$;
grant execute on function public.hidratar(int) to authenticated;

-- Pronto. O app do aluno mostra a garrafa e registra com +250 / +500 / garrafa cheia.
