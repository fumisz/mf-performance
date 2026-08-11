-- ============================================================
-- MF Performance — Diário de saúde do aluno (+ diabetes)
-- Rode uma vez (SQL Editor > Run). Requer treino.sql + login-aluno.sql.
-- ============================================================

-- Config de saúde (marca se o aluno é diabético → habilita glicemia/insulina)
create table if not exists public.train_saude (
  student_id uuid primary key references public.assess_students(id) on delete cascade,
  coach_id   uuid references public.profiles(id) on delete cascade,
  diabetico  boolean not null default false,
  condicoes  text,
  updated_at timestamptz not null default now()
);
alter table public.train_saude enable row level security;
drop policy if exists saude_self on public.train_saude;
create policy saude_self on public.train_saude for all to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) )
  with check ( student_id in (select id from public.assess_students where user_id = auth.uid()) );
drop policy if exists saude_coach on public.train_saude;
create policy saude_coach on public.train_saude for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Diário diário de bem-estar (1 registro por aluno por dia)
create table if not exists public.train_diario (
  id         text primary key,                 -- studentId_YYYY-MM-DD
  student_id uuid not null references public.assess_students(id) on delete cascade,
  coach_id   uuid references public.profiles(id) on delete cascade,
  data       date not null default current_date,
  peso       numeric, sono numeric, energia int, humor int, dor int, passos int,
  obs        text,
  created_at timestamptz not null default now()
);
create index if not exists train_diario_idx on public.train_diario(student_id, data);
alter table public.train_diario enable row level security;
drop policy if exists diario_self on public.train_diario;
create policy diario_self on public.train_diario for all to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) )
  with check ( student_id in (select id from public.assess_students where user_id = auth.uid()) );
drop policy if exists diario_coach on public.train_diario;
create policy diario_coach on public.train_diario for select to authenticated using (coach_id = auth.uid());

-- Registros de glicemia / insulina (para alunos diabéticos)
create table if not exists public.train_glicemia (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.assess_students(id) on delete cascade,
  coach_id      uuid references public.profiles(id) on delete cascade,
  registrado_em timestamptz not null default now(),
  valor         int not null,                  -- mg/dL
  momento       text,                          -- jejum | pre_refeicao | pos_refeicao | antes_treino | pos_treino | dormir
  insulina_unid numeric,
  obs           text
);
create index if not exists train_glicemia_idx on public.train_glicemia(student_id, registrado_em desc);
alter table public.train_glicemia enable row level security;
drop policy if exists glic_self on public.train_glicemia;
create policy glic_self on public.train_glicemia for all to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) )
  with check ( student_id in (select id from public.assess_students where user_id = auth.uid()) );
drop policy if exists glic_coach on public.train_glicemia;
create policy glic_coach on public.train_glicemia for select to authenticated using (coach_id = auth.uid());

-- Salvar config de saúde
create or replace function public.saude_cfg(p_diabetico boolean, p_condicoes text)
returns void language plpgsql security definer set search_path = public as $$
declare v_s record;
begin
  select id, coach_id into v_s from public.assess_students where user_id = auth.uid() limit 1;
  if v_s.id is null then return; end if;
  insert into public.train_saude (student_id, coach_id, diabetico, condicoes, updated_at)
  values (v_s.id, v_s.coach_id, p_diabetico, p_condicoes, now())
  on conflict (student_id) do update set diabetico=excluded.diabetico, condicoes=excluded.condicoes, updated_at=now();
end; $$;
grant execute on function public.saude_cfg(boolean,text) to authenticated;

-- Salvar diário do dia
create or replace function public.diario_salvar(p_peso numeric, p_sono numeric, p_energia int, p_humor int, p_dor int, p_passos int, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
declare v_s record; v_key text;
begin
  select id, coach_id into v_s from public.assess_students where user_id = auth.uid() limit 1;
  if v_s.id is null then return; end if;
  v_key := v_s.id::text || '_' || to_char(current_date,'YYYY-MM-DD');
  insert into public.train_diario (id, student_id, coach_id, data, peso, sono, energia, humor, dor, passos, obs)
  values (v_key, v_s.id, v_s.coach_id, current_date, p_peso, p_sono, p_energia, p_humor, p_dor, p_passos, p_obs)
  on conflict (id) do update set peso=excluded.peso, sono=excluded.sono, energia=excluded.energia,
    humor=excluded.humor, dor=excluded.dor, passos=excluded.passos, obs=excluded.obs;
end; $$;
grant execute on function public.diario_salvar(numeric,numeric,int,int,int,int,text) to authenticated;

-- Registrar glicemia
create or replace function public.glicemia_registrar(p_valor int, p_momento text, p_insulina numeric, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
declare v_s record;
begin
  select id, coach_id into v_s from public.assess_students where user_id = auth.uid() limit 1;
  if v_s.id is null then return; end if;
  insert into public.train_glicemia (student_id, coach_id, valor, momento, insulina_unid, obs)
  values (v_s.id, v_s.coach_id, p_valor, p_momento, p_insulina, p_obs);
end; $$;
grant execute on function public.glicemia_registrar(int,text,numeric,text) to authenticated;

-- Pronto. O app do aluno mostra o Diário (peso/sono/energia/humor/dor/passos)
-- e, se marcado como diabético, o registro de glicemia + insulina.
