-- MF Performance — permite o treinador colar um vídeo por exercício na ficha
-- Rode uma vez (SQL Editor > Run).
alter table public.train_serie_prescrita add column if not exists video_url text;
