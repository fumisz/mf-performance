-- ============================================================
-- MF Performance — Financeiro básico (mensalidades)
-- Rode uma vez (SQL Editor > Run). Requer treino.sql.
-- Somente o treinador acessa (RLS por coach_id).
-- ============================================================

-- Config de mensalidade por aluno
create table if not exists public.train_mensalidade (
  student_id uuid primary key references public.assess_students(id) on delete cascade,
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  valor      numeric,
  dia_venc   int,                       -- dia do mês (1-31)
  ativo      boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.train_mensalidade enable row level security;
drop policy if exists mens_coach on public.train_mensalidade;
create policy mens_coach on public.train_mensalidade for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Pagamentos por competência (mês)
create table if not exists public.train_pagamento (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  student_id  uuid not null references public.assess_students(id) on delete cascade,
  competencia text not null,            -- 'YYYY-MM'
  valor       numeric,
  pago        boolean not null default false,
  pago_em     timestamptz,
  unique (student_id, competencia)
);
create index if not exists train_pagamento_idx on public.train_pagamento(coach_id, competencia);
alter table public.train_pagamento enable row level security;
drop policy if exists pag_coach on public.train_pagamento;
create policy pag_coach on public.train_pagamento for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Definir mensalidade do aluno (coach_id = quem está logado)
create or replace function public.mensalidade_salvar(p_student uuid, p_valor numeric, p_dia int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select coach_id from public.assess_students where id = p_student) <> auth.uid() then return; end if;
  insert into public.train_mensalidade (student_id, coach_id, valor, dia_venc, updated_at)
  values (p_student, auth.uid(), p_valor, p_dia, now())
  on conflict (student_id) do update set valor=excluded.valor, dia_venc=excluded.dia_venc, updated_at=now();
end; $$;
grant execute on function public.mensalidade_salvar(uuid,numeric,int) to authenticated;

-- Marcar/alternar pagamento de um aluno numa competência (cria a linha se não existir)
create or replace function public.pagamento_marcar(p_student uuid, p_competencia text, p_pago boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_valor numeric;
begin
  if (select coach_id from public.assess_students where id = p_student) <> auth.uid() then return; end if;
  select valor into v_valor from public.train_mensalidade where student_id = p_student;
  insert into public.train_pagamento (coach_id, student_id, competencia, valor, pago, pago_em)
  values (auth.uid(), p_student, p_competencia, v_valor, p_pago, case when p_pago then now() else null end)
  on conflict (student_id, competencia) do update set pago=excluded.pago, pago_em=excluded.pago_em, valor=coalesce(train_pagamento.valor, excluded.valor);
end; $$;
grant execute on function public.pagamento_marcar(uuid,text,boolean) to authenticated;

-- Pronto. Defina a mensalidade no card do aluno e marque pago/pendente por mês.
