-- ============================================================
-- Juntar cadastros: as duas tabelas que ficavam para trás
-- ============================================================
-- `aluno_fundir` move o histórico de um cadastro para o outro e apaga o que
-- sobrou. Ela cobre 22 tabelas — e o banco tem duas que ela não conhecia:
--
--   train_conversa  as mensagens entre treinador e aluno.
--                   Tem ON DELETE CASCADE para assess_students. Como a função
--                   não movia as linhas, o delete do cadastro secundário
--                   APAGAVA a conversa, sem aviso e sem erro.
--
--   assess_tech     a avaliação técnica, com os vídeos.
--                   Não tem chave estrangeira nenhuma. As linhas ficavam
--                   ÓRFÃS, apontando para um cadastro que não existe mais:
--                   nada quebra, a avaliação simplesmente some de todas as
--                   telas e não há como achá-la de volta pelo app.
--
--   assess_slots    a agenda. Hoje está vazia, então não há como confirmar
--                   pelos dados de que lado ela é chaveada; entra junto porque
--                   um update que não casa com nada não custa nada, e um dado
--                   perdido custa.
--
-- Achado ao conferir a função contra as 35 tabelas que têm student_id, ANTES
-- de juntar os 7 grupos repetidos que existem hoje. As tabelas de fora que
-- ficam de fora de propósito (photos, meal_plans, checkins, water_logs,
-- weight_logs, daily_logs, cardio_logs, supplements, anamneses) são chaveadas
-- pela CONTA e não pelo cadastro — conferido linha a linha no banco — e a
-- conta já é transferida para o principal pela própria função.
--
-- O que muda além disso: o relatório que a tela mostra ("movidos") passa a
-- contar as duas, senão ela diz que moveu quatro coisas e mexeu em seis.

create or replace function public.aluno_fundir(p_principal uuid, p_secundario uuid, p_dois_logins_ok boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    'avisos',     (select count(*) from public.train_avisos    where student_id = p_secundario),
    'mensagens',  (select count(*) from public.train_conversa  where student_id = p_secundario),
    'tecnicas',   (select count(*) from public.assess_tech     where student_id = p_secundario));

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

  -- as duas que faltavam, e a agenda por precaução
  update public.train_conversa  set student_id = p_principal where student_id = p_secundario;
  update public.assess_tech     set student_id = p_principal where student_id = p_secundario;
  update public.assess_slots    set student_id = p_principal where student_id = p_secundario;

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
end; $function$;

-- ── Conferência: nenhuma linha órfã depois de juntar ─────────
-- Rode isto depois de cada fusão. Tem de voltar tudo zero.
-- select
--  (select count(*) from assess_tech    x where not exists(select 1 from assess_students s where s.id=x.student_id)) tecnicas_orfas,
--  (select count(*) from train_conversa x where not exists(select 1 from assess_students s where s.id=x.student_id)) mensagens_orfas,
--  (select count(*) from assess_slots   x where not exists(select 1 from assess_students s where s.id=x.student_id)) agenda_orfa;
