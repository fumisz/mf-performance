-- ============================================================
-- Montar ficha para varios alunos de uma vez
--
-- O problema: aluno com conta e sem ficha abre o app numa tela vazia. Aplicar
-- uma ficha pronta era feito no navegador — um insert por divisao e um lote de
-- series por divisao. Para uma turma inteira sao centenas de requisicoes, e se
-- a internet cair no meio o aluno fica com meia ficha gravada.
--
-- ficha_aplicar_modelo faz tudo no servidor, dentro da mesma transacao: ou o
-- aluno recebe a ficha inteira, ou nao recebe nada. Tambem casa o nome do
-- exercicio com a biblioteca aqui dentro, entao a demonstracao aparece para o
-- aluno sem depender do que o navegador tinha em memoria.
--
-- Regras de acesso:
--   - so treinador logado (anon nao tem execute)
--   - so aplica em aluno cujo coach_id e o proprio (os outros sao ignorados)
--   - so usa modelo global (coach_id null) ou do proprio treinador
-- ============================================================

create or replace function public.ficha_aplicar_modelo(
  p_modelo uuid,
  p_alunos uuid[],
  p_limpar boolean default false
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_coach uuid := auth.uid();
  v_modelo public.train_ficha_modelo%rowtype;
  v_aluno uuid;
  v_div jsonb;
  v_ex jsonb;
  v_div_id uuid;
  v_base int;
  v_i int;
  v_j int;
  v_feitos int := 0;
begin
  if v_coach is null then
    raise exception 'PRECISA_ESTAR_LOGADO';
  end if;

  select * into v_modelo from public.train_ficha_modelo
   where id = p_modelo and (coach_id is null or coach_id = v_coach);
  if not found then
    raise exception 'MODELO_NAO_ENCONTRADO';
  end if;

  foreach v_aluno in array coalesce(p_alunos, '{}'::uuid[]) loop
    -- so mexe em aluno do proprio treinador
    if not exists (select 1 from public.assess_students
                    where id = v_aluno and coach_id = v_coach) then
      continue;
    end if;

    if p_limpar then
      delete from public.train_divisao where student_id = v_aluno and coach_id = v_coach;
      v_base := 0;
    else
      -- entra DEPOIS do que ja existe: nunca sobrescreve a ficha em uso
      select coalesce(max(ordem) + 1, 0) into v_base
        from public.train_divisao where student_id = v_aluno;
    end if;

    v_i := 0;
    for v_div in
      select value from jsonb_array_elements(coalesce(v_modelo.divisoes, '[]'::jsonb)) t(value)
      order by coalesce((value->>'ordem')::int, 0)
    loop
      insert into public.train_divisao (coach_id, student_id, nome, ordem)
      values (v_coach, v_aluno, coalesce(v_div->>'nome', 'Divisão'), v_base + v_i)
      returning id into v_div_id;

      v_j := 0;
      for v_ex in
        select value from jsonb_array_elements(coalesce(v_div->'exercicios', '[]'::jsonb)) t(value)
        order by coalesce((value->>'ordem')::int, 0)
      loop
        insert into public.train_serie_prescrita
          (coach_id, divisao_id, exercicio_id, exercicio_nome,
           tipo_serie, qtd_series, faixa_reps, intervalo_seg_min, ordem)
        values (
          v_coach, v_div_id,
          -- casa pelo nome: primeiro o exercicio do proprio treinador, depois o global
          (select e.id from public.train_exercicios e
            where lower(e.nome) = lower(v_ex->>'nome')
              and (e.coach_id = v_coach or e.coach_id is null)
            order by (e.coach_id is null)
            limit 1),
          v_ex->>'nome',
          coalesce(v_ex->>'tipo_serie', 'Valida'),
          coalesce((v_ex->>'qtd_series')::int, 3),
          coalesce(v_ex->>'faixa_reps', '8-12'),
          coalesce((v_ex->>'intervalo_seg_min')::int, 60),
          v_j
        );
        v_j := v_j + 1;
      end loop;

      v_i := v_i + 1;
    end loop;

    v_feitos := v_feitos + 1;
  end loop;

  return v_feitos;
end;
$$;

revoke all on function public.ficha_aplicar_modelo(uuid, uuid[], boolean) from public, anon;
grant execute on function public.ficha_aplicar_modelo(uuid, uuid[], boolean) to authenticated;

-- Quem ainda nao tem treino montado, com quem ja tem conta primeiro: e esse
-- aluno que abre o app e nao ve nada.
create or replace function public.alunos_sem_treino()
returns table(id uuid, nome text, tem_conta boolean, dias_desde_cadastro int)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.id,
         s.name,
         s.user_id is not null,
         (current_date - s.created_at::date)::int
    from public.assess_students s
   where s.coach_id = auth.uid()
     and not exists (select 1 from public.train_divisao d where d.student_id = s.id)
   order by (s.user_id is not null) desc, s.name;
$$;

revoke all on function public.alunos_sem_treino() from public, anon;
grant execute on function public.alunos_sem_treino() to authenticated;
