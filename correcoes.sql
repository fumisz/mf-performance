-- ============================================================
-- MF Performance — correções aplicadas no banco (30/08/2026)
-- Já rodadas no projeto Supabase; ficam aqui como registro.
-- Idempotente: pode rodar de novo sem medo.
-- ============================================================

-- 1) A coluna de vídeo por exercício (ficha-video.sql) nunca tinha sido criada.
--    Sem ela o SELECT de train_serie_prescrita devolvia erro, e tanto a ficha
--    do treinador quanto o treino do aluno apareciam VAZIOS.
alter table public.train_serie_prescrita add column if not exists video_url text;

-- 2) O aluno passa a enxergar a periodização (ciclo, meta semanal, vencimento)
--    que o treinador montou — aparece na aba Progresso do app dele.
drop policy if exists train_periodizacao_self on public.train_periodizacao;
create policy train_periodizacao_self on public.train_periodizacao
  for select to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) );
