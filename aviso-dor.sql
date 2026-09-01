-- ============================================================
-- Dor relatada no fim do treino chega no celular do treinador
--
-- O feedback (RPE, dificuldade, dor, nota) ja era gravado, mas ficava
-- esperando o treinador abrir a ficha do aluno. Dor alta e justamente o que
-- nao pode esperar.
--
-- Por que o texto do aviso e montado no servidor: se o aparelho do aluno
-- mandasse titulo e texto, qualquer um com a sessao dele conseguiria enviar
-- mensagem arbitraria para o treinador. Aqui o app so diz "avisa sobre este
-- feedback"; o conteudo sai do banco.
--
-- O id evita ambiguidade: dois feedbacks no mesmo instante empatam em
-- created_at e a funcao poderia pegar o errado. Sem id (caso da fila offline,
-- que so reexecuta a RPC) ela cai no mais recente dos ultimos 30 minutos.
-- ============================================================

drop function if exists public.feedback_dor_recente();

create or replace function public.feedback_dor_recente(p_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_s record; v_f record;
begin
  select id, coach_id, name into v_s
    from public.assess_students where user_id = auth.uid() limit 1;
  if v_s.id is null then return jsonb_build_object('ok', false); end if;

  if p_id is not null then
    select * into v_f from public.train_feedback
     where id = p_id and student_id = v_s.id;      -- so o proprio feedback dele
  else
    select * into v_f from public.train_feedback
     where student_id = v_s.id
       and created_at > now() - interval '30 minutes'
     order by created_at desc, id desc limit 1;
  end if;
  if v_f.id is null then return jsonb_build_object('ok', false); end if;

  return jsonb_build_object(
    'ok', true,
    'coach_id', v_s.coach_id,
    'aluno', v_s.name,
    'dor', v_f.dor,
    'divisao', v_f.divisao_nome,
    'nota', left(coalesce(v_f.nota,''), 140)
  );
end; $$;

revoke all on function public.feedback_dor_recente(uuid) from public, anon;
grant execute on function public.feedback_dor_recente(uuid) to authenticated;

-- O envio e do modo 'dor' da Edge Function push, que so dispara com dor >= 4.
