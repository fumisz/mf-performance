-- Diário de saúde: a coluna que faltava e a assinatura que o app chama
--
-- O app pede diario_salvar(p_peso, p_sono, p_passos, p_fome, p_obs). A função
-- publicada era diario_salvar(p_peso, p_sono, p_energia, p_humor, p_dor,
-- p_passos, p_obs) — de quando sono, fadiga, estresse, dor e humor ainda
-- moravam no Diário. Eles foram para o Check-in e no lugar entrou a fome, mas
-- nem a coluna nem a assinatura acompanharam: o PostgREST não achava função
-- com esses nomes de parâmetro e TODO "Salvar diário de hoje" caía no
-- "Não consegui salvar seu diário". A tabela tem uma linha só, de 12/08.
--
-- Nada é removido aqui. A coluna é nova e a função de 7 argumentos continua
-- de pé: as duas convivem porque o PostgREST escolhe pela lista de nomes.

alter table public.train_diario add column if not exists fome int;

create or replace function public.diario_salvar(
  p_peso numeric, p_sono numeric, p_passos int, p_fome int, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
declare v_s record; v_key text;
begin
  select id, coach_id into v_s from public.assess_students where user_id = auth.uid() limit 1;
  if v_s.id is null then return; end if;
  v_key := v_s.id::text || '_' || to_char(current_date,'YYYY-MM-DD');
  insert into public.train_diario (id, student_id, coach_id, data, peso, sono, passos, fome, obs)
  values (v_key, v_s.id, v_s.coach_id, current_date, p_peso, p_sono, p_passos, p_fome, p_obs)
  on conflict (id) do update set peso=excluded.peso, sono=excluded.sono,
    passos=excluded.passos, fome=excluded.fome, obs=excluded.obs;
end; $$;

grant execute on function public.diario_salvar(numeric,numeric,int,int,text) to authenticated;
