-- ============================================================
--  MF — Separar acesso por app (Performance x Nutrition)
--  Cole TUDO no SQL Editor do Supabase e RUN. Idempotente.
-- ============================================================

-- Cada código de acesso passa a valer para um app específico:
--   'perf'  = só Performance | 'nutri' = só Nutrition | 'both' = ambos
alter table public.coach_invites add column if not exists app text not null default 'both';

-- Assinaturas independentes por app
alter table public.profiles add column if not exists perf_until  date;  -- acesso ao Performance
alter table public.profiles add column if not exists nutri_until date;  -- acesso ao Nutrition

-- ---------- Migração / grandfather ----------
-- Todos os treinadores atuais mantêm o Nutrition (não bloquear ninguém)
update public.profiles set nutri_until = '2999-12-31' where role='coach' and nutri_until is null;
-- Performance: revoga de todos e mantém só para o dono (evita vazamento atual)
update public.profiles set perf_until = null where coalesce(is_admin,false) = false;
update public.profiles set perf_until = '2999-12-31', nutri_until = '2999-12-31' where is_admin = true;
-- Código do dono vale para os dois apps
update public.coach_invites set app = 'both' where code = 'MF7K2QX9';

-- ---------- Gatilho de signup: concede só o app do código ----------
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
  v_app    text;
  v_until  date;
begin
  if v_role = 'coach' then
    if not exists(select 1 from public.coach_invites
        where code = v_invite and active and (max_uses is null or uses < max_uses)) then
      raise exception 'INVALID_COACH_CODE';
    end if;
    select grant_days, app into v_days, v_app from public.coach_invites where code = v_invite;
    update public.coach_invites set uses = uses + 1 where code = v_invite;
    v_mycode := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    v_until  := current_date + coalesce(v_days,30);
    insert into public.profiles(id, role, name, email, coach_code, perf_until, nutri_until)
    values (new.id, 'coach', v_name, new.email, v_mycode,
      case when coalesce(v_app,'both') in ('perf','both')  then v_until end,
      case when coalesce(v_app,'both') in ('nutri','both') then v_until end);
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
--  FUNÇÕES DE ADMIN — agora por app
-- ============================================================
create or replace function public.admin_list_coaches()
returns table(id uuid, name text, email text, coach_code text, perf_until date, nutri_until date, created_at timestamptz)
language sql security definer set search_path = public as $$
  select id, name, email, coach_code, perf_until, nutri_until, created_at
  from public.profiles
  where role = 'coach' and public.is_admin()
  order by created_at desc;
$$;

create or replace function public.admin_create_invite(p_code text, p_label text, p_max int, p_days int, p_app text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  insert into public.coach_invites(code, label, max_uses, grant_days, app, active)
    values (upper(trim(p_code)), nullif(p_label,''), p_max, p_days, coalesce(nullif(p_app,''),'both'), true)
    on conflict (code) do update
      set label=excluded.label, max_uses=excluded.max_uses,
          grant_days=excluded.grant_days, app=excluded.app, active=true;
  return upper(trim(p_code));
end; $$;

-- define/renova a assinatura de UM app específico (p_app = 'perf' | 'nutri')
create or replace function public.admin_set_app(p_coach uuid, p_app text, p_days int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_app = 'perf' then
    update public.profiles set perf_until = current_date + p_days where id=p_coach and role='coach';
  elsif p_app = 'nutri' then
    update public.profiles set nutri_until = current_date + p_days where id=p_coach and role='coach';
  end if;
  return true;
end; $$;

-- bloqueia UM app específico (vencimento ontem)
create or replace function public.admin_block_app(p_coach uuid, p_app text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_app = 'perf' then
    update public.profiles set perf_until = current_date - 1 where id=p_coach and role='coach';
  elsif p_app = 'nutri' then
    update public.profiles set nutri_until = current_date - 1 where id=p_coach and role='coach';
  end if;
  return true;
end; $$;
