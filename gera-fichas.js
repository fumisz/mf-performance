// Gera o SQL dos modelos de ficha novos. Escrever 14 fichas em JSON na mao e
// pedir erro de digitacao; aqui a estrutura sai sempre igual e os nomes de
// exercicio sao conferidos contra a biblioteca antes de gravar.
const fs=require('fs')

// nomes exatos da biblioteca (train_exercicios). Se algum nao existir, o app
// mostra o exercicio sem demonstracao — entao a lista e conferida no fim.
const BIBLIO=new Set(`Abdominal Bicicleta|Abdominal Infra|Abdominal na Polia|Abdominal Oblíquo|Abdominal Reverso no Solo|Abdominal Supra|Bicicleta no Solo|Caminhada do Fazendeiro|Dead Bug (Inseto Morto)|Elevação de Pernas|Escalador (Spider Crawl)|Prancha|Prancha Lateral|Prancha Lateral com Apoio|Rotação Russa|Vacuum Abdominal|Adução de Quadril com Elástico|Adução na Polia|Cadeira Adutora|Rosca Alternada|Rosca Concentrada|Rosca Direta|Rosca Inversa|Rosca Martelo|Rosca na Polia|Rosca Scott|Bicicleta|Corrida Estacionária (Skipping)|Elíptico|Escada|Esteira|Polichinelo (Star Jump)|Pular Corda|Remo Ergômetro|Barra Fixa|Barra Fixa com Elástico|Barra Fixa Pronada em Casa|Barra Fixa Supinada|Pulldown|Puxada Aberta|Puxada Frente|Puxada Supinada|Puxada Triângulo|Remada Alta na Polia|Remada Baixa|Remada Cavalinho|Remada Curvada|Remada Máquina|Remada Serrote|Remada Unilateral|Abdução com Elástico|Abdução de Quadril com Elástico|Abdução em Pé|Agachamento Sumô|Cadeira Abdutora|Círculos de Quadril em Prono|Coice na Polia|Coice Unilateral na Polia|Elevação de Perna Deitado de Lado|Elevação de Perna Lateral no Solo|Elevação Pélvica|Elevação Pélvica com Barra|Elevação Pélvica com Elástico|Extensão de Quadril com Elástico|Levantamento Terra Sumô|Ponte de Glúteo no Solo|Pull Through na Polia|Step-up com Elevação de Joelho|Hiperextensão Lombar|Hiperextensão sem Banco|Levantamento Terra|Superman|Superman no Solo|Abrir Elástico à Frente (Pull Apart)|Arnold Press|Crucifixo Inverso|Crucifixo Inverso com Elástico|Desenvolvimento com Barra|Desenvolvimento com Elástico|Desenvolvimento com Halteres|Desenvolvimento Máquina|Elevação Frontal|Elevação Frontal com Anilha|Elevação Lateral|Elevação Lateral com Elástico|Elevação Lateral na Polia|Encolhimento (Trapézio)|Face Pull|Remada Alta|Remada Alta com Elástico|Rotação Externa com Elástico|Rotação Interna com Elástico|Panturrilha com Elástico|Panturrilha em Pé|Panturrilha no Leg|Panturrilha Sentado|Crossover|Crossover Baixo|Crossover com Elástico|Crucifixo|Crucifixo Inclinado|Flexão com Pés Elevados|Flexão de Braço|Flexão de Braço Aberta|Flexão de Braço Inclinada|Flexão Inclinada|Flexão para Prancha Lateral|Peck Deck (Voador)|Pullover|Supino com Elástico|Supino Declinado|Supino Declinado com Halteres|Supino Inclinado|Supino Inclinado com Halteres|Supino Máquina|Supino Reto|Supino Reto com Halteres|Bom dia (Good Morning)|Bom dia com Elástico|Cadeira Flexora|Elevação Pélvica Unilateral|Flexora em Pé|Levantamento Terra Romeno|Mesa Flexora|Minhoca (Inchworm)|Nordic Curl (Flexão Nórdica)|Stiff|Swing com Kettlebell|Afundo|Afundo Estático (Split Squat)|Agachamento Búlgaro|Agachamento com Elástico|Agachamento com Salto|Agachamento Frontal|Agachamento Goblet|Agachamento Hack|Agachamento Isométrico na Parede|Agachamento Livre|Agachamento Livre sem Peso|Agachamento na Cadeira (sentar e levantar)|Agachamento Smith|Cadeira Extensora|Flexão de Quadril com Elástico|Leg Press|Passada (Walking Lunge)|Step-up|Step-up com Halteres|Subida no Degrau|Flexão de Braço Fechada|Mergulho (Dips)|Mergulho no Banco|Supino Fechado|Tríceps Barra na Polia|Tríceps Coice|Tríceps Corda|Tríceps Francês|Tríceps Sobre a Cabeça com Elástico|Tríceps Testa|Tríceps Testa com Elástico`.split('|'))

const faltando=new Set()
// e(nome, series, reps, descanso, tipo)
const e=(nome,qtd,reps,desc,tipo)=>{
  if(!BIBLIO.has(nome))faltando.add(nome)
  return{nome,qtd_series:qtd,faixa_reps:reps,intervalo_seg_min:desc,tipo_serie:tipo||'Valida'}
}
const aq=(nome,qtd,reps,desc)=>e(nome,qtd,reps,desc,'Aquecimento')
const div=(nome,exs)=>({nome,exercicios:exs.map((x,i)=>({...x,ordem:i}))})
const ficha=(nome,objetivo,nivel,resumo,divs)=>({
  nome,objetivo,nivel,dias:divs.length,resumo,
  divisoes:divs.map((d,i)=>({...d,ordem:i}))})

// ── nota comum sobre emagrecimento ──
// Quem perde gordura e o deficit calorico. O treino de forca esta aqui para
// segurar a massa magra enquanto o peso cai — e por isso ele e um treino de
// forca de verdade, nao um circuito para "queimar". O cardio entra no fim.
const NOTA_EMAG='O que emagrece é o déficit calórico. A musculação aqui existe para segurar a massa magra enquanto o peso cai — por isso é treino de força de verdade, com carga, e não circuito para suar. O cardio fica no fim para não roubar energia da parte que importa.'

const fichas=[]

/* ═══ EMAGRECIMENTO ═══ */

fichas.push(ficha('Emagrecimento — corpo inteiro (2x por semana)','Emagrecimento','Iniciante',
  'Para quem só consegue dois dias. Cada sessão cobre o corpo todo, então nenhum grupo fica uma semana sem estímulo. '+NOTA_EMAG,[
  div('A — Corpo inteiro',[
    aq('Esteira',1,'8 min leve',60),
    e('Agachamento Goblet',3,'10-12',90),
    e('Supino Máquina',3,'10-12',90),
    e('Remada Máquina',3,'10-12',90),
    e('Elevação Pélvica',3,'12-15',75),
    e('Prancha',3,'30-45 seg',60),
    e('Esteira',1,'15 min',0)]),
  div('B — Corpo inteiro',[
    aq('Bicicleta',1,'8 min leve',60),
    e('Leg Press',3,'12-15',90),
    e('Puxada Frente',3,'10-12',90),
    e('Desenvolvimento Máquina',3,'10-12',90),
    e('Cadeira Flexora',3,'12-15',75),
    e('Abdominal Supra',3,'15',45),
    e('Bicicleta',1,'15 min',0)])]))

fichas.push(ficha('Emagrecimento — corpo inteiro (3x por semana)','Emagrecimento','Iniciante',
  'Três dias de corpo inteiro, com ênfase girando entre pernas, empurrar e puxar. É a frequência que mais gente sustenta. '+NOTA_EMAG,[
  div('A — Ênfase pernas',[
    aq('Esteira',1,'6 min leve',60),
    e('Agachamento Livre',4,'8-10',120),
    e('Supino Reto com Halteres',3,'10-12',90),
    e('Remada Baixa',3,'10-12',90),
    e('Cadeira Flexora',3,'12-15',75),
    e('Prancha',3,'40 seg',60),
    e('Esteira',1,'15 min',0)]),
  div('B — Ênfase empurrar',[
    aq('Elíptico',1,'6 min leve',60),
    e('Supino Inclinado com Halteres',4,'8-10',120),
    e('Leg Press',3,'12-15',90),
    e('Desenvolvimento com Halteres',3,'10-12',90),
    e('Tríceps Corda',3,'12-15',60),
    e('Abdominal Infra',3,'15',45),
    e('Elíptico',1,'15 min',0)]),
  div('C — Ênfase puxar',[
    aq('Remo Ergômetro',1,'6 min leve',60),
    e('Puxada Frente',4,'8-10',120),
    e('Levantamento Terra Romeno',3,'10-12',105),
    e('Remada Serrote',3,'10-12',90),
    e('Rosca Direta',3,'12-15',60),
    e('Prancha Lateral',3,'30 seg cada lado',45),
    e('Remo Ergômetro',1,'15 min',0)])]))

fichas.push(ficha('Emagrecimento — Upper / Lower (4x por semana)','Emagrecimento','Intermediário',
  'Quatro dias divididos entre superior e inferior. Volume suficiente para segurar massa magra num déficit, sem sessões longas demais. '+NOTA_EMAG,[
  div('Upper A — Empurrar em ênfase',[
    aq('Elíptico',1,'6 min leve',60),
    e('Supino Reto',4,'8-10',120),
    e('Remada Curvada',4,'8-10',120),
    e('Desenvolvimento com Halteres',3,'10-12',90),
    e('Puxada Aberta',3,'10-12',90),
    e('Tríceps Corda',3,'12-15',60),
    e('Rosca Direta',3,'12-15',60)]),
  div('Lower A — Agachar',[
    aq('Bicicleta',1,'6 min leve',60),
    e('Agachamento Livre',4,'8-10',150),
    e('Leg Press',3,'12-15',105),
    e('Cadeira Flexora',3,'12-15',75),
    e('Elevação Pélvica com Barra',3,'10-12',90),
    e('Panturrilha em Pé',4,'12-15',60),
    e('Bicicleta',1,'15 min',0)]),
  div('Upper B — Puxar em ênfase',[
    aq('Remo Ergômetro',1,'6 min leve',60),
    e('Puxada Frente',4,'8-10',120),
    e('Supino Inclinado com Halteres',4,'8-10',120),
    e('Remada Máquina',3,'10-12',90),
    e('Elevação Lateral',3,'12-15',60),
    e('Rosca Martelo',3,'12-15',60),
    e('Tríceps Testa',3,'12-15',60)]),
  div('Lower B — Quadril',[
    aq('Esteira',1,'6 min leve',60),
    e('Levantamento Terra Romeno',4,'8-10',150),
    e('Agachamento Búlgaro',3,'10-12 cada perna',105),
    e('Cadeira Extensora',3,'12-15',75),
    e('Cadeira Abdutora',3,'15-20',60),
    e('Abdominal na Polia',3,'12-15',60),
    e('Esteira',1,'15 min',0)])]))

fichas.push(ficha('Emagrecimento — Upper / Lower + corpo inteiro (5x por semana)','Emagrecimento','Intermediário',
  'Cinco dias: superior, inferior, superior, inferior e um corpo inteiro mais curto no quinto. Para quem tem a semana livre e quer gasto calórico maior sem cortar mais comida. '+NOTA_EMAG,[
  div('Upper A',[
    aq('Elíptico',1,'6 min leve',60),
    e('Supino Reto',4,'8-10',120),
    e('Remada Curvada',4,'8-10',120),
    e('Desenvolvimento com Halteres',3,'10-12',90),
    e('Puxada Supinada',3,'10-12',90),
    e('Elevação Lateral',3,'12-15',60),
    e('Tríceps Corda',3,'12-15',60)]),
  div('Lower A',[
    aq('Bicicleta',1,'6 min leve',60),
    e('Agachamento Livre',4,'8-10',150),
    e('Levantamento Terra Romeno',3,'10-12',120),
    e('Leg Press',3,'12-15',105),
    e('Cadeira Flexora',3,'12-15',75),
    e('Panturrilha em Pé',4,'12-15',60)]),
  div('Upper B',[
    aq('Remo Ergômetro',1,'6 min leve',60),
    e('Puxada Frente',4,'8-10',120),
    e('Supino Inclinado com Halteres',4,'8-10',120),
    e('Remada Serrote',3,'10-12 cada lado',90),
    e('Crucifixo Inverso',3,'12-15',60),
    e('Rosca Direta',3,'12-15',60),
    e('Tríceps Testa',3,'12-15',60)]),
  div('Lower B',[
    aq('Esteira',1,'6 min leve',60),
    e('Agachamento Búlgaro',4,'10-12 cada perna',120),
    e('Elevação Pélvica com Barra',4,'10-12',105),
    e('Mesa Flexora',3,'12-15',75),
    e('Cadeira Extensora',3,'12-15',75),
    e('Panturrilha Sentado',4,'15',60)]),
  div('E — Corpo inteiro curto + cardio',[
    aq('Esteira',1,'5 min leve',60),
    e('Agachamento Goblet',3,'12-15',75),
    e('Remada Máquina',3,'12-15',75),
    e('Supino Máquina',3,'12-15',75),
    e('Prancha',3,'45 seg',60),
    e('Esteira',1,'20 min',0)])]))

fichas.push(ficha('Emagrecimento feminino — ênfase glúteo e posterior (4x por semana)','Emagrecimento','Intermediário',
  'A estrutura é a mesma de qualquer emagrecimento — o que muda é a ênfase, puxada para glúteo, posterior e abdutores, que é o que a maioria das alunas pede. '+NOTA_EMAG,[
  div('Inferior A — Quadril',[
    aq('Bicicleta',1,'6 min leve',60),
    e('Elevação Pélvica com Barra',4,'8-12',120),
    e('Agachamento Sumô',4,'10-12',105),
    e('Levantamento Terra Romeno',3,'10-12',105),
    e('Cadeira Abdutora',4,'15-20',60),
    e('Panturrilha em Pé',3,'15',45)]),
  div('Superior A',[
    aq('Elíptico',1,'6 min leve',60),
    e('Puxada Frente',4,'10-12',90),
    e('Supino Inclinado com Halteres',3,'10-12',90),
    e('Remada Baixa',3,'10-12',90),
    e('Elevação Lateral',3,'12-15',60),
    e('Tríceps Corda',3,'12-15',60),
    e('Abdominal na Polia',3,'12-15',60)]),
  div('Inferior B — Coxa e glúteo',[
    aq('Esteira',1,'6 min leve',60),
    e('Agachamento Búlgaro',4,'10-12 cada perna',120),
    e('Leg Press',4,'12-15',105),
    e('Mesa Flexora',3,'12-15',75),
    e('Coice na Polia',3,'12-15 cada perna',60),
    e('Abdução em Pé',3,'15-20 cada lado',45),
    e('Esteira',1,'15 min',0)]),
  div('Inferior C — Glúteo em volume',[
    aq('Bicicleta',1,'6 min leve',60),
    e('Elevação Pélvica Unilateral',4,'12 cada perna',90),
    e('Pull Through na Polia',4,'12-15',75),
    e('Step-up com Halteres',3,'10-12 cada perna',90),
    e('Cadeira Abdutora',4,'20',60),
    e('Prancha',3,'45 seg',60),
    e('Bicicleta',1,'15 min',0)])]))

fichas.push(ficha('Emagrecimento masculino — ênfase superior (4x por semana)','Emagrecimento','Intermediário',
  'Mesma estrutura, ênfase puxada para peito, costas e ombro — a queixa mais comum entre os alunos homens é perder braço junto com a barriga. '+NOTA_EMAG,[
  div('Superior A — Empurrar',[
    aq('Elíptico',1,'6 min leve',60),
    e('Supino Reto',4,'8-10',120),
    e('Desenvolvimento com Barra',4,'8-10',120),
    e('Supino Inclinado com Halteres',3,'10-12',90),
    e('Elevação Lateral',4,'12-15',60),
    e('Tríceps Testa',3,'10-12',75),
    e('Tríceps Corda',3,'12-15',60)]),
  div('Inferior A',[
    aq('Bicicleta',1,'6 min leve',60),
    e('Agachamento Livre',4,'8-10',150),
    e('Levantamento Terra Romeno',3,'10-12',120),
    e('Leg Press',3,'12-15',105),
    e('Cadeira Flexora',3,'12-15',75),
    e('Panturrilha em Pé',4,'12-15',60)]),
  div('Superior B — Puxar',[
    aq('Remo Ergômetro',1,'6 min leve',60),
    e('Barra Fixa',4,'até a falha',120),
    e('Remada Curvada',4,'8-10',120),
    e('Puxada Triângulo',3,'10-12',90),
    e('Crucifixo Inverso',3,'12-15',60),
    e('Rosca Direta',3,'10-12',75),
    e('Rosca Martelo',3,'12-15',60)]),
  div('Superior C + abdômen',[
    aq('Esteira',1,'6 min leve',60),
    e('Supino Declinado com Halteres',3,'10-12',90),
    e('Remada Máquina',3,'10-12',90),
    e('Crossover',3,'12-15',60),
    e('Face Pull',3,'15',60),
    e('Abdominal na Polia',4,'12-15',60),
    e('Esteira',1,'20 min',0)])]))

/* ═══ HIPERTROFIA — frequências que faltavam ═══ */

fichas.push(ficha('Corpo inteiro — Hipertrofia (2x por semana)','Hipertrofia','Intermediário',
  'Dois dias de corpo inteiro com volume concentrado. Cada músculo é estimulado duas vezes na semana, que é o que a literatura mostra render mais do que uma. Sessão longa: reserve 70 minutos.',[
  div('A — Corpo inteiro',[
    aq('Agachamento Livre',2,'10 leve',90),
    e('Agachamento Livre',4,'6-8',150),
    e('Supino Reto',4,'6-8',150),
    e('Remada Curvada',4,'8-10',120),
    e('Levantamento Terra Romeno',3,'8-10',120),
    e('Desenvolvimento com Halteres',3,'10-12',90),
    e('Rosca Direta',3,'10-12',60),
    e('Tríceps Testa',3,'10-12',60)]),
  div('B — Corpo inteiro',[
    aq('Leg Press',2,'12 leve',90),
    e('Leg Press',4,'10-12',120),
    e('Puxada Frente',4,'8-10',120),
    e('Supino Inclinado com Halteres',4,'8-10',120),
    e('Agachamento Búlgaro',3,'10-12 cada perna',105),
    e('Elevação Lateral',3,'12-15',60),
    e('Rosca Martelo',3,'10-12',60),
    e('Tríceps Corda',3,'12-15',60)])]))

fichas.push(ficha('Corpo inteiro — Hipertrofia (3x por semana)','Hipertrofia','Intermediário',
  'Três dias de corpo inteiro com o padrão principal girando: agachar, empurrar, puxar. Boa escolha para quem não gosta de dividir por músculo e para quem falta um dia sem estragar a semana.',[
  div('A — Agachar',[
    aq('Agachamento Livre',2,'10 leve',90),
    e('Agachamento Livre',4,'6-8',150),
    e('Supino Inclinado',3,'8-10',120),
    e('Remada Baixa',3,'8-10',120),
    e('Cadeira Flexora',3,'12-15',75),
    e('Elevação Lateral',3,'12-15',60),
    e('Abdominal na Polia',3,'12-15',60)]),
  div('B — Empurrar',[
    aq('Supino Reto',2,'10 leve',90),
    e('Supino Reto',4,'6-8',150),
    e('Desenvolvimento com Barra',4,'8-10',120),
    e('Leg Press',3,'10-12',120),
    e('Puxada Aberta',3,'10-12',90),
    e('Tríceps Testa',3,'10-12',60),
    e('Panturrilha em Pé',4,'12-15',60)]),
  div('C — Puxar',[
    aq('Puxada Frente',2,'12 leve',60),
    e('Levantamento Terra',4,'5-6',180),
    e('Barra Fixa',4,'até a falha',120),
    e('Remada Cavalinho',3,'8-10',120),
    e('Supino Declinado com Halteres',3,'10-12',90),
    e('Rosca Direta',3,'10-12',60),
    e('Prancha',3,'45 seg',60)])]))

fichas.push(ficha('Corpo inteiro — Hipertrofia (4x por semana)','Hipertrofia','Intermediário',
  'Quatro dias de corpo inteiro com quatro sessões diferentes: cada músculo aparece de duas a três vezes na semana, com poucas séries por sessão. Alto rendimento para quem se recupera bem.',[
  div('A — Agachamento e supino',[
    e('Agachamento Livre',4,'6-8',150),
    e('Supino Reto',4,'6-8',150),
    e('Remada Serrote',3,'10-12 cada lado',90),
    e('Elevação Lateral',3,'12-15',60),
    e('Abdominal Supra',3,'15',45)]),
  div('B — Terra e puxada',[
    e('Levantamento Terra Romeno',4,'8-10',150),
    e('Puxada Frente',4,'8-10',120),
    e('Desenvolvimento com Halteres',3,'10-12',90),
    e('Rosca Martelo',3,'10-12',60),
    e('Panturrilha Sentado',4,'15',60)]),
  div('C — Leg press e inclinado',[
    e('Leg Press',4,'10-12',120),
    e('Supino Inclinado com Halteres',4,'8-10',120),
    e('Remada Máquina',3,'10-12',90),
    e('Tríceps Corda',3,'12-15',60),
    e('Prancha',3,'45 seg',60)]),
  div('D — Unilateral e barra',[
    e('Agachamento Búlgaro',4,'10-12 cada perna',120),
    e('Barra Fixa',4,'até a falha',120),
    e('Crossover',3,'12-15',60),
    e('Cadeira Flexora',3,'12-15',75),
    e('Face Pull',3,'15',60)])]))

fichas.push(ficha('Upper / Lower — Hipertrofia (4x por semana)','Hipertrofia','Intermediário',
  'A divisão mais confiável para quem já passou do começo: dois superiores e dois inferiores, cada grupo estimulado duas vezes por semana. Existe a versão de força na biblioteca; esta é a de volume.',[
  div('Upper A — Empurrar em ênfase',[
    aq('Supino Reto',2,'10 leve',90),
    e('Supino Reto',4,'8-10',120),
    e('Desenvolvimento com Halteres',4,'8-10',105),
    e('Remada Curvada',3,'8-10',105),
    e('Crucifixo Inclinado',3,'12-15',75),
    e('Elevação Lateral',4,'12-15',60),
    e('Tríceps Testa',3,'10-12',60),
    e('Rosca Direta',3,'10-12',60)]),
  div('Lower A — Agachar',[
    aq('Agachamento Livre',2,'10 leve',90),
    e('Agachamento Livre',4,'8-10',150),
    e('Leg Press',4,'10-12',120),
    e('Cadeira Flexora',3,'12-15',75),
    e('Elevação Pélvica com Barra',3,'10-12',90),
    e('Panturrilha em Pé',4,'12-15',60),
    e('Abdominal na Polia',3,'12-15',60)]),
  div('Upper B — Puxar em ênfase',[
    aq('Puxada Frente',2,'12 leve',60),
    e('Barra Fixa',4,'até a falha',120),
    e('Remada Cavalinho',4,'8-10',120),
    e('Supino Inclinado com Halteres',3,'10-12',105),
    e('Crucifixo Inverso',3,'12-15',60),
    e('Rosca Martelo',3,'10-12',60),
    e('Tríceps Corda',3,'12-15',60),
    e('Face Pull',3,'15',60)]),
  div('Lower B — Posterior em ênfase',[
    aq('Levantamento Terra Romeno',2,'10 leve',90),
    e('Levantamento Terra Romeno',4,'8-10',150),
    e('Agachamento Búlgaro',3,'10-12 cada perna',120),
    e('Mesa Flexora',4,'12-15',75),
    e('Cadeira Extensora',3,'12-15',75),
    e('Cadeira Abdutora',3,'15-20',60),
    e('Panturrilha Sentado',4,'15',60)])]))

fichas.push(ficha('Upper / Lower — Hipertrofia (5x por semana)','Hipertrofia','Intermediário',
  'O upper/lower de quatro dias com um quinto dia de pontos fracos: braço, ombro e panturrilha, que são os que costumam ficar para trás nas divisões grandes.',[
  div('Upper A',[
    e('Supino Reto',4,'8-10',120),
    e('Remada Curvada',4,'8-10',120),
    e('Desenvolvimento com Halteres',3,'10-12',90),
    e('Puxada Aberta',3,'10-12',90),
    e('Elevação Lateral',3,'12-15',60),
    e('Tríceps Testa',3,'10-12',60)]),
  div('Lower A',[
    e('Agachamento Livre',4,'8-10',150),
    e('Leg Press',4,'10-12',120),
    e('Cadeira Flexora',3,'12-15',75),
    e('Elevação Pélvica com Barra',3,'10-12',90),
    e('Panturrilha em Pé',4,'12-15',60)]),
  div('Upper B',[
    e('Barra Fixa',4,'até a falha',120),
    e('Supino Inclinado com Halteres',4,'8-10',120),
    e('Remada Máquina',3,'10-12',90),
    e('Crucifixo Inverso',3,'12-15',60),
    e('Rosca Direta',3,'10-12',60),
    e('Tríceps Corda',3,'12-15',60)]),
  div('Lower B',[
    e('Levantamento Terra Romeno',4,'8-10',150),
    e('Agachamento Búlgaro',4,'10-12 cada perna',120),
    e('Mesa Flexora',3,'12-15',75),
    e('Cadeira Extensora',3,'12-15',75),
    e('Panturrilha Sentado',4,'15',60)]),
  div('E — Pontos fracos',[
    e('Elevação Lateral',4,'15',45),
    e('Face Pull',4,'15',45),
    e('Rosca Scott',4,'10-12',60),
    e('Tríceps Barra na Polia',4,'12-15',60),
    e('Rosca Martelo',3,'12-15',45),
    e('Panturrilha em Pé',5,'15-20',45),
    e('Abdominal na Polia',4,'12-15',60)])]))

/* ═══ PUSH / PULL / LEGS ═══ */

fichas.push(ficha('Push / Pull / Legs (3x por semana)','Hipertrofia','Intermediário',
  'O PPL rodando uma vez por semana, para quem tem três dias. Cada sessão junta os músculos que trabalham no mesmo sentido, então nada é treinado dois dias seguidos.',[
  div('Push — Peito, ombro e tríceps',[
    aq('Supino Reto',2,'10 leve',90),
    e('Supino Reto',4,'6-8',150),
    e('Desenvolvimento com Halteres',4,'8-10',120),
    e('Supino Inclinado com Halteres',3,'10-12',105),
    e('Elevação Lateral',4,'12-15',60),
    e('Crossover',3,'12-15',60),
    e('Tríceps Testa',3,'10-12',60),
    e('Tríceps Corda',3,'12-15',60)]),
  div('Pull — Costas e bíceps',[
    aq('Puxada Frente',2,'12 leve',60),
    e('Barra Fixa',4,'até a falha',120),
    e('Remada Curvada',4,'8-10',150),
    e('Puxada Triângulo',3,'10-12',90),
    e('Remada Serrote',3,'10-12 cada lado',90),
    e('Crucifixo Inverso',3,'12-15',60),
    e('Rosca Direta',3,'10-12',60),
    e('Rosca Martelo',3,'12-15',60)]),
  div('Legs — Pernas e abdômen',[
    aq('Agachamento Livre',2,'10 leve',90),
    e('Agachamento Livre',4,'6-8',180),
    e('Levantamento Terra Romeno',4,'8-10',150),
    e('Leg Press',3,'12-15',120),
    e('Cadeira Flexora',3,'12-15',75),
    e('Panturrilha em Pé',4,'12-15',60),
    e('Abdominal na Polia',3,'12-15',60)])]))

fichas.push(ficha('Push / Pull / Legs + Upper / Lower (5x por semana)','Hipertrofia','Intermediário',
  'Cinco dias que resolvem o problema do PPL de seis: o push, pull e legs abrem a semana e os dois últimos dias são um superior e um inferior mais leves, para o volume subir sem tirar o fim de semana.',[
  div('Push',[
    e('Supino Reto',4,'6-8',150),
    e('Desenvolvimento com Barra',4,'8-10',120),
    e('Supino Inclinado com Halteres',3,'10-12',105),
    e('Elevação Lateral',4,'12-15',60),
    e('Tríceps Testa',3,'10-12',60),
    e('Tríceps Corda',3,'12-15',60)]),
  div('Pull',[
    e('Barra Fixa',4,'até a falha',120),
    e('Remada Cavalinho',4,'8-10',150),
    e('Puxada Aberta',3,'10-12',90),
    e('Face Pull',3,'15',60),
    e('Rosca Direta',3,'10-12',60),
    e('Rosca Martelo',3,'12-15',60)]),
  div('Legs',[
    e('Agachamento Livre',4,'6-8',180),
    e('Levantamento Terra Romeno',4,'8-10',150),
    e('Leg Press',3,'12-15',120),
    e('Mesa Flexora',3,'12-15',75),
    e('Panturrilha em Pé',4,'12-15',60)]),
  div('Upper — leve',[
    e('Supino Inclinado',3,'10-12',90),
    e('Remada Máquina',3,'10-12',90),
    e('Desenvolvimento Máquina',3,'12-15',75),
    e('Crucifixo Inverso',3,'15',60),
    e('Rosca na Polia',3,'12-15',60),
    e('Tríceps Barra na Polia',3,'12-15',60)]),
  div('Lower — leve',[
    e('Agachamento Búlgaro',3,'12 cada perna',105),
    e('Cadeira Extensora',3,'15',75),
    e('Cadeira Flexora',3,'15',75),
    e('Elevação Pélvica com Barra',3,'12-15',90),
    e('Panturrilha Sentado',4,'15-20',60),
    e('Prancha',3,'45 seg',60)])]))

fichas.push(ficha('Arnold Split — peito/costas, ombro/braços, pernas (6x por semana)','Hipertrofia','Avançado',
  'A divisão clássica do fisiculturismo dos anos 70, rodando duas vezes na semana. Volume alto e sessões de peito com costas no mesmo dia, que é o que dá o efeito de "abrir" o tronco. Só para quem já treina há anos e dorme bem.',[
  div('A — Peito e costas',[
    aq('Supino Reto',2,'10 leve',90),
    e('Supino Reto',4,'8-10',120),
    e('Barra Fixa',4,'até a falha',120),
    e('Supino Inclinado com Halteres',4,'8-10',105),
    e('Remada Curvada',4,'8-10',105),
    e('Crucifixo',3,'12-15',60),
    e('Pullover',3,'12-15',60),
    e('Remada Baixa',3,'10-12',75)]),
  div('B — Ombro e braços',[
    aq('Desenvolvimento com Halteres',2,'12 leve',60),
    e('Desenvolvimento com Barra',4,'8-10',120),
    e('Elevação Lateral',4,'12-15',60),
    e('Crucifixo Inverso',4,'12-15',60),
    e('Rosca Direta',4,'8-10',75),
    e('Tríceps Testa',4,'8-10',75),
    e('Rosca Scott',3,'12-15',60),
    e('Tríceps Corda',3,'12-15',60)]),
  div('C — Pernas',[
    aq('Agachamento Livre',2,'10 leve',90),
    e('Agachamento Livre',5,'6-8',180),
    e('Leg Press',4,'10-12',150),
    e('Levantamento Terra Romeno',4,'8-10',150),
    e('Cadeira Extensora',3,'15',75),
    e('Mesa Flexora',3,'12-15',75),
    e('Panturrilha em Pé',5,'15',60),
    e('Abdominal na Polia',4,'12-15',60)])]))

/* ── conferencia e saida ── */
if(faltando.size){
  console.error('EXERCICIOS FORA DA BIBLIOTECA:',[...faltando].join(', '))
  process.exit(1)
}
// Formato compacto: uma linha por ficha. O JSON inteiro daria 52 KB de chave
// repetida; aqui a estrutura e montada pelo proprio SQL na hora de inserir.
//   fichas   separadas por linha
//   divisoes separadas por  ~     ->  NomeDaDivisao ^ exercicios
//   exercicios separados por |    ->  nome ; series ; reps ; descanso ; tipo
const PROIBIDO=/[;|~^']/
const linhas=fichas.map(f=>{
  const corpo=f.divisoes.map(d=>{
    if(PROIBIDO.test(d.nome))throw new Error('separador no nome da divisao: '+d.nome)
    return d.nome+'^'+d.exercicios.map(x=>{
      if(PROIBIDO.test(x.nome)||PROIBIDO.test(x.faixa_reps))
        throw new Error('separador no exercicio: '+x.nome+' / '+x.faixa_reps)
      return [x.nome,x.qtd_series,x.faixa_reps,x.intervalo_seg_min,x.tipo_serie].join(';')
    }).join('|')
  }).join('~')
  const esc=s=>String(s).replace(/'/g,"''")
  return `  ('${esc(f.nome)}','${esc(f.objetivo)}','${esc(f.nivel)}','${esc(f.resumo)}',\n   '${esc(corpo)}')`
})

const sql=`-- Modelos de ficha por frequência (2x a 6x) e para emagrecimento.
--
-- Gerado por gera-fichas.js, que confere cada nome de exercício contra a
-- biblioteca (train_exercicios) antes de escrever — assim todos abrem com
-- demonstração no app.
--
-- coach_id nulo = modelo público, aparece para todo treinador.
-- "dias" é a quantidade de divisões distintas; a frequência semanal está no
-- nome, seguindo o que a tabela já usava.
--
-- Formato de cada linha, para caber e continuar legível:
--   divisões separadas por  ~   ->  Nome da divisão ^ exercícios
--   exercícios separados por |  ->  nome ; séries ; reps ; descanso ; tipo
-- O SQL abaixo expande isso no jsonb que a tabela guarda.

with dados(nome, objetivo, nivel, resumo, corpo) as (values
${linhas.join(',\n')}
),
divs as (
  select d.nome, d.objetivo, d.nivel, d.resumo,
         dv.txt as divtxt, dv.i - 1 as ordem_div
  from dados d,
       unnest(string_to_array(d.corpo, '~')) with ordinality as dv(txt, i)
),
exs as (
  select v.*, ex.txt as extxt, ex.i - 1 as ordem_ex
  from divs v,
       unnest(string_to_array(split_part(v.divtxt, '^', 2), '|')) with ordinality as ex(txt, i)
),
por_divisao as (
  select nome, objetivo, nivel, resumo, ordem_div,
         split_part(divtxt, '^', 1) as div_nome,
         jsonb_agg(jsonb_build_object(
           'nome',              split_part(extxt, ';', 1),
           'qtd_series',        split_part(extxt, ';', 2)::int,
           'faixa_reps',        split_part(extxt, ';', 3),
           'intervalo_seg_min', split_part(extxt, ';', 4)::int,
           'tipo_serie',        split_part(extxt, ';', 5),
           'ordem',             ordem_ex
         ) order by ordem_ex) as exercicios
  from exs
  group by nome, objetivo, nivel, resumo, ordem_div, divtxt
),
pronta as (
  select nome, objetivo, nivel, resumo,
         count(*)::int as dias,
         jsonb_agg(jsonb_build_object(
           'nome', div_nome, 'ordem', ordem_div, 'exercicios', exercicios
         ) order by ordem_div) as divisoes
  from por_divisao
  group by nome, objetivo, nivel, resumo
)
insert into public.train_ficha_modelo (coach_id, nome, objetivo, nivel, dias, resumo, divisoes)
select null, p.nome, p.objetivo, p.nivel, p.dias, p.resumo, p.divisoes
from pronta p
where not exists (
  select 1 from public.train_ficha_modelo m
  where m.nome = p.nome and m.coach_id is null
);
`
fs.writeFileSync('/home/user/mf-performance/fichas-frequencia.sql',sql)
const series=fichas.reduce((a,f)=>a+f.divisoes.reduce((b,d)=>b+d.exercicios.reduce((c,x)=>c+x.qtd_series,0),0),0)
console.log(fichas.length,'fichas |',fichas.reduce((a,f)=>a+f.dias,0),'divisoes |',
  fichas.reduce((a,f)=>a+f.divisoes.reduce((b,d)=>b+d.exercicios.length,0),0),'exercicios |',series,'series')
console.log('SQL:',Math.round(sql.length/1024),'KB — todos os exercicios existem na biblioteca')
