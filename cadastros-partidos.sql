-- ============================================================
--  MF Performance — Importar da Nutrição sem criar cadastro repetido
--  Cole no SQL Editor do Supabase e RUN. Pode rodar de novo à vontade.
-- ============================================================
--
-- O QUE ACONTECEU
-- Trazer um aluno do Nutrition para o Performance chamava ficha_criar_de_perfil,
-- que só conferia se já existia cadastro com AQUELE LOGIN. Nunca olhava se o
-- treinador já tinha aquela pessoa cadastrada sem conta ligada. Em 12/08/2026
-- isso criou onze cadastros paralelos de uma vez: o Jefferson ganhou uma segunda
-- ficha, e as duas avaliações dele ficaram na primeira — invisíveis na tela de
-- Evolução, num aluno que o treinador avaliou duas vezes.
--
-- O QUE MUDA
-- A função de criar continua igual (é o caminho certo quando é gente nova).
-- Estas duas funções dão à tela o material para PERGUNTAR antes:
--   ficha_perfil_candidatos  — quem eu já tenho que pode ser esta pessoa
--   ficha_ligar_perfil       — ligar a conta no cadastro que já existe
--
-- Por que perguntar e não adivinhar: neste mesmo banco há TRÊS Biancas com três
-- e-mails diferentes e DUAS Elaines diferentes. Xará é pessoa de verdade, e
-- juntar por conta própria apagaria o cadastro de alguém.

-- Cadastros que PODEM ser a mesma pessoa: do mesmo treinador, sem conta ligada,
-- e com o primeiro nome batendo. Vem com o que cada um carrega, porque é isso
-- que se perde num cadastro paralelo — e é isso que o treinador precisa ver
-- para decidir sem estar no escuro.
create or replace function public.ficha_perfil_candidatos(p_uid uuid)
returns table(student_id uuid, nome text, criado date, nascimento date, telefone text,
              avaliacoes int, divisoes int, treinos int)
language sql stable security definer set search_path to 'public'
as $$
  with prof as (
    select id, name, coach_id from public.profiles
     where id = p_uid and role = 'student' and coach_id = auth.uid()
  )
  select s.id, s.name, s.created_at::date, s.dob, s.phone,
         (select count(*)::int from public.assessments     a where a.student_id = s.id),
         (select count(*)::int from public.train_divisao   d where d.student_id = s.id),
         (select count(*)::int from public.train_historico h where h.student_id = s.id)
    from public.assess_students s, prof
   where s.coach_id = auth.uid()
     and s.user_id is null
     and lower(split_part(regexp_replace(btrim(s.name), '\s+', ' ', 'g'), ' ', 1))
       = lower(split_part(regexp_replace(btrim(prof.name), '\s+', ' ', 'g'), ' ', 1))
   order by 6 desc, 7 desc, 3;
$$;
grant execute on function public.ficha_perfil_candidatos(uuid) to authenticated;

-- Ligar a conta a um cadastro que JÁ existe, em vez de criar outro. O histórico
-- que o treinador já tinha continua onde está e passa a ser o do aluno logado.
create or replace function public.ficha_ligar_perfil(p_uid uuid, p_student uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_prof record; v_stu record;
begin
  select id, name, email, coach_id into v_prof
    from public.profiles where id = p_uid and role = 'student';
  if not found then return jsonb_build_object('ok', false, 'erro', 'Aluno não encontrado.'); end if;
  if v_prof.coach_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'erro', 'Este aluno não é seu.'); end if;

  -- essa conta já está em outro cadastro? então não há o que ligar
  if exists (select 1 from public.assess_students where user_id = p_uid) then
    return jsonb_build_object('ok', false, 'erro', 'Esta conta já está ligada a um cadastro.'); end if;

  select * into v_stu from public.assess_students
   where id = p_student and coach_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'erro', 'Cadastro não encontrado entre os seus alunos.'); end if;
  -- nunca por cima de um cadastro que já tem dono: seria tomar a conta de outra pessoa
  if v_stu.user_id is not null then
    return jsonb_build_object('ok', false, 'erro', 'Este cadastro já tem uma conta ligada.'); end if;

  update public.assess_students
     set user_id = p_uid,
         email   = coalesce(nullif(btrim(email),''), v_prof.email),
         access_code = null
   where id = p_student;

  update public.profiles set coach_id = auth.uid()
   where id = p_uid and coach_id is null;

  return jsonb_build_object('ok', true, 'student_id', p_student);
end; $$;
grant execute on function public.ficha_ligar_perfil(uuid, uuid) to authenticated;
