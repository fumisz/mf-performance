-- Funções que existiam só no banco
--
-- Doze funções tinham sido aplicadas direto no Supabase, em sessões diferentes,
-- e nunca entraram no repositório. Duas consequências: o repositório não
-- reproduzia o banco do zero, e a suíte `contrato` — que confere cada
-- sb.rpc(...) do app contra a assinatura declarada — não conseguia conferir
-- nenhuma delas. Foi um buraco desse tipo que deixou o "Salvar diário de hoje"
-- quebrado para todo aluno sem ninguém notar.
--
-- Extraído do banco em produção com pg_get_functiondef, byte a byte, sem
-- edição: é exatamente o que está rodando hoje. Não reescreva à mão — se
-- precisar mudar alguma, altere no banco e exporte de novo.

CREATE OR REPLACE FUNCTION public.aluno_fundir(p_principal uuid, p_secundario uuid, p_dois_logins_ok boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_p record; v_s record; v_movidos jsonb;
begin
  if p_principal = p_secundario then
    return jsonb_build_object('ok', false, 'erro', 'Escolha dois cadastros diferentes.');
  end if;
  select * into v_p from public.assess_students where id = p_principal and coach_id = auth.uid();
  select * into v_s from public.assess_students where id = p_secundario and coach_id = auth.uid();
  if v_p.id is null or v_s.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Cadastro não encontrado entre os seus alunos.');
  end if;

  -- Trava: dois logins proprios quase sempre sao duas pessoas. Se juntar, uma
  -- delas perde o acesso e a dieta dela some da vista.
  if v_p.user_id is not null and v_s.user_id is not null and not coalesce(p_dois_logins_ok, false) then
    return jsonb_build_object('ok', false, 'dois_logins', true,
      'email_principal',  (select email from public.profiles where id = v_p.user_id),
      'email_secundario', (select email from public.profiles where id = v_s.user_id),
      'erro', 'Os dois cadastros têm login próprio. Confira os e-mails antes: se forem pessoas diferentes, não junte.');
  end if;

  v_movidos := jsonb_build_object(
    'avaliacoes', (select count(*) from public.assessments     where student_id = p_secundario),
    'divisoes',   (select count(*) from public.train_divisao   where student_id = p_secundario),
    'treinos',    (select count(*) from public.train_historico where student_id = p_secundario),
    'avisos',     (select count(*) from public.train_avisos    where student_id = p_secundario));

  update public.assessments     set student_id = p_principal where student_id = p_secundario;
  update public.train_divisao   set student_id = p_principal where student_id = p_secundario;
  update public.train_historico set student_id = p_principal where student_id = p_secundario;
  update public.train_avisos    set student_id = p_principal where student_id = p_secundario;
  update public.train_feedback  set student_id = p_principal where student_id = p_secundario;
  update public.train_macro     set student_id = p_principal where student_id = p_secundario;
  update public.train_periodizacao set student_id = p_principal where student_id = p_secundario;
  update public.train_meta      set student_id = p_principal where student_id = p_secundario;
  update public.train_saude     set student_id = p_principal where student_id = p_secundario;
  update public.train_glicemia  set student_id = p_principal where student_id = p_secundario;
  update public.train_diario    set student_id = p_principal where student_id = p_secundario;

  update public.train_hidratacao g set student_id = p_principal
   where g.student_id = p_secundario
     and not exists (select 1 from public.train_hidratacao x where x.student_id = p_principal and x.data = g.data);
  delete from public.train_hidratacao where student_id = p_secundario;

  update public.train_checkin c set student_id = p_principal
   where c.student_id = p_secundario
     and not exists (select 1 from public.train_checkin x where x.student_id = p_principal and x.data = c.data);
  delete from public.train_checkin where student_id = p_secundario;

  update public.train_aluno t set student_id = p_principal
   where t.student_id = p_secundario
     and not exists (select 1 from public.train_aluno x where x.student_id = p_principal);
  delete from public.train_aluno where student_id = p_secundario;

  update public.train_ciclo t set student_id = p_principal
   where t.student_id = p_secundario
     and not exists (select 1 from public.train_ciclo x where x.student_id = p_principal);
  delete from public.train_ciclo where student_id = p_secundario;

  update public.train_peso_meta t set student_id = p_principal
   where t.student_id = p_secundario
     and not exists (select 1 from public.train_peso_meta x where x.student_id = p_principal);
  delete from public.train_peso_meta where student_id = p_secundario;

  update public.train_mensalidade t set student_id = p_principal
   where t.student_id = p_secundario
     and not exists (select 1 from public.train_mensalidade x where x.student_id = p_principal);
  delete from public.train_mensalidade where student_id = p_secundario;

  update public.train_lembrete t set student_id = p_principal
   where t.student_id = p_secundario
     and not exists (select 1 from public.train_lembrete x where x.student_id = p_principal);
  delete from public.train_lembrete where student_id = p_secundario;

  update public.train_pagamento set student_id = p_principal where student_id = p_secundario;
  update public.train_push      set student_id = p_principal where student_id = p_secundario;

  if v_p.user_id is null and v_s.user_id is not null then
    update public.assess_students set user_id = v_s.user_id where id = p_principal;
    update public.assess_students set user_id = null where id = p_secundario;
  end if;

  update public.assess_students p set
    dob         = coalesce(p.dob, v_s.dob),
    gender      = coalesce(nullif(p.gender,''), v_s.gender),
    phone       = coalesce(nullif(p.phone,''), v_s.phone),
    email       = coalesce(nullif(p.email,''), v_s.email),
    goal        = coalesce(nullif(p.goal,''), v_s.goal),
    photo_url   = coalesce(nullif(p.photo_url,''), v_s.photo_url),
    access_code = coalesce(p.access_code, v_s.access_code)
  where p.id = p_principal;

  delete from public.assess_students where id = p_secundario;
  return jsonb_build_object('ok', true, 'movidos', v_movidos);
end; $function$
;
grant execute on function public.aluno_fundir(p_principal uuid, p_secundario uuid, p_dois_logins_ok boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.alunos_duplicados()
 RETURNS TABLE(chave text, student_id uuid, nome text, email text, vinculado boolean, criado date, avaliacoes integer, divisoes integer, treinos integer, avisos integer, refeicoes integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select s.id, s.name, s.user_id, s.created_at::date criado,
           coalesce(nullif(btrim(s.email),''), pr.email) mail,
           lower(split_part(regexp_replace(btrim(s.name), '\s+', ' ', 'g'), ' ', 1)) k
      from public.assess_students s
      left join public.profiles pr on pr.id = s.user_id
     where s.coach_id = auth.uid()
  ),
  repetidos as (select k from base group by k having count(*) > 1)
  select b.k, b.id, b.name, b.mail, b.user_id is not null, b.criado,
         (select count(*)::int from public.assessments     a where a.student_id = b.id),
         (select count(*)::int from public.train_divisao   d where d.student_id = b.id),
         (select count(*)::int from public.train_historico h where h.student_id = b.id),
         (select count(*)::int from public.train_avisos    v where v.student_id = b.id),
         -- a dieta segue a CONTA, nao a ficha: sem isso nao da para ver o que se perde
         (select count(*)::int from public.meals m
            join public.meal_plans p on p.id = m.plan_id
           where b.user_id is not null and p.student_id = b.user_id)
    from base b join repetidos r on r.k = b.k
   order by b.k, b.criado;
$function$
;
grant execute on function public.alunos_duplicados() to authenticated;

CREATE OR REPLACE FUNCTION public.alunos_sem_ficha()
 RETURNS TABLE(id uuid, name text, email text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.name, p.email, p.created_at
    from public.profiles p
   where p.role = 'student'
     and p.coach_id = auth.uid()
     and not exists (select 1 from public.assess_students s where s.user_id = p.id)
   order by p.created_at desc;
$function$
;
grant execute on function public.alunos_sem_ficha() to authenticated;

CREATE OR REPLACE FUNCTION public.coach_invite_valid(p_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.coach_invites
    where code = upper(trim(p_code)) and active and (max_uses is null or uses < max_uses));
$function$
;
grant execute on function public.coach_invite_valid(p_code text) to authenticated;

CREATE OR REPLACE FUNCTION public.exercicio_definir_video(p_exercicio uuid, p_path text DEFAULT NULL::text, p_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ex record; v_novo uuid;
begin
  select * into v_ex from public.train_exercicios where id = p_exercicio;
  if not found then raise exception 'EXERCICIO_NAO_ENCONTRADO'; end if;

  -- exercício do próprio treinador: atualiza direto
  if v_ex.coach_id = auth.uid() then
    update public.train_exercicios
       set video_path = coalesce(p_path, video_path),
           video_url  = coalesce(p_url,  video_url)
     where id = p_exercicio;
    return p_exercicio;
  end if;

  -- exercício da base global: cria a versão do treinador com o vídeo dele
  if v_ex.coach_id is null then
    select id into v_novo from public.train_exercicios
     where coach_id = auth.uid() and nome = v_ex.nome limit 1;
    if v_novo is null then
      insert into public.train_exercicios (coach_id, nome, grupo_muscular, video_path, video_url)
      values (auth.uid(), v_ex.nome, v_ex.grupo_muscular, p_path, p_url)
      returning id into v_novo;
    else
      update public.train_exercicios
         set video_path = coalesce(p_path, video_path),
             video_url  = coalesce(p_url,  video_url)
       where id = v_novo;
    end if;
    return v_novo;
  end if;

  raise exception 'NAO_E_SEU_EXERCICIO';
end; $function$
;
grant execute on function public.exercicio_definir_video(p_exercicio uuid, p_path text, p_url text) to authenticated;

CREATE OR REPLACE FUNCTION public.exercicio_remover_video(p_exercicio uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.train_exercicios set video_path = null, video_url = null
   where id = p_exercicio and coach_id = auth.uid();
  return found;
end; $function$
;
grant execute on function public.exercicio_remover_video(p_exercicio uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.ficha_criar_de_perfil(p_uid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id   uuid;
  v_prof record;
begin
  select id, name, email, coach_id into v_prof
    from public.profiles where id = p_uid and role = 'student';
  if not found then raise exception 'ALUNO_NAO_ENCONTRADO'; end if;
  if v_prof.coach_id is distinct from auth.uid() then raise exception 'NAO_E_SEU_ALUNO'; end if;

  -- já tem ficha? devolve a existente (idempotente)
  select id into v_id from public.assess_students where user_id = p_uid limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.assess_students(coach_id, name, email, user_id)
  values (auth.uid(), coalesce(nullif(v_prof.name,''),'Aluno'), v_prof.email, p_uid)
  returning id into v_id;
  return v_id;
end; $function$
;
grant execute on function public.ficha_criar_de_perfil(p_uid uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.peso_meta_salvar(p_student uuid, p_alvo numeric, p_prazo date DEFAULT NULL::date, p_inicial numeric DEFAULT NULL::numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ini numeric;
begin
  if not exists(select 1 from public.assess_students where id = p_student and coach_id = auth.uid())
    then raise exception 'NAO_E_SEU_ALUNO'; end if;
  v_ini := coalesce(p_inicial,
    (select d.peso from public.train_diario d
      where d.student_id = p_student and d.peso is not null
      order by d.data desc limit 1));
  insert into public.train_peso_meta(student_id, coach_id, peso_inicial, peso_alvo, prazo, atualizado_em)
  values (p_student, auth.uid(), v_ini, p_alvo, p_prazo, now())
  on conflict (student_id) do update
    set peso_alvo = excluded.peso_alvo, prazo = excluded.prazo,
        peso_inicial = coalesce(excluded.peso_inicial, public.train_peso_meta.peso_inicial),
        atualizado_em = now();
  return true;
end; $function$
;
grant execute on function public.peso_meta_salvar(p_student uuid, p_alvo numeric, p_prazo date, p_inicial numeric) to authenticated;

CREATE OR REPLACE FUNCTION public.push_salvar_treinador(p_endpoint text, p_p256dh text, p_auth text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'SOMENTE_TREINADOR';
  end if;
  insert into public.train_push (endpoint, user_id, student_id, coach_id, p256dh, auth, papel)
  values (p_endpoint, auth.uid(), null, auth.uid(), p_p256dh, p_auth, 'treinador')
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    student_id = null, coach_id = auth.uid(), papel = 'treinador';
end; $function$
;
grant execute on function public.push_salvar_treinador(p_endpoint text, p_p256dh text, p_auth text) to authenticated;

CREATE OR REPLACE FUNCTION public.painel_hoje()
 RETURNS TABLE(student_id uuid, nome text, treinou boolean, dias_parado integer, aval_dias integer, refeicoes_total integer, refeicoes_ok integer, agua_ml integer, agua_meta integer, checkin_sinal text, mensalidade_venc integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with alunos as (
    select s.id, s.name, s.user_id
      from public.assess_students s
     where s.coach_id = auth.uid()
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
$function$
;
grant execute on function public.painel_hoje() to authenticated;

CREATE OR REPLACE FUNCTION public.periodizacao_atual(p_student uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stu   uuid;
  v_macro record;
  v_sem   int;
  v_acc   int := 0;
  v_total int := 0;
  r       record;
  v_out   jsonb := null;
begin
  if p_student is not null then
    select id into v_stu from public.assess_students
     where id = p_student and coach_id = auth.uid();
  else
    select id into v_stu from public.assess_students where user_id = auth.uid() limit 1;
  end if;
  if v_stu is null then return jsonb_build_object('ok', false); end if;

  select * into v_macro from public.train_macro
   where student_id = v_stu and ativo order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', true, 'macro', false); end if;

  v_sem := floor((current_date - v_macro.data_inicio) / 7.0)::int + 1;

  select coalesce(sum(mi.semanas),0) into v_total
    from public.train_micro mi
    join public.train_meso me on me.id = mi.meso_id
   where me.macro_id = v_macro.id;

  for r in
    select mi.*, me.nome as meso_nome, me.modelo, me.foco, me.ordem as meso_ordem,
           d.nome as divisao_nome
      from public.train_micro mi
      join public.train_meso me on me.id = mi.meso_id
      left join public.train_divisao d on d.id = mi.divisao_id
     where me.macro_id = v_macro.id
     order by me.ordem, mi.ordem
  loop
    if v_sem > v_acc and v_sem <= v_acc + r.semanas then
      v_out := jsonb_build_object(
        'micro_nome', r.nome, 'meso_nome', r.meso_nome, 'modelo', r.modelo,
        'foco', r.foco, 'volume', r.volume, 'intensidade', r.intensidade,
        'deload', r.deload, 'obs', r.obs, 'divisao', r.divisao_nome,
        'semana_do_micro', v_sem - v_acc, 'semanas_do_micro', r.semanas);
      exit;
    end if;
    v_acc := v_acc + r.semanas;
  end loop;

  return jsonb_build_object(
    'ok', true, 'macro', true,
    'macro_nome', v_macro.nome, 'objetivo', v_macro.objetivo,
    'inicio', v_macro.data_inicio,
    'semana_atual', v_sem, 'semanas_total', v_total,
    'terminou', (v_total > 0 and v_sem > v_total),
    'atual', v_out);
end; $function$
;
grant execute on function public.periodizacao_atual(p_student uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.peso_situacao(p_student uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stu uuid; m record; v_atual numeric; v_total numeric;
  v_feito numeric; v_frac numeric; v_esper numeric; v_sit text;
begin
  if p_student is not null then
    select id into v_stu from public.assess_students
     where id = p_student and coach_id = auth.uid();
  else
    select id into v_stu from public.assess_students where user_id = auth.uid() limit 1;
  end if;
  if v_stu is null then return jsonb_build_object('ok', false); end if;

  select * into m from public.train_peso_meta where student_id = v_stu;
  if not found then return jsonb_build_object('ok', true, 'meta', false); end if;

  select d.peso into v_atual from public.train_diario d
   where d.student_id = v_stu and d.peso is not null order by d.data desc limit 1;
  if v_atual is null then
    return jsonb_build_object('ok', true, 'meta', true, 'sem_pesagem', true,
                              'alvo', m.peso_alvo, 'inicial', m.peso_inicial);
  end if;

  v_total := m.peso_alvo - coalesce(m.peso_inicial, v_atual);
  v_feito := v_atual - coalesce(m.peso_inicial, v_atual);

  if v_total = 0 then v_sit := 'Na meta';
  else
    v_frac := v_feito / v_total;
    if m.prazo is not null and m.prazo > m.data_inicio then
      v_esper := least(1, greatest(0,
        (current_date - m.data_inicio)::numeric / (m.prazo - m.data_inicio)::numeric));
    else v_esper := null; end if;

    if v_frac >= 1 then v_sit := 'Meta batida';
    elsif v_frac < 0 then v_sit := 'Indo ao contrário';
    elsif v_esper is null then v_sit := 'Em andamento';
    elsif v_frac >= v_esper * 0.85 then v_sit := 'Em dia';
    elsif v_frac >= v_esper * 0.5  then v_sit := 'Um pouco atrás';
    else v_sit := 'Atrasado';
    end if;
  end if;

  return jsonb_build_object('ok', true, 'meta', true,
    'inicial', m.peso_inicial, 'alvo', m.peso_alvo, 'atual', v_atual,
    'prazo', m.prazo, 'inicio', m.data_inicio,
    'progresso', case when v_total = 0 then 1 else round(v_frac, 3) end,
    'esperado', v_esper, 'situacao', v_sit, 'falta', round(m.peso_alvo - v_atual, 1));
end; $function$
;
grant execute on function public.peso_situacao(p_student uuid) to authenticated;
