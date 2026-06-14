-- ============================================================
--  MF PERFORMANCE — Painel de Admin (funções seguras p/ o dono)
--  Cole TUDO no SQL Editor do Supabase e clique RUN. Idempotente.
--  >>> TROQUE o e-mail abaixo pelo e-mail que VOCÊ usa no app <<<
-- ============================================================

alter table public.profiles add column if not exists is_admin boolean not null default false;

-- marca você como admin (troque o e-mail se for outro)
update public.profiles set is_admin = true where email = 'fumismatheus@gmail.com';

-- helper: o usuário atual é admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- lista os treinadores (só admin enxerga)
create or replace function public.admin_list_coaches()
returns table(id uuid, name text, email text, coach_code text, subscription_until date, created_at timestamptz)
language sql security definer set search_path = public as $$
  select id, name, email, coach_code, subscription_until, created_at
  from public.profiles
  where role = 'coach' and public.is_admin()
  order by created_at desc;
$$;

-- lista os códigos de acesso (só admin)
create or replace function public.admin_list_invites()
returns setof public.coach_invites
language sql security definer set search_path = public as $$
  select * from public.coach_invites where public.is_admin() order by created_at desc;
$$;

-- cria/atualiza um código de acesso de treinador
create or replace function public.admin_create_invite(p_code text, p_label text, p_max int, p_days int)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  insert into public.coach_invites(code, label, max_uses, grant_days, active)
    values (upper(trim(p_code)), nullif(p_label,''), p_max, p_days, true)
    on conflict (code) do update
      set label = excluded.label, max_uses = excluded.max_uses,
          grant_days = excluded.grant_days, active = true;
  return upper(trim(p_code));
end; $$;

-- ativa/desativa um código
create or replace function public.admin_set_invite_active(p_code text, p_active boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  update public.coach_invites set active = p_active where code = upper(trim(p_code));
  return true;
end; $$;

-- renova/define a validade da assinatura de um treinador (dias a partir de hoje)
create or replace function public.admin_set_subscription(p_coach uuid, p_days int)
returns date language plpgsql security definer set search_path = public as $$
declare d date;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  update public.profiles set subscription_until = current_date + p_days
    where id = p_coach and role = 'coach'
    returning subscription_until into d;
  return d;
end; $$;

-- bloqueia um treinador na hora (vencimento ontem)
create or replace function public.admin_block(p_coach uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  update public.profiles set subscription_until = current_date - 1
    where id = p_coach and role = 'coach';
  return true;
end; $$;
