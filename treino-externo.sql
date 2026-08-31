-- ============================================================
-- Treino feito fora do app + foto de progresso do aluno
--
-- Nada de estrutura nova: as duas coisas cabem no que ja existe.
-- Este arquivo so registra as decisoes e confere que o banco aceita.
--
-- 1) "Treinei fora do app" grava em train_historico com
--    tipo_serie = 'Externo', carga e reps nulos, observacao com a duracao.
--    Como nao existe CHECK em tipo_serie, o valor entra normal.
--    O que conta o dia (painel_hoje, frequencia, sequencia) olha so
--    data_treino, entao o dia entra; o que calcula recorde e evolucao
--    filtra tipo_serie = 'Valida', entao o treino externo nao suja carga.
--
-- 2) A foto de progresso usa a tabela photos com kind = 'progress',
--    que a tela de Registros do treinador ja sabia exibir. O arquivo vai
--    para o bucket photos na pasta do proprio aluno (<uid>/<arquivo>.jpg),
--    que e o que a politica de storage exige desde mfp-security.sql.
-- ============================================================

-- confere que nao ha CHECK barrando o tipo novo
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.train_historico'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%tipo_serie%'
  ) then
    raise exception 'train_historico tem CHECK em tipo_serie: revise antes de gravar Externo';
  end if;
end $$;

-- indice para o painel: ele pergunta "qual o ultimo dia de treino deste aluno"
create index if not exists train_historico_dia_idx
  on public.train_historico (student_id, data_treino desc);

-- indice para as fotos do aluno, que agora sao lidas por tipo
create index if not exists photos_aluno_tipo_idx
  on public.photos (student_id, kind, created_at desc);
