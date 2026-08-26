-- ============================================================
-- MF Performance — Gifs de exercícios GRÁTIS (free-exercise-db, MIT)
-- Substitui os links do YouTube (que tinham anúncio) por imagens/gifs
-- ilustrados, sem anúncio, tocando INLINE no app.
-- Rode uma vez (SQL Editor > Run). Requer treino-exercicios.sql.
-- ============================================================

update public.train_exercicios as e set video_url = v.url
from (values
  ('Supino Reto','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Bench_Press_-_Medium_Grip/0.jpg'),
  ('Supino Inclinado','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Incline_Bench_Press_-_Medium_Grip/0.jpg'),
  ('Supino Declinado','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Decline_Barbell_Bench_Press/0.jpg'),
  ('Crucifixo','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Dumbbell_Flyes/0.jpg'),
  ('Crossover','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Cable_Crossover/0.jpg'),
  ('Peck Deck (Voador)','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Butterfly/0.jpg'),
  ('Flexão de Braço','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Pushups/0.jpg'),
  ('Supino Máquina','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Leverage_Chest_Press/0.jpg'),
  ('Puxada Frente','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Wide-Grip_Lat_Pulldown/0.jpg'),
  ('Remada Curvada','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Bent_Over_Barbell_Row/0.jpg'),
  ('Remada Baixa','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Seated_Cable_Rows/0.jpg'),
  ('Remada Cavalinho','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Lying_T-Bar_Row/0.jpg'),
  ('Remada Unilateral','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/One-Arm_Dumbbell_Row/0.jpg'),
  ('Barra Fixa','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Pullups/0.jpg'),
  ('Pulldown','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Straight-Arm_Pulldown/0.jpg'),
  ('Remada Máquina','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Leverage_High_Row/0.jpg'),
  ('Desenvolvimento com Halteres','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Dumbbell_Shoulder_Press/0.jpg'),
  ('Desenvolvimento Máquina','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Standing_Military_Press/0.jpg'),
  ('Elevação Lateral','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Side_Lateral_Raise/0.jpg'),
  ('Elevação Frontal','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Front_Dumbbell_Raise/0.jpg'),
  ('Crucifixo Inverso','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Reverse_Flyes/0.jpg'),
  ('Remada Alta','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Upright_Barbell_Row/0.jpg'),
  ('Arnold Press','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Arnold_Dumbbell_Press/0.jpg'),
  ('Rosca Direta','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Curl/0.jpg'),
  ('Rosca Alternada','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Dumbbell_Bicep_Curl/0.jpg'),
  ('Rosca Scott','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Preacher_Curl/0.jpg'),
  ('Rosca Martelo','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Hammer_Curls/0.jpg'),
  ('Rosca Concentrada','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Concentration_Curls/0.jpg'),
  ('Tríceps Testa','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/EZ-Bar_Skullcrusher/0.jpg'),
  ('Tríceps Corda','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Triceps_Pushdown_-_Rope_Attachment/0.jpg'),
  ('Tríceps Francês','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Seated_Triceps_Press/0.jpg'),
  ('Tríceps Coice','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Tricep_Dumbbell_Kickback/0.jpg'),
  ('Mergulho (Dips)','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Dips_-_Triceps_Version/0.jpg'),
  ('Agachamento Livre','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Full_Squat/0.jpg'),
  ('Leg Press','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Leg_Press/0.jpg'),
  ('Cadeira Extensora','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Leg_Extensions/0.jpg'),
  ('Agachamento Hack','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Hack_Squat/0.jpg'),
  ('Afundo','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Dumbbell_Lunges/0.jpg'),
  ('Agachamento Búlgaro','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Side_Split_Squat/0.jpg'),
  ('Agachamento Smith','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Smith_Machine_Squat/0.jpg'),
  ('Stiff','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Stiff-Legged_Barbell_Deadlift/0.jpg'),
  ('Mesa Flexora','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Lying_Leg_Curls/0.jpg'),
  ('Cadeira Flexora','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Seated_Leg_Curl/0.jpg'),
  ('Levantamento Terra Romeno','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Romanian_Deadlift/0.jpg'),
  ('Flexora em Pé','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Standing_Leg_Curl/0.jpg'),
  ('Elevação Pélvica','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Hip_Thrust/0.jpg'),
  ('Coice na Polia','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Glute_Kickback/0.jpg'),
  ('Cadeira Abdutora','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Thigh_Abductor/0.jpg'),
  ('Abdução em Pé','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Thigh_Abductor/0.jpg'),
  ('Agachamento Sumô','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Plie_Dumbbell_Squat/0.jpg'),
  ('Panturrilha em Pé','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Standing_Calf_Raises/0.jpg'),
  ('Panturrilha Sentado','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Seated_Calf_Raise/0.jpg'),
  ('Panturrilha no Leg','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Calf_Press_On_The_Leg_Press_Machine/0.jpg'),
  ('Abdominal Supra','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Crunches/0.jpg'),
  ('Prancha','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Plank/0.jpg'),
  ('Elevação de Pernas','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Hanging_Leg_Raise/0.jpg'),
  ('Abdominal Infra','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Reverse_Crunch/0.jpg'),
  ('Abdominal Oblíquo','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Oblique_Crunches/0.jpg'),
  ('Hiperextensão Lombar','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Superman/0.jpg'),
  ('Levantamento Terra','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Deadlift/0.jpg'),
  ('Cadeira Adutora','https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Thigh_Adductor/0.jpg')
) as v(nome, url)
where e.nome = v.nome and e.coach_id is null;

-- Pronto. No app, os exercícios mostram o gif inline (sem YouTube, sem anúncio).
