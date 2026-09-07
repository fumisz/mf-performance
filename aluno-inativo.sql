-- ============================================================
-- Inativar aluno sem apagar nada
-- ============================================================
-- Até aqui, a única saída para quem parou de treinar era o "×" do painel, que
-- EXCLUI o cadastro — e leva junto avaliações, fotos, ficha, histórico de
-- séries e mensalidades. Quem some por dois meses e volta em janeiro perdia
-- tudo. E enquanto não some, continua ocupando o painel, o "O mês", a lista de
-- sem treino, a cobrança e a lista de quem recebe aviso.
--
-- O "Ativo/Inativo" que o painel já mostrava NÃO é isto: ele é deduzido da data
-- da última avaliação (mais de 90 dias sem avaliar = inativo). É um palpite do
-- app sobre a agenda de reavaliação, não uma decisão do treinador.
--
-- Esta coluna é a decisão dele:
--   inativo_em NULL      → aluno ativo, tudo como sempre foi
--   inativo_em com data  → parou. Sai das listas do dia a dia, o cadastro e o
--                          histórico ficam inteiros, e um botão traz de volta.
--
-- Guarda a data, e não um booleano, porque "parou em agosto" responde uma
-- pergunta que "parou" não responde.

alter table public.assess_students
  add column if not exists inativo_em timestamptz;

comment on column public.assess_students.inativo_em is
  'Quando o treinador inativou o aluno. NULL = ativo. Não apaga nada: o aluno só sai das listas do dia a dia e pode ser reativado.';

-- ── As duas listas que o servidor monta ─────────────────────
-- Estas RPCs varrem assess_students direto; sem elas o aluno inativado
-- continuaria aparecendo no bloco "quem treinou hoje" e na cobrança do menu
-- "Alunos sem treino" — que é justamente o que o botão promete tirar da frente.
-- `alunos_duplicados` fica como está de propósito: dois cadastros da mesma
-- pessoa continuam sendo um cadastro para juntar, mesmo que um esteja inativo.

create or replace function public.alunos_sem_treino()
 returns table(id uuid, nome text, tem_conta boolean, dias_desde_cadastro integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select s.id,
         s.name,
         s.user_id is not null,
         (current_date - s.created_at::date)::int
    from public.assess_students s
   where s.coach_id = auth.uid()
     and s.inativo_em is null
     and not exists (select 1 from public.train_divisao d where d.student_id = s.id)
   order by (s.user_id is not null) desc, s.name;
$function$;

create or replace function public.painel_hoje()
 returns table(student_id uuid, nome text, treinou boolean, dias_parado integer,
               aval_dias integer, refeicoes_total integer, refeicoes_ok integer,
               agua_ml integer, agua_meta integer, checkin_sinal text,
               mensalidade_venc integer)
 language sql
 security definer
 set search_path to 'public'
as $function$
  with alunos as (
    select s.id, s.name, s.user_id
      from public.assess_students s
     where s.coach_id = auth.uid()
       and s.inativo_em is null
  ),
  treino as (
    select h.student_id,
           max(h.data_treino) ultimo,
           bool_or(h.data_treino = current_date) hoje
      from public.train_historico h
      join alunos a on a.id = h.student_id
     group by h.student_id
  ),
  aval as (
    select v.student_id, max(v.date) ultima
      from public.assessments v
      join alunos a on a.id = v.student_id
     group by v.student_id
  ),
  plano as (
    select a.id student_id, p.id plan_id, p.water_goal_ml
      from alunos a
      join lateral (
        select p.id, p.water_goal_ml
          from public.meal_plans p
         where p.student_id = a.user_id and p.active
         order by p.created_at desc
         limit 1
      ) p on true
     where a.user_id is not null
  ),
  refeicoes as (
    select pl.student_id,
           (select count(*) from public.meals m where m.plan_id = pl.plan_id) total,
           (select count(*) from public.checkins c
              join public.meals m on m.id = c.meal_id
             where m.plan_id = pl.plan_id and c.day = current_date and c.done) ok
      from plano pl
  ),
  agua as (
    select g.student_id, g.total_ml
      from public.train_hidratacao g
      join alunos a on a.id = g.student_id
     where g.data = current_date
  ),
  chk as (
    select c.student_id, c.sinal
      from public.train_checkin c
      join alunos a on a.id = c.student_id
     where c.data = current_date
  )
  select a.id,
         a.name,
         coalesce(t.hoje,false),
         case when t.ultimo is null then null else (current_date - t.ultimo)::int end,
         case when v.ultima is null then null else (current_date - v.ultima)::int end,
         coalesce(r.total,0)::int,
         coalesce(r.ok,0)::int,
         coalesce(g.total_ml,0)::int,
         coalesce(pl.water_goal_ml,0)::int,
         k.sinal,
         m.dia_venc
    from alunos a
    left join treino t on t.student_id = a.id
    left join aval   v on v.student_id = a.id
    left join plano  pl on pl.student_id = a.id
    left join refeicoes r on r.student_id = a.id
    left join agua   g on g.student_id = a.id
    left join chk    k on k.student_id = a.id
    left join public.train_mensalidade m on m.student_id = a.id and m.ativo
   order by a.name;
$function$;

-- ── "Avisar todos" ──────────────────────────────────────────
-- Mandar recado para quem parou é assunto do botão "Reativar", que já escreve
-- uma mensagem própria. O "avisar todos" é para a turma que está treinando.
create or replace function public.aviso_enviar_todos(p_titulo text, p_texto text, p_tipo text default 'aviso'::text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_n int;
begin
  insert into public.train_avisos (coach_id, student_id, tipo, titulo, texto)
  select auth.uid(), s.id, coalesce(nullif(p_tipo,''),'aviso'), p_titulo, p_texto
    from public.assess_students s
   where s.coach_id = auth.uid()
     and s.inativo_em is null;
  get diagnostics v_n = row_count;
  return v_n;
end; $function$;

-- ── Lembrete de treino ──────────────────────────────────────
-- O celular de quem parou não pode continuar cobrando treino. Só muda a CTE
-- `cand`, que é onde a lista de candidatos nasce; o resto da função é o mesmo.
create or replace function public.lembrete_treino_alvos(p_periodo text)
 returns table(student_id uuid, primeiro_nome text, proxima_divisao text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with cand as (
    select l.student_id, s.name
      from public.train_lembrete l
      join public.assess_students s on s.id = l.student_id
     where l.treino_ativo and l.treino_periodo = p_periodo
       and s.inativo_em is null
  ),
  -- ja treinou hoje? entao nao incomoda
  hoje as (
    select distinct h.student_id from public.train_historico h
      join cand c on c.student_id = h.student_id
     where h.data_treino = current_date
  ),
  -- meta da semana: a periodizacao ativa manda; senao, o numero de divisoes
  meta as (
    select c.student_id,
           coalesce(
             (select p.meta_treinos_semana from public.train_periodizacao p
               where p.student_id = c.student_id and p.ativo
               order by p.created_at desc limit 1),
             nullif((select count(*) from public.train_divisao d where d.student_id = c.student_id), 0),
             4
           )::int as alvo
      from cand c
  ),
  feitos as (
    select c.student_id, count(distinct h.data_treino)::int as dias
      from cand c
      left join public.train_historico h
        on h.student_id = c.student_id
       and h.data_treino >= date_trunc('week', current_date)::date
     group by c.student_id
  ),
  -- rodizio: a divisao seguinte a ultima que ele fez
  ultima as (
    select distinct on (h.student_id) h.student_id, h.divisao_id
      from public.train_historico h
      join cand c on c.student_id = h.student_id
     where h.divisao_id is not null
     order by h.student_id, h.data_treino desc, h.registrado_em desc
  ),
  divs as (
    select d.student_id, d.id, d.nome,
           row_number() over (partition by d.student_id order by d.ordem, d.id) - 1 as pos,
           count(*) over (partition by d.student_id) as total
      from public.train_divisao d
      join cand c on c.student_id = d.student_id
     where exists (select 1 from public.train_serie_prescrita p where p.divisao_id = d.id)
  ),
  prox as (
    select dv.student_id, dv.nome
      from divs dv
      left join ultima u on u.student_id = dv.student_id
      left join divs atual on atual.student_id = dv.student_id and atual.id = u.divisao_id
     where dv.pos = case
             when atual.pos is null then 0
             else (atual.pos + 1) % dv.total
           end
  )
  select c.student_id,
         split_part(coalesce(c.name,''), ' ', 1),
         p.nome
    from cand c
    join meta m on m.student_id = c.student_id
    join feitos f on f.student_id = c.student_id
    left join prox p on p.student_id = c.student_id
   where c.student_id not in (select student_id from hoje)
     and f.dias < m.alvo;
$function$;
