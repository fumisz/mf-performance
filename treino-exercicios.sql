-- ============================================================
-- MF Performance — Biblioteca base de exercícios + acesso do aluno
-- Rode uma vez (SQL Editor > Run). Requer treino.sql + login-aluno.sql.
-- ============================================================

-- 1) O aluno pode LER os exercícios prescritos a ele (para ver o vídeo)
drop policy if exists train_exercicios_aluno on public.train_exercicios;
create policy train_exercicios_aluno on public.train_exercicios
  for select to authenticated
  using ( id in (
    select sp.exercicio_id
      from public.train_serie_prescrita sp
      join public.train_divisao d  on d.id = sp.divisao_id
      join public.assess_students s on s.id = d.student_id
     where s.user_id = auth.uid() ) );

-- 2) Semear a biblioteca base (global: coach_id null). Só se estiver vazia.
insert into public.train_exercicios (coach_id, nome, grupo_muscular)
select null, x.nome, x.grupo
from (values
  ('Supino Reto','Peito'),('Supino Inclinado','Peito'),('Supino Declinado','Peito'),
  ('Crucifixo','Peito'),('Crossover','Peito'),('Peck Deck (Voador)','Peito'),
  ('Flexão de Braço','Peito'),('Supino Máquina','Peito'),
  ('Puxada Frente','Costas'),('Puxada Aberta','Costas'),('Remada Curvada','Costas'),
  ('Remada Baixa','Costas'),('Remada Cavalinho','Costas'),('Remada Unilateral','Costas'),
  ('Barra Fixa','Costas'),('Pulldown','Costas'),('Remada Máquina','Costas'),
  ('Desenvolvimento com Halteres','Ombro'),('Desenvolvimento Máquina','Ombro'),
  ('Elevação Lateral','Ombro'),('Elevação Frontal','Ombro'),('Crucifixo Inverso','Ombro'),
  ('Remada Alta','Ombro'),('Arnold Press','Ombro'),
  ('Rosca Direta','Bíceps'),('Rosca Alternada','Bíceps'),('Rosca Scott','Bíceps'),
  ('Rosca Martelo','Bíceps'),('Rosca Concentrada','Bíceps'),
  ('Tríceps Testa','Tríceps'),('Tríceps Corda','Tríceps'),('Tríceps Francês','Tríceps'),
  ('Tríceps Coice','Tríceps'),('Mergulho (Dips)','Tríceps'),
  ('Agachamento Livre','Quadríceps'),('Leg Press','Quadríceps'),('Cadeira Extensora','Quadríceps'),
  ('Agachamento Hack','Quadríceps'),('Afundo','Quadríceps'),('Agachamento Búlgaro','Quadríceps'),
  ('Agachamento Smith','Quadríceps'),
  ('Stiff','Posterior de Coxa'),('Mesa Flexora','Posterior de Coxa'),('Cadeira Flexora','Posterior de Coxa'),
  ('Levantamento Terra Romeno','Posterior de Coxa'),('Flexora em Pé','Posterior de Coxa'),
  ('Elevação Pélvica','Glúteos'),('Coice na Polia','Glúteos'),('Cadeira Abdutora','Glúteos'),
  ('Agachamento Sumô','Glúteos'),('Abdução em Pé','Glúteos'),
  ('Panturrilha em Pé','Panturrilha'),('Panturrilha Sentado','Panturrilha'),('Panturrilha no Leg','Panturrilha'),
  ('Abdominal Supra','Abdômen'),('Prancha','Abdômen'),('Elevação de Pernas','Abdômen'),
  ('Abdominal Infra','Abdômen'),('Abdominal Oblíquo','Abdômen'),
  ('Hiperextensão Lombar','Lombar'),('Levantamento Terra','Lombar'),
  ('Cadeira Adutora','Adutores'),
  ('Esteira','Cardio'),('Bicicleta','Cardio'),('Elíptico','Cardio'),('Escada','Cardio')
) as x(nome,grupo)
where not exists (select 1 from public.train_exercicios where coach_id is null);

-- Pronto. Base semeada; o "Ver vídeo" usa busca no YouTube quando não há link,
-- e o treinador pode colar o vídeo de cada exercício na Biblioteca / no montador.
