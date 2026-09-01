-- ============================================================
-- Conversa treinador <-> aluno
--
-- Os avisos (train_avisos) sao mao-unica: o treinador escreve, o aluno le e
-- acabou. Na pratica o aluno responde no WhatsApp e o app vira so um caderno
-- de cargas. Esta tabela e o outro lado da rua.
--
-- Os avisos continuam existindo como estao. Na tela do aluno os dois viram uma
-- linha do tempo so, ordenada por hora — ele nao precisa saber que sao duas
-- coisas diferentes.
--
-- Regras de acesso (todas testadas):
--   aluno   ve e escreve so na propria conversa, e o with check exige de_aluno
--           (ele nao consegue gravar uma mensagem fingindo ser o treinador)
--   coach   ve e escreve so nas conversas dos alunos dele, e o with check
--           exige not de_aluno
--   o texto do push e montado no servidor a partir do que ficou gravado
-- ============================================================

create table if not exists public.train_conversa (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.assess_students(id) on delete cascade,
  de_aluno   boolean not null,                 -- true = escrito pelo aluno
  texto      text not null check (length(btrim(texto)) between 1 and 2000),
  lido_em    timestamptz,                      -- quando o OUTRO lado leu
  created_at timestamptz not null default now()
);
create index if not exists train_conversa_idx
  on public.train_conversa (student_id, created_at desc);

alter table public.train_conversa enable row level security;

drop policy if exists conversa_aluno on public.train_conversa;
create policy conversa_aluno on public.train_conversa
  for all to authenticated
  using ( student_id in (select id from public.assess_students where user_id = auth.uid()) )
  with check ( student_id in (select id from public.assess_students where user_id = auth.uid())
               and de_aluno );

drop policy if exists conversa_treinador on public.train_conversa;
create policy conversa_treinador on public.train_conversa
  for all to authenticated
  using ( coach_id = auth.uid() )
  with check ( coach_id = auth.uid() and not de_aluno );

-- Enviar. Em RPC para o remetente vir de quem esta logado, e nao do aparelho.
create or replace function public.conversa_enviar(p_texto text, p_student uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_s record; v_id uuid; v_txt text;
begin
  v_txt := btrim(coalesce(p_texto,''));
  if v_txt = '' then return jsonb_build_object('ok', false, 'erro', 'VAZIO'); end if;
  if length(v_txt) > 2000 then v_txt := left(v_txt, 2000); end if;

  select id, coach_id into v_s from public.assess_students where user_id = auth.uid() limit 1;
  if v_s.id is not null and p_student is null then
    if v_s.coach_id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_TREINADOR'); end if;
    insert into public.train_conversa (coach_id, student_id, de_aluno, texto)
    values (v_s.coach_id, v_s.id, true, v_txt) returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'de_aluno', true);
  end if;

  if p_student is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ALUNO'); end if;
  if not exists (select 1 from public.assess_students
                  where id = p_student and coach_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_ALUNO');
  end if;
  insert into public.train_conversa (coach_id, student_id, de_aluno, texto)
  values (auth.uid(), p_student, false, v_txt) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'de_aluno', false);
end; $$;

revoke all on function public.conversa_enviar(text, uuid) from public, anon;
grant execute on function public.conversa_enviar(text, uuid) to authenticated;

create or replace function public.conversa_marcar_lida(p_student uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_s record;
begin
  select id into v_s from public.assess_students where user_id = auth.uid() limit 1;
  if v_s.id is not null and p_student is null then
    update public.train_conversa set lido_em = now()
     where student_id = v_s.id and not de_aluno and lido_em is null;
    return;
  end if;
  if p_student is null then return; end if;
  update public.train_conversa set lido_em = now()
   where student_id = p_student and coach_id = auth.uid() and de_aluno and lido_em is null;
end; $$;

revoke all on function public.conversa_marcar_lida(uuid) from public, anon;
grant execute on function public.conversa_marcar_lida(uuid) to authenticated;

create or replace function public.conversa_nao_lidas()
returns table(student_id uuid, nome text, quantas int, ultima timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select c.student_id, s.name, count(*)::int, max(c.created_at)
    from public.train_conversa c
    join public.assess_students s on s.id = c.student_id
   where c.coach_id = auth.uid() and c.de_aluno and c.lido_em is null
   group by c.student_id, s.name
   order by max(c.created_at) desc;
$$;

revoke all on function public.conversa_nao_lidas() from public, anon;
grant execute on function public.conversa_nao_lidas() to authenticated;

-- Dados para o aviso no celular. Confere que quem pediu participa da conversa.
create or replace function public.conversa_para_aviso(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_m record; v_aluno text; v_coach text;
begin
  select * into v_m from public.train_conversa where id = p_id;
  if v_m.id is null then return jsonb_build_object('ok', false); end if;
  if not (v_m.coach_id = auth.uid()
          or v_m.student_id in (select id from public.assess_students where user_id = auth.uid()))
  then return jsonb_build_object('ok', false); end if;

  select name into v_aluno from public.assess_students where id = v_m.student_id;
  select coalesce(brand_name, name) into v_coach from public.profiles where id = v_m.coach_id;
  return jsonb_build_object('ok', true,
    'de_aluno', v_m.de_aluno, 'coach_id', v_m.coach_id, 'student_id', v_m.student_id,
    'aluno', v_aluno, 'treinador', coalesce(v_coach,'Seu treinador'),
    'texto', left(v_m.texto, 160));
end; $$;

revoke all on function public.conversa_para_aviso(uuid) from public, anon;
grant execute on function public.conversa_para_aviso(uuid) to authenticated;
