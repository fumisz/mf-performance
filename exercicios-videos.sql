-- ============================================================
-- MF Performance — Vídeos de demonstração da biblioteca base
-- Rode uma vez (SQL Editor > Run). Requer treino-exercicios.sql aplicado.
-- Preenche video_url dos exercícios base (coach_id null) com vídeos do YouTube.
-- O app embute o player INLINE (não sai do app). Só preenche onde ainda está vazio.
-- ============================================================

update public.train_exercicios as e
set video_url = v.url
from (values
  ('Supino Reto',               'https://youtu.be/vIGvt-vgrvY'),
  ('Supino Inclinado',          'https://youtu.be/oZjIQN0YMX0'),
  ('Crucifixo',                 'https://youtu.be/_kpKlYexyXs'),
  ('Crossover',                 'https://youtu.be/E3aha5zhlc0'),
  ('Peck Deck (Voador)',        'https://youtu.be/FwtqdGlRgig'),
  ('Puxada Frente',             'https://youtu.be/7cCiQUdIXWw'),
  ('Remada Curvada',            'https://youtu.be/mxvS-iwm53o'),
  ('Remada Baixa',              'https://youtu.be/f8AVh4VBbos'),
  ('Barra Fixa',                'https://youtu.be/e0_JPPnPNXo'),
  ('Agachamento Livre',         'https://youtu.be/nrM8zB5-gtE'),
  ('Leg Press',                 'https://youtu.be/waAxlYvtCcI'),
  ('Levantamento Terra',        'https://youtu.be/QuePyle8pVs'),
  ('Desenvolvimento com Halteres','https://youtu.be/eufDL9MmF8A'),
  ('Elevação Lateral',          'https://youtu.be/jannLx4RxKo'),
  ('Rosca Direta',              'https://youtu.be/yopIHJ-jr3w'),
  ('Tríceps Corda',             'https://youtu.be/M-DTY40JG9M'),
  ('Cadeira Extensora',         'https://youtu.be/y6juG3XuRe4'),
  ('Mesa Flexora',              'https://youtu.be/dMYsB4Eb2BY'),
  ('Stiff',                     'https://youtu.be/BHfY5-jGNDA'),
  ('Elevação Pélvica',          'https://youtu.be/5KYtuo5Y-sg'),
  ('Panturrilha em Pé',         'https://youtu.be/cklp_Xh5V8M'),
  ('Prancha',                   'https://youtu.be/DoOtkRaL1BI')
) as v(nome, url)
where e.nome = v.nome
  and e.coach_id is null
  and (e.video_url is null or e.video_url = '');

-- Pronto. Ao iniciar o treino e tocar em "Ver", o vídeo toca dentro do app.
-- Exercício sem vídeo continua com o botão "Buscar no YouTube".
