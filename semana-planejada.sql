-- ============================================================
-- Semana planejada: em que dias cada divisao cai
--
-- Ate agora o rodizio era livre: fez A, o app sugere B. Funciona, mas muito
-- treinador prescreve "segunda A, quarta B, sexta C" — e o aluno quer abrir o
-- app e ver o treino DO DIA dele, sem pensar.
--
-- Guardado como array no padrao ISO: 1=segunda ... 7=domingo.
-- Vazio = sem dia fixo, e o rodizio livre continua valendo. Ou seja: quem nao
-- usar isso nao muda nada, e ficha antiga segue funcionando igual.
-- ============================================================

alter table public.train_divisao
  add column if not exists dias_semana smallint[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid='public.train_divisao'::regclass
                    and conname='train_divisao_dias_ck') then
    alter table public.train_divisao
      add constraint train_divisao_dias_ck
      check (dias_semana <@ array[1,2,3,4,5,6,7]::smallint[]);
  end if;
end $$;
