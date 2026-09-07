-- ============================================================
-- Recontar os recordes já gravados
-- ============================================================
-- NÃO RODEI ISTO. É uma alteração nos dados dos alunos e a decisão é sua.
--
-- Por que existe: até a versão 2026.10.24 a regra do recorde era
-- `carga > (melhor_do_exercicio || 0)`. Exercício que a pessoa nunca tinha
-- feito não tinha melhor, virava zero, e qualquer peso acima de zero entrava
-- como recorde.
--
-- O que isso deixou no banco (medido em 07/09/2026):
--   112 séries válidas com carga, 65 marcadas como recorde ....... 58%
--    39 são a PRIMEIRA série que a pessoa fez daquele exercício .. nada a superar
--    25 são a rampa do MESMO dia de estreia (20 kg, depois 30 kg)  nada a superar
--     1 caiu em dia posterior e nem assim superou a marca
--   ------------------------------------------------------------
--    65 falsas. Nenhum recorde de verdade, em nenhum aluno.
--
-- Marcadas como recorde, por aluno — e quantas resistem à regra certa:
--   Pedro 23 → 0 · Jefferson 16 → 0 · Elaine 13 → 0
--   Karen  7 → 0 · Vanessa    4 → 0 · Joyce   2 → 0
--
-- A razão de não sobrar nenhum: só uma pessoa (Elaine, num exercício) chegou a
-- repetir o mesmo exercício em outro dia. Todo o resto foi feito uma vez só.
-- Sem segundo dia não existe marca anterior — e sem marca anterior não existe
-- recorde. Quando eles voltarem ao mesmo exercício, o recorde volta a acontecer,
-- e aí vai valer alguma coisa.
--
-- O QUE O APP JÁ FAZ SOZINHO (2026.10.25), sem você rodar nada:
--   · grava certo daqui para a frente — estreia é "primeira marca", is_pr false;
--   · e RECONTA na hora de ler. A tela do aluno (recordes, retrospectiva do mês,
--     evolução, card de treino) e a tela de sessões que você abre por aluno já
--     ignoram o is_pr gravado e refazem a conta com a regra certa. Karen já vê
--     zero recorde em vez de sete, sem tocar no banco.
--
-- O QUE CONTINUA ERRADO SEM ESTE SCRIPT:
--   o painel "O mês" carrega só a janela de dois meses. Sem o histórico
--   inteiro não dá para saber se uma série é estreia ou não — a marca
--   anterior está fora da janela — então essa tela é a única que ainda lê o
--   is_pr gravado. Enquanto isso, o número de recordes do mês ali fica maior
--   que o que o aluno vê na tela dele. Rodando este script, as duas telas
--   passam a dizer a mesma coisa.
--
-- A REGRA, igual à do app (função recontarRecordes / "a marca a bater"):
--   · série tem de ser Válida e ter carga;
--   · no primeiro dia em que a pessoa fez aquele exercício não há recorde —
--     é a primeira marca, não havia o que bater;
--   · nos dias seguintes é recorde quem passa da maior carga já feita antes
--     daquela série, contando os dias anteriores e as séries anteriores do
--     mesmo dia. Subir de 45 para 50 kg é recorde; cair para 20 kg depois de
--     bater 45 no mesmo dia, não.
--
-- COMO USAR: rode o PASSO 1 e olhe. Se concordar, rode o 2 e depois o 3.
-- O passo 2 faz uma cópia antes de mexer em qualquer coisa.
-- ============================================================

-- ── PASSO 1: ver o que mudaria, sem mudar nada ──────────────
with v as (
  select h.*, a.name aluno
  from train_historico h
  join assess_students a on a.id = h.student_id
  where h.tipo_serie = 'Valida'
    and h.exercicio_id is not null
    and h.carga is not null
),
m as (
  select id, aluno, exercicio_nome, data_treino, carga, is_pr,
         -- maior carga em QUALQUER série anterior a esta
         max(carga) over (partition by student_id, exercicio_id
                          order by data_treino, indice_serie
                          rows between unbounded preceding and 1 preceding) marca_antes,
         -- primeiro dia em que ela fez este exercício: nesse dia não há recorde
         min(data_treino) over (partition by student_id, exercicio_id) estreou_em
  from v
)
select aluno, data_treino, exercicio_nome, carga,
       is_pr as marcado_hoje,
       (data_treino > estreou_em and carga > marca_antes) as deveria_ser,
       case when data_treino = estreou_em then '(primeira vez)'
            else marca_antes::text end as marca_anterior
from m
where is_pr <> (data_treino > estreou_em and carga > marca_antes)
order by aluno, data_treino, exercicio_nome;

-- ── PASSO 2: cópia de segurança (obrigatória antes do passo 3) ──
-- create table train_historico_bkp_recorde_20260907 as
--   select id, is_pr from train_historico;

-- ── PASSO 3: corrigir ───────────────────────────────────────
-- Só toca na coluna is_pr. Carga, reps, data e tudo o mais ficam intactos.
-- with v as (
--   select * from train_historico
--   where tipo_serie = 'Valida'
--     and exercicio_id is not null
--     and carga is not null
-- ),
-- m as (
--   select id, carga,
--          max(carga) over (partition by student_id, exercicio_id
--                           order by data_treino, indice_serie
--                           rows between unbounded preceding and 1 preceding) marca_antes,
--          data_treino,
--          min(data_treino) over (partition by student_id, exercicio_id) estreou_em
--   from v
-- )
-- update train_historico h
--    set is_pr = (m.data_treino > m.estreou_em and m.carga > m.marca_antes)
--   from m
--  where m.id = h.id
--    and h.is_pr <> (m.data_treino > m.estreou_em and m.carga > m.marca_antes);

-- ── Para desfazer, se você mudar de ideia ───────────────────
-- update train_historico h set is_pr = b.is_pr
--   from train_historico_bkp_recorde_20260907 b where b.id = h.id;
