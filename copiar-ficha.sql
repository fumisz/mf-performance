-- Copiar a ficha de um aluno para outro(s).
-- Já dava para fazer em três passos (salvar como modelo -> abrir fichas
-- prontas -> aplicar), mas no dia a dia o treinador só quer dar ao aluno novo
-- o mesmo que montou para outro.
--
-- Mesmo desenho do ficha_aplicar_modelo: SECURITY DEFINER, só mexe em aluno do
-- próprio treinador, e devolve quantos foram servidos de verdade — o app trata
-- zero como erro, não como sucesso.
--
-- As divisões entram DEPOIS das que já existem (p_limpar=false), então nada é
-- sobrescrito. As cargas não vão junto: elas são histórico de quem treinou.

create or replace function public.ficha_copiar_de_aluno(
  p_origem uuid,
  p_alunos uuid[],
  p_limpar boolean default false
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_coach uuid := auth.uid();
  v_aluno uuid;
  v_div record;
  v_div_id uuid;
  v_base int;
  v_i int;
  v_feitos int := 0;
begin
  if v_coach is null then
    raise exception 'PRECISA_ESTAR_LOGADO';
  end if;

  if not exists (select 1 from public.assess_students
                  where id = p_origem and coach_id = v_coach) then
    raise exception 'ORIGEM_NAO_ENCONTRADA';
  end if;

  if not exists (select 1 from public.train_divisao where student_id = p_origem) then
    raise exception 'ORIGEM_SEM_FICHA';
  end if;

  foreach v_aluno in array coalesce(p_alunos, '{}'::uuid[]) loop
    if v_aluno = p_origem then
      continue;
    end if;
    if not exists (select 1 from public.assess_students
                    where id = v_aluno and coach_id = v_coach) then
      continue;
    end if;

    if p_limpar then
      delete from public.train_divisao where student_id = v_aluno and coach_id = v_coach;
      v_base := 0;
    else
      select coalesce(max(ordem) + 1, 0) into v_base
        from public.train_divisao where student_id = v_aluno;
    end if;

    v_i := 0;
    for v_div in
      select id, nome, dias_semana from public.train_divisao
       where student_id = p_origem order by ordem, nome
    loop
      insert into public.train_divisao (coach_id, student_id, nome, ordem, dias_semana)
      values (v_coach, v_aluno, v_div.nome, v_base + v_i, v_div.dias_semana)
      returning id into v_div_id;

      -- as prescrições vão inteiras, inclusive o vídeo que o treinador colou
      insert into public.train_serie_prescrita
        (coach_id, divisao_id, exercicio_id, exercicio_nome, tipo_serie,
         qtd_series, faixa_reps, intervalo_seg_min, ordem, video_url)
      select v_coach, v_div_id, p.exercicio_id, p.exercicio_nome, p.tipo_serie,
             p.qtd_series, p.faixa_reps, p.intervalo_seg_min, p.ordem, p.video_url
        from public.train_serie_prescrita p
       where p.divisao_id = v_div.id
       order by p.ordem;

      v_i := v_i + 1;
    end loop;

    v_feitos := v_feitos + 1;
  end loop;

  return v_feitos;
end;
$$;

-- funções nascem com EXECUTE para PUBLIC: revogar só de anon não adianta
revoke all on function public.ficha_copiar_de_aluno(uuid, uuid[], boolean) from public, anon;
grant execute on function public.ficha_copiar_de_aluno(uuid, uuid[], boolean) to authenticated, service_role;
