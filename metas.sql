-- ============================================================
-- MF Performance — Metas e desafios do aluno
-- Rode uma vez (SQL Editor > Run). Requer treino.sql + login-aluno.sql.
-- O treinador cria as metas; o aluno vê o progresso (engajamento).
-- ============================================================

create table if not exists public.train_meta (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.profiles(id) on delete cascade,
  student_id    uuid not null references public.assess_students(id) on delete cascade,
  tipo          text not null default 'custom',  -- peso | gordura | medida | treinos | custom
  titulo        text not null,
  unidade       text,                            -- kg | % | cm | treinos
  valor_inicial numeric,
  valor_alvo    numeric,
  valor_atual   numeric,                         -- opcional (peso/gordura vêm da avaliação)
  prazo         date,
  atingida      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists train_meta_idx on public.train_meta(student_id, created_at);
alter table public.train_meta enable row level security;

-- Treinador cria/edita; aluno lê as próprias
drop policy if exists meta_coach on public.train_meta;
create policy meta_coach on public.train_meta for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
drop policy if exists meta_self on public.train_meta;
create policy meta_self on public.train_meta for select to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) );

-- Pronto. Crie metas pelo painel do treinador; elas aparecem no app do aluno
-- com barra de progresso. Peso/%gordura usam o valor da última avaliação.
