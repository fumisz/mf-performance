-- ============================================================
-- MF Performance — Web Push (notificações na barra do celular)
-- Rode uma vez (SQL Editor > Run). Requer login-aluno.sql + avisos.sql.
-- Depois: publique a Edge Function "push" (ver push-function.md).
-- ============================================================

-- 1) Inscrições de push do aluno (1 por navegador/aparelho)
create table if not exists public.train_push (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  student_id uuid references public.assess_students(id) on delete cascade,
  coach_id   uuid references public.profiles(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists train_push_student_idx on public.train_push(student_id);

alter table public.train_push enable row level security;
-- Aluno gerencia as próprias inscrições; treinador lê as dos seus alunos
drop policy if exists push_self on public.train_push;
create policy push_self on public.train_push
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists push_coach_read on public.train_push;
create policy push_coach_read on public.train_push
  for select to authenticated using (coach_id = auth.uid());

-- Aluno salva a inscrição (preenche student_id/coach_id automaticamente)
create or replace function public.push_salvar(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
declare v_s record;
begin
  select id, coach_id into v_s from public.assess_students where user_id = auth.uid() limit 1;
  insert into public.train_push (endpoint, user_id, student_id, coach_id, p256dh, auth)
  values (p_endpoint, auth.uid(), v_s.id, v_s.coach_id, p_p256dh, p_auth)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    student_id = excluded.student_id, coach_id = excluded.coach_id;
end; $$;
grant execute on function public.push_salvar(text,text,text) to authenticated;

create or replace function public.push_remover(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.train_push where endpoint = p_endpoint and user_id = auth.uid();
end; $$;
grant execute on function public.push_remover(text) to authenticated;

-- 2) Preferência de lembrete de água por aluno
create table if not exists public.train_lembrete (
  student_id uuid primary key references public.assess_students(id) on delete cascade,
  coach_id   uuid references public.profiles(id) on delete cascade,
  agua_ativo boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.train_lembrete enable row level security;
drop policy if exists lembrete_self on public.train_lembrete;
create policy lembrete_self on public.train_lembrete
  for all to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) )
  with check ( student_id in (select id from public.assess_students where user_id = auth.uid()) );
drop policy if exists lembrete_coach on public.train_lembrete;
create policy lembrete_coach on public.train_lembrete
  for select to authenticated using (coach_id = auth.uid());

create or replace function public.lembrete_agua(p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_s record;
begin
  select id, coach_id into v_s from public.assess_students where user_id = auth.uid() limit 1;
  if v_s.id is null then return; end if;
  insert into public.train_lembrete (student_id, coach_id, agua_ativo, updated_at)
  values (v_s.id, v_s.coach_id, p_ativo, now())
  on conflict (student_id) do update set agua_ativo = excluded.agua_ativo, updated_at = now();
end; $$;
grant execute on function public.lembrete_agua(boolean) to authenticated;

-- Pronto. As notificações em si são enviadas pela Edge Function "push"
-- (ela usa a service_role para ler train_push). Veja push-function.md.
