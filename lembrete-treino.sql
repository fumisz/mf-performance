-- ============================================================
-- Lembrete de treino no celular do aluno
--
-- O lembrete de agua ja existia. Este e o que move adesao, que e o que decide
-- se o aluno fica: um toque no dia em que ele ainda nao treinou, dizendo qual
-- e o treino de hoje.
--
-- Regras para NAO virar spam (todas checadas no banco, antes de enviar):
--   - so quem ligou o lembrete, e so no periodo que ele escolheu
--   - quem ja treinou hoje nao recebe
--   - quem ja bateu a meta da semana nao recebe
--   - a mensagem diz a proxima divisao do rodizio, nao um "va treinar" generico
--
-- O envio e da Edge Function "push", modo 'treino', chamada por tres cron jobs
-- (10h, 15h e 22h UTC = 7h, 12h e 19h no horario de Brasilia).
-- ============================================================

alter table public.train_lembrete
  add column if not exists treino_ativo boolean not null default false,
  add column if not exists treino_periodo text not null default 'noite';

-- periodo em vez de horario exato: evita fazer conta de fuso por aluno e ja
-- cobre o que muda de verdade (quem treina cedo, na hora do almoco, a noite)
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid='public.train_lembrete'::regclass
                    and conname='train_lembrete_periodo_ck') then
    alter table public.train_lembrete
      add constraint train_lembrete_periodo_ck
      check (treino_periodo in ('manha','tarde','noite'));
  end if;
end $$;

create or replace function public.lembrete_treino(p_ativo boolean, p_periodo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_s record; v_p text;
begin
  select id, coach_id into v_s from public.assess_students where user_id = auth.uid() limit 1;
  if v_s.id is null then return; end if;
  v_p := coalesce(nullif(p_periodo,''), 'noite');
  if v_p not in ('manha','tarde','noite') then v_p := 'noite'; end if;
  insert into public.train_lembrete (student_id, coach_id, treino_ativo, treino_periodo, updated_at)
  values (v_s.id, v_s.coach_id, p_ativo, v_p, now())
  on conflict (student_id) do update
    set treino_ativo = excluded.treino_ativo,
        treino_periodo = excluded.treino_periodo,
        updated_at = now();
end; $$;

revoke all on function public.lembrete_treino(boolean, text) from public, anon;
grant execute on function public.lembrete_treino(boolean, text) to authenticated;

-- Quem deve receber o lembrete agora, e qual e o treino dele.
-- Ninguem tem execute: quem chama e a Edge Function, com a service role.
create or replace function public.lembrete_treino_alvos(p_periodo text)
returns table(student_id uuid, primeiro_nome text, proxima_divisao text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with cand as (
    select l.student_id, s.name
      from public.train_lembrete l
      join public.assess_students s on s.id = l.student_id
     where l.treino_ativo and l.treino_periodo = p_periodo
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
  -- divisao sem exercicio nao entra: nao adianta chamar para uma tela vazia
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
$$;

revoke all on function public.lembrete_treino_alvos(text) from public, anon, authenticated;

-- Os tres disparos ficam em cron.job (nao entram aqui: levam o token combinado
-- com a Edge Function, e este repositorio e publico).
--   mfp-lembrete-treino-manha  0 10 * * *
--   mfp-lembrete-treino-tarde  0 15 * * *
--   mfp-lembrete-treino-noite  0 22 * * *
