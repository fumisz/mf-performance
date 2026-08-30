-- ============================================================
--  MF Performance — Biblioteca de exercícios com demonstração grátis
--  Fonte: free-exercise-db (yuhonas) — domínio público (Unlicense).
--  O app anima os quadros 0.jpg/1.jpg como se fosse um gif, sem anúncio
--  e sem sair do app (os links de YouTube antigos faziam as duas coisas).
--  Idempotente: pode rodar de novo sem duplicar nada.
-- ============================================================
do $$
declare v_base text := 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';
begin
  create temporary table if not exists _ex(nome text, grupo text, pasta text);
  delete from _ex;
  insert into _ex(nome,grupo,pasta) values
  ('Supino Reto','Peito','Barbell_Bench_Press_-_Medium_Grip'),('Supino Reto com Halteres','Peito','Dumbbell_Bench_Press'),
  ('Supino Inclinado','Peito','Barbell_Incline_Bench_Press_-_Medium_Grip'),('Supino Inclinado com Halteres','Peito','Incline_Dumbbell_Press'),
  ('Supino Declinado','Peito','Decline_Barbell_Bench_Press'),('Supino Declinado com Halteres','Peito','Decline_Dumbbell_Bench_Press'),
  ('Supino Máquina','Peito','Leverage_Chest_Press'),('Crucifixo','Peito','Dumbbell_Flyes'),('Crucifixo Inclinado','Peito','Incline_Dumbbell_Flyes'),
  ('Peck Deck (Voador)','Peito','Butterfly'),('Crossover','Peito','Cable_Crossover'),('Crossover Baixo','Peito','Low_Cable_Crossover'),
  ('Flexão de Braço','Peito','Pushups'),('Flexão Inclinada','Peito','Incline_Push-Up'),('Pullover','Peito','Straight-Arm_Dumbbell_Pullover'),
  ('Puxada Frente','Costas','Wide-Grip_Lat_Pulldown'),('Puxada Aberta','Costas','Wide-Grip_Rear_Pull-Up'),
  ('Puxada Supinada','Costas','Underhand_Cable_Pulldowns'),('Puxada Triângulo','Costas','V-Bar_Pulldown'),
  ('Pulldown','Costas','Straight-Arm_Pulldown'),('Barra Fixa','Costas','Pullups'),('Barra Fixa Supinada','Costas','Chin-Up'),
  ('Remada Curvada','Costas','Bent_Over_Barbell_Row'),('Remada Baixa','Costas','Seated_Cable_Rows'),('Remada Unilateral','Costas','One-Arm_Dumbbell_Row'),
  ('Remada Cavalinho','Costas','T-Bar_Row_with_Handle'),('Remada Máquina','Costas','Leverage_High_Row'),('Remada Serrote','Costas','Bent_Over_Two-Dumbbell_Row'),
  ('Remada Alta na Polia','Costas','Face_Pull'),('Desenvolvimento com Halteres','Ombro','Dumbbell_Shoulder_Press'),
  ('Desenvolvimento com Barra','Ombro','Standing_Military_Press'),('Desenvolvimento Máquina','Ombro','Machine_Shoulder_Military_Press'),
  ('Arnold Press','Ombro','Arnold_Dumbbell_Press'),('Elevação Lateral','Ombro','Side_Lateral_Raise'),('Elevação Lateral na Polia','Ombro','Cable_Seated_Lateral_Raise'),
  ('Elevação Frontal','Ombro','Front_Dumbbell_Raise'),('Elevação Frontal com Anilha','Ombro','Front_Plate_Raise'),
  ('Crucifixo Inverso','Ombro','Reverse_Flyes'),('Remada Alta','Ombro','Upright_Barbell_Row'),('Encolhimento (Trapézio)','Ombro','Dumbbell_Shrug'),
  ('Rosca Direta','Bíceps','Barbell_Curl'),('Rosca Alternada','Bíceps','Alternate_Incline_Dumbbell_Curl'),
  ('Rosca Martelo','Bíceps','Hammer_Curls'),('Rosca Concentrada','Bíceps','Concentration_Curls'),('Rosca Scott','Bíceps','Preacher_Curl'),
  ('Rosca na Polia','Bíceps','Cable_Hammer_Curls_-_Rope_Attachment'),('Rosca Inversa','Bíceps','Reverse_Barbell_Curl'),
  ('Tríceps Corda','Tríceps','Triceps_Pushdown_-_Rope_Attachment'),('Tríceps Barra na Polia','Tríceps','Triceps_Pushdown'),
  ('Tríceps Testa','Tríceps','Lying_Triceps_Press'),('Tríceps Francês','Tríceps','Standing_Dumbbell_Triceps_Extension'),
  ('Tríceps Coice','Tríceps','Tricep_Dumbbell_Kickback'),('Mergulho (Dips)','Tríceps','Dips_-_Triceps_Version'),
  ('Supino Fechado','Tríceps','Close-Grip_Barbell_Bench_Press'),('Agachamento Livre','Quadríceps','Barbell_Squat'),
  ('Agachamento Frontal','Quadríceps','Front_Barbell_Squat'),('Agachamento Smith','Quadríceps','Smith_Machine_Squat'),
  ('Agachamento Hack','Quadríceps','Hack_Squat'),('Agachamento Búlgaro','Quadríceps','One_Leg_Barbell_Squat'),
  ('Leg Press','Quadríceps','Leg_Press'),('Cadeira Extensora','Quadríceps','Leg_Extensions'),('Afundo','Quadríceps','Dumbbell_Lunges'),
  ('Passada (Walking Lunge)','Quadríceps','Barbell_Walking_Lunge'),('Step-up','Quadríceps','Dumbbell_Step_Ups'),
  ('Mesa Flexora','Posterior de Coxa','Lying_Leg_Curls'),('Cadeira Flexora','Posterior de Coxa','Seated_Leg_Curl'),
  ('Flexora em Pé','Posterior de Coxa','Standing_Leg_Curl'),('Stiff','Posterior de Coxa','Stiff-Legged_Barbell_Deadlift'),
  ('Levantamento Terra Romeno','Posterior de Coxa','Romanian_Deadlift'),('Bom dia (Good Morning)','Posterior de Coxa','Good_Morning'),
  ('Elevação Pélvica Unilateral','Posterior de Coxa','Single_Leg_Glute_Bridge'),('Elevação Pélvica','Glúteos','Barbell_Glute_Bridge'),
  ('Agachamento Sumô','Glúteos','Plie_Dumbbell_Squat'),('Coice na Polia','Glúteos','Glute_Kickback'),('Cadeira Abdutora','Glúteos','Thigh_Abductor'),
  ('Abdução com Elástico','Glúteos','Monster_Walk'),('Elevação Pélvica com Barra','Glúteos','Barbell_Hip_Thrust'),
  ('Coice Unilateral na Polia','Glúteos','One-Legged_Cable_Kickback'),('Levantamento Terra Sumô','Glúteos','Sumo_Deadlift'),
  ('Cadeira Adutora','Adutores','Thigh_Adductor'),('Adução na Polia','Adutores','Adductor'),('Panturrilha em Pé','Panturrilha','Standing_Calf_Raises'),
  ('Panturrilha Sentado','Panturrilha','Seated_Calf_Raise'),('Panturrilha no Leg','Panturrilha','Calf_Press_On_The_Leg_Press_Machine'),
  ('Levantamento Terra','Lombar','Barbell_Deadlift'),('Hiperextensão Lombar','Lombar','Hyperextensions_Back_Extensions'),
  ('Superman','Lombar','Superman'),('Abdominal Supra','Abdômen','Crunches'),('Abdominal Infra','Abdômen','Flat_Bench_Lying_Leg_Raise'),
  ('Abdominal Oblíquo','Abdômen','Oblique_Crunches_-_On_The_Floor'),('Elevação de Pernas','Abdômen','Hanging_Leg_Raise'),
  ('Prancha','Abdômen','Plank'),('Prancha Lateral','Abdômen','Side_Bridge'),('Abdominal na Polia','Abdômen','Cable_Crunch'),
  ('Bicicleta no Solo','Abdômen','Air_Bike'),('Rotação Russa','Abdômen','Russian_Twist'),('Esteira','Cardio','Running_Treadmill'),
  ('Bicicleta','Cardio','Bicycling_Stationary'),('Elíptico','Cardio','Elliptical_Trainer'),('Escada','Cardio','Stairmaster'),
  ('Pular Corda','Cardio','Rope_Jumping'),('Remo Ergômetro','Cardio','Rowing_Stationary');

  -- 1) atualiza a demonstração dos que já existem na base compartilhada
  update public.train_exercicios e
     set video_url = v_base || x.pasta || '/0.jpg',
         grupo_muscular = x.grupo
    from _ex x
   where e.coach_id is null and lower(btrim(e.nome)) = lower(x.nome);

  -- 2) acrescenta as variações que ainda não existiam
  insert into public.train_exercicios (coach_id, nome, grupo_muscular, video_url)
  select null, x.nome, x.grupo, v_base || x.pasta || '/0.jpg'
    from _ex x
   where not exists (select 1 from public.train_exercicios e
                      where e.coach_id is null and lower(btrim(e.nome)) = lower(x.nome));
  drop table _ex;
end $$;
