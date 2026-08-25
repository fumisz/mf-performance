-- ============================================================
-- MF Performance — Vídeos da biblioteca base + técnicas avançadas
-- Rode uma vez (SQL Editor > Run). Requer treino-exercicios.sql.
-- Preenche video_url (demo INLINE no app) de ~58 exercícios e
-- cadastra as técnicas de treino avançadas. Só onde ainda está vazio.
-- ============================================================

update public.train_exercicios as e
set video_url = v.url
from (values
  -- Peito
  ('Supino Reto','https://youtu.be/vIGvt-vgrvY'),
  ('Supino Inclinado','https://youtu.be/oZjIQN0YMX0'),
  ('Supino Declinado','https://youtu.be/9XqGE8PNrws'),
  ('Crucifixo','https://youtu.be/_kpKlYexyXs'),
  ('Crossover','https://youtu.be/E3aha5zhlc0'),
  ('Peck Deck (Voador)','https://youtu.be/FwtqdGlRgig'),
  ('Flexão de Braço','https://youtu.be/GOj4TMPVuZg'),
  ('Supino Máquina','https://youtu.be/bKSvckCwvh4'),
  -- Costas
  ('Puxada Frente','https://youtu.be/7cCiQUdIXWw'),
  ('Puxada Aberta','https://youtu.be/Xn-fIQw08q4'),
  ('Remada Curvada','https://youtu.be/mxvS-iwm53o'),
  ('Remada Baixa','https://youtu.be/f8AVh4VBbos'),
  ('Remada Cavalinho','https://youtu.be/b-n8m51UIxc'),
  ('Remada Unilateral','https://youtu.be/K25eTWoEOWU'),
  ('Barra Fixa','https://youtu.be/e0_JPPnPNXo'),
  ('Pulldown','https://youtu.be/3uIW1Wmc2_I'),
  ('Remada Máquina','https://youtu.be/cwZi6M76s3Q'),
  -- Ombro
  ('Desenvolvimento com Halteres','https://youtu.be/eufDL9MmF8A'),
  ('Desenvolvimento Máquina','https://youtu.be/oBF4YIwh_w8'),
  ('Elevação Lateral','https://youtu.be/jannLx4RxKo'),
  ('Elevação Frontal','https://youtu.be/jhxLYSm_P-k'),
  ('Crucifixo Inverso','https://youtu.be/ZMK0PITZFxQ'),
  ('Remada Alta','https://youtu.be/0FOiIyUFDPE'),
  ('Arnold Press','https://youtu.be/Qjv_6bwRlnE'),
  -- Bíceps
  ('Rosca Direta','https://youtu.be/yopIHJ-jr3w'),
  ('Rosca Alternada','https://youtu.be/nJxbtI4C1bU'),
  ('Rosca Scott','https://youtu.be/wWKrF4iSU_8'),
  ('Rosca Martelo','https://youtu.be/5vPGH1uTtbs'),
  ('Rosca Concentrada','https://youtu.be/azpBXHDxCRk'),
  -- Tríceps
  ('Tríceps Testa','https://youtu.be/5FTQbDJK0lI'),
  ('Tríceps Corda','https://youtu.be/M-DTY40JG9M'),
  ('Tríceps Francês','https://youtu.be/9EkGm94Q2Ms'),
  ('Tríceps Coice','https://youtu.be/dnyUwaA7Pok'),
  ('Mergulho (Dips)','https://youtu.be/8mgsEx0xyeI'),
  -- Quadríceps
  ('Agachamento Livre','https://youtu.be/nrM8zB5-gtE'),
  ('Leg Press','https://youtu.be/waAxlYvtCcI'),
  ('Cadeira Extensora','https://youtu.be/y6juG3XuRe4'),
  ('Agachamento Hack','https://youtu.be/Whp712OHPl8'),
  ('Afundo','https://youtu.be/LD6dydg2bxc'),
  ('Agachamento Búlgaro','https://youtu.be/a3-bQbTdA_0'),
  ('Agachamento Smith','https://youtu.be/uDBQtlCLQ0Y'),
  -- Posterior de Coxa
  ('Stiff','https://youtu.be/BHfY5-jGNDA'),
  ('Mesa Flexora','https://youtu.be/dMYsB4Eb2BY'),
  ('Cadeira Flexora','https://youtu.be/AFG0wxXmTH4'),
  ('Levantamento Terra Romeno','https://youtu.be/jSomWOwLiGE'),
  ('Flexora em Pé','https://youtu.be/DkZvVE9sNtc'),
  -- Glúteos
  ('Elevação Pélvica','https://youtu.be/5KYtuo5Y-sg'),
  ('Coice na Polia','https://youtu.be/DHCv6Vjakv0'),
  ('Cadeira Abdutora','https://youtu.be/50qHGus1TZk'),
  ('Agachamento Sumô','https://youtu.be/u_TTcv8FvOk'),
  ('Abdução em Pé','https://youtu.be/jYnZvayVU5Q'),
  -- Panturrilha
  ('Panturrilha em Pé','https://youtu.be/cklp_Xh5V8M'),
  ('Panturrilha Sentado','https://youtu.be/UqsUaoE3SSs'),
  ('Panturrilha no Leg','https://youtu.be/E15QyvVwZXU'),
  -- Abdômen
  ('Abdominal Supra','https://youtu.be/Xj0tk-bPJoQ'),
  ('Prancha','https://youtu.be/DoOtkRaL1BI'),
  ('Elevação de Pernas','https://youtu.be/IIMzCZXqIeA'),
  ('Abdominal Infra','https://youtu.be/8slFJ9J31lM'),
  ('Abdominal Oblíquo','https://youtu.be/HO693873yRo'),
  -- Lombar
  ('Hiperextensão Lombar','https://youtu.be/6Bg5woPBEA8'),
  ('Levantamento Terra','https://youtu.be/QuePyle8pVs'),
  -- Adutores
  ('Cadeira Adutora','https://youtu.be/mphx1zpnyT0')
) as v(nome, url)
where e.nome = v.nome and e.coach_id is null
  and (e.video_url is null or e.video_url = '');

-- ---------- Técnicas de treino avançadas (grupo próprio) ----------
insert into public.train_exercicios (coach_id, nome, grupo_muscular, dicas)
select null, t.nome, 'Técnica avançada', t.dica
from (values
  ('Drop-set','Faça a série até a falha e, sem descanso, reduza a carga (~20-30%) e continue. Repita 1-3 quedas. Ótimo pra finalizar um grupo.'),
  ('Bi-set','Dois exercícios em sequência, sem descanso entre eles. Mesmo grupo (pré/pós-exaustão) ou agonista/antagonista.'),
  ('Tri-set','Três exercícios seguidos sem descanso — alta densidade e congestão muscular.'),
  ('Super-set antagonista','Alterna dois músculos opostos (ex.: bíceps e tríceps) sem descanso; economiza tempo e mantém intensidade.'),
  ('Rest-pause','Série até a falha, 10-15s de pausa, mais algumas reps; repita. Aumenta o volume com a mesma carga.'),
  ('Série piramidal','Aumenta a carga e reduz as reps a cada série (crescente) ou o inverso (decrescente).'),
  ('Repetições forçadas','Ao atingir a falha, um parceiro ajuda o mínimo pra completar 2-3 reps extras na fase concêntrica.'),
  ('Série negativa (excêntrica)','Ênfase na fase de descida (3-5s), com carga acima do normal e auxílio na subida. Muito estímulo, cuidado com a recuperação.'),
  ('Pré-exaustão','Isolador antes do composto (ex.: cadeira extensora antes do agachamento) pra fatigar o alvo primeiro.'),
  ('FST-7','7 séries do exercício isolador no fim do treino, com ~30-45s de descanso, buscando congestão/estiramento da fáscia.'),
  ('Cluster set','Divide a série em mini-blocos com pausas curtas (ex.: 3+3+3 com 15s), permitindo mais reps com carga alta.'),
  ('Isometria','Segura a contração numa posição por tempo (ex.: pausa embaixo do agachamento) pra aumentar o tempo sob tensão.')
) as t(nome, dica)
where not exists (
  select 1 from public.train_exercicios e
  where e.nome = t.nome and e.grupo_muscular = 'Técnica avançada'
);

-- Pronto. Exercícios tocam o vídeo INLINE; técnicas ficam num grupo próprio
-- com a explicação (o vídeo de cada técnica dá pra adicionar depois).
