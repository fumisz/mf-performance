-- ============================================================
-- MF Performance — Módulo TREINO (Fase 1)
-- Rode uma vez no Supabase (SQL Editor > New query > Run).
-- Usa o mesmo aluno da avaliação (assess_students) e o mesmo coach (profiles).
-- Tudo com coach_id + RLS desde o início.
-- ============================================================

-- 1) Extensão 1:1 do aluno com campos de treino
create table if not exists public.train_aluno (
  student_id             uuid primary key references public.assess_students(id) on delete cascade,
  coach_id               uuid not null references public.profiles(id) on delete cascade,
  taxa_hidratacao_ml_kg  numeric not null default 35,
  capacidade_garrafa_ml  int     not null default 500,
  updated_at             timestamptz not null default now()
);

-- 2) Biblioteca de exercícios — base compartilhada (coach_id null) + custom por coach
create table if not exists public.train_exercicios (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid references public.profiles(id) on delete cascade,  -- null = base global
  nome               text not null,
  grupo_muscular     text,
  grupos_musculares  jsonb not null default '{}'::jsonb,  -- {"Quadríceps":1.0,"Glúteo":0.5} p/ volume
  video_url          text,
  dicas              text,
  created_at         timestamptz not null default now()
);
create index if not exists train_exercicios_coach_idx on public.train_exercicios (coach_id, grupo_muscular);

-- 3) Periodização (ciclo contratado) — 1 ativa por aluno
create table if not exists public.train_periodizacao (
  id                  uuid primary key default gen_random_uuid(),
  coach_id            uuid not null references public.profiles(id) on delete cascade,
  student_id          uuid not null references public.assess_students(id) on delete cascade,
  nome                text,
  inicio              date,
  vencimento          date,
  meta_treinos_semana int default 3,
  valor_mensalidade   numeric,
  ativo               boolean not null default true,
  created_at          timestamptz not null default now()
);
create index if not exists train_periodizacao_idx on public.train_periodizacao (coach_id, student_id);

-- 4) Divisão da ficha (A, B, C…) — FK EXPLÍCITA p/ periodização (corrige a ligação por data)
create table if not exists public.train_divisao (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references public.profiles(id) on delete cascade,
  student_id      uuid not null references public.assess_students(id) on delete cascade,
  periodizacao_id uuid references public.train_periodizacao(id) on delete set null,
  nome            text,
  ordem           int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists train_divisao_idx on public.train_divisao (student_id, ordem);

-- 5) Prescrição — 1 linha por TIER de um exercício (renomeado qtd_series p/ evitar ambiguidade)
create table if not exists public.train_serie_prescrita (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null references public.profiles(id) on delete cascade,
  divisao_id         uuid not null references public.train_divisao(id) on delete cascade,
  exercicio_id       uuid references public.train_exercicios(id) on delete set null,
  exercicio_nome     text,               -- denormalizado (resiliência)
  tipo_serie         text not null default 'Valida',  -- Aquecimento|Preparatoria|Valida
  qtd_series         int not null default 3,          -- QUANTIDADE de séries do tier
  ordem              int not null default 0,          -- posição do exercício na divisão
  faixa_reps         text default '8-12',
  intervalo_seg_min  int default 60,
  intervalo_seg_max  int,
  carga_alvo         numeric,
  observacoes        text
);
create index if not exists train_serie_prescrita_idx on public.train_serie_prescrita (divisao_id, ordem);

-- 6) Histórico de cargas — 1 linha POR SÉRIE EXECUTADA (coleção mais importante)
create table if not exists public.train_historico (
  id             uuid primary key default gen_random_uuid(),
  coach_id       uuid not null references public.profiles(id) on delete cascade,
  student_id     uuid not null references public.assess_students(id) on delete cascade,
  divisao_id     uuid references public.train_divisao(id) on delete set null,
  exercicio_id   uuid references public.train_exercicios(id) on delete set null,
  exercicio_nome text,
  data_treino    date not null,              -- dia (agrupa a sessão)
  registrado_em  timestamptz not null default now(),
  indice_serie   int,                        -- índice da série DENTRO do tier
  tipo_serie     text,
  carga          numeric,
  reps           int,
  rpe            int,
  observacao     text,
  is_pr          boolean not null default false
);
create index if not exists train_historico_idx on public.train_historico (student_id, exercicio_id, data_treino);

-- 7) RLS — cada coach só enxerga/gerencia o que é seu
alter table public.train_aluno            enable row level security;
alter table public.train_exercicios       enable row level security;
alter table public.train_periodizacao     enable row level security;
alter table public.train_divisao          enable row level security;
alter table public.train_serie_prescrita  enable row level security;
alter table public.train_historico        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['train_aluno','train_periodizacao','train_divisao','train_serie_prescrita','train_historico']
  loop
    execute format('drop policy if exists %I_all on public.%I', t, t);
    execute format('create policy %I_all on public.%I for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid())', t, t);
  end loop;
end $$;

-- Biblioteca: lê a base global (coach_id null) + as próprias; escreve só as próprias
drop policy if exists train_exercicios_read on public.train_exercicios;
create policy train_exercicios_read on public.train_exercicios
  for select to authenticated using (coach_id is null or coach_id = auth.uid());
drop policy if exists train_exercicios_write on public.train_exercicios;
create policy train_exercicios_write on public.train_exercicios
  for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Pronto. Fase 1 do módulo Treino instalada.
-- (Os 140 exercícios da base entram depois via importador — me mande o JSON.)
