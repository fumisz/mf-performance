-- ============================================================
--  MF PERFORMANCE — Schema (roda no MESMO projeto Supabase do Nutrition)
--  Cole TODO este arquivo no SQL Editor do Supabase e clique RUN.
--  É idempotente: pode rodar de novo sem medo.
--  Reaproveita profiles + coach_invites + handle_new_user já existentes.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Assinatura mensal do treinador ----------
-- coluna compartilhada em profiles (o Nutrition ignora; o Performance usa p/ liberar acesso)
alter table public.profiles      add column if not exists subscription_until date;
-- dias concedidos automaticamente quando alguém cadastra com um código
alter table public.coach_invites add column if not exists grant_days int;

-- ---------- Gatilho de signup: igual ao existente + define a validade do coach ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role   text := coalesce(new.raw_user_meta_data->>'role','student');
  v_name   text := coalesce(new.raw_user_meta_data->>'name','');
  v_code   text := new.raw_user_meta_data->>'coach_code';
  v_invite text := upper(trim(coalesce(new.raw_user_meta_data->>'coach_signup_code','')));
  v_coach  uuid;
  v_mycode text;
  v_days   int;
begin
  if v_role = 'coach' then
    if not exists(select 1 from public.coach_invites
        where code = v_invite and active and (max_uses is null or uses < max_uses)) then
      raise exception 'INVALID_COACH_CODE';
    end if;
    select grant_days into v_days from public.coach_invites where code = v_invite;
    update public.coach_invites set uses = uses + 1 where code = v_invite;
    v_mycode := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    insert into public.profiles(id, role, name, email, coach_code, subscription_until)
    values (new.id, 'coach', v_name, new.email, v_mycode, current_date + coalesce(v_days,30));
  else
    if v_code is not null then
      select id into v_coach from public.profiles
        where coach_code = upper(trim(v_code)) and role = 'coach' limit 1;
    end if;
    insert into public.profiles(id, role, name, email, coach_id)
    values (new.id, 'student', v_name, new.email, v_coach);
  end if;
  return new;
end; $$;

-- ============================================================
--  TABELAS DO PERFORMANCE (alunos como fichas + avaliações)
--  Cada linha pertence a um coach (coach_id = auth.uid()).
-- ============================================================
create table if not exists public.assess_students (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null default '',
  dob         date,
  gender      text default 'M',
  phone       text, email text, profession text, goal text,
  activity    text, schedule text, train_time text,
  photo_url   text,
  health      text, meds text, family_hist text, injuries text,
  smoker      text, alcohol text, sleep text, obs text,
  created_at  timestamptz not null default now()
);

create table if not exists public.assessments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.assess_students(id) on delete cascade,
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  date        date not null default current_date,
  data        jsonb not null default '{}'::jsonb,  -- todos os campos numéricos da avaliação
  obs         text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_as_students_coach on public.assess_students(coach_id);
create index if not exists idx_assessments_student on public.assessments(student_id);
create index if not exists idx_assessments_coach on public.assessments(coach_id);

-- ---------- RLS: o coach só enxerga o que é dele ----------
alter table public.assess_students enable row level security;
alter table public.assessments     enable row level security;

drop policy if exists as_students_all on public.assess_students;
create policy as_students_all on public.assess_students for all
  using ( coach_id = auth.uid() ) with check ( coach_id = auth.uid() );

drop policy if exists assessments_all on public.assessments;
create policy assessments_all on public.assessments for all
  using ( coach_id = auth.uid() ) with check ( coach_id = auth.uid() );

-- ============================================================
--  COMO VENDER / CONTROLAR MENSALIDADE
-- ------------------------------------------------------------
--  Criar código que dá 30 dias de acesso a um treinador (uso único):
--    insert into public.coach_invites(code, label, max_uses, grant_days)
--      values ('JOAO2026', 'João Personal', 1, 30);
--
--  Renovar a mensalidade de um treinador (quando pagar):
--    update public.profiles set subscription_until = current_date + 30
--      where email = 'treinador@email.com';
--
--  Ver assinaturas:   select name, email, subscription_until from public.profiles where role='coach';
--  Bloquear na hora:  update public.profiles set subscription_until = current_date - 1 where email='...';
-- ============================================================
