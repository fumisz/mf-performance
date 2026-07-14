-- ============================================================
-- MF Performance — Avaliação Técnica por Vídeo
-- Rode este SQL uma vez no Supabase (SQL Editor > New query > Run).
-- Cria a tabela, as funções da página pública e o bucket de vídeos.
-- ============================================================

-- 1) Tabela das avaliações técnicas (uma linha por avaliação)
create table if not exists public.assess_tech (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles(id) on delete cascade,
  student_id   uuid not null,
  token        uuid not null default gen_random_uuid(),
  title        text,
  status       text not null default 'requested',  -- 'requested' | 'submitted' | 'reviewed'
  exercises    jsonb not null default '[]'::jsonb,  -- [{key,label}] pedidos pelo profissional
  items        jsonb not null default '{}'::jsonb,  -- {exKey:{video_path,video_url,note}} preenchido pelo aluno
  analysis     jsonb not null default '{}'::jsonb,  -- {exKey:{score,notes,positives,corrections,recs,errors[]}} do profissional
  feedback     jsonb not null default '{}'::jsonb,  -- {text,audio_path,video_path}
  created_at   timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at  timestamptz
);
create index if not exists assess_tech_coach_idx   on public.assess_tech (coach_id, student_id, created_at desc);
create unique index if not exists assess_tech_token_idx on public.assess_tech (token);

-- 2) RLS: cada profissional só vê/gerencia as próprias avaliações técnicas.
alter table public.assess_tech enable row level security;
drop policy if exists tech_coach_all on public.assess_tech;
create policy tech_coach_all on public.assess_tech
  for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- 3) Função pública: o aluno abre o link e vê os exercícios pedidos.
create or replace function public.tech_get(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_row public.assess_tech; v_brand text; v_student text;
begin
  select * into v_row from public.assess_tech where token = p_token;
  if not found then return json_build_object('ok', false); end if;
  select name into v_brand   from public.profiles       where id = v_row.coach_id;
  select name into v_student from public.assess_students where id = v_row.student_id;
  return json_build_object('ok', true, 'id', v_row.id, 'coach_id', v_row.coach_id,
    'brand', coalesce(v_brand,'MF Performance'),
    'student_name', v_student, 'title', v_row.title, 'status', v_row.status,
    'exercises', v_row.exercises, 'items', v_row.items);
end; $$;

-- 4) Função pública: o aluno envia os vídeos (caminhos no Storage) + observações.
create or replace function public.tech_submit(p_token uuid, p_items jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_row public.assess_tech;
begin
  update public.assess_tech
     set items = coalesce(p_items,'{}'::jsonb),
         status = 'submitted',
         submitted_at = now()
   where token = p_token and status in ('requested','submitted')
   returning * into v_row;
  if not found then return json_build_object('ok', false, 'message', 'Avaliação não encontrada ou já concluída.'); end if;
  return json_build_object('ok', true);
end; $$;

grant execute on function public.tech_get(uuid)          to anon, authenticated;
grant execute on function public.tech_submit(uuid, jsonb) to anon, authenticated;

-- 5) Bucket de vídeos (privado) + políticas de acesso.
insert into storage.buckets (id, name, public)
values ('assess-videos','assess-videos', false)
on conflict (id) do nothing;

-- Upload: aluno (anon, pelo link) e profissional (feedback) podem enviar.
drop policy if exists tech_video_upload on storage.objects;
create policy tech_video_upload on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'assess-videos');

-- Leitura: apenas o profissional autenticado (gera signed URLs para tocar).
drop policy if exists tech_video_read on storage.objects;
create policy tech_video_read on storage.objects
  for select to authenticated
  using (bucket_id = 'assess-videos');

-- Exclusão: profissional autenticado.
drop policy if exists tech_video_delete on storage.objects;
create policy tech_video_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'assess-videos');

-- Observação de segurança: o upload é liberado para anônimos (o aluno não faz login).
-- Os caminhos usam IDs aleatórios; para um estúdio pequeno o risco é baixo. Se quiser
-- endurecer no futuro, dá para trocar por upload via URL assinada emitida por função.
