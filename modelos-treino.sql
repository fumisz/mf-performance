-- ============================================================
-- MF Performance — Modelos de ficha e de periodização
-- Rode uma vez no Supabase (SQL Editor > New query > Run).
--
-- Duas tabelas simples. coach_id null = modelo que já vem no app
-- (todo mundo enxerga, ninguém edita). coach_id preenchido = modelo
-- que o treinador salvou, só ele enxerga.
--
-- O conteúdo fica em jsonb porque o modelo é lido inteiro de uma vez
-- e escrito inteiro de uma vez — não há consulta por exercício solto.
-- ============================================================

-- 1) Modelo de ficha (divisões + exercícios prescritos)
create table if not exists public.train_ficha_modelo (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references public.profiles(id) on delete cascade,  -- null = base do app
  nome        text not null,
  objetivo    text,          -- Hipertrofia, Emagrecimento, Força, Adaptação
  nivel       text,          -- Iniciante, Intermediário, Avançado
  dias        int,           -- treinos por semana
  resumo      text,
  divisoes    jsonb not null default '[]'::jsonb,
  -- [{nome, ordem, exercicios:[{nome,tipo_serie,qtd_series,faixa_reps,intervalo_seg_min,ordem}]}]
  created_at  timestamptz not null default now()
);
create index if not exists train_ficha_modelo_coach_idx on public.train_ficha_modelo (coach_id);

alter table public.train_ficha_modelo enable row level security;
drop policy if exists train_ficha_modelo_read  on public.train_ficha_modelo;
drop policy if exists train_ficha_modelo_write on public.train_ficha_modelo;
create policy train_ficha_modelo_read on public.train_ficha_modelo
  for select using (coach_id is null or coach_id = auth.uid());
create policy train_ficha_modelo_write on public.train_ficha_modelo
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- 2) Modelo de periodização (fases + microciclos)
create table if not exists public.train_perio_modelo (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references public.profiles(id) on delete cascade,
  nome        text not null,
  resumo      text,
  fases       jsonb not null default '[]'::jsonb,
  -- [{nome, modelo, foco, micros:[{nome,semanas,volume,intensidade,deload}]}]
  created_at  timestamptz not null default now()
);
create index if not exists train_perio_modelo_coach_idx on public.train_perio_modelo (coach_id);

alter table public.train_perio_modelo enable row level security;
drop policy if exists train_perio_modelo_read  on public.train_perio_modelo;
drop policy if exists train_perio_modelo_write on public.train_perio_modelo;
create policy train_perio_modelo_read on public.train_perio_modelo
  for select using (coach_id is null or coach_id = auth.uid());
create policy train_perio_modelo_write on public.train_perio_modelo
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- 3) Fichas prontas que já vêm no app (só as da base, sem duplicar)
delete from public.train_ficha_modelo where coach_id is null;
with src(nome,objetivo,nivel,dias,resumo,d) as (values
('AB — Iniciante (2x por semana)','Adaptação','Iniciante',2,'Corpo inteiro em dois treinos. Serve para quem está voltando ou nunca treinou: pouca máquina, muito padrão de movimento.','[["A — Corpo inteiro",[["Esteira","A",1,"8 min",0],["Agachamento Livre","V",3,"10-12",90],["Supino Reto com Halteres","V",3,"10-12",75],["Puxada Frente","V",3,"10-12",75],["Elevação Lateral","V",2,"12-15",45],["Prancha","V",3,"30 s",45]]],["B — Corpo inteiro",[["Bicicleta","A",1,"8 min",0],["Leg Press","V",3,"12-15",90],["Remada Baixa","V",3,"10-12",75],["Supino Inclinado com Halteres","V",3,"10-12",75],["Desenvolvimento com Halteres","V",2,"10-12",60],["Rosca Direta","V",2,"12",45],["Tríceps Corda","V",2,"12",45],["Abdominal Supra","V",3,"15",45]]]]'::jsonb),
('ABC — Hipertrofia (3x por semana)','Hipertrofia','Intermediário',3,'Clássico empurrar / puxar / pernas. Volume moderado e descanso de 60 a 90 segundos.','[["A — Peito, ombro e tríceps",[["Supino Reto","A",1,"15 leve",60],["Supino Reto","V",4,"8-10",90],["Supino Inclinado com Halteres","V",3,"10-12",75],["Crucifixo","V",3,"12-15",60],["Desenvolvimento com Halteres","V",3,"10-12",75],["Elevação Lateral","V",4,"12-15",45],["Tríceps Corda","V",3,"12-15",45],["Tríceps Testa","V",3,"10-12",60]]],["B — Costas e bíceps",[["Puxada Frente","A",1,"15 leve",60],["Barra Fixa","V",3,"até a falha",90],["Puxada Frente","V",4,"10-12",75],["Remada Curvada","V",4,"8-10",90],["Remada Baixa","V",3,"10-12",75],["Crucifixo Inverso","V",3,"15",45],["Rosca Direta","V",3,"10-12",60],["Rosca Martelo","V",3,"12",45]]],["C — Pernas e glúteo",[["Cadeira Extensora","A",1,"20 leve",60],["Agachamento Livre","V",4,"8-10",120],["Leg Press","V",4,"12-15",90],["Cadeira Extensora","V",3,"15",60],["Mesa Flexora","V",4,"12",60],["Stiff","V",3,"10-12",90],["Elevação Pélvica com Barra","V",3,"12",75],["Panturrilha em Pé","V",4,"15-20",45]]]]'::jsonb),
('ABCD — Hipertrofia avançada (4x por semana)','Hipertrofia','Avançado',4,'Divisão em quatro para quem já treina há mais de um ano. Volume alto por grupo e um dia só de ombro e abdômen.','[["A — Peito e tríceps",[["Supino Reto","A",1,"15 leve",60],["Supino Reto","V",4,"6-8",120],["Supino Inclinado","V",4,"8-10",90],["Crossover","V",3,"12-15",60],["Peck Deck (Voador)","V",3,"12-15",60],["Supino Fechado","V",3,"8-10",90],["Tríceps Barra na Polia","V",4,"10-12",60],["Tríceps Francês","V",3,"12",60]]],["B — Costas e bíceps",[["Puxada Frente","A",1,"15 leve",60],["Barra Fixa","V",4,"até a falha",90],["Remada Curvada","V",4,"6-8",120],["Puxada Triângulo","V",3,"10-12",75],["Remada Serrote","V",3,"10-12",75],["Pullover","V",3,"12-15",60],["Rosca Direta","V",4,"8-10",60],["Rosca Scott","V",3,"10-12",60],["Rosca Concentrada","V",3,"12",45]]],["C — Pernas",[["Cadeira Extensora","A",1,"20 leve",60],["Agachamento Livre","V",5,"6-8",150],["Agachamento Hack","V",4,"10-12",120],["Leg Press","V",4,"12-15",90],["Cadeira Extensora","V",4,"15",60],["Levantamento Terra Romeno","V",4,"8-10",120],["Mesa Flexora","V",4,"12",60],["Panturrilha no Leg","V",5,"15-20",45]]],["D — Ombro, glúteo e abdômen",[["Elevação Lateral","A",1,"20 leve",45],["Desenvolvimento com Barra","V",4,"8-10",90],["Elevação Lateral","V",4,"12-15",45],["Elevação Frontal","V",3,"12",45],["Crucifixo Inverso","V",4,"15",45],["Encolhimento (Trapézio)","V",4,"12-15",60],["Elevação Pélvica com Barra","V",4,"10-12",90],["Cadeira Abdutora","V",3,"15-20",45],["Abdominal na Polia","V",4,"15",45]]]]'::jsonb),
('Upper / Lower — Força (4x por semana)','Força','Intermediário',4,'Dois treinos de membros superiores e dois de inferiores. Cargas altas, poucas repetições e descanso longo.','[["Upper A — Força de empurrar",[["Supino Reto","A",2,"10 leve",90],["Supino Reto","V",5,"5",180],["Desenvolvimento com Barra","V",4,"6",150],["Remada Curvada","V",4,"6",150],["Barra Fixa","V",3,"até a falha",120],["Tríceps Testa","V",3,"8-10",90],["Rosca Direta","V",3,"8-10",90]]],["Lower A — Agachamento",[["Agachamento Livre","A",2,"8 leve",90],["Agachamento Livre","V",5,"5",210],["Leg Press","V",4,"8",150],["Levantamento Terra Romeno","V",4,"6-8",150],["Cadeira Flexora","V",3,"10-12",75],["Panturrilha em Pé","V",4,"12-15",60]]],["Upper B — Força de puxar",[["Puxada Frente","A",2,"12 leve",60],["Remada Cavalinho","V",5,"6",150],["Supino Inclinado","V",4,"6-8",150],["Puxada Supinada","V",4,"8",120],["Desenvolvimento Máquina","V",3,"8-10",90],["Rosca Martelo","V",3,"10",75],["Mergulho (Dips)","V",3,"até a falha",90]]],["Lower B — Terra",[["Hiperextensão Lombar","A",2,"12 leve",60],["Levantamento Terra","V",5,"3-5",210],["Agachamento Frontal","V",4,"6",150],["Afundo","V",3,"10 cada perna",120],["Mesa Flexora","V",3,"10-12",75],["Panturrilha Sentado","V",4,"15",60]]]]'::jsonb),
('ABC — Emagrecimento em circuito (3x por semana)','Emagrecimento','Iniciante',3,'Descanso curto para manter a frequência cardíaca alta, com cardio no fim de cada treino.','[["A — Inferiores em circuito",[["Esteira","A",1,"10 min",0],["Agachamento Livre","V",4,"15",30],["Leg Press","V",4,"15-20",30],["Afundo","V",3,"12 cada perna",30],["Cadeira Flexora","V",3,"15",30],["Elevação Pélvica","V",3,"15",30],["Esteira","V",1,"15 min",0]]],["B — Superiores em circuito",[["Remo Ergômetro","A",1,"8 min",0],["Puxada Frente","V",4,"15",30],["Supino Máquina","V",4,"15",30],["Remada Máquina","V",3,"15",30],["Elevação Lateral","V",3,"15",30],["Tríceps Corda","V",3,"15",30],["Rosca na Polia","V",3,"15",30],["Bicicleta","V",1,"15 min",0]]],["C — Corpo inteiro e core",[["Pular Corda","A",1,"5 min",0],["Agachamento Sumô","V",4,"15",30],["Flexão de Braço","V",4,"até a falha",30],["Remada Baixa","V",4,"15",30],["Desenvolvimento com Halteres","V",3,"15",30],["Prancha","V",3,"45 s",30],["Bicicleta no Solo","V",3,"20",30],["Escada","V",1,"12 min",0]]]]'::jsonb),
('Glúteo e pernas — 3x por semana','Hipertrofia','Intermediário',3,'Dois treinos de inferiores com foco em glúteo e um de superiores para equilibrar.','[["A — Glúteo e posterior",[["Abdução com Elástico","A",2,"20",45],["Elevação Pélvica com Barra","V",4,"10-12",90],["Levantamento Terra Sumô","V",4,"10",120],["Cadeira Flexora","V",4,"12-15",60],["Coice na Polia","V",3,"15 cada perna",45],["Cadeira Abdutora","V",4,"20",45],["Panturrilha em Pé","V",3,"15-20",45]]],["B — Quadríceps e glúteo",[["Cadeira Extensora","A",2,"20 leve",45],["Agachamento Livre","V",4,"10-12",120],["Agachamento Búlgaro","V",3,"12 cada perna",90],["Leg Press","V",4,"15",90],["Cadeira Extensora","V",3,"15",60],["Elevação Pélvica Unilateral","V",3,"12 cada perna",60],["Abdução em Pé","V",3,"20",45]]],["C — Superiores e core",[["Puxada Frente","A",1,"15 leve",60],["Puxada Frente","V",4,"10-12",75],["Remada Baixa","V",3,"12",60],["Supino Inclinado com Halteres","V",3,"12",60],["Elevação Lateral","V",4,"15",45],["Rosca Alternada","V",3,"12",45],["Tríceps Corda","V",3,"12-15",45],["Prancha","V",3,"45 s",45],["Abdominal Infra","V",3,"15",45]]]]'::jsonb)
)
insert into public.train_ficha_modelo (nome,objetivo,nivel,dias,resumo,divisoes)
select s.nome,s.objetivo,s.nivel,s.dias,s.resumo,
  (select jsonb_agg(jsonb_build_object(
     'nome', dv->>0,
     'ordem', di-1,
     'exercicios', (select jsonb_agg(jsonb_build_object(
         'nome', ex->>0,
         'tipo_serie', case ex->>1 when 'A' then 'Aquecimento' else 'Valida' end,
         'qtd_series', (ex->>2)::int,
         'faixa_reps', ex->>3,
         'intervalo_seg_min', (ex->>4)::int,
         'ordem', ei-1) order by ei)
       from jsonb_array_elements(dv->1) with ordinality t(ex,ei))
   ) order by di)
   from jsonb_array_elements(s.d) with ordinality u(dv,di))
from src s;

-- ============================================================
-- Pente fino pré-lançamento: a tela de cadastros repetidos agrupa por
-- primeiro nome, e isso junta homônimos. Aqui o e-mail entra na lista e
-- a fusão trava quando os dois cadastros têm login próprio.
-- (Aplicado como migração mfp_duplicados_email_e_trava_dois_logins.)
-- ============================================================
