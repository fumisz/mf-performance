-- ============================================================
-- Fechar as RPCs ao anonimo
--
-- O painel do Supabase acusava 51 funcoes SECURITY DEFINER chamaveis SEM LOGIN
-- pela API REST — inclusive admin_block_app, aluno_fundir e painel_hoje.
-- Nenhuma vazava dado (quase todas checam auth.uid() e voltam vazias), mas a
-- superficie era desnecessaria: qualquer um podia bater nelas o dia inteiro.
--
-- Pegadinha do Postgres que fez a primeira tentativa nao surtir efeito:
-- funcao nasce com EXECUTE para o papel PUBLIC. `revoke ... from anon` nao
-- muda nada, porque o acesso do anon vem do PUBLIC. O caminho e tirar do
-- PUBLIC e devolver so para quem precisa.
--
-- Ficam abertas ao anonimo apenas:
--   agendamento             assess_open_slots, assess_book_slot
--   ficha online            assess_intake_info, assess_submit_intake
--   avaliacao tecnica       tech_get, tech_submit
--   cadastro do treinador   coach_invite_valid
-- Todas dependem de um token/uuid que nao da para adivinhar.
--
--   is_my_student, my_coach_id, is_admin tambem ficam: elas aparecem DENTRO
--   das politicas de RLS de photos, checkins, profiles e outras. Sem EXECUTE,
--   uma consulta anonima passaria a dar "permission denied for function" em
--   vez de simplesmente voltar vazia — pior de usar e sem ganho de seguranca.
--
-- handle_new_user e protect_is_admin sao gatilhos: rodam como dono, ninguem
-- precisa de EXECUTE.
--
-- Resultado: 51 -> 10 funcoes abertas ao anonimo; os avisos do painel cairam
-- de 107 para 65.
-- ============================================================
do $$
declare
  r record;
  publicas text[] := array[
    'assess_open_slots','assess_book_slot',
    'assess_intake_info','assess_submit_intake',
    'tech_get','tech_submit',
    'coach_invite_valid',
    'is_my_student','my_coach_id','is_admin'
  ];
  so_gatilho text[] := array['handle_new_user','protect_is_admin'];
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated',
                   r.proname, r.args);
    -- o service_role e quem as Edge Functions usam: nunca perde acesso
    execute format('grant execute on function public.%I(%s) to service_role',
                   r.proname, r.args);

    if r.proname = any(so_gatilho) then
      null;
    else
      execute format('grant execute on function public.%I(%s) to authenticated',
                     r.proname, r.args);
      if r.proname = any(publicas) then
        execute format('grant execute on function public.%I(%s) to anon',
                       r.proname, r.args);
      end if;
    end if;
  end loop;
end $$;

-- Conferencia rapida depois de aplicar:
--   select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.prosecdef
--      and has_function_privilege('anon', p.oid, 'execute') order by 1;
-- Tem que listar so as 10 acima.
