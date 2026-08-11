-- ============================================================
-- MF Performance — Avisos / Lembretes (treinador → aluno)
-- Rode uma vez (SQL Editor > Run). Requer treino.sql + login-aluno.sql.
-- Aparece na aba "Avisos" do app do aluno.
-- ============================================================

create table if not exists public.train_avisos (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.assess_students(id) on delete cascade,
  tipo       text not null default 'aviso',   -- lembrete | parabens | aviso
  titulo     text not null,
  texto      text not null,
  lido       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists train_avisos_idx on public.train_avisos(student_id, created_at desc);

alter table public.train_avisos enable row level security;

-- Treinador gerencia os avisos dos seus alunos
drop policy if exists avisos_coach on public.train_avisos;
create policy avisos_coach on public.train_avisos
  for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Aluno lê os próprios avisos
drop policy if exists avisos_self_sel on public.train_avisos;
create policy avisos_self_sel on public.train_avisos
  for select to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

-- Aluno marca como lido os próprios avisos
drop policy if exists avisos_self_upd on public.train_avisos;
create policy avisos_self_upd on public.train_avisos
  for update to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) )
  with check ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

-- Enviar aviso para 1 aluno (valida que o aluno é do coach logado)
create or replace function public.aviso_enviar(p_student uuid, p_titulo text, p_texto text, p_tipo text default 'aviso')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_coach uuid;
begin
  select coach_id into v_coach from public.assess_students where id = p_student;
  if v_coach is null or v_coach <> auth.uid() then return jsonb_build_object('ok', false); end if;
  insert into public.train_avisos (coach_id, student_id, tipo, titulo, texto)
  values (auth.uid(), p_student, coalesce(nullif(p_tipo,''),'aviso'), p_titulo, p_texto);
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.aviso_enviar(uuid,text,text,text) to authenticated;

-- Enviar aviso para TODOS os alunos do coach logado — retorna quantos receberam
create or replace function public.aviso_enviar_todos(p_titulo text, p_texto text, p_tipo text default 'aviso')
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into public.train_avisos (coach_id, student_id, tipo, titulo, texto)
  select auth.uid(), s.id, coalesce(nullif(p_tipo,''),'aviso'), p_titulo, p_texto
    from public.assess_students s
   where s.coach_id = auth.uid();
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
grant execute on function public.aviso_enviar_todos(text,text,text) to authenticated;

-- Aluno marca todos os seus avisos como lidos
create or replace function public.avisos_marcar_lidos()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.train_avisos set lido = true
   where lido = false
     and student_id in (select id from public.assess_students where user_id = auth.uid());
end; $$;
grant execute on function public.avisos_marcar_lidos() to authenticated;

-- Pronto. O treinador envia pelo sino 🔔 na lista de alunos (ou "Avisar todos"),
-- e o aluno vê na aba Avisos, com contador de não lidos na barra inferior.
