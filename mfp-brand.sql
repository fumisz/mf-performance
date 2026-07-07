-- ============================================================
--  MF PERFORMANCE — Marca do treinador (white-label no relatório)
--  Cole no SQL Editor do Supabase e RUN. Idempotente.
-- ============================================================
alter table public.profiles add column if not exists brand_name text;  -- nome da marca/estúdio no relatório
alter table public.profiles add column if not exists cref       text;  -- registro CREF
alter table public.profiles add column if not exists instagram  text;  -- @ do treinador
alter table public.profiles add column if not exists logo_url   text;  -- logo (imagem) do treinador
-- (a política de update existente já permite o coach editar o próprio perfil)
