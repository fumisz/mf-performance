// MF Performance — codigo do app.
// Este e o ARQUIVO-FONTE. O que vai para o celular e o app.js, gerado
// daqui por `node build.js` — nao edite o app.js na mao.
const { useState, useEffect, useRef, useCallback } = React;

/* ── Helpers ── */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
// Número para MOSTRAR na tela, em português: 24,3 e não 24.3. Só exibição —
// nenhum campo de entrada nem exportação passa por aqui.
const fmt = (n,d=1)=>(n!=null&&n!==''&&!isNaN(parseFloat(n)))
  ? parseFloat(n).toFixed(d).replace('.',',') : '—';
/* Número que vem cru do banco e vai direto para o papel. Diferente do fmt: não
   força casa decimal (165 continua 165, não vira 165,0) e põe separador de
   milhar. Deixa passar sem tocar o que já veio formatado — assim serve numa
   coluna onde alguns valores já passaram pelo fmt e outros não, que era
   exatamente o caso do relatório: "22,1" e "60.1" na mesma tabela. */
/* "setembro de 2026" -> "Setembro de 2026". O text-transform:capitalize do CSS
   põe maiúscula em TODA palavra e escrevia "Setembro De 2026" — em português o
   "de" fica minúsculo, e nome de mês também. */
const maiusculaInicial = s=>{const t=String(s||'');return t.charAt(0).toUpperCase()+t.slice(1);};
/* Lista dentro de uma frase: "força e performance", não "força, performance".
   Vírgula no lugar do "e" é como uma máquina emenda itens — e o relatório é
   assinado pelo treinador. */
const listaE = arr=>{
  const l=(arr||[]).filter(Boolean);
  if(l.length<=1)return l[0]||'';
  return l.slice(0,-1).join(', ')+' e '+l[l.length-1];
};
const numBR = v=>{
  if(v==null||v==='')return v;
  const s=String(v);
  if(!/^-?\d+(\.\d+)?$/.test(s))return s;
  return parseFloat(s).toLocaleString('pt-BR',{maximumFractionDigits:1});
};
const fmtDate = d=>d?new Date(d+'T00:00:00').toLocaleDateString('pt-BR'):'—';
// data de um timestamp (created_at). fmtDate só serve para 'AAAA-MM-DD'.
const fmtTime = t=>{if(!t)return'—';const d=new Date(t);return isNaN(d)?'—':d.toLocaleDateString('pt-BR');};
// "1 aluno" / "2 alunos". O "(s)" entre parenteses e jeito de formulario, nao
// de app: quem le sabe quantos sao, o texto tem que saber tambem.
const plural=(n,um,muitos)=>n+' '+(n===1?um:(muitos||um+'s'));
// So o rotulo, sem o numero: o bloco de estatistica ja mostra o valor em cima.
const rotuloN=(n,um,muitos)=>n===1?um:(muitos||um+'s');
const tempoRel = iso=>{if(!iso)return'';const s=Math.floor((Date.now()-new Date(iso).getTime())/1000);
  if(s<60)return'agora';if(s<3600)return'há '+Math.floor(s/60)+' min';if(s<86400)return'há '+Math.floor(s/3600)+'h';
  const d=Math.floor(s/86400);if(d<7)return'há '+d+(d===1?' dia':' dias');return new Date(iso).toLocaleDateString('pt-BR');};
const initials = name=>(name||'?').split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase();
const age = dob=>dob?Math.floor((Date.now()-new Date(dob))/31557600000):null;
const num = v=>{const n=parseFloat(v);return isNaN(n)?null:n;};
function load(k,def){try{const v=localStorage.getItem('mfp_'+k);return v!=null?JSON.parse(v):def;}catch{return def;}}
const save=(k,v)=>{try{localStorage.setItem('mfp_'+k,JSON.stringify(v));}catch{}};

/* ── Supabase (mesmo projeto do MF Nutrition) ── */
const CFG = window.MFP_CONFIG || {};
const CONFIGURED = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
let sb = null;
if (CONFIGURED && window.supabase) sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
/* Dispara a chamada e não espera resposta.
   Cuidado: o que sb.rpc()/sb.from() devolvem NÃO é Promise — tem .then, não tem
   .catch. Chamar .catch direto estoura TypeError, e dentro de um useEffect isso
   derruba a tela inteira do aluno. */
const semEsperar=q=>{try{q.then(()=>{},()=>{});}catch(e){}};
const APP_VERSION='2026.10.16';   // aparece na tela; serve para conferir se a atualizacao subiu
const todayStr = () => new Date().toLocaleDateString('en-CA');
const dayKey = d => d.toLocaleDateString('en-CA');   // YYYY-MM-DD no fuso LOCAL

/* O histórico que a tela do aluno carrega na abertura. Ficou numa constante
   porque é lido em dois lugares e uma coluna esquecida some sem barulho: a
   tonelagem já ficou zerada em produção por faltar reps aqui, e o teste não
   pegou porque o servidor de mentira devolvia a linha inteira. */
const COLUNAS_HIST='exercicio_id,exercicio_nome,carga,reps,data_treino,tipo_serie,is_pr,divisao_id';

/* ── Sessões de treino ──
   O train_historico guarda uma linha POR SÉRIE. Para olhar o treino como ele
   aconteceu — "terça, treino B, 18 séries, 4,2 t" — as linhas precisam voltar a
   ser sessão. Serve para o aluno (Meus treinos) e para o treinador (o que ele
   fez de verdade), então mora aqui fora e não dentro de uma tela. */
function agruparSessoes(hist){
  const dias=new Map();
  (hist||[]).forEach(h=>{
    const d=h.data_treino;if(!d)return;
    if(!dias.has(d))dias.set(d,{data:d,divisoes:new Set(),exercicios:new Map(),
      series:0,tonelagem:0,prs:0,externos:[],ultimo:null});
    const s=dias.get(d);
    // a hora da última série é o que diz se o treino ainda está rolando
    if(h.registrado_em&&(!s.ultimo||h.registrado_em>s.ultimo))s.ultimo=h.registrado_em;
    if(h.tipo_serie==='Externo'){
      s.externos.push({nome:h.exercicio_nome||'Treino externo',obs:h.observacao||null});
      return;
    }
    s.series++;
    const carga=num(h.carga)||0,reps=num(h.reps)||0;
    s.tonelagem+=carga*reps;
    if(h.is_pr)s.prs++;
    if(h.divisao_id)s.divisoes.add(h.divisao_id);
    const k=h.exercicio_id||h.exercicio_nome||'?';
    if(!s.exercicios.has(k))s.exercicios.set(k,{nome:h.exercicio_nome||'Exercício',sets:[]});
    s.exercicios.get(k).sets.push({carga:num(h.carga),reps:num(h.reps),
      tipo:h.tipo_serie,pr:!!h.is_pr,i:h.indice_serie||0});
  });
  return [...dias.values()].map(s=>{
    const exercicios=[...s.exercicios.values()];
    exercicios.forEach(e=>e.sets.sort((a,b)=>(a.i||0)-(b.i||0)));
    return {...s,divisoes:[...s.divisoes],exercicios,
      tonelagem:Math.round(s.tonelagem),
      soExterno:s.series===0&&s.externos.length>0};
  }).sort((a,b)=>a.data<b.data?1:-1);   // mais recente primeiro
}
const fmtTon = kg=>kg>=1000?(kg/1000).toFixed(1).replace('.',',')+' t':Math.round(kg)+' kg';
// "47 toneladas" não diz nada; "o peso de 39 carros" é post. Os pesos são
// aproximados de propósito e o texto diz "mais ou menos" — número redondo que
// se entende vale mais aqui do que precisão que ninguém confere.
function equivalePeso(kg){
  if(!kg||kg<400)return null;
  const t=kg/1000;
  if(t<12) return plural(Math.max(1,Math.round(kg/1200)),'carro popular','carros populares');
  if(t<200)return Math.max(1,Math.round(t/12))+' ônibus';   // ônibus não muda no plural
  return plural(Math.max(1,Math.round(t/180)),'avião de carreira','aviões de carreira');
}
// Qual divisão ele fez por último — é o que diz qual vem agora no rodízio.
function divisaoMaisRecente(hist){
  let melhor=null;
  (hist||[]).forEach(h=>{
    if(!h.divisao_id||!h.data_treino)return;
    if(!melhor||h.data_treino>melhor.data)melhor={id:h.divisao_id,data:h.data_treino};
  });
  return melhor?melhor.id:null;
}
const fmtCarga = c=>c==null?'—':String(c).replace('.',',');
// Dias da semana no padrão ISO: 1=segunda ... 7=domingo.
const DIAS_SEMANA=[[1,'Seg'],[2,'Ter'],[3,'Qua'],[4,'Qui'],[5,'Sex'],[6,'Sáb'],[7,'Dom']];
const diaHojeISO=()=>{const d=new Date().getDay();return d===0?7:d;};   // Date: 0=domingo
const listaDias=arr=>(arr||[]).slice().sort((a,b)=>a-b)
  .map(n=>(DIAS_SEMANA.find(d=>d[0]===n)||[,'?'])[1]).join(', ');
// "hoje" / "ontem" / "terça, 12 de agosto" — data que se lê sem contar nos dedos
function diaPorExtenso(d){
  if(!d)return'';
  if(d===todayStr())return'Hoje';
  const on=new Date();on.setDate(on.getDate()-1);
  if(d===dayKey(on))return'Ontem';
  const dt=new Date(d+'T00:00:00');
  const s=dt.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  return s.charAt(0).toUpperCase()+s.slice(1);
}

/* ── Nutrição: helpers compartilhados com o MF Nutrition ──
   Os dois apps rodam no mesmo projeto Supabase e o aluno é o mesmo
   auth.user, então student_id das tabelas de dieta == profiles.id. */
const n0 = v => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
function sumItems(items){
  return (items||[]).reduce((a,i)=>({
    kcal:a.kcal+n0(i.kcal), protein:a.protein+n0(i.protein), carb:a.carb+n0(i.carb), fat:a.fat+n0(i.fat)
  }), {kcal:0,protein:0,carb:0,fat:0});
}
function sumMeals(meals){
  return (meals||[]).reduce((a,m)=>{const s=sumItems(m.items);
    return {kcal:a.kcal+s.kcal, protein:a.protein+s.protein, carb:a.carb+s.carb, fat:a.fat+s.fat};
  }, {kcal:0,protein:0,carb:0,fat:0});
}
/* Uma leitura que falhou por falta de internet NÃO é "não existe". Sem isso a
   tela escreve "seu treinador ainda não montou" com a coisa pronta no
   servidor — foi o que aconteceu com a ficha de treino. O flag semCopia já
   vinha do lerCopia; ninguém lia. */
const semRede = r => !!(r&&(r.semCopia||r.error));

async function getActivePlan(studentId){
  const r = await lerCopia('plano-'+studentId,
    sb.from('meal_plans').select('*').eq('student_id',studentId).eq('active',true)
      .order('created_at',{ascending:false}).limit(1).maybeSingle());
  return r.data||null;
}
// mesma consulta, mas dizendo se o vazio é de verdade ou é falta de rede
async function getActivePlanR(studentId){
  const r = await lerCopia('plano-'+studentId,
    sb.from('meal_plans').select('*').eq('student_id',studentId).eq('active',true)
      .order('created_at',{ascending:false}).limit(1).maybeSingle());
  return {plano:r.data||null, offline:semRede(r)};
}
function montarArvore(meals,items,subs){
  return (meals||[]).map(m=>({...m,
    items: (items||[]).filter(i=>i.meal_id===m.id)
      .map(i=>({...i, subs: (subs||[]).filter(s=>s.meal_item_id===i.id)}))
  }));
}
/* O cardápio vem em três níveis e um depende do outro: refeição -> item ->
   troca. São três idas ao servidor EM FILA, cada uma com o prazo de 12 s. Num
   sinal ruim isso é meio minuto de tela girando com o plano inteiro já guardado
   no aparelho — foi o que a suíte mediu: 35 s. Aqui monta o cardápio direto da
   cópia, sem tocar na rede. Devolve null quando não há cópia. */
async function planTreeDaCopia(planId){
  const [mc,ic,sc]=await Promise.all([IDB.get('ler-refeicoes-'+planId),
    IDB.get('ler-itens-'+planId),IDB.get('ler-trocas-'+planId)]);
  if(!mc||!Array.isArray(mc.dado))return null;
  return montarArvore(mc.dado,ic&&ic.dado,sc&&sc.dado);
}
async function loadPlanTree(planId){
  const { data:meals } = await lerCopia('refeicoes-'+planId,
    sb.from('meals').select('*').eq('plan_id',planId).order('order_index'));
  const mealIds=(meals||[]).map(m=>m.id);
  let items=[],subs=[];
  if(mealIds.length){
    const ri=await lerCopia('itens-'+planId,
      sb.from('meal_items').select('*').in('meal_id',mealIds).order('order_index'));
    items=ri.data||[];
    const itemIds=items.map(i=>i.id);
    if(itemIds.length){
      const rs=await lerCopia('trocas-'+planId,
        sb.from('substitutions').select('*').in('meal_item_id',itemIds));
      subs=rs.data||[];
    }
  }
  return montarArvore(meals,items,subs);
}
function resizeImage(file, max=1000, quality=0.82){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=e=>{const img=new Image();img.onload=()=>{
      const c=document.createElement('canvas');let {width:w,height:h}=img;
      const sc=Math.min(max/w,max/h,1);c.width=Math.round(w*sc);c.height=Math.round(h*sc);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      c.toBlob(b=>b?res(b):rej('blob'),'image/jpeg',quality);
    };img.onerror=rej;img.src=e.target.result;};
    r.onerror=rej;r.readAsDataURL(file);
  });
}
// Foto do aluno (refeição ou progresso). Vai sempre para a pasta dele —
// é o que a política do bucket usa para ninguém ver a foto de ninguém.
async function uploadFotoAluno(userId, blob){
  const path=`${userId}/${uid()}.jpg`;
  const {error}=await sb.storage.from('photos').upload(path,blob,{contentType:'image/jpeg'});
  if(error) throw error;
  return sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
}

/* ── Base nativa de alimentos (espelha a do MF Nutrition) ── */
const FOOD_GROUPS = {
  'Proteínas': [
    ['Peito de frango grelhado',165,31,0,3.6,'Grelhe sem óleo, tempere com sal, alho e ervas. ~6-8 min/lado.'],
    ['Sobrecoxa de frango assada',209,26,0,11,'Asse temperada a 200°C ~35 min. Retire a pele p/ menos gordura.'],
    ['Carne moída (patinho)',219,28,0,11,'Refogue em panela antiaderente, sem óleo, até dourar.'],
    ['Acém cozido',215,27,0,11,'Cozinhe na pressão ~30 min com temperos.'],
    ['Alcatra grelhada',241,28,0,14,'Grelhe na chapa quente; sal só no final.'],
    ['Filé mignon grelhado',220,29,0,11,'Sele em fogo alto ~3 min/lado.'],
    ['Contrafilé grelhado',250,27,0,15,'Grelhe ao ponto desejado; deixe descansar 2 min.'],
    ['Tilápia grelhada',128,26,0,2.7,'Grelhe com limão, sal e azeite ~4 min/lado.'],
    ['Salmão grelhado',208,22,0,13,'Grelhe com a pele p/ baixo ~4 min, vire e finalize.'],
    ['Merluza cozida',90,19,0,1.3,'Cozinhe no vapor ou ensopada com tomate.'],
    ['Atum em água (lata)',116,26,0,1,'Escorra bem. Pronto p/ saladas e sanduíches.'],
    ['Sardinha em lata',208,25,0,11,'Escorra o óleo. Rica em ômega-3.'],
    ['Ovo inteiro cozido',155,13,1.1,11,'Cozinhe 8-10 min p/ gema firme.'],
    ['Clara de ovo cozida',52,11,0.7,0.2,'Cozinhe e separe a gema, ou use claras pasteurizadas.'],
    ['Lombo suíno assado',242,27,0,14,'Tempere e asse a 180°C ~40 min.'],
    ['Peito de peru',135,29,0.5,1.7,'Fatias magras, ótimas p/ lanches.'],
    ['Presunto magro',145,18,1.5,7,'Use em sanduíches e omeletes.'],
    ['Whey protein (pó)',400,80,8,6,'Misture ~30g em 200ml de água ou leite.'],
    ['Carne seca cozida',313,33,0,19,'Dessalgue trocando a água, depois cozinhe na pressão.'],
    ['Camarão cozido',99,24,0.2,0.3,'Cozinhe rápido com alho e limão.'],
    ['Tofu',76,8,1.9,4.8,'Grelhe ou refogue temperado com shoyu.'],
  ],
  'Carboidratos': [
    ['Arroz branco cozido',128,2.5,28,0.2,'Refogue, adicione água (2:1) e cozinhe ~15 min.'],
    ['Arroz integral cozido',124,2.6,26,1,'Cozinhe ~25 min; absorve mais água.'],
    ['Batata doce cozida',86,1.6,20,0.1,'Cozinhe ou asse ~25 min até ficar macia.'],
    ['Batata inglesa cozida',87,1.9,20,0.1,'Cozinhe com casca p/ manter nutrientes.'],
    ['Mandioca cozida',125,0.6,30,0.3,'Cozinhe na pressão ~20 min.'],
    ['Inhame cozido',116,1.5,28,0.2,'Cozinhe até amaciar; ótimo no café da manhã.'],
    ['Macarrão cozido',158,5.8,31,0.9,'Cozinhe al dente em água com sal.'],
    ['Macarrão integral cozido',124,5,27,0.5,'Cozinhe al dente; mais fibras.'],
    ['Aveia em flocos',389,17,66,7,'Misture com leite, iogurte ou frutas.'],
    ['Pão francês',300,8,59,3.1,'1 unidade ~50g.'],
    ['Pão de forma integral',253,9,43,3.5,'1 fatia ~25g.'],
    ['Tapioca (goma)',240,0,60,0,'Hidrate a goma e leve à frigideira até firmar.'],
    ['Cuscuz de milho cozido',113,2.2,25,0.5,'Hidrate o flocão e cozinhe no vapor.'],
    ['Quinoa cozida',120,4.4,21,1.9,'Lave bem e cozinhe ~15 min.'],
    ['Granola',471,10,64,20,'Complemento de iogurte ou frutas.'],
    ['Milho verde cozido',96,3.4,21,1.5,'Cozinhe a espiga ~15 min.'],
    ['Feijão carioca cozido',76,4.8,14,0.5,'Cozinhe na pressão ~25 min com temperos.'],
    ['Feijão preto cozido',77,4.5,14,0.5,'Cozinhe na pressão ~30 min.'],
    ['Lentilha cozida',116,9,20,0.4,'Cozinhe ~20 min, sem molho prévio.'],
    ['Grão de bico cozido',164,9,27,2.6,'Deixe de molho e cozinhe na pressão ~25 min.'],
    ['Ervilha cozida',84,5,14,0.4,'Cozinhe rapidamente; ótima em saladas.'],
    ['Pão de queijo',295,5,38,13,'Asse a 200°C até dourar.'],
  ],
  'Frutas': [
    ['Banana',89,1.1,23,0.3,'In natura. 1 unidade média ~100g.'],
    ['Maçã',52,0.3,14,0.2,'In natura com casca.'],
    ['Mamão',43,0.5,11,0.3,'In natura; ótimo p/ digestão.'],
    ['Laranja',47,0.9,12,0.1,'Prefira a fruta ao suco.'],
    ['Morango',32,0.7,7.7,0.3,'Lave bem antes de consumir.'],
    ['Abacate',160,2,9,15,'Rico em gorduras boas; use com moderação.'],
    ['Manga',60,0.8,15,0.4,'In natura.'],
    ['Melancia',30,0.6,8,0.2,'Refrescante e hidratante.'],
    ['Melão',34,0.8,8,0.2,'In natura, gelado.'],
    ['Uva',69,0.7,18,0.2,'Lave bem; porção ~1 cacho pequeno.'],
    ['Abacaxi',50,0.5,13,0.1,'Ótimo no pós-treino.'],
    ['Kiwi',61,1.1,15,0.5,'Rico em vitamina C.'],
    ['Pera',57,0.4,15,0.1,'In natura com casca.'],
    ['Goiaba',68,2.6,14,0.9,'Rica em fibras.'],
    ['Tangerina',53,0.8,13,0.3,'Prática p/ lanches.'],
    ['Uva passa',299,3.1,79,0.5,'Porção pequena ~20g.'],
    ['Açaí (polpa s/ açúcar)',70,1,6,5,'Bata com banana; evite xaropes.'],
  ],
  'Legumes e Verduras': [
    ['Brócolis cozido',35,2.4,7,0.4,'Cozinhe no vapor ~5 min.'],
    ['Couve-flor cozida',25,1.9,5,0.3,'Cozinhe no vapor; pode virar "arroz".'],
    ['Cenoura crua',41,0.9,10,0.2,'Ralada ou em palitos.'],
    ['Tomate',18,0.9,3.9,0.2,'Cru em saladas.'],
    ['Alface',15,1.4,2.9,0.2,'Lave folha a folha.'],
    ['Abobrinha cozida',17,1.2,3.1,0.3,'Refogue ou grelhe com pouco azeite.'],
    ['Espinafre cozido',23,2.9,3.8,0.4,'Refogue rápido com alho.'],
    ['Pepino',15,0.7,3.6,0.1,'Cru, hidratante.'],
    ['Beterraba cozida',44,1.7,10,0.2,'Cozinhe e fatie em saladas.'],
    ['Couve refogada',90,1.8,5,7,'Fatie fino e refogue com alho.'],
    ['Vagem cozida',35,1.9,8,0.3,'Cozinhe no vapor até ficar al dente.'],
    ['Berinjela cozida',35,0.8,9,0.2,'Asse ou refogue temperada.'],
    ['Abóbora cozida',26,1,6.5,0.1,'Cozinhe ou asse; boa em purês.'],
    ['Pimentão',31,1,6,0.3,'Cru ou assado.'],
    ['Rúcula',25,2.6,3.7,0.7,'Lave bem; sabor marcante.'],
  ],
  'Gorduras': [
    ['Azeite de oliva extra virgem',884,0,0,100,'1 fio (~5ml) p/ finalizar.'],
    ['Óleo de coco',862,0,0,100,'Use pouco; bom p/ refogar.'],
    ['Pasta de amendoim',588,25,20,50,'1 colher de sopa ~15g.'],
    ['Castanha de caju',553,18,30,44,'Porção ~30g (punhado).'],
    ['Castanha do Pará',656,14,12,66,'1-2 unidades já bastam.'],
    ['Amêndoas',579,21,22,50,'Porção ~30g.'],
    ['Nozes',654,15,14,65,'Porção ~30g; ricas em ômega-3.'],
    ['Amendoim torrado',567,26,16,49,'Sem sal de preferência.'],
    ['Chia',486,17,42,31,'Hidrate em água/leite ~15 min.'],
    ['Linhaça',534,18,29,42,'Use triturada p/ melhor absorção.'],
    ['Coco ralado',354,3.3,15,33,'Complemento de receitas.'],
    ['Azeitona',115,0.8,6,11,'Porção pequena; controle o sódio.'],
    ['Manteiga',717,0.9,0.1,81,'Use com moderação.'],
  ],
  'Laticínios': [
    ['Leite integral',61,3.2,4.7,3.3,'Por 100ml.'],
    ['Leite desnatado',35,3.4,5,0.1,'Por 100ml.'],
    ['Iogurte natural integral',61,3.5,4.7,3.3,'Combine com frutas ou granola.'],
    ['Iogurte natural desnatado',41,4.1,6,0.2,'Baixa gordura.'],
    ['Iogurte grego natural',97,9,4,5,'Ótimo com frutas vermelhas.'],
    ['Queijo minas frescal',264,17,3,20,'Fatias magras p/ lanches.'],
    ['Queijo cottage',98,11,3.4,4.3,'Alto em proteína, baixa gordura.'],
    ['Requeijão light',175,10,5,12,'1 colher de sopa ~20g.'],
    ['Ricota',174,11,3,13,'Boa p/ patês e recheios.'],
    ['Mussarela',280,22,2.2,21,'1 fatia ~20g.'],
    ['Queijo prato',360,26,2,28,'Use com moderação.'],
    ['Cream cheese',250,6,4,24,'1 colher de sopa ~15g.'],
  ],
  'Outros': [
    ['Mel',309,0.3,84,0,'1 colher de chá p/ adoçar.'],
    ['Chocolate 70% cacau',579,7.8,46,38,'Porção ~20g (2 quadradinhos).'],
    ['Café sem açúcar',2,0.1,0,0,'Sem calorias relevantes.'],
    ['Creatina (pó)',0,0,0,0,'3-5g por dia, em qualquer horário.'],
    ['Whey + banana (shake)',230,22,28,3,'Bata 1 dose de whey, 1 banana e 200ml de líquido.'],
    ['Doce de leite',315,6,55,7,'Consumir com moderação.'],
    ['Barra de proteína',350,30,40,9,'Praticidade p/ lanches.'],
  ],
};
const slug = s => 'native-'+(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-');
const NATIVE_FOODS = Object.entries(FOOD_GROUPS).flatMap(([cat,arr])=>arr.map(a=>(
  {id:slug(a[0]), name:a[0], category:cat, kcal:a[1], protein:a[2], carb:a[3], fat:a[4], preparo:a[5], native:true}
)));

/* cache: base nativa + alimentos proprios do treinador */
let _foodsCache=null;
function clearFoodsCache(){ _foodsCache=null; }
async function getFoods(){
  if(_foodsCache) return _foodsCache;
  let custom=[];
  try{ const {data}=await sb.from('foods').select('*').not('owner_id','is',null).order('name'); custom=data||[]; }catch(e){}
  _foodsCache=[...custom, ...NATIVE_FOODS];
  return _foodsCache;
}
const genId = () => (crypto.randomUUID ? crypto.randomUUID() : uid());
const r0 = v => Math.round(n0(v));

/* ── Web Push (notificações na barra do celular) ── */
const VAPID_PUBLIC='BP1GyX7qbDDD1o643pIru_CHS6jenWACj4u8h8aOEPKMJ3LsGnavo70yYbeB1ymSMvWoqgtq7i7qf7c0Fszu6vw';
const _u8=b64=>{const pad='='.repeat((4-b64.length%4)%4);const s=(b64+pad).replace(/-/g,'+').replace(/_/g,'/');const r=atob(s);const a=new Uint8Array(r.length);for(let i=0;i<r.length;i++)a[i]=r.charCodeAt(i);return a;};
const pushSuportado=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window);
async function ativarPush(){
  if(!pushSuportado())return{ok:false,msg:'Este aparelho/navegador não suporta notificações. No iPhone, adicione o app à Tela de Início primeiro.'};
  const perm=await Notification.requestPermission();
  if(perm!=='granted')return{ok:false,msg:'Permissão de notificação negada. Ative nas configurações do navegador.'};
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:_u8(VAPID_PUBLIC)});
  const j=sub.toJSON();
  const {error}=await sb.rpc('push_salvar',{p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth});
  if(error)return{ok:false,msg:error.message};
  return{ok:true};
}
// O treinador se inscreve para receber no celular quando um aluno treinar.
async function ativarPushTreinador(){
  if(!pushSuportado())return{ok:false,msg:'Este aparelho/navegador não suporta notificações. No iPhone, adicione o app à Tela de Início e abra por lá.'};
  const perm=await Notification.requestPermission();
  if(perm!=='granted')return{ok:false,msg:'Permissão negada. Libere as notificações nas configurações do navegador.'};
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:_u8(VAPID_PUBLIC)});
  const j=sub.toJSON();
  const {error}=await sb.rpc('push_salvar_treinador',{p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth});
  if(error)return{ok:false,msg:/SOMENTE_TREINADOR/.test(error.message)?'Só a conta de treinador recebe este aviso.':error.message};
  return{ok:true};
}

// Chamado quando o aluno fecha o treino: o treinador recebe na hora.
async function avisarTreinoConcluido(divisaoNome){
  try{
    const {data:sess}=await sb.auth.getSession();
    const token=sess&&sess.session&&sess.session.access_token;
    if(!token)return;
    await fetch(CFG.SUPABASE_URL+'/functions/v1/push',{
      method:'POST',
      headers:{'content-type':'application/json',apikey:CFG.SUPABASE_ANON_KEY,authorization:'Bearer '+token},
      body:JSON.stringify({mode:'treino-concluido',divisao:divisaoNome||''}),
    });
  }catch(e){/* sem internet: o treino já está salvo, só o aviso não sai */}
}

/* ── Aviso do fim do descanso com o celular bloqueado ──
   O apito só toca com a aba viva. Com o telefone no bolso quem avisa é o
   service worker: a página manda a hora do fim e ele solta a notificação. */
async function pedirAvisoDescanso(){
  try{
    if(!('Notification'in window))return false;
    if(Notification.permission==='granted')return true;
    if(Notification.permission==='denied')return false;
    return (await Notification.requestPermission())==='granted';
  }catch(e){return false;}
}
async function agendarAvisoDescanso(em,nome){
  try{
    if(!('serviceWorker'in navigator))return;
    if(!('Notification'in window)||Notification.permission!=='granted')return;
    const reg=await navigator.serviceWorker.ready;
    if(reg.active)reg.active.postMessage({tipo:'DESCANSO',em,nome:nome||''});
  }catch(e){}
}
async function cancelarAvisoDescanso(){
  try{
    if(!('serviceWorker'in navigator))return;
    const reg=await navigator.serviceWorker.ready;
    if(reg.active)reg.active.postMessage({tipo:'DESCANSO-CANCELAR'});
  }catch(e){}
}

// Dor alta no fim do treino: o treinador recebe na hora, em vez de descobrir
// dias depois. Quem monta o texto é o servidor, lendo o feedback já gravado.
async function avisarDorAoTreinador(id){
  try{
    const {data:sess}=await sb.auth.getSession();
    const token=sess&&sess.session&&sess.session.access_token;
    if(!token)return;
    await comPrazo(fetch(CFG.SUPABASE_URL+'/functions/v1/push',{
      method:'POST',
      headers:{'content-type':'application/json',apikey:CFG.SUPABASE_ANON_KEY,authorization:'Bearer '+token},
      body:JSON.stringify({mode:'dor',id:id||null}),
    }),12000);
  }catch(e){/* sem internet: o feedback já está gravado, só o aviso não sai */}
}

// Mensagem nova na conversa: o outro lado recebe no celular. O texto sai do
// banco (conversa_para_aviso), nunca do aparelho de quem escreveu.
async function avisarMensagem(id){
  try{
    if(!id)return;
    const {data:sess}=await sb.auth.getSession();
    const token=sess&&sess.session&&sess.session.access_token;
    if(!token)return;
    await comPrazo(fetch(CFG.SUPABASE_URL+'/functions/v1/push',{
      method:'POST',
      headers:{'content-type':'application/json',apikey:CFG.SUPABASE_ANON_KEY,authorization:'Bearer '+token},
      body:JSON.stringify({mode:'mensagem',id}),
    }),12000);
  }catch(e){/* sem internet: a mensagem ja esta gravada, so o aviso nao sai */}
}

/* Desligar avisos: devolve se conseguiu tirar a inscrição TAMBÉM do servidor.
   Antes engolia o erro e a tela dizia "desligado" enquanto o servidor seguia
   mandando push para aquele aparelho — a pessoa desliga, continua recebendo, e
   conclui que o app não obedece. */
async function desativarPush(){
  try{
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    if(!sub)return {ok:true};
    let noServidor=true;
    try{await gravar(sb.rpc('push_remover',{p_endpoint:sub.toJSON().endpoint}));}
    catch(e){noServidor=false;}
    await sub.unsubscribe();
    return {ok:noServidor,msg:noServidor?null:
      'Desliguei neste aparelho, mas não consegui avisar o servidor. Pode ser que ainda chegue algum aviso — tente de novo com internet.'};
  }catch(e){return {ok:false,msg:porQueFalhou(e)};}
}

/* ── Logo (letreiro LED + pulso) ── */
/* Silhueta do levantador (deadlift) — desenhada em paths, estilo estêncil */
function Lifter({bone='var(--accent)',cut='var(--bg)'}){
  return(
    <g>
      {/* corpo: cabeça, ombros, tronco em V, braços até a barra */}
      <path fill={bone} d="M110 58
        c7 0 12 5 12 12 0 4-2 8-5 10
        l10 6 c9 5 14 11 17 19
        l4 11 -7 3 -5-11 c-2-5-6-9-11-11
        l3 14 4 20 -3 14 -8-2 2-15 -3-19 -2 8-4 14-4 14
        l0 1 -8 0 0-1 c0 0-2-6-4-14 -5 4-3 19-3 19
        l2 15 -8 2 -3-14 4-20 3-14 c-5 2-9 6-11 11
        l-5 11 -7-3 4-11 c3-8 8-14 17-19
        l10-6 c-3-2-5-6-5-10 0-7 5-12 12-12 Z"/>
      {/* pernas */}
      <path fill={bone} d="M97 132 l-3 30 -1 34 9 0 3-32 2-18 z"/>
      <path fill={bone} d="M123 132 l3 30 1 34 -9 0 -3-32 -2-18 z"/>
      {/* linhas de definição (estêncil) */}
      <g stroke={cut} strokeWidth="2.2" fill="none" strokeLinecap="round">
        <path d="M110 84 l0 30"/>
        <path d="M96 92 c6 7 22 7 28 0"/>
        <path d="M100 104 c4 4 16 4 20 0"/>
        <path d="M101 120 h18 M102 128 h16"/>
      </g>
      {/* barra + anilhas */}
      <g fill={bone}>
        <rect x="44" y="150" width="132" height="5" rx="2.5"/>
        <rect x="38" y="138" width="9" height="30" rx="3"/>
        <rect x="50" y="142" width="7" height="22" rx="3"/>
        <rect x="173" y="138" width="9" height="30" rx="3"/>
        <rect x="163" y="142" width="7" height="22" rx="3"/>
      </g>
    </g>);
}

/* Emblema elegante: monograma MF em roundel com anel dourado e barra */
function LogoLifter({size=120}){
  return(
    <svg viewBox="0 0 200 232" height={size} width={size*0.86} style={{flexShrink:0}} aria-label="MF Performance">
      {/* roundel */}
      <circle cx="100" cy="86" r="72" fill="none" stroke="var(--accent)" strokeWidth="2.5"/>
      <circle cx="100" cy="86" r="64" fill="none" stroke="var(--gold)" strokeWidth="1"/>
      {/* monograma serif MF entrelaçado */}
      <text x="100" y="104" textAnchor="middle" fontSize="70" fontWeight="600"
        fontFamily="'Playfair Display',Georgia,serif" fill="var(--accent)" letterSpacing="-3">MF</text>
      {/* barra minimalista sob o monograma */}
      <g stroke="var(--gold)" strokeWidth="3" strokeLinecap="round">
        <line x1="66" y1="128" x2="134" y2="128"/>
      </g>
      <g fill="var(--gold)">
        <rect x="60" y="123" width="4" height="10" rx="2"/>
        <rect x="136" y="123" width="4" height="10" rx="2"/>
      </g>
      {/* wordmark */}
      <text x="100" y="192" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--accent)"
        fontFamily="'Cormorant Garamond',Georgia,serif"
        textLength="132" lengthAdjust="spacingAndGlyphs">PERFORMANCE</text>
      <line x1="34" y1="204" x2="166" y2="204" stroke="var(--gold)" strokeWidth="1"/>
    </svg>
  );
}

/* Lupa do campo de busca (o espaço reservado estava vazio) */
function IconBusca(){
  return(<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="6.8" cy="6.8" r="4.6"/><line x1="10.3" y1="10.3" x2="14" y2="14"/></svg>);
}

/* Emblema compacto: MF + barra, em badge */
function LogoMark({size=46}){
  return(
    <svg viewBox="0 0 64 64" width={size} height={size} style={{flexShrink:0}}>
      <rect x="1.5" y="1.5" width="61" height="61" rx="14" fill="#16160f" stroke="var(--accent)" strokeWidth="1.2" opacity="1"/>
      <text x="32" y="34" textAnchor="middle" fontSize="27" fontWeight="800" fill="var(--bone)"
        fontFamily="Arial Black,Helvetica,sans-serif" letterSpacing="-1.5">MF</text>
      <g fill="var(--bone)">
        <rect x="14" y="44" width="36" height="3.4" rx="1.7"/>
        <rect x="10" y="40" width="5" height="12" rx="2"/>
        <rect x="17" y="42" width="4" height="8" rx="2"/>
        <rect x="49" y="40" width="5" height="12" rx="2"/>
        <rect x="43" y="42" width="4" height="8" rx="2"/>
      </g>
    </svg>
  );
}

/* ── Calculations ── */
/* aceita estatura em cm (175) ou metros (1.75); retorna sempre cm */
function normHeightCm(h){const v=num(h);if(v==null)return null;return v>0&&v<3?v*100:v;}
function bmi(w,h){const wn=num(w),hc=normHeightCm(h);if(!wn||!hc)return null;const hm=hc/100;const b=wn/(hm*hm);return (b<5||b>90)?null:b;}
/* Relação cintura/quadril — risco cardiometabólico por sexo (OMS) */
function classifyRCQ(gender,rcq){const v=num(rcq);if(v==null)return null;
  if(gender==='F'){
    if(v<0.80)return{l:'Baixo risco',c:'bg'};
    if(v<0.85)return{l:'Risco moderado',c:'ba'};
    return{l:'Alto risco',c:'br'};
  }
  if(v<0.90)return{l:'Baixo risco',c:'bg'};
  if(v<1.00)return{l:'Risco moderado',c:'ba'};
  return{l:'Alto risco',c:'br'};}
/* Relação cintura/estatura (WHtR) — preditor de risco cardiometabólico */
function whtr(waist,heightCm){const wc=num(waist),h=normHeightCm(heightCm);if(!wc||!h)return null;return +(wc/h).toFixed(2);}
function classifyWHtR(v){const x=num(v);if(x==null)return null;
  if(x<0.40)return{l:'Cuidado (baixo)',c:'ba'};
  if(x<0.50)return{l:'Saudável',c:'bg'};
  if(x<0.60)return{l:'Risco aumentado',c:'ba'};
  return{l:'Risco alto',c:'br'};}
/* Índice de massa livre de gordura (FFMI) — muscularidade (kg/m²) */
function ffmi(leanKg,heightCm){const l=num(leanKg),h=normHeightCm(heightCm);if(!l||!h)return null;const hm=h/100;return +(l/(hm*hm)).toFixed(1);}
function classifyFFMI(gender,v){const x=num(v);if(x==null)return null;
  if(gender==='F'){
    if(x<14)return{l:'Abaixo',c:'bb'};if(x<17)return{l:'Média',c:'bg'};if(x<19)return{l:'Boa massa muscular',c:'bg'};if(x<21.5)return{l:'Muito boa',c:'bg'};return{l:'Excepcional',c:'bo'};
  }
  if(x<18)return{l:'Abaixo',c:'bb'};if(x<20)return{l:'Média',c:'bg'};if(x<22)return{l:'Boa massa muscular',c:'bg'};if(x<25)return{l:'Muito boa',c:'bg'};return{l:'Excepcional',c:'bo'};}
/* % água corporal (referência geral por sexo) */
function classifyWater(gender,pct){const p=num(pct);if(p==null)return null;
  if(gender==='F'){if(p<45)return{l:'Baixa',c:'ba'};if(p<=60)return{l:'Adequada',c:'bg'};return{l:'Alta',c:'bb'};}
  if(p<50)return{l:'Baixa',c:'ba'};if(p<=65)return{l:'Adequada',c:'bg'};return{l:'Alta',c:'bb'};}
/* % músculo esquelético (referência geral por sexo) */
function classifySkeletal(gender,pct){const p=num(pct);if(p==null)return null;
  if(gender==='F'){if(p<24)return{l:'Baixo',c:'ba'};if(p<35)return{l:'Normal',c:'bg'};return{l:'Alto',c:'bo'};}
  if(p<33)return{l:'Baixo',c:'ba'};if(p<43)return{l:'Normal',c:'bg'};return{l:'Alto',c:'bo'};}
/* gordura visceral (níveis Tanita/OMS) */
function classifyVisceral(v){const x=num(v);if(x==null)return null;
  if(x<=9)return{l:'Saudável',c:'bg'};if(x<=14)return{l:'Elevada',c:'ba'};return{l:'Alto risco',c:'br'};}
/* Taxa metabólica basal — Katch-McArdle (usa massa magra) ou Mifflin-St Jeor */
function tmbCalc(leanKg,weight,heightCm,ageYrs,gender){
  const l=num(leanKg);
  if(l)return Math.round(370+21.6*l);
  const w=num(weight),h=normHeightCm(heightCm),a=num(ageYrs);
  if(!w||!h||!a)return null;
  return Math.round(gender==='F'?(10*w+6.25*h-5*a-161):(10*w+6.25*h-5*a+5));
}
const ACTIVITY_FACTOR={'Sedentário':1.2,'Levemente ativo':1.375,'Moderadamente ativo':1.55,'Muito ativo':1.725,'Atleta':1.9};
function gastoTotal(tmb,activity){const t=num(tmb);if(!t)return null;return Math.round(t*(ACTIVITY_FACTOR[activity]||1.375));}
/* Ingestão hídrica diária recomendada (mL/dia). Base ~35 mL/kg para adultos,
   ajustada por idade (idosos menos; crianças/adolescentes mais) + acréscimo por
   nível de atividade (perda hídrica no exercício). Referência de apoio. */
function hydrationMl(weightKg,activity,ageYrs){
  const w=num(weightKg);if(!w)return null;
  const a=num(ageYrs)||30;
  const perKg=a>=65?30:a<18?40:35;
  const bonus={'Sedentário':0,'Levemente ativo':250,'Moderadamente ativo':500,'Muito ativo':750,'Atleta':1000};
  const ml=w*perKg+(bonus[activity]??250);
  return Math.round(ml/50)*50;}
/* Projeção de metas até a próxima reavaliação (fácil/razoável/difícil) */
function projectGoals(ev,d){
  if(!ev.goal_next||!ev.date)return null;
  const weeks=Math.round((new Date(ev.goal_next+'T00:00:00')-new Date(ev.date+'T00:00:00'))/6048e5);
  if(weeks<1)return null;
  const fat=d.fatPct,w=d.weight;
  const rates=[['Fácil',0.20,0.25],['Razoável',0.35,0.45],['Difícil',0.50,0.70]]; // %gordura/sem , kg/sem
  const scenarios=rates.map(([l,fr,wr])=>({l,
    fat:fat!=null?Math.max(+(fat-fr*weeks).toFixed(1),3):null,
    weight:w?Math.max(+(w-wr*weeks).toFixed(1),35):null}));
  return {weeks,scenarios};
}
/* Progresso rumo à meta + estimativa de tempo (ritmo real quando há histórico) */
function goalProgress({start,cur,goal,dir,startDate,curDate,defRate}){
  cur=num(cur);goal=num(goal);start=num(start);
  if(cur==null||goal==null)return null;
  const reached=dir==='down'?cur<=goal:cur>=goal;
  const remaining=reached?0:+Math.abs(cur-goal).toFixed(1);
  let total=null,done=0,pct=null;
  if(start!=null){
    total=+Math.abs(start-goal).toFixed(1);
    done=Math.max(0,dir==='down'?start-cur:cur-start);
    pct=total>0?Math.max(0,Math.min(100,Math.round(done/total*100))):(reached?100:0);
  }else pct=reached?100:null;
  // ritmo: usa a evolução real (início→atual) se houver ≥1 semana e mudança na direção certa
  let rate=null,basis='estimativa saudável';
  if(start!=null&&startDate&&curDate){
    const wk=(new Date(curDate+'T00:00:00')-new Date(startDate+'T00:00:00'))/6048e5;
    const chg=dir==='down'?start-cur:cur-start;
    if(wk>=1&&chg>0.05){rate=chg/wk;basis='ritmo atual do aluno';}
  }
  if(rate==null)rate=defRate;
  const weeks=(!reached&&rate>0)?Math.ceil(remaining/rate):0;
  const eta=weeks>0?new Date(Date.now()+weeks*6048e5):null;
  return{reached,remaining,total,done:+done.toFixed(1),pct,rate:+rate.toFixed(2),basis,weeks,eta};
}
function classifyBMI(b){if(!b)return null;
  if(b<18.5)return{l:'Abaixo do peso',c:'bb'};
  if(b<25)return{l:'Peso normal',c:'bg'};
  if(b<30)return{l:'Sobrepeso',c:'ba'};
  if(b<35)return{l:'Obesidade I',c:'br'};
  if(b<40)return{l:'Obesidade II',c:'br'};
  return{l:'Obesidade III',c:'br'};}
function jp7(gender,ageYrs,sf){
  const keys=['sf_chest','sf_midaxillary','sf_triceps','sf_subscapular','sf_abdomen','sf_suprailiac','sf_thigh'];
  const vals=keys.map(k=>num(sf[k]));
  if(vals.some(v=>v==null))return null;
  const sum=vals.reduce((a,b)=>a+b,0),a=num(ageYrs)||0;
  let bd=gender==='M'
    ?1.112-(0.00043499*sum)+(0.00000055*sum*sum)-(0.00028826*a)
    :1.097-(0.00046971*sum)+(0.00000056*sum*sum)-(0.00012828*a);
  return (495/bd)-450;}

/* Protocolos de dobras cutâneas — o treinador escolhe. Todos usam Siri (%G = 495/DC − 450),
   exceto Faulkner que já retorna o percentual. Referências: Jackson & Pollock (1978/1980),
   Guedes (1994) e Faulkner (1968). Sítios variam por protocolo e sexo. */
const SF_LABELS={sf_triceps:'tríceps',sf_subscapular:'subescapular',sf_biceps:'bíceps',sf_chest:'tórax',sf_midaxillary:'axilar média',sf_suprailiac:'suprailíaca',sf_abdomen:'abdominal',sf_thigh:'coxa',sf_calf:'panturrilha'};
const SF_PROTOCOLS={
  jp7:{label:'Jackson-Pollock — 7 dobras',short:'JP7',n:7,
    sites:{M:['sf_chest','sf_midaxillary','sf_triceps','sf_subscapular','sf_abdomen','sf_suprailiac','sf_thigh'],
           F:['sf_chest','sf_midaxillary','sf_triceps','sf_subscapular','sf_abdomen','sf_suprailiac','sf_thigh']}},
  jp3:{label:'Jackson-Pollock — 3 dobras',short:'JP3',n:3,
    sites:{M:['sf_chest','sf_abdomen','sf_thigh'],F:['sf_triceps','sf_suprailiac','sf_thigh']}},
  guedes3:{label:'Guedes — 3 dobras',short:'Guedes',n:3,
    sites:{M:['sf_triceps','sf_suprailiac','sf_abdomen'],F:['sf_subscapular','sf_suprailiac','sf_thigh']}},
  faulkner4:{label:'Faulkner — 4 dobras',short:'Faulkner',n:4,
    sites:{M:['sf_triceps','sf_subscapular','sf_suprailiac','sf_abdomen'],F:['sf_triceps','sf_subscapular','sf_suprailiac','sf_abdomen']}}
};
function sfSites(protocol,gender){const P=SF_PROTOCOLS[protocol]||SF_PROTOCOLS.jp7;return P.sites[gender==='F'?'F':'M'];}
function sfBodyFat(gender,ageYrs,ev,protocol){
  protocol=protocol&&SF_PROTOCOLS[protocol]?protocol:'jp7';
  const G=gender==='F'?'F':'M';
  const keys=sfSites(protocol,G);
  const vals=keys.map(k=>num(ev[k]));
  if(vals.some(v=>v==null))return null;
  const S=vals.reduce((x,y)=>x+y,0),a=num(ageYrs)||0;
  let bd=null,fat=null;
  if(protocol==='jp7'){bd=G==='M'?1.112-0.00043499*S+0.00000055*S*S-0.00028826*a:1.097-0.00046971*S+0.00000056*S*S-0.00012828*a;}
  else if(protocol==='jp3'){bd=G==='M'?1.10938-0.0008267*S+0.0000016*S*S-0.0002574*a:1.0994921-0.0009929*S+0.0000023*S*S-0.0001392*a;}
  else if(protocol==='guedes3'){bd=G==='M'?1.1714-0.0671*Math.log10(S):1.1665-0.0706*Math.log10(S);}
  else if(protocol==='faulkner4'){fat=S*0.153+5.783;}
  if(fat==null&&bd)fat=(495/bd)-450;
  return (fat!=null&&isFinite(fat))?+fat.toFixed(1):null;}
function classifyBP(s,d){const sv=num(s),dv=num(d);if(!sv||!dv)return null;
  if(sv<120&&dv<80)return{l:'Ótima',c:'bg'};
  if(sv<130&&dv<85)return{l:'Normal',c:'bg'};
  if(sv<140&&dv<90)return{l:'Limítrofe',c:'ba'};
  if(sv<160&&dv<100)return{l:'HAS Estágio 1',c:'br'};
  if(sv<180&&dv<110)return{l:'HAS Estágio 2',c:'br'};
  return{l:'HAS Estágio 3',c:'br'};}
function classifyFat(gender,ageYrs,pct){const p=num(pct);if(p==null)return null;
  if(gender==='M'){
    if(p<6)return{l:'Abaixo do ideal',c:'bb'};
    if(p<14)return{l:'Atlético',c:'bg'};
    if(p<18)return{l:'Bom',c:'bg'};
    if(p<25)return{l:'Aceitável',c:'ba'};
    return{l:'Acima do ideal',c:'br'};
  }else{
    if(p<14)return{l:'Abaixo do ideal',c:'bb'};
    if(p<21)return{l:'Atlético',c:'bg'};
    if(p<25)return{l:'Bom',c:'bg'};
    if(p<32)return{l:'Aceitável',c:'ba'};
    return{l:'Acima do ideal',c:'br'};
  }}

/* Flexão de braço — mínimos por categoria [Excelente, Muito bom, Bom, Razoável] (ref. ACSM/CSEP, por faixa etária e sexo) */
const PUSHUP_NORMS={
  M:{'20':[36,29,22,17],'30':[30,22,17,12],'40':[25,17,13,10],'50':[21,13,10,7],'60':[18,11,8,5]},
  F:{'20':[30,21,15,10],'30':[27,20,13,8],'40':[24,15,11,5],'50':[21,11,7,2],'60':[17,12,5,2]}
};
function ageBand(a){a=num(a)||25;if(a<30)return'20';if(a<40)return'30';if(a<50)return'40';if(a<60)return'50';return'60';}
function classifyByMin(mins,reps){const r=num(reps);if(r==null)return null;
  const labs=[{l:'Excelente',c:'bg'},{l:'Muito bom',c:'bg'},{l:'Bom',c:'bb'},{l:'Razoável',c:'ba'}];
  for(let i=0;i<mins.length;i++)if(r>=mins[i])return labs[i];
  return{l:'Ruim',c:'br'};}
function classifyPushup(gender,ageYrs,reps){const t=PUSHUP_NORMS[gender==='F'?'F':'M'][ageBand(ageYrs)];return classifyByMin(t,reps);}

/* Cooper 12 min: VO2máx estimado (mL/kg/min) e classificação */
function cooperVO2(distM){const d=num(distM);if(d==null)return null;return (d-504.9)/44.73;}
/* limiares de VO2máx "bom/acima" por faixa (ref. ACSM/Cooper) — mínimos [Superior,Excelente,Bom,Regular] */
const VO2_NORMS={
  M:{'20':[56,51,45,42],'30':[54,48,44,41],'40':[52,46,42,38],'50':[49,43,39,35],'60':[45,39,35,31]},
  F:{'20':[49,44,39,36],'30':[47,42,37,34],'40':[45,40,35,32],'50':[42,37,32,29],'60':[38,34,29,26]}
};
function classifyVO2(gender,ageYrs,vo2){const v=num(vo2);if(v==null)return null;
  const t=VO2_NORMS[gender==='F'?'F':'M'][ageBand(ageYrs)];
  const labs=[{l:'Superior',c:'bg'},{l:'Excelente',c:'bg'},{l:'Bom',c:'bb'},{l:'Regular',c:'ba'}];
  for(let i=0;i<t.length;i++)if(v>=t[i])return labs[i];
  return{l:'Fraco',c:'br'};}
/* 1-RM estimado a partir de carga × repetições (Brzycki) */
function est1RM(weight,reps){const w=num(weight),r=num(reps);if(!w||!r)return null;if(r<=1)return w;if(r>12)return w*(1+r/30);return +(w/(1.0278-0.0278*r)).toFixed(1);}
/* Zonas de frequência cardíaca (Tanaka p/ FCmáx; Karvonen se houver FC repouso) */
function fcZones(ageYrs,restingHR){const a=num(ageYrs);if(a==null)return null;
  const fcmax=Math.round(208-0.7*a);const rest=num(restingHR);const hrr=rest?fcmax-rest:null;
  const Z=[['Z1 · Recuperação',.50,.60],['Z2 · Aeróbio leve',.60,.70],['Z3 · Aeróbio',.70,.80],['Z4 · Limiar',.80,.90],['Z5 · VO₂máx',.90,1.0]];
  const bpm=p=>hrr?Math.round(rest+p*hrr):Math.round(p*fcmax);
  return {fcmax,rest,method:hrr?'Karvonen (FC reserva)':'% FCmáx',zones:Z.map(([n,lo,hi])=>({n,lo:bpm(lo),hi:bpm(hi)}))};}
/* Zonas de carga a partir do 1-RM */
function loadZones(rm){const m=num(rm);if(!m)return null;
  const R=[['Força máxima','1–3 reps',.90,1.0],['Força','3–5 reps',.85,.90],['Hipertrofia','6–12 reps',.67,.85],['Resistência','15+ reps',.50,.67]];
  return R.map(([n,reps,lo,hi])=>({n,reps,lo:Math.round(m*lo),hi:Math.round(m*hi)}));}

/* Protocolo incremental de esteira: VO2máx estimado pela velocidade final (VAM ≈ 3.5 × km/h) */
function incVO2(vFinalKmh){const v=num(vFinalKmh);if(v==null)return null;return +(3.5+3.3333*v).toFixed(1);}

/* ── Normas de resistência (referência geral, ajustável) ── mínimos [Excelente,Muito bom,Bom,Razoável] */
const SITUP_NORMS={ // abdominal em 1 min, por idade/sexo
  M:{'20':[43,37,33,29],'30':[39,33,29,25],'40':[35,29,25,21],'50':[30,24,20,16],'60':[26,20,16,12]},
  F:{'20':[38,32,28,24],'30':[34,28,24,20],'40':[30,24,20,16],'50':[25,19,15,11],'60':[20,14,10,6]}
};
function classifySitup(gender,ageYrs,reps){return classifyByMin(SITUP_NORMS[gender==='F'?'F':'M'][ageBand(ageYrs)],reps);}
/* barra fixa (máx. repetições) — referência geral por sexo */
function classifyPullup(gender,reps){const r=num(reps);if(r==null)return null;
  const t=gender==='F'?[8,5,3,1]:[15,10,6,3];return classifyByMin(t,reps);}
/* agachamento em 1 min — referência geral por sexo */
function classifySquat(gender,reps){const r=num(reps);if(r==null)return null;
  const t=gender==='F'?[45,37,30,22]:[50,42,34,26];return classifyByMin(t,reps);}
/* Banco de Wells (sentar-e-alcançar, cm) — mínimos [Excelente,Bom,Média,Fraco] (ref. geral por idade/sexo) */
const WELLS_NORMS={
  M:{'20':[34,28,23,16],'30':[33,27,21,15],'40':[31,25,19,13],'50':[29,23,17,10],'60':[27,21,15,8]},
  F:{'20':[37,33,28,22],'30':[36,32,27,21],'40':[34,30,25,19],'50':[33,28,23,17],'60':[31,26,21,15]}
};
function classifyWells(gender,ageYrs,cm){const v=num(cm);if(v==null)return null;
  const t=WELLS_NORMS[gender==='F'?'F':'M'][ageBand(ageYrs)];
  const labs=[{l:'Excelente',c:'bg'},{l:'Bom',c:'bg'},{l:'Média',c:'bb'},{l:'Fraco',c:'ba'}];
  for(let i=0;i<t.length;i++)if(v>=t[i])return labs[i];
  return{l:'Ruim',c:'br'};}

/* ── Mobilidade / Equilíbrio / Questionários ── */
/* Assimetria bilateral: retorna {diff, pct, side, badge} */
function asymmetry(r,l,thrPct=10,thrAbs=null){const R=num(r),L=num(l);if(R==null||L==null)return null;
  const diff=+(Math.abs(R-L)).toFixed(1);const base=Math.max(Math.abs(R),Math.abs(L))||1;const pct=+((diff/base)*100).toFixed(1);
  const side=R>L?'D':(L>R?'E':'—');
  const over=thrAbs!=null?diff>thrAbs:pct>thrPct;
  return {diff,pct,side,badge:over?{l:`Assimetria ${pct}% (${side}>)`,c:'br'}:{l:'Simétrico',c:'bg'}};}
function classifyKneeWall(cm){const v=num(cm);if(v==null)return null;if(v>=10)return{l:'Normal',c:'bg'};if(v>=8)return{l:'Leve restrição',c:'ba'};return{l:'Restrito',c:'br'};}
function classifySLR(deg){const v=num(deg);if(v==null)return null;if(v>=80)return{l:'Normal',c:'bg'};if(v>=70)return{l:'Leve encurtamento',c:'ba'};return{l:'Encurtado',c:'br'};}
function classifyThoracicRot(deg){const v=num(deg);if(v==null)return null;if(v>=45)return{l:'Normal',c:'bg'};if(v>=35)return{l:'Reduzida',c:'ba'};return{l:'Limitada',c:'br'};}
/* Equilíbrio unipodal por faixa etária (s) — mínimos [olhos abertos, olhos fechados] */
function classifyBalance(ageYrs,secOpen,secClosed){const a=num(ageYrs)||30;
  const openMin=a<40?45:a<60?40:a<70?30:20, closedMin=a<40?25:a<60?20:a<70?12:6;
  const cl=(v,m)=>{v=num(v);if(v==null)return null;if(v>=m)return{l:'Bom',c:'bg'};if(v>=m*0.6)return{l:'Regular',c:'ba'};return{l:'Baixo',c:'br'};};
  return {open:cl(secOpen,openMin),closed:cl(secClosed,closedMin)};}
/* Y-Balance: composto e risco (assimetria anterior > 4 cm = maior risco de lesão) */
function ybComposite(ant,pm,pl){const a=num(ant),p=num(pm),l=num(pl);if(a==null||p==null||l==null)return null;return +(a+p+l).toFixed(1);}
function classifyEVA(v){const x=num(v);if(x==null)return null;if(x===0)return{l:'Sem dor',c:'bg'};if(x<=3)return{l:'Dor leve',c:'bb'};if(x<=6)return{l:'Dor moderada',c:'ba'};return{l:'Dor intensa',c:'br'};}
function classifyScale10(v,inv){const x=num(v);if(x==null)return null;const s=inv?10-x:x;if(s<=3)return{l:'Baixo',c:'bg'};if(s<=6)return{l:'Moderado',c:'ba'};return{l:'Alto',c:'br'};}
const PARQ_QUESTIONS=[
  'Algum médico já disse que você possui problema cardíaco e que só deveria fazer atividade física supervisionada?',
  'Você sente dor no peito ao praticar atividade física?',
  'No último mês, sentiu dor no peito ao praticar atividade física?',
  'Você perde o equilíbrio por tontura ou já perdeu a consciência?',
  'Tem algum problema ósseo/articular que poderia piorar com atividade física?',
  'Toma atualmente medicamento para pressão arterial ou problema cardíaco?',
  'Sabe de algum outro motivo pelo qual não deveria praticar atividade física?'
];
function parqResult(ev){const any=PARQ_QUESTIONS.some((_,i)=>ev['parq_'+(i+1)]==='Sim');if(!PARQ_QUESTIONS.some((_,i)=>ev['parq_'+(i+1)]))return null;
  return any?{l:'Encaminhar para avaliação médica',c:'br'}:{l:'Liberado (baixo risco)',c:'bg'};}

/* ── Funcional & Performance (Fase 2) ── */
function classifyTUG(s){const v=num(s);if(v==null)return null;if(v<10)return{l:'Normal',c:'bg'};if(v<14)return{l:'Risco leve de queda',c:'ba'};return{l:'Alto risco de queda',c:'br'};}
function classifySTS5(s){const v=num(s);if(v==null)return null;if(v<=8)return{l:'Excelente',c:'bg'};if(v<=12)return{l:'Normal',c:'bg'};if(v<=15)return{l:'Regular',c:'ba'};return{l:'Reduzido',c:'br'};}
function classifyChair30(reps){const v=num(reps);if(v==null)return null;if(v>=20)return{l:'Excelente',c:'bg'};if(v>=15)return{l:'Bom',c:'bg'};if(v>=12)return{l:'Médio',c:'bb'};if(v>=8)return{l:'Regular',c:'ba'};return{l:'Baixo',c:'br'};}
function classifyPlank(s){const v=num(s);if(v==null)return null;if(v>=120)return{l:'Excelente',c:'bg'};if(v>=60)return{l:'Bom',c:'bg'};if(v>=30)return{l:'Regular',c:'ba'};return{l:'Fraco',c:'br'};}
function classifyWallSit(s){const v=num(s);if(v==null)return null;if(v>=90)return{l:'Excelente',c:'bg'};if(v>=45)return{l:'Bom',c:'bg'};if(v>=25)return{l:'Regular',c:'ba'};return{l:'Fraco',c:'br'};}
function classifyDeadHang(s){const v=num(s);if(v==null)return null;if(v>=90)return{l:'Excelente',c:'bg'};if(v>=45)return{l:'Bom',c:'bg'};if(v>=20)return{l:'Regular',c:'ba'};return{l:'Fraco',c:'br'};}
function rsiCalc(hCm,ctMs){const h=num(hCm),c=num(ctMs);if(!h||!c)return null;return +((h/100)/(c/1000)).toFixed(2);}
function classifyRSI(v){const x=num(v);if(x==null)return null;if(x>=2.5)return{l:'Excelente',c:'bg'};if(x>=1.5)return{l:'Bom',c:'bg'};if(x>=1.0)return{l:'Moderado',c:'ba'};return{l:'Baixo',c:'br'};}
function sprintVel(dist,sec){const s=num(sec);if(!s)return null;return +(dist/s).toFixed(2);}
function yoyoVO2(distM){const d=num(distM);if(!d)return null;return +(d*0.0084+36.4).toFixed(1);}
function classifyFatigueIndex(pct){const v=num(pct);if(v==null)return null;if(v<=6)return{l:'Baixa fadiga',c:'bg'};if(v<=10)return{l:'Moderada',c:'ba'};return{l:'Alta fadiga',c:'br'};}
/* Qualidade do movimento (nota 1-5) */
function classifyMove(v){const x=num(v);if(x==null)return null;if(x>=5)return{l:'Excelente',c:'bg'};if(x>=4)return{l:'Bom',c:'bg'};if(x>=3)return{l:'Adequado',c:'bb'};if(x>=2)return{l:'Deficiente',c:'ba'};return{l:'Disfuncional',c:'br'};}
/* Painel de assimetrias — cruza todos os pares D/E existentes */
function asymmetryPanel(ev){
  const pairs=[
    ['Preensão manual','dyn_r','dyn_l',10],['Braço (perímetro)','circ_arm_r','circ_arm_l',5],['Coxa (perímetro)','circ_thigh_r','circ_thigh_l',5],['Panturrilha (perímetro)','circ_calf_r','circ_calf_l',5],
    ['Dorsiflexão (Knee to Wall)','kneewall_r','kneewall_l',15],['Elevação de perna (SLR)','slr_r','slr_l',10],['Rotação torácica','throt_r','throt_l',15],
    ['Equilíbrio unipodal','bal_open_r','bal_open_l',15],['Y-Balance anterior','yb_ant_r','yb_ant_l',10],['Sentar-levantar unipodal','func_slsts_r','func_slsts_l',15],['Teste 505','pw_505_r','pw_505_l',8]
  ];
  return pairs.map(([lbl,r,l,thr])=>{const a=asymmetry(ev[r],ev[l],thr);return a?{lbl,r:ev[r],l:ev[l],...a}:null;}).filter(Boolean);}

/* ── Derived metrics for an eval ── */
function derive(student,ev){
  const a=age(student.dob)||25;
  const b=bmi(ev.weight,ev.height);
  const jp=sfBodyFat(student.gender,a,ev,ev.sf_protocol);
  const fatPct=num(ev.bio_fat)??(jp!=null?+jp.toFixed(1):null);
  const w=num(ev.weight);
  const leanMass=num(ev.bio_lean)??((w&&fatPct!=null)?+(w*(1-fatPct/100)).toFixed(1):null);
  const fatMass=(w&&fatPct!=null)?+(w*fatPct/100).toFixed(1):null;
  const rcq=(num(ev.circ_waist)&&num(ev.circ_hip))?+(num(ev.circ_waist)/num(ev.circ_hip)).toFixed(2):null;
  const dynAvg=(num(ev.dyn_r)&&num(ev.dyn_l))?+((num(ev.dyn_r)+num(ev.dyn_l))/2).toFixed(1):null;
  const wh=whtr(ev.circ_waist,ev.height);
  const ffmiV=ffmi(leanMass,ev.height);
  const tmb=num(ev.bio_bmr)||tmbCalc(leanMass,ev.weight,ev.height,a,student.gender);
  const get=gastoTotal(tmb,student.activity);
  const hidr=hydrationMl(ev.weight,student.activity,a);
  return {bmi:b,jp,fatPct,leanMass,fatMass,rcq,dynAvg,weight:w,whtr:wh,ffmi:ffmiV,tmb,get,hidr};
}

/* ── Mapa corporal (screening de lesões) ── */
const BODY_REGIONS=[
  {k:'cervical',l:'Cervical',x:50,y:9},
  {k:'shoulder_r',l:'Ombro D',x:35,y:19},{k:'shoulder_l',l:'Ombro E',x:65,y:19},
  {k:'thoracic',l:'Coluna torácica',x:50,y:24},
  {k:'elbow_r',l:'Cotovelo D',x:30,y:34},{k:'elbow_l',l:'Cotovelo E',x:70,y:34},
  {k:'lumbar',l:'Coluna lombar',x:50,y:38},
  {k:'wrist_r',l:'Punho D',x:26,y:47},{k:'wrist_l',l:'Punho E',x:74,y:47},
  {k:'hip_r',l:'Quadril D',x:43,y:46},{k:'hip_l',l:'Quadril E',x:57,y:46},
  {k:'knee_r',l:'Joelho D',x:44,y:68},{k:'knee_l',l:'Joelho E',x:56,y:68},
  {k:'ankle_r',l:'Tornozelo D',x:45,y:88},{k:'ankle_l',l:'Tornozelo E',x:55,y:88},
  {k:'foot_r',l:'Pé D',x:44,y:95},{k:'foot_l',l:'Pé E',x:56,y:95}
];
function evaColor(v){const x=num(v);if(x==null||x===0)return '#9aae8a';if(x<=3)return '#c9b45a';if(x<=6)return '#cf8f45';return '#c05045';}
function BodyMap({value,onChange}){
  const map=value||{};
  const [active,setActive]=useState(null);
  const set=(k,patch)=>{const cur=map[k]||{eva:'',note:''};const nv={...map,[k]:{...cur,...patch}};if((nv[k].eva===''||nv[k].eva==null)&&!nv[k].note){delete nv[k];}onChange(nv);};
  const cur=active?(map[active]||{eva:'',note:''}):null;
  const lbl=active?(BODY_REGIONS.find(r=>r.k===active)||{}).l:'';
  return(
    <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'flex-start'}}>
      <div style={{position:'relative',width:170,flexShrink:0}}>
        <svg viewBox="0 0 100 100" width="170" style={{display:'block'}}>
          <g fill="none" stroke="var(--border2)" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
            <circle cx="50" cy="7" r="5"/>
            <path d="M42 13 Q50 16 58 13 L64 20 66 40 60 41 58 26 57 55 53 92 47 92 43 55 42 26 40 41 34 40 36 20 Z"/>
            <path d="M36 20 L26 48 M64 20 L74 48"/>
          </g>
          {BODY_REGIONS.map(r=>{const m=map[r.k];const on=active===r.k;return(
            <circle key={r.k} cx={r.x} cy={r.y} r={on?3.6:2.8} fill={m?evaColor(m.eva):'rgba(160,150,135,.35)'}
              stroke={on?'var(--accent)':'#fff'} strokeWidth={on?1.2:0.8} style={{cursor:'pointer'}} onClick={()=>setActive(r.k)}/>);})}
        </svg>
      </div>
      <div style={{flex:1,minWidth:190}}>
        <div style={{fontSize:12,color:'var(--text2)',marginBottom:8}}>Toque em uma região para registrar dor/lesão.</div>
        {active?<div className="card" style={{padding:'12px 14px'}}>
          <div style={{fontWeight:600,marginBottom:8}}>{lbl}</div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
            <span style={{fontSize:12,color:'var(--text2)'}}>Dor (EVA)</span>
            <input type="range" min="0" max="10" step="1" value={cur.eva===''?0:cur.eva} onChange={e=>set(active,{eva:e.target.value})} style={{flex:1}}/>
            <span style={{fontWeight:700,width:18}}>{cur.eva===''?'0':cur.eva}</span>
          </div>
          <input className="fi" placeholder="Descrição (ex: tendinite, entorse antiga...)" value={cur.note} onChange={e=>set(active,{note:e.target.value})}/>
          {(cur.eva!==''&&cur.eva!=null)||cur.note?<button className="btn btn-ghost btn-sm" style={{marginTop:8}} onClick={()=>{const nv={...map};delete nv[active];onChange(nv);setActive(null);}}>Remover marca</button>:null}
        </div>:null}
        {Object.keys(map).length>0&&<div style={{marginTop:10,display:'flex',flexWrap:'wrap',gap:6}}>
          {Object.entries(map).map(([k,m])=>{const r=BODY_REGIONS.find(x=>x.k===k);if(!r)return null;return(
            <button key={k} type="button" onClick={()=>setActive(k)} style={{fontSize:11,fontWeight:600,padding:'4px 9px',borderRadius:14,border:'1px solid var(--border2)',background:'var(--bg2)',color:'var(--text)',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:evaColor(m.eva)}}/>{r.l}{m.eva?` · EVA ${m.eva}`:''}</button>);})}
        </div>}
      </div>
    </div>);
}

/* ── UI primitives ── */
// O rotulo ENVOLVE o campo. Antes era um <label> irmao, sem for nem
// aninhamento: visualmente parecia rotulado, mas o leitor de tela anunciava
// "campo de edicao" e nada mais. Envolver associa os dois sem precisar de id.
function FI({label,unit,...p}){return(
  <label className="fg">{label&&<span className="flbl">{label}{unit&&<span style={{color:'var(--text3)',marginLeft:3}}>({unit})</span>}</span>}<input className="fi" {...p}/></label>);}
function FS({label,children,...p}){return(
  <label className="fg">{label&&<span className="flbl">{label}</span>}<select className="fi" {...p}>{children}</select></label>);}
function FTA({label,...p}){return(
  <label className="fg">{label&&<span className="flbl">{label}</span>}<textarea className="fi" {...p}/></label>);}
function Stat({lbl,val,unit,badge}){return(
  <div className="stat"><div className="stat-lbl">{lbl}</div>
    <div className="stat-val">{typeof val==='number'||(typeof val==='string'&&val!==''&&!isNaN(parseFloat(val))&&/^-?\d+(\.\d+)?$/.test(String(val).trim()))
      ? fmt(val,String(val).includes('.')?1:0) : (val??'—')}{unit&&<span className="stat-unit"> {unit}</span>}</div>
    {badge&&<span className={`badge ${badge.c}`} style={{marginTop:7,display:'inline-flex'}}>{badge.l}</span>}</div>);}
function Badge({cls,children}){return<span className={`badge ${cls}`}>{children}</span>;}

/* ── Dashboard ── */
function reassessInfo(se){if(!se||!se.length)return null;const last=se[0];
  let base=last.goal_next;if(!base){const d=new Date(last.date+'T00:00:00');d.setDate(d.getDate()+90);base=d.toLocaleDateString('en-CA');}
  const days=Math.ceil((new Date(base+'T00:00:00')-new Date(new Date().toLocaleDateString('en-CA')+'T00:00:00'))/86400000);
  return {date:base,days};}
/* Score geral (0-100) de uma avaliação; tolerante a dados faltando */
function evalOverall(student,ev,prevEv){try{const d=derive(student,ev);const ex=buildExecutive(student,ev,d,prevEv);return ex&&ex.overall!=null?ex.overall:null;}catch(e){return null;}}
const scoreColor=v=>v==null?'var(--text3)':v>=75?'#2f8f4e':v>=55?'#b0894f':v>=40?'#c98a3a':'#b3434f';

/* ── Enviar aviso/lembrete para aluno(s) ── */
const AVISO_MODELOS=[
  {tipo:'lembrete',titulo:'Treino de hoje te espera',texto:'Bora fechar mais um treino? Não esqueça de registrar as cargas.'},
  {tipo:'lembrete',titulo:'Bebeu água hoje?',texto:'Lembra de manter a hidratação em dia — faz diferença no seu desempenho.'},
  {tipo:'parabens',titulo:'Mandou muito bem!',texto:'Vi sua evolução na semana. Continua assim que os resultados vêm.'},
  {tipo:'aviso',titulo:'Sua reavaliação está chegando',texto:'Semana que vem faremos sua reavaliação. Capricha no sono e na alimentação.'},
];
function NotifyModal({target,students,onClose}){
  const all=!!target.all;const stu=target.student;const reativar=!!target.reativar;
  const [tipo,setTipo]=useState('lembrete');
  const [titulo,setTitulo]=useState(reativar?'Senti sua falta nos treinos':'');
  const [texto,setTexto]=useState(reativar?'Bora retomar? Guardei um lugar pra você. Me conta como posso te ajudar a voltar pra rotina — dá um passo hoje!':'');
  const [busy,setBusy]=useState(false);const [okMsg,setOkMsg]=useState(null);
  /* Quem realmente é alcançado no celular.
     O aviso sempre entra na aba Avisos do app — isso é o banco e não falha. O
     que NÃO chega em todo mundo é a notificação na tela bloqueada: ela depende
     do aluno ter ligado os avisos. Eram 4 aparelhos para 19 contas, e a tela
     dizia "Aviso enviado para 22 alunos" sem distinguir uma coisa da outra.
     Quem manda o recado precisa saber ANTES de escrever se ele vai vibrar no
     bolso da pessoa ou só esperar ela abrir o app. */
  const [comAviso,setComAviso]=useState(null);   // null = ainda perguntando
  useEffect(()=>{(async()=>{
    try{const {data,error}=await sb.from('train_push').select('student_id').eq('papel','aluno');
      if(error)throw error;
      setComAviso(new Set((data||[]).map(r=>r.student_id).filter(Boolean)));
    }catch(e){setComAviso(false);}   // false = não consegui saber; não invento
  })();},[]);
  const usar=m=>{setTipo(m.tipo);setTitulo(m.titulo);setTexto(m.texto);};
  const enviar=async()=>{
    if(!titulo.trim()||!texto.trim()){alert('Preencha título e mensagem.');return;}
    setBusy(true);
    try{
      /* A função devolve em quantos aparelhos a notificação entrou (`sent`).
         Esse número era jogado fora: o treinador mandava para todos, chegava em
         quatro celulares, e a tela dizia o mesmo de sempre. */
      const empurrar=async corpo=>{
        try{const {data,error}=await sb.functions.invoke('push',{body:corpo});
          if(error)return null;
          return data&&typeof data.sent==='number'?data.sent:null;
        }catch(e){return null;}
      };
      if(all){const {data,error}=await sb.rpc('aviso_enviar_todos',{p_titulo:titulo,p_texto:texto,p_tipo:tipo});if(error)throw error;
        const n=await empurrar({all:true,titulo,texto,tipo});
        setOkMsg('Aviso enviado para '+plural(data??students.length,'aluno')+'.'+
          (n==null?'':n===0?' Nenhum tem notificação ligada — vão ver quando abrirem o app.'
            :' Vibrou em '+plural(n,'celular','celulares')+' agora; os outros veem ao abrir o app.'));}
      else{const {error}=await sb.rpc('aviso_enviar',{p_student:stu.id,p_titulo:titulo,p_texto:texto,p_tipo:tipo});if(error)throw error;
        const n=await empurrar({student_id:stu.id,titulo,texto,tipo});
        setOkMsg('Aviso enviado para '+stu.name+'.'+
          (n==null?'':n===0?' Sem notificação ligada — vai ver ao abrir o app.':' Chegou no celular agora.'));}
      setTimeout(onClose,all?2600:2200);
    }catch(e){alert('Erro ao enviar: '+e.message);setBusy(false);}
  };
  /* O aviso do alcance, escrito antes de ele começar a digitar. */
  const alcance=(()=>{
    if(comAviso===null||comAviso===false)return null;
    if(all){
      const contas=(students||[]).filter(s=>s.user_id);
      const n=contas.filter(s=>comAviso.has(s.id)).length;
      if(!contas.length)return null;
      /* Frases separadas por caso em vez de uma montada com plural(): com um
         aluno só saía "Os 1 alunos", e o treinador desconfia da tela toda
         quando ela erra o português na frente dele. */
      if(n===contas.length)return {bom:true,txt:'Todos com conta no app recebem a notificação no celular.'};
      if(n===0)return {bom:false,txt:'Nenhum aluno tem notificação ligada. O recado fica na aba Avisos até cada um abrir o app.'};
      return {bom:false,txt:n+' de '+contas.length+' alunos com conta têm notificação ligada. '+
        'Os outros só veem o recado quando abrirem o app.'};
    }
    /* Sempre pelo primeiro nome. "Ela(e)" na tela do treinador fica com cara de
       formulário, e o app já sabe o nome da pessoa. */
    const nome=stu&&stu.name?stu.name.split(' ')[0]:'Este aluno';
    if(!stu||!stu.user_id)return {bom:false,txt:nome+' ainda não ativou a conta no app: o recado fica guardado até a primeira entrada.'};
    return comAviso.has(stu.id)
      ? {bom:true,txt:'Chega como notificação no celular.'}
      : {bom:false,txt:nome+' não tem notificação ligada. O recado aparece na aba Avisos quando abrir o app.'};
  })();
  return(<div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.8)',display:'flex',alignItems:'center',justifyContent:'center',padding:16,overflow:'auto'}} onClick={onClose}><div className="card" style={{maxWidth:460,width:'100%'}} onClick={e=>e.stopPropagation()}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
      <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:600}}>{all?'Aviso para todos os alunos':'Aviso para '+stu.name}</div>
      <button className="btn-icon btn-sm" onClick={onClose}>×</button>
    </div>
    <p className="s-meta" style={{marginBottom:alcance?6:12}}>Aparece na aba <b>Avisos</b> do app do aluno.</p>
    {alcance&&<div className="s-meta" style={{marginBottom:12,lineHeight:1.5,
      color:alcance.bom?'var(--text2)':'var(--gold)'}}>{alcance.txt}</div>}
    {okMsg?<div className="alert alert-success">{okMsg}</div>:<>
      <div className="fg"><label className="flbl">Tipo</label>
        <select className="fi" value={tipo} onChange={e=>setTipo(e.target.value)}>
          <option value="lembrete">Lembrete</option><option value="parabens">Parabéns</option><option value="aviso">Aviso</option>
        </select></div>
      <div className="fg"><label className="flbl">Modelos rápidos</label>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {AVISO_MODELOS.map((m,i)=><button key={i} type="button" className="chip" onClick={()=>usar(m)}>{AVISO_ICON[m.tipo]} {m.titulo}</button>)}
        </div></div>
      <div className="fg"><label className="flbl">Título</label><input className="fi" value={titulo} onChange={e=>setTitulo(e.target.value)} maxLength={80} placeholder="Ex.: Treino de hoje te espera"/></div>
      <div className="fg"><label className="flbl">Mensagem</label><textarea className="fi" rows={3} value={texto} onChange={e=>setTexto(e.target.value)} maxLength={280} placeholder="Escreva a mensagem…"/></div>
      <button className="btn btn-primary" style={{width:'100%'}} disabled={busy} onClick={enviar}>{busy?'Enviando…':(all?'Enviar para todos':'Enviar aviso')}</button>
    </>}
  </div></div>);
}
/* ── Diário de saúde do aluno (visão do treinador) ── */
function DiarioCoach({student,onClose}){
  const [loaded,setLoaded]=useState(false);
  const [dias,setDias]=useState([]);const [glic,setGlic]=useState([]);const [diab,setDiab]=useState(false);
  useEffect(()=>{(async()=>{
    try{const {data:sd}=await sb.from('train_saude').select('diabetico').eq('student_id',student.id).maybeSingle();setDiab(!!(sd&&sd.diabetico));}catch(e){}
    try{const {data:dd}=await sb.from('train_diario').select('*').eq('student_id',student.id).order('data',{ascending:false}).limit(21);setDias(dd||[]);}catch(e){}
    try{const {data:gg}=await sb.from('train_glicemia').select('*').eq('student_id',student.id).order('registrado_em',{ascending:false}).limit(20);setGlic(gg||[]);}catch(e){}
    setLoaded(true);
  })();},[]);
  const humorTxt=v=>v==null?'—':['','Ruim','','','','Ótimo'][v]||v;
  return(<div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.8)',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:16,overflow:'auto'}} onClick={onClose}>
    <div className="card" style={{maxWidth:560,width:'100%',marginTop:24}} onClick={e=>e.stopPropagation()}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:600}}>Diário de saúde · {student.name.split(' ')[0]}</div>
        <button className="btn-icon btn-sm" onClick={onClose}>×</button>
      </div>
      {!loaded?<div className="s-meta">Carregando…</div>:<>
        {diab&&<>
          <div className="kpi-lbl" style={{margin:'6px 0 8px'}}>Glicemia & insulina</div>
          {glic.length===0?<div className="s-meta" style={{marginBottom:12}}>Sem registros de glicemia.</div>:
          <div style={{overflowX:'auto',marginBottom:16}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{textAlign:'left',color:'var(--text3)'}}><th style={{padding:'4px 8px'}}>Quando</th><th>mg/dL</th><th>Momento</th><th>Insulina</th></tr></thead>
            <tbody>{glic.map(g=>{const f=glicFaixa(g.valor);const mom=(GLIC_MOMENTOS.find(m=>m[0]===g.momento)||[,g.momento||'—'])[1];return(
              <tr key={g.id} style={{borderTop:'1px solid var(--border)'}}>
                <td style={{padding:'6px 8px'}}>{new Date(g.registrado_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
                <td style={{fontWeight:800,color:f.c}}>{g.valor}</td><td>{mom}</td><td>{g.insulina_unid?`${g.insulina_unid}u`:'—'}</td></tr>);})}
            </tbody></table></div>}
        </>}
        <div className="kpi-lbl" style={{margin:'6px 0 8px'}}>Diário diário</div>
        {dias.length===0?<div className="s-meta">Este aluno ainda não registrou o diário.</div>:
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{textAlign:'left',color:'var(--text3)'}}><th style={{padding:'4px 8px'}}>Data</th><th>Peso</th><th>Sono</th><th>Energia</th><th>Humor</th><th>Dor</th><th>Passos</th></tr></thead>
          <tbody>{dias.map(d=>(
            <tr key={d.id} style={{borderTop:'1px solid var(--border)'}}>
              <td style={{padding:'6px 8px'}}>{fmtDate(d.data)}</td><td>{d.peso!=null?d.peso+'kg':'—'}</td><td>{d.sono!=null?d.sono+'h':'—'}</td>
              <td>{d.energia??'—'}</td><td>{humorTxt(d.humor)}</td><td>{d.dor??'—'}</td><td>{d.passos!=null?d.passos:'—'}</td></tr>))}
          </tbody></table></div>}
        {dias.some(d=>d.obs)&&<div style={{marginTop:14}}><div className="kpi-lbl" style={{marginBottom:6}}>Observações</div>
          {dias.filter(d=>d.obs).slice(0,6).map(d=><div key={d.id} className="s-meta" style={{marginBottom:6}}><b>{fmtDate(d.data)}:</b> {d.obs}</div>)}</div>}
      </>}
    </div>
  </div>);
}

/* ── Metas do aluno (treinador cria/edita) ── */
const META_TIPOS=[['peso','Peso','kg'],['gordura','% de gordura','%'],['medida','Medida','cm'],['treinos','Treinos/semana','treinos'],['custom','Personalizada','']];
function MetasCoach({student,onClose}){
  const [loaded,setLoaded]=useState(false);const [metas,setMetas]=useState([]);const [coachId,setCoachId]=useState(null);
  const [f,setF]=useState({tipo:'peso',titulo:'',unidade:'kg',valor_inicial:'',valor_alvo:'',prazo:''});
  const [busy,setBusy]=useState(false);
  const load=async()=>{const {data}=await sb.from('train_meta').select('*').eq('student_id',student.id).order('created_at');setMetas(data||[]);};
  useEffect(()=>{(async()=>{try{const {data:u}=await sb.auth.getUser();setCoachId(u?.user?.id||null);}catch(e){}await load();setLoaded(true);})();},[]);
  const setTipo=t=>{const info=META_TIPOS.find(x=>x[0]===t);setF(p=>({...p,tipo:t,unidade:info?info[2]:p.unidade}));};
  const add=async()=>{if(!f.titulo.trim()||f.valor_alvo===''){alert('Preencha o título e o valor da meta.');return;}
    /* O catch aqui nunca rodava: o supabase-js devolve {error}, não lança. A
       meta não era gravada, o formulário limpava, e a lista recarregava sem
       ela — como se o treinador nunca tivesse digitado. */
    setBusy(true);
    if(await gravarAvisando(sb.from('train_meta').insert({coach_id:coachId,student_id:student.id,tipo:f.tipo,titulo:f.titulo,unidade:f.unidade||null,
      valor_inicial:num(f.valor_inicial),valor_alvo:num(f.valor_alvo),prazo:f.prazo||null}),'A meta'))
      setF({tipo:'peso',titulo:'',unidade:'kg',valor_inicial:'',valor_alvo:'',prazo:''});
    await load();setBusy(false);};
  const del=async(id)=>{if(!confirm('Excluir esta meta?'))return;
    await gravarAvisando(sb.from('train_meta').delete().eq('id',id),'A meta');await load();};
  return(<div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.8)',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:16,overflow:'auto'}} onClick={onClose}>
    <div className="card" style={{maxWidth:520,width:'100%',marginTop:24}} onClick={e=>e.stopPropagation()}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
        <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:600}}>Metas · {student.name.split(' ')[0]}</div>
        <button className="btn-icon btn-sm" onClick={onClose}>×</button>
      </div>
      <p className="s-meta" style={{marginBottom:12}}>As metas aparecem no app do aluno com barra de progresso. Peso e % de gordura usam o valor da última avaliação.</p>
      {loaded&&metas.length>0&&<div style={{marginBottom:16}}>
        {metas.map(m=><div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:'1px solid var(--border)'}}>
          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600}}>{m.titulo}</div>
            <div className="s-meta">{m.valor_inicial!=null?`${m.valor_inicial}${m.unidade||''} → `:''}{m.valor_alvo}{m.unidade||''}{m.prazo?` · até ${fmtDate(m.prazo)}`:''}</div></div>
          <button className="btn-icon btn-sm" onClick={()=>del(m.id)}>×</button>
        </div>)}
      </div>}
      <div className="kpi-lbl" style={{margin:'4px 0 8px'}}>Nova meta</div>
      <div className="fg"><label className="flbl">Tipo</label>
        <select className="fi" value={f.tipo} onChange={e=>setTipo(e.target.value)}>{META_TIPOS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div>
      <div className="fg"><label className="flbl">Título</label><input className="fi" value={f.titulo} onChange={e=>setF(p=>({...p,titulo:e.target.value}))} placeholder="Ex.: Chegar a 72 kg"/></div>
      <div style={{display:'flex',gap:10}}>
        <div className="fg" style={{flex:1}}><label className="flbl">Valor inicial</label><input className="fi" type="number" value={f.valor_inicial} onChange={e=>setF(p=>({...p,valor_inicial:e.target.value}))} placeholder="atual"/></div>
        <div className="fg" style={{flex:1}}><label className="flbl">Meta</label><input className="fi" type="number" value={f.valor_alvo} onChange={e=>setF(p=>({...p,valor_alvo:e.target.value}))} placeholder="alvo"/></div>
        <div className="fg" style={{width:80}}><label className="flbl">Unidade</label><input className="fi" value={f.unidade} onChange={e=>setF(p=>({...p,unidade:e.target.value}))}/></div>
      </div>
      <div className="fg"><label className="flbl">Prazo (opcional)</label><input className="fi" type="date" value={f.prazo} onChange={e=>setF(p=>({...p,prazo:e.target.value}))}/></div>
      <button className="btn btn-primary" style={{width:'100%'}} disabled={busy} onClick={add}>{busy?'Salvando…':'+ Adicionar meta'}</button>
    </div>
  </div>);
}

/* ── Financeiro do aluno (mensalidade + pagamento do mês) ── */
function FinanceiroCard({student}){
  const comp=todayStr().slice(0,7);
  const [loaded,setLoaded]=useState(false);
  const [valor,setValor]=useState('');const [dia,setDia]=useState('');
  const [pago,setPago]=useState(false);const [edit,setEdit]=useState(false);const [busy,setBusy]=useState(false);
  useEffect(()=>{(async()=>{
    try{const {data:mm}=await sb.from('train_mensalidade').select('*').eq('student_id',student.id).maybeSingle();
      if(mm){setValor(mm.valor??'');setDia(mm.dia_venc??'');}
      const {data:pp}=await sb.from('train_pagamento').select('pago').eq('student_id',student.id).eq('competencia',comp).maybeSingle();
      setPago(!!(pp&&pp.pago));}catch(e){}
    setLoaded(true);
  })();},[]);
  /* Esta é a única tela do app que fala de dinheiro, e as duas gravações
     engoliam qualquer erro: o formulário fechava e o botão escrevia "✓ Pago"
     mesmo sem nada ter saído do aparelho. Dizer que um mês está pago quando o
     servidor não soube é o pior erro que este app pode cometer — o treinador
     confia na tela e não cobra. */
  const [erro,setErro]=useState(null);
  const salvar=async()=>{
    setBusy(true);setErro(null);
    try{
      const {error}=await comPrazo(sb.rpc('mensalidade_salvar',
        {p_student:student.id,p_valor:num(valor),p_dia:dia?parseInt(dia):null}));
      if(error)throw error;
      setEdit(false);
    }catch(e){
      setErro(isNetErr(e)?'A internet falhou. Nada foi salvo — tente de novo.'
        :'Não consegui salvar: '+(e.message||e));
    }
    setBusy(false);
  };
  const togglePago=async()=>{
    const nv=!pago;setPago(nv);setErro(null);
    try{
      const {error}=await comPrazo(sb.rpc('pagamento_marcar',
        {p_student:student.id,p_competencia:comp,p_pago:nv}));
      if(error)throw error;
    }catch(e){
      setPago(!nv);   // volta ao que era: a tela não pode afirmar o que não gravou
      setErro(isNetErr(e)?'A internet falhou. O pagamento não foi registrado.'
        :'Não consegui registrar: '+(e.message||e));
    }
  };
  const mesLbl=new Date(comp+'-01T00:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const temValor=valor!=='' && valor!=null;
  return(<div className="card" style={{marginTop:14}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
      <div style={{fontFamily:'var(--serif)',fontSize:16,fontWeight:600}}>Financeiro</div>
      {!edit&&<button className="btn btn-ghost btn-sm" onClick={()=>setEdit(true)}>{temValor?'Editar':'Definir mensalidade'}</button>}
    </div>
    {erro&&<div className="alert alert-danger" style={{marginBottom:10}}>{erro}</div>}
    {!loaded?<div className="s-meta">Carregando…</div>:edit?<div>
      <div style={{display:'flex',gap:10}}>
        <div className="fg" style={{flex:1,margin:0}}><label className="flbl">Mensalidade (R$)</label><input className="fi" type="number" value={valor} onChange={e=>setValor(e.target.value)} placeholder="Ex.: 250"/></div>
        <div className="fg" style={{flex:1,margin:0}}><label className="flbl">Dia do vencimento</label><input className="fi" type="number" min="1" max="31" value={dia} onChange={e=>setDia(e.target.value)} placeholder="Ex.: 10"/></div>
      </div>
      <div className="bgroup" style={{marginTop:10}}><button className="btn btn-primary btn-sm" disabled={busy} onClick={salvar}>{busy?'Salvando…':'Salvar'}</button><button className="btn btn-ghost btn-sm" onClick={()=>setEdit(false)}>Cancelar</button></div>
    </div>:!temValor?<div className="s-meta">Nenhuma mensalidade definida para este aluno.</div>:<div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
      <div><div style={{fontSize:22,fontWeight:800}}>R$ {(+valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        <div className="s-meta">{dia?`vence dia ${dia}`:'sem vencimento'} · <span>{maiusculaInicial(mesLbl)}</span></div></div>
      <span className="sp" style={{flex:1}}/>
      <button className={`btn btn-sm ${pago?'btn-primary':'btn-ghost'}`} onClick={togglePago}>{pago?'✓ Pago':'Marcar como pago'}</button>
    </div>}
  </div>);
}
const _DEMO_PAINEL=[
  {student_id:'d1',nome:'Laryssa Araujo',treinou:true,checkin_sinal:'Verde',agua_ml:2600,agua_meta:2500,refeicoes_ok:4,refeicoes_total:4,dias_parado:0,aval_dias:34,mensalidade_venc:10},
  {student_id:'d2',nome:'Joao Demonstracao',treinou:false,checkin_sinal:'Vermelho',agua_ml:750,agua_meta:3000,refeicoes_ok:1,refeicoes_total:5,dias_parado:2,aval_dias:58,mensalidade_venc:null},
  {student_id:'d3',nome:'Marina Cardoso',treinou:false,checkin_sinal:null,agua_ml:0,agua_meta:2500,refeicoes_ok:0,refeicoes_total:4,dias_parado:12,aval_dias:112,mensalidade_venc:5},
  {student_id:'d4',nome:'Rafael Nunes',treinou:true,checkin_sinal:'Amarelo',agua_ml:1900,agua_meta:3500,refeicoes_ok:3,refeicoes_total:5,dias_parado:0,aval_dias:null,mensalidade_venc:28},
  {student_id:'d5',nome:'Beatriz Lima',treinou:false,checkin_sinal:'Verde',agua_ml:2500,agua_meta:2500,refeicoes_ok:2,refeicoes_total:4,dias_parado:6,aval_dias:45,mensalidade_venc:null},
];
/* -- Painel "Hoje": o que precisa da decisão do treinador agora ──
   Uma RPC só (painel_hoje) em vez de 6 queries por aluno. */
/* Ligar o aviso no celular estava enterrado em "Meu perfil / marca", e sem ele
   o treinador só descobre que o aluno treinou quando abre o app. Este cartão
   fica no painel enquanto o aparelho não estiver inscrito e some depois. */
function LigarAvisoCard({demo}){
  const [estado,setEstado]=useState('vendo');  // vendo | precisa | ok | erro
  const [msg,setMsg]=useState(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{if(demo){setEstado('ok');return;}(async()=>{
    try{
      if(!pushSuportado()||!sb){setEstado('precisa');return;}
      if(Notification.permission!=='granted'){setEstado('precisa');return;}
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.getSubscription();
      if(!sub){setEstado('precisa');return;}
      const {data}=await sb.from('train_push').select('endpoint')
        .eq('endpoint',sub.toJSON().endpoint).eq('papel','treinador').maybeSingle();
      setEstado(data?'ok':'precisa');
    }catch(e){setEstado('precisa');}
  })();},[demo]);
  if(estado==='vendo'||estado==='ok')return null;
  if(conviteInstalarVisivel('coach'))return null;
  return(<div className="card" style={{marginBottom:18,borderColor:'rgba(234,179,8,.35)'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:14,flexWrap:'wrap'}}>
      <div style={{minWidth:220,flex:1}}>
        <div style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:600,marginBottom:3}}>Receber aviso quando o aluno treinar</div>
        <p className="s-meta" style={{marginBottom:0,lineHeight:1.55}}>
          Este aparelho ainda não está inscrito, então nada chega na sua tela — nem o treino
          concluído. É uma vez por aparelho. No iPhone, adicione o app à Tela de Início e
          abra por lá antes de ligar.</p>
      </div>
      <button className="btn btn-primary" disabled={busy} onClick={async()=>{
        setBusy(true);setMsg(null);
        const r=await ativarPushTreinador();
        if(r.ok)setEstado('ok'); else setMsg(r.msg);
        setBusy(false);
      }}>{busy?'Ligando…':'Ligar avisos neste aparelho'}</button>
    </div>
    {msg&&<div className="alert alert-danger" style={{marginTop:12,marginBottom:0}}>{msg}</div>}
  </div>);
}

// Parabenizar tinha cinco passos: abrir o aluno, abrir o compositor, escolher o
// tipo, escrever, enviar. Por isso quase nunca acontecia — e quem recebe uma
// palavra depois de treinar volta mais. Aqui e um toque. O texto muda com o dia
// para nao chegar sempre igual em quem treina toda semana.
const PARABENS_DO_DIA=[
  {titulo:'Mandou bem hoje',texto:'Vi aqui que você fechou o treino de hoje. É essa constância que constrói resultado.'},
  {titulo:'Treino fechado',texto:'Mais um na conta. O resultado vem de dias assim, não de um dia só.'},
  {titulo:'Boa!',texto:'Fechou o treino de hoje. Segue nesse ritmo que a evolução aparece na próxima avaliação.'},
  {titulo:'Presença marcada',texto:'Mais um treino registrado. Quem aparece nos dias comuns é quem chega longe.'},
];
const chaveParabens=id=>'mfp-parabens-'+id+'-'+new Date().toISOString().slice(0,10);
function PainelHoje({onSelect,students,demo}){
  const [rows,setRows]=useState(undefined);
  const [aberto,setAberto]=useState(true);
  const [parabens,setParabens]=useState({});   // student_id -> 'indo' | 'feito' | 'erro'
  // se ele recarregar a pagina, o botao nao pode voltar a oferecer o que ja foi
  const jaMandou=id=>{try{return localStorage.getItem(chaveParabens(id))==='1';}catch(e){return false;}};
  const mandarParabens=async(id,nome)=>{
    if(demo){setParabens(p=>({...p,[id]:'feito'}));return;}
    setParabens(p=>({...p,[id]:'indo'}));
    const m=PARABENS_DO_DIA[new Date().getDate()%PARABENS_DO_DIA.length];
    try{
      const {error}=await sb.rpc('aviso_enviar',{p_student:id,p_titulo:m.titulo,p_texto:m.texto,p_tipo:'parabens'});
      if(error)throw error;
      try{await sb.functions.invoke('push',{body:{student_id:id,titulo:m.titulo,texto:m.texto,tipo:'parabens'}});}catch(e){}
      try{localStorage.setItem(chaveParabens(id),'1');}catch(e){}
      setParabens(p=>({...p,[id]:'feito'}));
    }catch(e){setParabens(p=>({...p,[id]:'erro'}));}
  };
  useEffect(()=>{
    if(demo){setRows(_DEMO_PAINEL);return;}
    if(!sb){setRows(null);return;}
    // se painel_hoje ainda nao foi criada (unificacao-dados.sql), some sem erro
    lerCopia('painel-hoje',sb.rpc('painel_hoje'))
      .then(({data,error})=>setRows(error?null:(data||[])))
      .catch(()=>setRows(null));},[demo]);

  if(rows===undefined)return <div className="card" style={{marginBottom:18}}><div className="center-screen" style={{minHeight:70}}><div className="spinner"/></div></div>;
  if(rows===null||rows.length===0)return null;

  const byId=Object.fromEntries((students||[]).map(s=>[s.id,s]));
  const abrir=id=>{const s=byId[id];if(s&&onSelect)onSelect(s);};

  // prioriza: quanto mais alto o peso, mais cedo aparece
  const alertas=[];
  rows.forEach(r=>{
    if(r.checkin_sinal==='Vermelho')
      alertas.push({p:100,id:r.student_id,nome:r.nome,ic:'',cor:'#b91c1c',
        t:'Prontidão baixa hoje',d:'Sono, dor ou estresse ruins — vale ajustar a carga da sessão.'});
    if(r.dias_parado!=null&&r.dias_parado>=10)
      alertas.push({p:90,id:r.student_id,nome:r.nome,ic:'',cor:'#b91c1c',
        t:`Sumiu há ${r.dias_parado} dias`,d:'Risco real de perder o aluno. Uma mensagem hoje costuma resolver.'});
    else if(r.dias_parado!=null&&r.dias_parado>=5)
      alertas.push({p:60,id:r.student_id,nome:r.nome,ic:'',cor:'#b45309',
        t:`${r.dias_parado} dias sem treinar`,d:'Ainda dá para retomar sem quebrar o ritmo.'});
    if(r.aval_dias!=null&&r.aval_dias>=90)
      alertas.push({p:70,id:r.student_id,nome:r.nome,ic:'',cor:'#b45309',
        t:`Sem reavaliar há ${Math.floor(r.aval_dias/30)} meses`,d:'Sem medida nova não dá para mostrar evolução.'});
    if(r.aval_dias==null)
      alertas.push({p:65,id:r.student_id,nome:r.nome,ic:'',cor:'var(--accent)',
        t:'Nunca foi avaliado',d:'Fazer a avaliação inicial define a linha de base.'});
    if(r.refeicoes_total>0&&r.refeicoes_ok===0)
      alertas.push({p:40,id:r.student_id,nome:r.nome,ic:'',cor:'#b45309',
        t:'Não marcou nenhuma refeição hoje',d:`Plano com ${r.refeicoes_total} refeições, nenhuma confirmada.`});
    if(r.mensalidade_venc!=null){
      const hoje=new Date().getDate();const faltam=r.mensalidade_venc-hoje;
      if(faltam<0) alertas.push({p:80,id:r.student_id,nome:r.nome,ic:'',cor:'#b91c1c',
        t:`Mensalidade venceu dia ${r.mensalidade_venc}`,d:'Cobrança em atraso.'});
      else if(faltam<=3) alertas.push({p:30,id:r.student_id,nome:r.nome,ic:'',cor:'#6b7280',
        t:`Mensalidade vence dia ${r.mensalidade_venc}`,d:'Vale mandar o lembrete antes.'});
    }
  });
  alertas.sort((a,b)=>b.p-a.p);

  const treinaram=rows.filter(r=>r.treinou).length;
  const dietaOk=rows.filter(r=>r.refeicoes_total>0&&r.refeicoes_ok>=r.refeicoes_total).length;
  const comPlano=rows.filter(r=>r.refeicoes_total>0).length;
  const aguaOk=rows.filter(r=>r.agua_meta>0&&r.agua_ml>=r.agua_meta).length;
  const responderam=rows.filter(r=>r.checkin_sinal).length;
  const kpis=[
    ['Treinaram hoje',treinaram,rows.length,'var(--accent)'],
    ['Dieta em dia',dietaOk,comPlano,'#15803d'],
    ['Bateram a água',aguaOk,rows.length,'#0891b2'],
    ['Fizeram check-in',responderam,rows.length,'#b45309'],
  ];
  const hojeRaw=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
  const hoje=hojeRaw.charAt(0).toUpperCase()+hojeRaw.slice(1);   // so a 1a letra: "Quarta-feira, 12 de agosto"

  return(<div className="card" style={{marginBottom:18}}>
    <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:14}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:'var(--serif)',fontSize:21,fontWeight:600}}>Hoje</div>
        <div className="s-meta">{hoje}</div>
      </div>
      {alertas.length>0&&<span className="badge" style={{background:'#fee2e2',color:'#b91c1c',fontWeight:700}}>
        {alertas.length} {alertas.length===1?'pendência':'pendências'}</span>}
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,marginBottom:16}}>
      {kpis.map(([lbl,v,tot,cor])=>{const pct=tot>0?Math.round((v/tot)*100):0;return(
        <div key={lbl} style={{background:'var(--bg3,#f7f4ef)',borderRadius:14,padding:'12px 13px'}}>
          <div style={{fontSize:10.5,color:'var(--text2)',textTransform:'uppercase',letterSpacing:.5,fontWeight:700,marginBottom:5}}>{lbl}</div>
          <div style={{display:'flex',alignItems:'baseline',gap:4}}>
            <span style={{fontFamily:'var(--serif)',fontSize:24,fontWeight:700,color:cor}}>{v}</span>
            <span style={{fontSize:12,color:'var(--text3)'}}>/ {tot}</span>
          </div>
          <div style={{height:5,background:'#e7e0d6',borderRadius:3,overflow:'hidden',marginTop:7}}>
            <i style={{display:'block',height:'100%',width:pct+'%',background:cor,borderRadius:3}}/>
          </div>
        </div>);})}
    </div>

    {(()=>{const t=rows.filter(r=>r.treinou);if(!t.length)return null;
      return(<div style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,color:'#15803d',marginBottom:8}}>
          Treinaram hoje</div>
        {t.map(r=>{const st=parabens[r.student_id]||(jaMandou(r.student_id)?'feito':null);
          return(<div key={r.student_id} style={{display:'flex',alignItems:'center',gap:10,
            padding:'9px 0',borderTop:'1px solid var(--border)'}}>
            <span className="link" style={{flex:1,minWidth:0,cursor:'pointer',fontWeight:600,fontSize:13.5}}
              onClick={()=>abrir(r.student_id)}>{r.nome}</span>
            {st==='feito'
              ? <span className="s-meta" style={{fontSize:12}}>parabenizado</span>
              : <button className="btn btn-secondary" style={{padding:'5px 12px',fontSize:12.5}}
                  disabled={st==='indo'} onClick={()=>mandarParabens(r.student_id,r.nome)}>
                  {st==='indo'?'Enviando…':st==='erro'?'Tentar de novo':'Parabenizar'}</button>}
          </div>);})}
      </div>);})()}

    {alertas.length===0?
      <div style={{textAlign:'center',padding:'18px 10px',color:'var(--text2)',fontSize:13.5}}>
        Nenhuma pendência. Todo mundo em dia — aproveite.</div>:
      <>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,color:'var(--accent)'}}>Precisa de você</div>
          {alertas.length>5&&<span className="link" style={{fontSize:12,cursor:'pointer'}} onClick={()=>setAberto(a=>!a)}>
            {aberto?'ver menos':`ver todas (${alertas.length})`}</span>}
        </div>
        {(aberto?alertas:alertas.slice(0,5)).map((a,i)=>(
          <div key={i} onClick={()=>abrir(a.id)} style={{display:'flex',gap:11,alignItems:'flex-start',padding:'10px 0',
            borderTop:i?'1px solid var(--border)':'none',cursor:byId[a.id]?'pointer':'default'}}>
            <span style={{width:9,height:9,borderRadius:'50%',background:a.cor,flexShrink:0,marginTop:6}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13.5}}><b>{a.nome}</b> · <span style={{color:a.cor,fontWeight:600}}>{a.t}</span></div>
              <div style={{fontSize:12,color:'var(--text2)',marginTop:1}}>{a.d}</div>
            </div>
            {byId[a.id]&&<span style={{color:'var(--text3)',fontSize:15}}>›</span>}
          </div>))}
      </>}
  </div>);
}


/* ── Evolução da carteira: quem está andando e quem empacou ──
   Usa as avaliações que o dashboard já carregou: nenhuma query nova. */
function PainelEvolucao({rows,onSelect}){
  const [aberto,setAberto]=useState(false);

  const dados=React.useMemo(()=>rows.map(r=>{
    if(r.se.length<2)return{r,base:false};
    const asc=[...r.se].reverse();
    const pri=derive(r.s,asc[0]), ult=derive(r.s,asc[asc.length-1]);
    const d=(a,b)=>(a!=null&&b!=null)?+(b-a).toFixed(1):null;
    const dPeso=d(pri.weight,ult.weight);
    const dGord=d(pri.fatPct,ult.fatPct);
    const dMagra=d(pri.leanMass,ult.leanMass);
    const sh=r.scoreHist;
    const dScore=(sh.length>1)?Math.round(sh[sh.length-1]-sh[0]):null;
    // veredito: score manda; composicao desempata
    let v;
    if(dScore!=null&&dScore>=3) v={l:'Evoluindo',c:'#2f8f4e'};
    else if(dScore!=null&&dScore<=-3) v={l:'Regredindo',c:'#b3434f'};
    else if(dGord!=null&&dGord<=-1&&(dMagra==null||dMagra>=-0.3)) v={l:'Evoluindo',c:'#2f8f4e'};
    else if(dGord!=null&&dGord>=1.5) v={l:'Atenção',c:'#c98a3a'};
    else v={l:'Estável',c:'#8a8378'};
    const meses=Math.max(1,Math.round((new Date(asc[asc.length-1].date)-new Date(asc[0].date))/2592000000));
    return{r,base:true,dPeso,dGord,dMagra,dScore,v,meses,n:asc.length};
  }),[rows]);

  const comBase=dados.filter(x=>x.base);
  if(comBase.length===0)return null;
  const conta=l=>comBase.filter(x=>x.v.l===l).length;
  const ord=[...comBase].sort((a,b)=>(b.dScore??-99)-(a.dScore??-99));
  const mostra=aberto?ord:ord.slice(0,5);
  const semBase=dados.length-comBase.length;

  const seta=(v,melhorSeCai)=>{
    if(v==null)return<span style={{color:'var(--text3)'}}>—</span>;
    const bom=melhorSeCai?v<0:v>0;
    const cor=v===0?'#8a8378':bom?'#2f8f4e':'#b3434f';
    return<span style={{color:cor,fontWeight:700}}>{v>0?'+':''}{fmt(v)}</span>;
  };

  return(<div className="card" style={{marginBottom:18}}>
    <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:14}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:'var(--serif)',fontSize:21,fontWeight:600}}>Evolução</div>
        <div className="s-meta">Comparando a primeira e a última avaliação de cada aluno</div>
      </div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,marginBottom:16}}>
      {[['Evoluindo',conta('Evoluindo'),'#2f8f4e'],['Estável',conta('Estável'),'#8a8378'],
        ['Atenção',conta('Atenção'),'#c98a3a'],['Regredindo',conta('Regredindo'),'#b3434f']].map(([l,n,c])=>(
        <div key={l} style={{background:'var(--bg3,#f7f4ef)',borderRadius:14,padding:'12px 13px'}}>
          <div style={{fontSize:10.5,color:'var(--text2)',textTransform:'uppercase',letterSpacing:.5,fontWeight:700}}>{l}</div>
          <div style={{fontFamily:'var(--serif)',fontSize:26,fontWeight:700,color:c,marginTop:2}}>{n}</div>
        </div>))}
    </div>

    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:520}}>
        <thead><tr style={{textAlign:'left',color:'var(--text3)',fontSize:10.5,textTransform:'uppercase',letterSpacing:.5}}>
          <th style={{padding:'0 8px 8px 0',fontWeight:700}}>Aluno</th>
          <th style={{padding:'0 8px 8px',fontWeight:700}}>Score</th>
          <th style={{padding:'0 8px 8px',fontWeight:700,textAlign:'right'}}>Peso</th>
          <th style={{padding:'0 8px 8px',fontWeight:700,textAlign:'right'}}>Gordura</th>
          <th style={{padding:'0 8px 8px',fontWeight:700,textAlign:'right'}}>Magra</th>
          <th style={{padding:'0 0 8px 8px',fontWeight:700}}></th>
        </tr></thead>
        <tbody>
          {mostra.map(x=>(
            <tr key={x.r.s.id} onClick={()=>onSelect&&onSelect(x.r.s)}
              style={{borderTop:'1px solid var(--border)',cursor:'pointer'}}>
              <td style={{padding:'10px 8px 10px 0'}}>
                <div style={{fontWeight:600}}>{x.r.s.name}</div>
                <div style={{fontSize:11,color:'var(--text3)'}}>{x.n} avaliações · {x.meses} {x.meses===1?'mês':'meses'}</div>
              </td>
              <td style={{padding:'10px 8px'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <Sparkline values={x.r.scoreHist} color={x.v.c} w={70} h={24}/>
                  {seta(x.dScore,false)}
                </div>
              </td>
              <td style={{padding:'10px 8px',textAlign:'right'}}>{x.dPeso==null?'—':<span>{x.dPeso>0?'+':''}{fmt(x.dPeso)} kg</span>}</td>
              <td style={{padding:'10px 8px',textAlign:'right'}}>{x.dGord==null?'—':<>{seta(x.dGord,true)}<span style={{color:'var(--text3)'}}> pp</span></>}</td>
              <td style={{padding:'10px 8px',textAlign:'right'}}>{x.dMagra==null?'—':<>{seta(x.dMagra,false)}<span style={{color:'var(--text3)'}}> kg</span></>}</td>
              <td style={{padding:'10px 0 10px 8px'}}>
                <span style={{fontSize:11,fontWeight:700,color:x.v.c,whiteSpace:'nowrap'}}>{x.v.l}</span></td>
            </tr>))}
        </tbody>
      </table>
    </div>

    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}>
      <span className="s-meta">{semBase>0?`${semBase} aluno${semBase>1?'s':''} sem base de comparação (só uma avaliação)`:''}</span>
      {ord.length>5&&<span className="link" style={{fontSize:12,cursor:'pointer'}} onClick={()=>setAberto(a=>!a)}>
        {aberto?'ver menos':`ver todos (${ord.length})`}</span>}
    </div>
  </div>);
}

function Dashboard({students,evals,onSelect,onNew,onDelete,onReassess,onSchedule,onTrain,demo}){
  const [q,setQ]=useState('');
  const [filter,setFilter]=useState('todos');
  const [sortBy,setSortBy]=useState('urgencia');
  const [notify,setNotify]=useState(null); // {student} | {all:true}

  const rows=React.useMemo(()=>students.map(s=>{
    const se=evals.filter(e=>e.studentId===s.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
    const asc=[...se].reverse();
    const scoreHist=asc.map((e,i)=>evalOverall(s,e,asc[i-1]));
    const last=se[0];
    const lastScore=scoreHist.length?scoreHist[scoreHist.length-1]:null;
    const prevScore=scoreHist.length>1?scoreHist[scoreHist.length-2]:null;
    const scoreDelta=(lastScore!=null&&prevScore!=null)?lastScore-prevScore:null;
    const ri=reassessInfo(se);
    const daysSince=last?Math.floor((new Date(todayStr()+'T00:00:00')-new Date(last.date+'T00:00:00'))/86400000):null;
    let status;
    if(se.length===0)status={l:'Sem avaliação',c:'bb',rank:2};
    else if(ri&&ri.days<0)status={l:`Reavaliação vencida há ${Math.abs(ri.days)}d`,c:'br',rank:0};
    else if(ri&&ri.days<=7)status={l:ri.days===0?'Reavaliar hoje':`Reavaliar em ${ri.days}d`,c:'ba',rank:1};
    else if(daysSince!=null&&daysSince>120)status={l:'Inativo',c:'ba',rank:3};
    else status={l:'Em dia',c:'bg',rank:5};
    const active=daysSince!=null&&daysSince<=90;
    return{s,se,last,scoreHist:scoreHist.filter(v=>v!=null),lastScore,scoreDelta,ri,daysSince,status,active};
  }),[students,evals]);

  const kpi=React.useMemo(()=>{
    const withEval=rows.filter(r=>r.se.length>0);
    const active=rows.filter(r=>r.active).length;
    const inactive=rows.filter(r=>!r.active&&r.se.length>0).length;
    const noEval=rows.filter(r=>r.se.length===0).length;
    const overdue=rows.filter(r=>r.ri&&r.ri.days<0).length;
    const week=rows.filter(r=>r.ri&&r.ri.days>=0&&r.ri.days<=7).length;
    const month=rows.filter(r=>r.ri&&r.ri.days>7&&r.ri.days<=30).length;
    const ym=todayStr().slice(0,7);
    const evalsMonth=evals.filter(e=>e.date&&e.date.slice(0,7)===ym).length;
    const scores=withEval.map(r=>r.lastScore).filter(v=>v!=null);
    const avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null;
    const deltas=rows.map(r=>r.scoreDelta).filter(v=>v!=null);
    const avgDelta=deltas.length?Math.round(deltas.reduce((a,b)=>a+b,0)/deltas.length):null;
    return{active,inactive,noEval,overdue,week,month,evalsMonth,avg,avgDelta,total:rows.length};
  },[rows,evals]);


  const filtered=rows.filter(r=>r.s.name.toLowerCase().includes(q.toLowerCase()))
    .filter(r=>{if(filter==='reavaliar')return r.ri&&r.ri.days<=7;if(filter==='sem')return r.se.length===0;if(filter==='ativos')return r.active;if(filter==='inativos')return !r.active&&r.se.length>0;return true;})
    .sort((a,b)=>{
      if(sortBy==='nome')return a.s.name.localeCompare(b.s.name);
      if(sortBy==='recente')return new Date(b.last?.date||0)-new Date(a.last?.date||0);
      if(sortBy==='score')return (b.lastScore??-1)-(a.lastScore??-1);
      return a.status.rank-b.status.rank||(a.ri?.days??999)-(b.ri?.days??999)||a.s.name.localeCompare(b.s.name);
    });

  const chips=[['todos','Todos',kpi.total],['ativos','Ativos',kpi.active],['inativos','Inativos',kpi.inactive],['reavaliar','Reavaliar',kpi.overdue+kpi.week],['sem','Sem avaliação',kpi.noEval]];

  return(
    <div>
      <div className="abar">
        <div><div className="ph-title">Painel do treinador</div>
          <div className="ph-sub">{students.length} aluno{students.length!==1?'s':''}
            {kpi.evalsMonth>0&&` · ${kpi.evalsMonth} avaliaç${kpi.evalsMonth!==1?'ões':'ão'} neste mês`}
            {kpi.avg!=null&&` · score médio ${kpi.avg}`}
            {kpi.avgDelta>0&&' ▲'}{kpi.avgDelta<0&&' ▼'}</div></div>
        <button className="btn btn-primary" onClick={onNew}>+ Novo aluno</button>
      </div>
      <ConviteInstalar fechavel chave="coach"
        titulo="Instale o app no seu celular"
        texto="Aberto pelo ícone, você recebe na hora o aviso de quando um aluno termina o treino."/>

      <LigarAvisoCard demo={demo}/>
      <PainelHoje students={students} onSelect={onSelect} demo={demo}/>
      <PainelEvolucao rows={rows} onSelect={onSelect}/>

      <div style={{display:'flex',gap:12,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <div className="search-wrap" style={{flex:1,minWidth:180}}><span className="search-icon"><IconBusca/></span>
          <input className="fi" placeholder="Buscar aluno..." value={q} onChange={e=>setQ(e.target.value)}/></div>
        <select className="fi" aria-label="Ordenar a lista de alunos" style={{width:'auto',minWidth:170}} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="urgencia">Ordenar: urgência</option>
          <option value="recente">Ordenar: mais recente</option>
          <option value="score">Ordenar: maior score</option>
          <option value="nome">Ordenar: nome</option>
        </select>
      </div>
      <div className="chips" style={{marginBottom:20}}>
        {chips.map(([k,l,n])=><button key={k} type="button" className={`chip ${filter===k?'active':''}`} onClick={()=>setFilter(k)}>{l}<span className="cn">{n}</span></button>)}
      </div>

      {students.length===0&&<div className="empty">        <div className="empty-title">Nenhum aluno cadastrado</div>
        <p style={{marginBottom:16,fontSize:13}}>Comece adicionando o primeiro aluno</p>
        <button className="btn btn-primary" onClick={onNew}>+ Novo aluno</button></div>}
      {students.length>0&&filtered.length===0&&<div className="empty">        <div className="empty-title">Nenhum aluno neste filtro</div></div>}

      {filtered.length>0&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',margin:'4px 2px 10px'}}>
        <div className="kpi-lbl">Acompanhamento de alunos</div>
        <button className="btn btn-ghost btn-sm" onClick={()=>setNotify({all:true})}>Avisar todos</button>
      </div>}
      {notify&&<NotifyModal target={notify} students={students} onClose={()=>setNotify(null)}/>}
      {(()=>{
        const Row=({s,se,last,lastScore,ri,active})=>{
          let pill;
          if(se.length===0)pill={c:'b',t:'Sem avaliação'};
          else if(ri&&ri.days<0)pill={c:'r',t:`Vencida · ${Math.abs(ri.days)}d`};
          else if(ri&&ri.days<=7)pill={c:'a',t:`Atenção · ${ri.days}d`};
          else if(ri)pill={c:'g',t:`Em dia · ${ri.days}d`};
          else pill={c:'g',t:'Em dia'};
          const dias=last?Math.floor((new Date(todayStr()+'T00:00:00')-new Date(last.date+'T00:00:00'))/86400000):null;
          return(
            <div key={s.id} className="dash-row" onClick={()=>onSelect(s)}>
              <div className="avatar" style={{width:42,height:42,fontSize:14}}>{s.photo?<img src={s.photo} alt=""/>:initials(s.name)}</div>
              <div style={{minWidth:0}}>
                <div className="dr-name">{s.name}</div>
                <div className="dr-meta">{s.goal||(se.length>0?`${se.length} avaliaç${se.length>1?'ões':'ão'} · ${fmtDate(last.date)}`:'Sem avaliações')}</div>
              </div>
              <div className="dr-right">
                {lastScore!=null&&<span className="dscore" style={{color:scoreColor(lastScore)}}>{lastScore}</span>}
                <span className={`dstat-pill dstat-${pill.c}`}><i/>{pill.t}</span>
                {!active&&se.length>0&&<button className="dr-act" title="Reativar aluno" onClick={e=>{e.stopPropagation();setNotify({student:s,reativar:true});}}>Reativar</button>}
                <button className="dr-act" title="Enviar aviso" onClick={e=>{e.stopPropagation();setNotify({student:s});}}>Avisar</button>
                <button className="dr-act" title="Treino" onClick={e=>{e.stopPropagation();onTrain(s);}}>Treino</button>
                <button className="dr-act" title="Excluir" onClick={e=>{e.stopPropagation();if(confirm(`Excluir ${s.name} e todas as avaliações?`))onDelete(s.id);}}>×</button>
              </div>
            </div>);
        };
        const groupHead=(txt,n,cor)=>(<div style={{display:'flex',alignItems:'center',gap:8,margin:'18px 2px 9px'}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:cor}}/>
          <span className="kpi-lbl" style={{margin:0}}>{txt}</span><span className="cn">{n}</span></div>);
        if(filter==='todos'){
          const ativos=filtered.filter(r=>r.active);
          const inativos=filtered.filter(r=>!r.active);
          return(<div>
            {ativos.length>0&&<>{groupHead('Ativos',ativos.length,'var(--green,#2f8f4e)')}
              <div className="dash-list">{ativos.map(r=><Row key={r.s.id} {...r}/>)}</div></>}
            {inativos.length>0&&<>{groupHead('Inativos e sem avaliação',inativos.length,'#c98a3a')}
              <div className="dash-list" style={{opacity:.9}}>{inativos.map(r=><Row key={r.s.id} {...r}/>)}</div></>}
          </div>);
        }
        return <div className="dash-list">{filtered.map(r=><Row key={r.s.id} {...r}/>)}</div>;
      })()}
    </div>);
}

/* ── PhotoUpload ── */
function PhotoUpload({value,onChange}){
  const ref=useRef();
  const pick=f=>{if(!f)return;const r=new FileReader();r.onload=e=>{
    const img=new Image();img.onload=()=>{
      const c=document.createElement('canvas');const m=320;let{width:w,height:h}=img;
      const sc=Math.min(m/w,m/h,1);c.width=w*sc;c.height=h*sc;
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      onChange(c.toDataURL('image/jpeg',0.8));
    };img.src=e.target.result;};r.readAsDataURL(f);};
  return(
    <div className="fg"><label className="flbl">Foto do aluno</label>
      <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
        <div className="photo-up" onClick={()=>ref.current.click()}>
          {value?<img src={value} alt=""/>:<div className="photo-ph"><span className="photo-ph-icon">Foto</span>Toque<br/>p/ adicionar</div>}
        </div>
        {value&&<button className="btn btn-ghost btn-sm" onClick={()=>onChange('')}>Remover</button>}
        <input ref={ref} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>pick(e.target.files[0])}/>
      </div>
    </div>);
}

/* Sobreposição de fio de prumo + grade sobre a foto postural */
function PlumbOverlay({plumb=50,grid=true}){
  return(
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
      {grid&&<g stroke="rgba(176,137,79,.45)" strokeWidth="0.4">
        <line x1="33.3" y1="0" x2="33.3" y2="100"/><line x1="66.6" y1="0" x2="66.6" y2="100"/>
        <line x1="0" y1="33.3" x2="100" y2="33.3"/><line x1="0" y1="66.6" x2="100" y2="66.6"/>
      </g>}
      <line x1={plumb} y1="0" x2={plumb} y2="100" stroke="#b3434f" strokeWidth="0.7" strokeDasharray="2 1.5"/>
    </svg>);
}
/* Upload de foto postural com prumo ajustável (form) */
function PlumbPhoto({label,photo,plumb,onPhoto,onPlumb}){
  const ref=useRef();
  const pick=f=>{if(!f)return;const r=new FileReader();r.onload=e=>{
    const img=new Image();img.onload=()=>{const c=document.createElement('canvas');const m=760;let{width:w,height:h}=img;
      const sc=Math.min(m/w,m/h,1);c.width=w*sc;c.height=h*sc;c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      onPhoto(c.toDataURL('image/jpeg',0.72));};img.src=e.target.result;};r.readAsDataURL(f);};
  return(
    <div className="fg"><label className="flbl">{label}</label>
      {photo?<>
        <div style={{position:'relative',borderRadius:12,overflow:'hidden',border:'1px solid var(--border2)',background:'#000',maxWidth:220}}>
          <img src={photo} alt="" style={{display:'block',width:'100%'}}/>
          <PlumbOverlay plumb={plumb??50}/>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6,maxWidth:220}}>
          <span style={{fontSize:11,color:'var(--text2)'}}>Prumo</span>
          <input type="range" min="0" max="100" value={plumb??50} onChange={e=>onPlumb(parseInt(e.target.value))} style={{flex:1}}/>
          <button className="btn btn-ghost btn-sm" onClick={()=>onPhoto('')}>×</button>
        </div>
      </>:
        <div className="photo-up" style={{width:'100%',maxWidth:220,height:150}} onClick={()=>ref.current.click()}>
          <div className="photo-ph"><span className="photo-ph-icon">Foto</span>{label}<br/>toque p/ adicionar</div></div>}
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>pick(e.target.files[0])}/>
    </div>);
}

/* ── Postura: marcação de pontos anatômicos e cálculo de ângulos ── */
const POSTURE_VIEWS={
  front:{label:'Anterior',landmarks:[
    {k:'earR',l:'Orelha D',s:'R'},{k:'earL',l:'Orelha E',s:'L'},
    {k:'jugular',l:'Incisura jugular',s:'C'},
    {k:'acrR',l:'Acrômio D',s:'R'},{k:'acrL',l:'Acrômio E',s:'L'},
    {k:'axR',l:'Axila D',s:'R'},{k:'axL',l:'Axila E',s:'L'},
    {k:'waistR',l:'Cintura D',s:'R'},{k:'waistL',l:'Cintura E',s:'L'},
    {k:'asisR',l:'EIAS D',s:'R'},{k:'asisL',l:'EIAS E',s:'L'},
    {k:'kneeR',l:'Joelho D',s:'R'},{k:'kneeL',l:'Joelho E',s:'L'},
    {k:'malR',l:'Maléolo D',s:'R'},{k:'malL',l:'Maléolo E',s:'L'}],
    pairs:[['earR','earL'],['acrR','acrL'],['axR','axL'],['waistR','waistL'],['asisR','asisL'],['kneeR','kneeL'],['malR','malL']]},
  side:{label:'Lateral',landmarks:[
    {k:'tragus',l:'Trago',s:'C'},{k:'acr',l:'Acrômio',s:'C'},{k:'troch',l:'Trocânter',s:'C'},{k:'fib',l:'Cab. fíbula',s:'C'},{k:'mal',l:'Maléolo',s:'C'}],
    pairs:[]},
  back:{label:'Posterior',landmarks:[
    {k:'c7',l:'C7',s:'C'},{k:'scapR',l:'Escápula D',s:'R'},{k:'scapL',l:'Escápula E',s:'L'},
    {k:'sacrum',l:'Sacro',s:'C'},{k:'malR',l:'Maléolo D',s:'R'},{k:'malL',l:'Maléolo E',s:'L'}],
    pairs:[['scapR','scapL'],['malR','malL']]}
};
function classifyTilt(deg){const x=num(deg);if(x==null)return null;const a=Math.abs(x);if(a<2)return{l:'Simétrico',c:'bg'};if(a<4)return{l:'Leve',c:'bb'};if(a<6)return{l:'Moderado',c:'ba'};return{l:'Acentuado',c:'br'};}
function classifySym(p){const x=num(p);if(x==null)return null;if(x>=90)return{l:'Ótima',c:'bg'};if(x>=80)return{l:'Boa',c:'bb'};if(x>=70)return{l:'Regular',c:'ba'};return{l:'Baixa',c:'br'};}
function segAngle(a,b,asp){if(!a||!b)return null;return Math.atan2((b.y-a.y),(b.x-a.x)*asp)*180/Math.PI;}
function vertAngle(a,b,asp){if(!a||!b)return null;return Math.atan2((b.x-a.x)*asp,(b.y-a.y))*180/Math.PI;}
function computePosture(view,pts,asp){
  if(!pts||!asp)return[];const P=pts;const out=[];const add=(l,v,u,badge)=>{if(v!=null&&!isNaN(v))out.push({l,v:+(+v).toFixed(1),u,badge});};
  if(view==='front'){
    const h=segAngle(P.earR,P.earL,asp);if(h!=null)add('Inclinação da cabeça',Math.abs(h),'°',classifyTilt(h));
    const s=segAngle(P.acrR,P.acrL,asp);if(s!=null)add('Inclinação dos ombros',Math.abs(s),'°',classifyTilt(s));
    const pe=segAngle(P.asisR,P.asisL,asp);if(pe!=null)add('Inclinação da pelve',Math.abs(pe),'°',classifyTilt(pe));
    const k=segAngle(P.kneeR,P.kneeL,asp);if(k!=null)add('Inclinação dos joelhos',Math.abs(k),'°',classifyTilt(k));
    // linha de gravidade (plumbo pelo ponto médio dos maléolos)
    const mid=(P.malR&&P.malL)?(P.malR.x+P.malL.x)/2:null;
    if(mid!=null){
      if(P.jugular){const dj=Math.abs((P.jugular.x-mid)*asp*100);add('Desequilíbrio na incisura jugular',dj,'%',classifyTilt(dj/1.2));}
      const mlDiff=(kR,kL,lbl)=>{if(!P[kR]||!P[kL])return;const dR=Math.abs(P[kR].x-mid)*asp,dL=Math.abs(P[kL].x-mid)*asp;const base=(dR+dL)/2||1;const idx=Math.abs(dL-dR)/base*100;add(lbl,idx,'%',classifyTilt(idx/2));};
      mlDiff('axR','axL','Diferença médio-lateral na axila');
      mlDiff('waistR','waistL','Diferença médio-lateral na cintura');
    }
    // simetria: média do desalinhamento vertical dos pares
    const prs=[['earR','earL'],['acrR','acrL'],['axR','axL'],['waistR','waistL'],['asisR','asisL'],['kneeR','kneeL'],['malR','malL']];
    const ds=prs.filter(([a,b])=>P[a]&&P[b]).map(([a,b])=>Math.abs(P[a].y-P[b].y));
    if(ds.length){const m=ds.reduce((x,y)=>x+y,0)/ds.length;const sym=Math.max(0,Math.min(100,Math.round(100-m*600)));add('Simetria corporal',sym,'%',classifySym(sym));}
  }else if(view==='side'){
    const fh=vertAngle(P.acr,P.tragus,asp);if(fh!=null)add('Projeção anterior da cabeça',Math.abs(fh),'°',classifyTilt(fh/1.5));
    if(P.mal){const dev=k=>P[k]?+((P[k].x-P.mal.x)*asp*100).toFixed(1):null;
      const a=dev('acr'),t=dev('troch');
      if(a!=null)add('Desvio do acrômio (linha de gravidade)',a,'%');
      if(t!=null)add('Desvio do trocânter (linha de gravidade)',t,'%');}
  }else if(view==='back'){
    const sc=segAngle(P.scapR,P.scapL,asp);if(sc!=null)add('Inclinação das escápulas',Math.abs(sc),'°',classifyTilt(sc));
    const sp=vertAngle(P.c7,P.sacrum,asp);if(sp!=null)add('Desvio lateral da coluna',Math.abs(sp),'°',classifyTilt(sp));
    const prs=[['scapR','scapL'],['malR','malL']];
    const ds=prs.filter(([a,b])=>P[a]&&P[b]).map(([a,b])=>Math.abs(P[a].y-P[b].y));
    if(ds.length){const m=ds.reduce((x,y)=>x+y,0)/ds.length;const sym=Math.max(0,Math.min(100,Math.round(100-m*600)));add('Simetria posterior',sym,'%',classifySym(sym));}
  }
  return out;
}
function ptColor(s){return s==='R'?'#2563eb':s==='L'?'#c4685e':'#5a1e2e';}
/* Overlay dos pontos + linhas (compartilhado form/relatório) */
function PostureOverlay({view,pts,active,showLabels}){
  const cfg=POSTURE_VIEWS[view];if(!cfg)return null;
  const X=p=>p.x*100,Y=p=>p.y*100;
  let plumb=50;const ml=pts.mal,mr=pts.malR,mll=pts.malL;
  if(view==='side'&&ml)plumb=ml.x*100;else if((view==='front'||view==='back')&&mr&&mll)plumb=(mr.x+mll.x)/2*100;
  const r=showLabels?2.8:1.5;
  return(
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
      <line x1={plumb} y1="0" x2={plumb} y2="100" stroke="rgba(179,67,79,.65)" strokeWidth="0.5" strokeDasharray="1.5 1.2"/>
      {cfg.pairs.map(([a,b],i)=>pts[a]&&pts[b]?<line key={i} x1={X(pts[a])} y1={Y(pts[a])} x2={X(pts[b])} y2={Y(pts[b])} stroke="#b0894f" strokeWidth="0.7"/>:null)}
      {cfg.landmarks.map(l=>{const p=pts[l.k];if(!p)return null;const on=active===l.k;return <g key={l.k}>
        {on&&<circle cx={X(p)} cy={Y(p)} r={r+3} fill="var(--accent)" opacity="0.18"/>}
        {on&&<circle cx={X(p)} cy={Y(p)} r={r+2.4} fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.95"/>}
        <circle cx={X(p)} cy={Y(p)} r={r} fill={ptColor(l.s)} stroke="#fff" strokeWidth={showLabels?0.9:0.5}/>
      </g>;})}
    </svg>);
}
/* Marcação interativa (formulário) */
const POSTURE_TEMPLATES={
  front:{earR:{x:.45,y:.09},earL:{x:.55,y:.09},jugular:{x:.5,y:.2},acrR:{x:.37,y:.22},acrL:{x:.63,y:.22},axR:{x:.4,y:.3},axL:{x:.6,y:.3},waistR:{x:.42,y:.44},waistL:{x:.58,y:.44},asisR:{x:.43,y:.5},asisL:{x:.57,y:.5},kneeR:{x:.44,y:.72},kneeL:{x:.56,y:.72},malR:{x:.45,y:.94},malL:{x:.55,y:.94}},
  side:{tragus:{x:.53,y:.09},acr:{x:.5,y:.23},troch:{x:.5,y:.5},fib:{x:.5,y:.74},mal:{x:.5,y:.94}},
  back:{c7:{x:.5,y:.15},scapR:{x:.44,y:.28},scapL:{x:.56,y:.28},sacrum:{x:.5,y:.52},malR:{x:.46,y:.94},malL:{x:.54,y:.94}}
};
function PostureMarker({view,label,photo,pts,onPhoto,onPts,onMetrics}){
  const cfg=POSTURE_VIEWS[view];
  const [P,setP]=useState(()=>pts&&Object.keys(pts).length?pts:{});
  const [asp,setAsp]=useState(P._a||null);
  const [active,setActive]=useState(()=>{const fm=cfg.landmarks.find(l=>!P[l.k]);return fm?fm.k:cfg.landmarks[0].k;});
  const boxRef=useRef();const fileRef=useRef();const drag=useRef(null);const Pref=useRef(P);Pref.current=P;
  const pick=f=>{if(!f)return;const r=new FileReader();r.onload=e=>{const img=new Image();img.onload=()=>{
    const c=document.createElement('canvas');const m=760;let{width:w,height:h}=img;const sc=Math.min(m/w,m/h,1);
    c.width=w*sc;c.height=h*sc;c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    onPhoto(c.toDataURL('image/jpeg',0.75));};img.src=e.target.result;};r.readAsDataURL(f);};
  const commit=np=>{const withA={...np,_a:asp};Pref.current=withA;setP(withA);onPts(withA);if(asp)onMetrics(computePosture(view,withA,asp));};
  useEffect(()=>{if(asp&&Object.keys(Pref.current).some(k=>k!=='_a'))onMetrics(computePosture(view,Pref.current,asp));},[asp]);
  const norm=e=>{const r=boxRef.current.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
  const nearest=c=>{let best=0.1,key=null;cfg.landmarks.forEach(l=>{const p=Pref.current[l.k];if(p){const d=Math.hypot(p.x-c.x,p.y-c.y);if(d<best){best=d;key=l.k;}}});return key;};
  const down=e=>{e.preventDefault();const c=norm(e);const nk=nearest(c);
    if(nk){drag.current=nk;setActive(nk);try{boxRef.current.setPointerCapture(e.pointerId);}catch(x){}}
    else if(active){const np={...Pref.current,[active]:c};const idx=cfg.landmarks.findIndex(l=>l.k===active);const nx=cfg.landmarks.slice(idx+1).find(l=>!np[l.k]);commit(np);setActive(nx?nx.k:active);}};
  const move=e=>{if(!drag.current)return;e.preventDefault();const c=norm(e);const np={...Pref.current,[drag.current]:c};Pref.current=np;setP(np);};
  const up=()=>{if(drag.current){drag.current=null;commit(Pref.current);}};
  const template=()=>{commit({...POSTURE_TEMPLATES[view]});setActive(null);};
  const placed=cfg.landmarks.filter(l=>P[l.k]).length;
  return(
    <div className="fg"><label className="flbl">{label} · {placed}/{cfg.landmarks.length} pontos</label>
      {photo?<>
        <div ref={boxRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{position:'relative',borderRadius:12,overflow:'hidden',border:'1px solid var(--border2)',background:'#000',width:'100%',maxWidth:360,margin:'0 auto',cursor:'crosshair',touchAction:'none',userSelect:'none'}}>
          <img src={photo} alt="" draggable="false" style={{display:'block',width:'100%',pointerEvents:'none'}} onLoad={e=>{const a=e.target.naturalWidth/e.target.naturalHeight;setAsp(a);
            if(!Object.keys(Pref.current).some(k=>k!=='_a')){const tp={...POSTURE_TEMPLATES[view],_a:a};Pref.current=tp;setP(tp);onPts(tp);onMetrics(computePosture(view,tp,a));setActive(cfg.landmarks[0].k);}}}/>
          <PostureOverlay view={view} pts={P} active={active} showLabels/>
        </div>
        <div style={{fontSize:11.5,color:'var(--text2)',marginTop:6,textAlign:'center',lineHeight:1.5}}>Arraste cada ponto até o marco anatômico correto. Toque num ponto (ou nas etiquetas abaixo) para destacá-lo.</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:5,marginTop:7,justifyContent:'center'}}>
          {cfg.landmarks.map(l=>{const done=!!P[l.k];const on=active===l.k;
            return <button key={l.k} type="button" onClick={()=>setActive(l.k)}
              style={{fontSize:10.5,padding:'5px 9px',borderRadius:14,cursor:'pointer',border:'1px solid '+(on?'var(--accent)':done?ptColor(l.s):'var(--border2)'),
                background:on?'var(--accent)':done?ptColor(l.s):'transparent',color:on||done?'#fff':'var(--text2)',fontWeight:600}}>
              {done?'✓ ':''}{l.l}</button>;})}
        </div>
        <div style={{display:'flex',gap:6,marginTop:8,justifyContent:'center',flexWrap:'wrap'}}>
          <button className="btn btn-secondary btn-sm" type="button" onClick={template}>Auto-posicionar</button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={()=>{commit({});setActive(cfg.landmarks[0].k);}}>Limpar</button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={()=>{onPhoto('');commit({});}}>Trocar foto</button>
        </div>
      </>:
        <div className="photo-up" style={{width:'100%',maxWidth:360,height:180,margin:'0 auto'}} onClick={()=>fileRef.current.click()}>
          <div className="photo-ph">{label}<br/>toque p/ adicionar foto</div></div>}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>pick(e.target.files[0])}/>
    </div>);
}

/* ── StudentForm ── */
function StudentForm({student,onSave,onCancel}){
  const [f,setF]=useState(student||{
    name:'',dob:'',gender:'M',phone:'',email:'',profession:'',goal:'',
    activity:'Moderadamente ativo',schedule:'',train_time:'',photo:'',
    health:'',meds:'',family_hist:'',injuries:'',smoker:'Não',alcohol:'Não',sleep:'',obs:''});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return(
    <div>
      <div className="abar">
        <div><div className="breadcrumb" onClick={onCancel}>← Voltar</div>
          <div className="ph-title">{student?'Editar aluno':'Novo aluno'}</div>
          <div className="ph-sub">Dados cadastrais e anamnese</div></div>
        <div className="bgroup">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={()=>{if(!f.name.trim()){alert('Nome é obrigatório');return;}onSave({...f,id:student?.id||uid()});}}>Salvar</button>
        </div>
      </div>
      <div className="card">
        <div className="sec">
          <div className="sec-title">Dados pessoais</div>
          <div style={{display:'flex',gap:20,alignItems:'flex-start',flexWrap:'wrap'}}>
            <PhotoUpload value={f.photo} onChange={v=>s('photo',v)}/>
            <div style={{flex:1,minWidth:240}}>
              <FI label="Nome completo *" value={f.name} onChange={e=>s('name',e.target.value)} placeholder="Nome do aluno"/>
              <div className="fgrid2" style={{marginTop:13}}>
                <FI label="Data de nascimento" type="date" value={f.dob} onChange={e=>s('dob',e.target.value)}/>
                <FS label="Sexo biológico" value={f.gender} onChange={e=>s('gender',e.target.value)}>
                  <option value="M">Masculino</option><option value="F">Feminino</option></FS>
              </div>
            </div>
          </div>
          <div className="fgrid" style={{marginTop:13}}>
            <FI label="Telefone / WhatsApp" value={f.phone} onChange={e=>s('phone',e.target.value)} placeholder="(00) 00000-0000"/>
            <FI label="E-mail" type="email" value={f.email} onChange={e=>s('email',e.target.value)} placeholder="email@exemplo.com"/>
            <FI label="Profissão" value={f.profession} onChange={e=>s('profession',e.target.value)} placeholder="Ex: Advogado"/>
          </div>
        </div>

        <div className="sec">
          <div className="sec-title">Perfil de treino</div>
          <div className="fgrid">
            <FI label="Objetivo principal" value={f.goal} onChange={e=>s('goal',e.target.value)} placeholder="Hipertrofia, emagrecimento..."/>
            <FS label="Perfil de avaliação (bateria)" value={f.profile_type||''} onChange={e=>s('profile_type',e.target.value)}>
              <option value="">— escolher —</option>{PROFILE_TYPES.map(p=><option key={p}>{p}</option>)}</FS>
            <FS label="Nível de atividade física" value={f.activity} onChange={e=>s('activity',e.target.value)}>
              <option>Sedentário</option><option>Levemente ativo</option><option>Moderadamente ativo</option>
              <option>Muito ativo</option><option>Atleta</option></FS>
            <FI label="Tempo de treino / experiência" value={f.train_time} onChange={e=>s('train_time',e.target.value)} placeholder="Ex: 2 anos"/>
            <FI label="Horários disponíveis" value={f.schedule} onChange={e=>s('schedule',e.target.value)} placeholder="Ex: Seg/Qua/Sex manhã"/>
          </div>
        </div>

        <div className="sec">
          <div className="sec-title">Anamnese / Histórico de saúde</div>
          <div className="fgrid2" style={{marginBottom:13}}>
            <FS label="Fumante" value={f.smoker} onChange={e=>s('smoker',e.target.value)}>
              <option>Não</option><option>Sim</option><option>Ex-fumante</option></FS>
            <FS label="Consumo de álcool" value={f.alcohol} onChange={e=>s('alcohol',e.target.value)}>
              <option>Não</option><option>Social</option><option>Frequente</option></FS>
            <FI label="Qualidade do sono" value={f.sleep} onChange={e=>s('sleep',e.target.value)} placeholder="Ex: 7h, boa"/>
          </div>
          <div className="fgrid" style={{gridTemplateColumns:'1fr 1fr'}}>
            <FTA label="Doenças / condições de saúde" value={f.health} onChange={e=>s('health',e.target.value)} placeholder="Hipertensão, diabetes, asma..."/>
            <FTA label="Medicamentos em uso" value={f.meds} onChange={e=>s('meds',e.target.value)} placeholder="Nome e dosagem..."/>
            <FTA label="Histórico familiar" value={f.family_hist} onChange={e=>s('family_hist',e.target.value)} placeholder="Doenças na família..."/>
            <FTA label="Lesões / limitações articulares" value={f.injuries} onChange={e=>s('injuries',e.target.value)} placeholder="Lesões prévias, dores, restrições..."/>
          </div>
          <div style={{marginTop:13}}>
            <FTA label="Observações gerais" value={f.obs} onChange={e=>s('obs',e.target.value)} placeholder="Outras informações relevantes..."/>
          </div>
        </div>
      </div>
    </div>);
}

/* ── EvalForm ── */
const BLANK_EVAL={date:todayStr(),
  weight:'',height:'',bp_sys:'',bp_dia:'',resting_hr:'',dyn_r:'',dyn_l:'',
  bio_fat:'',bio_muscle:'',bio_muscle_pct:'',bio_lean:'',bio_water:'',bio_visceral:'',bio_bmr:'',bio_metabage:'',bio_bone:'',
  sf_protocol:'jp7',
  sf_triceps:'',sf_subscapular:'',sf_biceps:'',sf_chest:'',sf_midaxillary:'',sf_suprailiac:'',sf_abdomen:'',sf_thigh:'',sf_calf:'',
  circ_shoulders:'',circ_chest:'',circ_waist:'',circ_abdomen:'',circ_hip:'',
  circ_arm_r:'',circ_arm_l:'',circ_thigh_r:'',circ_thigh_l:'',circ_calf_r:'',circ_calf_l:'',
  pw_cmj:'',pw_horizontal:'',pw_sargent:'',pw_medball:'',pw_sprint20:'',pw_agility_t:'',
  pw_sj:'',pw_dj_h:'',pw_dj_ct:'',pw_sprint5:'',pw_sprint10:'',pw_sprint30:'',pw_illinois:'',pw_505_r:'',pw_505_l:'',pw_rast_fi:'',pw_yoyo:'',pw_beep:'',
  func_tug:'',func_sts5:'',func_chair30:'',func_wallsit:'',func_plank:'',func_deadhang:'',func_slsts_r:'',func_slsts_l:'',func_obs:'',
  injury_current:'',injury_history:'',inj_surgery:'',inj_fracture:'',inj_sprain:'',inj_tendinitis:'',inj_hernia:'',inj_muscle:'',inj_details:'',injury_map:{},
  mq_squat:'',mq_lunge:'',mq_pushup:'',mq_deadlift:'',mq_run:'',mq_jump:'',mq_obs:'',
  mob_lunge:'',goal_weight:'',goal_fat:'',goal_next:'',pt_strong:'',pt_improve:'',pt_strategy:'',obs:''};

/* Protocolos selecionáveis por avaliação */
const EVAL_MODULES=[['quest','Questionários'],['injury','Lesões'],['bp','Hemodinâmica'],['dyn','Dinamometria'],['bio','Bioimpedância'],['skin','Dobras'],['circ','Circunferências'],['postural','Postural'],['mobility','Mobilidade'],['balance','Equilíbrio'],['resist','Resistência'],['func','Funcional'],['movement','Qualidade do movimento'],['flex','Flexibilidade'],['cardio','Cardio'],['strength','1‑RM'],['power','Potência'],['goals','Metas'],['parecer','Parecer']];
const EVAL_PRESETS=[
  ['Completa',['quest','injury','bp','dyn','bio','skin','circ','postural','mobility','balance','resist','func','movement','flex','cardio','strength','power','goals','parecer']],
  ['Só bioimpedância',['bio','goals','parecer']],
  ['Composição',['bio','skin','circ','goals','parecer']],
  ['Saúde',['quest','injury','bp','bio','circ','postural','mobility','balance','func','flex','cardio','goals','parecer']],
  ['Performance',['injury','dyn','postural','mobility','resist','func','movement','power','cardio','strength','goals','parecer']]
];
/* Bateria automática conforme o perfil do aluno */
const PROFILE_TYPES=['Saúde','Condicionamento','Atleta','Personalizado'];
const PROFILE_PRESET={
  'Saúde':['quest','injury','bp','bio','circ','postural','mobility','balance','func','flex','cardio','goals','parecer'],
  'Condicionamento':['quest','injury','bp','bio','skin','circ','postural','mobility','resist','func','movement','flex','cardio','goals','parecer'],
  'Atleta':['injury','dyn','postural','mobility','balance','resist','func','movement','power','cardio','strength','flex','goals','parecer'],
  'Personalizado':null
};

/* Dados fictícios para o modo demo (?demo=1) */
const DEMO_STUDENTS=[{id:'ds1',name:'João Demonstração',dob:'1992-05-10',gender:'M',phone:'(11) 98888-0000',email:'joao@demo.com',profession:'Engenheiro',goal:'Hipertrofia e perda de gordura',activity:'Muito ativo',schedule:'Seg/Qua/Sex',train_time:'3 anos',photo:'',health:'Hipertensão controlada',meds:'Losartana 50mg',family_hist:'Pai diabético',injuries:'Dor lombar ocasional',smoker:'Não',alcohol:'Social',sleep:'7h, boa',obs:''}];
const _dev=(date,w,fat,musc,wat,visc,bmr,mage,bone,shoulders,waist)=>({date,weight:String(w),height:'178',resting_hr:'62',bp_sys:'124',bp_dia:'80',dyn_r:'46',dyn_l:'44',
  bio_fat:String(fat),bio_muscle:String(musc),bio_muscle_pct:'43',bio_lean:'',bio_water:String(wat),bio_visceral:String(visc),bio_bmr:String(bmr),bio_metabage:String(mage),bio_bone:String(bone),
  sf_triceps:'11',sf_subscapular:'14',sf_biceps:'6',sf_chest:'9',sf_midaxillary:'11',sf_suprailiac:'15',sf_abdomen:'18',sf_thigh:'12',sf_calf:'9',
  circ_shoulders:String(shoulders),circ_chest:'104',circ_waist:String(waist),circ_abdomen:String(waist+2),circ_hip:'101',circ_arm_r:'39',circ_arm_l:'38',circ_thigh_r:'60',circ_thigh_l:'59',circ_calf_r:'39',circ_calf_l:'39',
  res_pushup:'34',res_situp:'40',res_squat:'45',res_pullup:'12',flex_wells:'28',mob_lunge:'11',
  short_hamstring:'Encurtado leve',short_iliopsoas:'Normal',short_rectus:'Normal',short_calf:'Normal',short_pec:'Encurtado leve',
  inc_vfinal:'15',inc_time:'11',pw_cmj:'42',pw_horizontal:'230',pw_sargent:'55',pw_medball:'6.2',pw_sprint20:'3.1',pw_agility_t:'10.2',
  rm_bench_w:'100',rm_bench_r:'5',rm_squat_w:'140',rm_squat_r:'5',rm_dead_w:'160',rm_dead_r:'3',rm_ohp_w:'',rm_ohp_r:'',rm_row_w:'',rm_row_r:'',
  post_head:'Leve anteriorização',post_shoulders:'Protraídos',post_scapula:'Alada D',post_cervical:'Normal',post_thoracic:'Hipercifose',post_lumbar:'Hiperlordose',post_pelvis:'Anteversão',post_knees:'Normal',post_feet:'Pronado',
  post_obs:'Padrão de anteriorização com protração de ombros.',flex_obs:'',
  goal_weight:'75',goal_fat:'14',goal_next:'2026-10-09',pt_strong:'Boa força relativa e preensão manual.',pt_improve:'Mobilidade de quadril e flexibilidade posterior.',pt_strategy:'Fortalecimento de core, mobilidade e ajuste calórico leve.',obs:'Boa evolução geral.',
  _mods:['bp','dyn','bio','skin','circ','postural','resist','flex','cardio','strength','power','goals','parecer']});
const _demoPhoto=(c,t)=>`data:image/svg+xml;utf8,`+encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='360'><rect width='240' height='360' fill='#1b1b22'/><g fill='${c}'><circle cx='120' cy='60' r='30'/><rect x='95' y='92' width='50' height='150' rx='16'/><rect x='70' y='100' width='24' height='110' rx='12'/><rect x='146' y='100' width='24' height='110' rx='12'/><rect x='100' y='238' width='18' height='110' rx='8'/><rect x='122' y='238' width='18' height='110' rx='8'/></g><text x='120' y='350' fill='#fff' font-size='16' text-anchor='middle' font-family='sans-serif'>${t}</text></svg>`);
const DEMO_EVALS=[
  {id:'de1',studentId:'ds1',post_photo_front:_demoPhoto('#8a5a5a','Mar/2026'),post_photo_side:_demoPhoto('#8a5a5a','Mar'),..._dev('2026-03-09',84,22,34,52,9,1820,34,3.2,118,92)},
  {id:'de2',studentId:'ds1',post_photo_front:_demoPhoto('#5a8a63','Jul/2026'),post_photo_side:_demoPhoto('#5a8a63','Jul'),..._dev('2026-07-09',78,16,37,56,6,1760,29,3.3,124,86)}
];

function EvalForm({student,evalData,carryHeight,isReassess,onSave,onCancel}){
  const [f,setF]=useState(evalData||{...BLANK_EVAL,height:carryHeight||'',_mods:PROFILE_PRESET[student.profile_type]||undefined});
  const upd=(k,v)=>setF(p=>({...p,[k]:v}));
  const N=(label,key,unit,ph)=>(
    <div className="fg"><label className="flbl">{label}{unit&&<span style={{color:'var(--text3)',marginLeft:3}}>({unit})</span>}</label>
      <input className="fi" type="number" inputMode="decimal" step="0.1" value={f[key]} onChange={e=>upd(key,e.target.value)} placeholder={ph||''}/></div>);
  const a=age(student.dob)||25;
  const d=derive(student,f);
  const bmiCls=classifyBMI(d.bmi),bpCls=classifyBP(f.bp_sys,f.bp_dia),fatCls=classifyFat(student.gender,a,d.fatPct);
  const mods=f._mods||EVAL_MODULES.map(m=>m[0]);
  const has=k=>mods.includes(k);
  const toggleMod=k=>upd('_mods',has(k)?mods.filter(x=>x!==k):[...mods,k]);
  const setPreset=arr=>upd('_mods',arr);
  return(
    <div>
      <div className="abar">
        <div><div className="breadcrumb" onClick={onCancel}>← {student.name}</div>
          <div className="ph-title">{evalData?'Editar avaliação':isReassess?'Reavaliação':'Nova avaliação'}</div>
          {isReassess&&<div className="ph-sub">Estatura preenchida da última avaliação · ajuste se necessário</div>}</div>
        <div className="bgroup">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={()=>onSave({...f,id:evalData?.id||uid()})}>Salvar avaliação</button>
        </div>
      </div>
      {(d.bmi||bpCls||d.fatPct||d.dynAvg||d.hidr)&&(
        <div className="stat-grid">
          {d.bmi&&<Stat lbl="IMC" val={fmt(d.bmi)} unit="kg/m²" badge={bmiCls}/>}
          {bpCls&&<Stat lbl="Pressão arterial" val={`${numBR(f.bp_sys)}/${numBR(f.bp_dia)}`} unit="mmHg" badge={bpCls}/>}
          {d.fatPct!=null&&<Stat lbl="% Gordura" val={fmt(d.fatPct)} unit="%" badge={fatCls}/>}
          {d.dynAvg&&<Stat lbl="Preensão média" val={fmt(d.dynAvg)} unit="kgf"/>}
          {d.rcq&&<Stat lbl="Cintura/Quadril" val={fmt(d.rcq,2)}/>}
          {d.hidr&&<Stat lbl="Hidratação/dia" val={(d.hidr/1000).toFixed(1).replace('.',',')} unit="L"/>}
        </div>)}
      <div className="card" style={{marginBottom:16}}>
        <div className="sec-title" style={{marginBottom:12}}>Protocolos desta avaliação</div>
        <div className="bgroup" style={{marginBottom:12}}>
          {EVAL_PRESETS.map(([lbl,arr])=><button key={lbl} type="button" className="btn btn-ghost btn-sm" onClick={()=>setPreset(arr)}>{lbl}</button>)}
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {EVAL_MODULES.map(([k,lbl])=>(
            <button key={k} type="button" onClick={()=>toggleMod(k)}
              style={{padding:'8px 12px',borderRadius:20,fontSize:12.5,fontWeight:600,cursor:'pointer',border:'1px solid '+(has(k)?'var(--accent)':'var(--border2)'),background:has(k)?'var(--accent)':'transparent',color:has(k)?'var(--cream)':'var(--text2)'}}>
              {has(k)?' ':''}{lbl}</button>))}
        </div>
        <div style={{fontSize:11.5,color:'var(--text3)',marginTop:10}}>Só os protocolos marcados aparecem abaixo e no relatório. (Data, peso e estatura estão sempre presentes.)</div>
      </div>
      <div className="card">
        <div className="sec"><div className="sec-title">Data e medidas básicas</div>
          <div className="fgrid">
            <FI label="Data da avaliação" type="date" value={f.date} onChange={e=>upd('date',e.target.value)}/>
            {N('Peso','weight','kg','70.5')}{N('Estatura','height','cm','175')}
          </div>
          {d.bmi&&<div className="alert alert-info" style={{marginTop:13}}>IMC: <strong>{fmt(d.bmi)} kg/m²</strong>{bmiCls&&<> — <Badge cls={bmiCls.c}>{bmiCls.l}</Badge></>}</div>}
        </div>
        {has('bp')&&<div className="sec"><div className="sec-title">Dados hemodinâmicos</div>
          <div className="fgrid">{N('Freq. cardíaca de repouso','resting_hr','bpm','60')}{N('PA sistólica','bp_sys','mmHg','120')}{N('PA diastólica','bp_dia','mmHg','80')}</div>
          {bpCls&&<div style={{marginTop:9}}>Pressão arterial: <Badge cls={bpCls.c}>{bpCls.l}</Badge></div>}
        </div>}
        {has('dyn')&&<div className="sec"><div className="sec-title">Dinamometria — preensão manual</div>
          <div className="fgrid">{N('Mão direita','dyn_r','kgf','35')}{N('Mão esquerda','dyn_l','kgf','32')}</div>
          {d.dynAvg&&<div style={{marginTop:9,fontSize:12,color:'var(--text2)'}}>Média: <strong style={{color:'var(--text)'}}>{fmt(d.dynAvg)} kgf</strong></div>}
        </div>}
        {has('bio')&&<div className="sec"><div className="sec-title">Bioimpedância</div>
          <div className="fgrid2">{N('% Gordura corporal','bio_fat','%','18.5')}{N('Massa muscular','bio_muscle','kg','32')}
            {N('% Músculo esquelético','bio_muscle_pct','%','42')}{N('Massa magra','bio_lean','kg','58')}{N('% Água corporal','bio_water','%','55')}
            {N('Massa óssea','bio_bone','kg','3.2')}{N('Gordura visceral','bio_visceral','nível','5')}
            {N('Taxa metab. basal (TMB)','bio_bmr','kcal','1750')}{N('Idade metabólica','bio_metabage','anos','28')}</div>
        </div>}
        {has('skin')&&(()=>{
          const proto=f.sf_protocol||'jp7';const req=sfSites(proto,student.gender);const isReq=k=>req.includes(k);
          const star=k=>isReq(k)?' ★':'';
          return <div className="sec"><div className="sec-title">Dobras cutâneas</div>
          <div className="fg" style={{maxWidth:340}}><label className="flbl">Protocolo</label>
            <select className="fi" value={proto} onChange={e=>upd('sf_protocol',e.target.value)}>
              {Object.entries(SF_PROTOCOLS).map(([k,p])=><option key={k} value={k}>{p.label}</option>)}
            </select></div>
          <div className="alert alert-info">Preencha as dobras com ★ ({req.map(k=>SF_LABELS[k]).join(', ')}) para o cálculo automático de % de gordura — protocolo {SF_PROTOCOLS[proto].label}{student.gender==='F'?' (feminino)':' (masculino)'}.</div>
          <div className="fgrid2">{N('Tríceps'+star('sf_triceps'),'sf_triceps','mm')}{N('Subescapular'+star('sf_subscapular'),'sf_subscapular','mm')}{N('Bíceps'+star('sf_biceps'),'sf_biceps','mm')}
            {N('Tórax/Peitoral'+star('sf_chest'),'sf_chest','mm')}{N('Axilar média'+star('sf_midaxillary'),'sf_midaxillary','mm')}{N('Suprailíaca'+star('sf_suprailiac'),'sf_suprailiac','mm')}
            {N('Abdominal'+star('sf_abdomen'),'sf_abdomen','mm')}{N('Coxa'+star('sf_thigh'),'sf_thigh','mm')}{N('Panturrilha'+star('sf_calf'),'sf_calf','mm')}</div>
          {d.jp!=null&&<div className="alert alert-success" style={{marginTop:13}}>% Gordura ({SF_PROTOCOLS[proto].short}): <strong>{fmt(d.jp)}%</strong>{fatCls&&<> — <Badge cls={fatCls.c}>{fatCls.l}</Badge></>}</div>}
        </div>;})()}
        {has('circ')&&<div className="sec"><div className="sec-title">Circunferências</div>
          <div className="fgrid2">{N('Ombros','circ_shoulders','cm')}{N('Tórax','circ_chest','cm')}{N('Cintura','circ_waist','cm')}
            {N('Abdômen','circ_abdomen','cm')}{N('Quadril','circ_hip','cm')}{N('Braço dir. contraído','circ_arm_r','cm')}
            {N('Braço esq. contraído','circ_arm_l','cm')}{N('Coxa direita','circ_thigh_r','cm')}{N('Coxa esquerda','circ_thigh_l','cm')}
            {N('Panturrilha dir.','circ_calf_r','cm')}{N('Panturrilha esq.','circ_calf_l','cm')}</div>
          {(d.rcq||d.whtr)&&<div className="alert alert-info" style={{marginTop:12}}>
            {d.rcq&&<div>Relação cintura/quadril: <strong>{fmt(d.rcq,2)}</strong> {classifyRCQ(student.gender,d.rcq)&&<Badge cls={classifyRCQ(student.gender,d.rcq).c}>{classifyRCQ(student.gender,d.rcq).l}</Badge>}</div>}
            {d.whtr&&<div style={{marginTop:5}}>Relação cintura/estatura: <strong>{fmt(d.whtr,2)}</strong> {classifyWHtR(d.whtr)&&<Badge cls={classifyWHtR(d.whtr).c}>{classifyWHtR(d.whtr).l}</Badge>}</div>}
          </div>}
        </div>}
        {(()=>{const SEL=(label,key,opts)=>(
          <div className="fg"><label className="flbl">{label}</label>
            <select className="fi" value={f[key]||''} onChange={e=>upd(key,e.target.value)}>
              <option value="">—</option>{opts.map(o=><option key={o} value={o}>{o}</option>)}</select></div>);
          const pAge=age(student.dob);const G=student.gender;
          const puCls=classifyPushup(G,pAge,f.res_pushup);
          const siCls=classifySitup(G,pAge,f.res_situp);
          const sqCls=classifySquat(G,f.res_squat);
          const puuCls=classifyPullup(G,f.res_pullup);
          const wCls=classifyWells(G,pAge,f.flex_wells);
          const vo2=num(f.inc_vfinal)?incVO2(f.inc_vfinal):(num(f.cooper_dist)?cooperVO2(f.cooper_dist):num(f.vo2max));
          const vo2Cls=classifyVO2(G,pAge,vo2);
          const PhotoField=(lbl,k)=><PlumbPhoto label={lbl} photo={f['post_photo_'+k]} plumb={f['post_plumb_'+k]}
            onPhoto={v=>upd('post_photo_'+k,v)} onPlumb={v=>upd('post_plumb_'+k,v)}/>;
          const badgeLine=(lbl,cls,val,unit)=>cls?<div style={{marginTop:8}}><span style={{fontSize:12,color:'var(--text2)'}}>{lbl}: <strong style={{color:'var(--text)'}}>{val} {unit}</strong></span> <Badge cls={cls.c}>{cls.l}</Badge></div>:null;
          return(<>
          {has('postural')&&<div className="sec"><div className="sec-title">Avaliação postural</div>
            <div className="alert alert-info">Adicione as fotos (frente, lateral e costas) e toque nos pontos anatômicos indicados. Os ângulos são calculados automaticamente.</div>
            <div className="fgrid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))'}}>
              {['front','side','back'].map(v=><PostureMarker key={v} view={v} label={POSTURE_VIEWS[v].label}
                photo={f['post_photo_'+v]} pts={f['post_pts_'+v]}
                onPhoto={val=>upd('post_photo_'+v,val)} onPts={val=>upd('post_pts_'+v,val)} onMetrics={m=>upd('post_metrics_'+v,m)}/>)}
            </div>
            {['front','side','back'].some(v=>(f['post_metrics_'+v]||[]).length>0)&&
              <div className="alert alert-success" style={{marginTop:12}}>
                {['front','side','back'].map(v=>{const m=f['post_metrics_'+v]||[];if(!m.length)return null;
                  return <div key={v} style={{marginBottom:6}}><strong>{POSTURE_VIEWS[v].label}:</strong> {m.map((x,i)=><span key={i} style={{marginRight:10}}>{x.l} <strong>{x.v}{x.u}</strong>{x.badge&&<> <Badge cls={x.badge.c}>{x.badge.l}</Badge></>}</span>)}</div>;})}
              </div>}
            <div style={{marginTop:14,fontSize:12.5,fontWeight:700,color:'var(--accent)'}}>Classificação por segmento (grau)</div>
            <div className="fgrid2" style={{marginTop:8}}>
              {SEL('Cabeça','post_head',['Alinhada','Leve anteriorização','Moderada','Grave'])}
              {SEL('Ombros','post_shoulders',['Simétricos','Direito elevado','Esquerdo elevado','Protraídos','Retraídos'])}
              {SEL('Escápulas','post_scapula',['Normal','Alada D','Alada E','Abduzida','Aduzida','Elevada','Deprimida'])}
              {SEL('Coluna cervical','post_cervical',['Normal','Hiperlordose','Retificada'])}
              {SEL('Coluna torácica','post_thoracic',['Normal','Hipercifose','Retificada'])}
              {SEL('Coluna lombar','post_lumbar',['Normal','Hiperlordose','Retificada'])}
              {SEL('Pelve','post_pelvis',['Neutra','Anteversão','Retroversão','Inclinação D','Inclinação E','Rotação'])}
              {SEL('Joelhos','post_knees',['Normal','Valgo','Varo','Recurvato','Flexo'])}
              {SEL('Pés','post_feet',['Normal','Pronado','Supinado','Plano','Cavo','Hallux Valgus'])}
            </div>
            <div style={{marginTop:12}}><FTA label="Observações posturais" value={f.post_obs||''} onChange={e=>upd('post_obs',e.target.value)} placeholder="Assimetrias, compensações, encurtamentos..."/></div>
          </div>}

          {has('resist')&&<div className="sec"><div className="sec-title">Testes de resistência muscular</div>
            <div className="fgrid2">
              {N('Flexão de braço','res_pushup','reps')}
              {N('Abdominal (1 min)','res_situp','reps')}
              {N('Agachamento (1 min)','res_squat','reps')}
              {N('Barra fixa','res_pullup','reps')}
            </div>
            {badgeLine('Flexão de braço',puCls,f.res_pushup,'reps')}
            {badgeLine('Abdominal',siCls,f.res_situp,'reps')}
            {badgeLine('Agachamento',sqCls,f.res_squat,'reps')}
            {badgeLine('Barra fixa',puuCls,f.res_pullup,'reps')}
          </div>}

          {has('mobility')&&(()=>{
            const asymRow=(lbl,r,l,thrPct,thrAbs)=>{const a=asymmetry(f[r],f[l],thrPct,thrAbs);return a?<div style={{marginTop:6}}><span style={{fontSize:12,color:'var(--text2)'}}>{lbl} — dif. {a.diff} ({a.pct}%)</span> <Badge cls={a.badge.c}>{a.badge.l}</Badge></div>:null;};
            return(<div className="sec"><div className="sec-title">Mobilidade articular</div>
              <details style={{marginBottom:10}}><summary style={{cursor:'pointer',fontSize:12,color:'var(--text2)'}}>Como realizar cada teste</summary>
                <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.7,marginTop:6}}>
                  <b>Knee to Wall</b>: distância máxima do hálux à parede mantendo o joelho tocando a parede e o calcanhar no chão (dorsiflexão).<br/>
                  <b>SLR</b>: em decúbito dorsal, eleve a perna estendida; registre o ângulo do quadril.<br/>
                  <b>Rotação torácica</b>: sentado/quadrupede, gire o tronco; registre a amplitude (°).<br/>
                  <b>Thomas</b>: joelho ao peito; a coxa oposta que se eleva indica encurtamento de iliopsoas.<br/>
                  <b>Ober</b>: decúbito lateral; a coxa que não desce indica encurtamento do TFL/banda IT.<br/>
                  <b>Ely</b>: em prono, flexione o joelho; elevação do quadril indica encurtamento do reto femoral.<br/>
                  <b>FABER</b>: flexão-abdução-rotação externa; dor indica quadril/sacroilíaca.<br/>
                  <b>FADIR</b>: flexão-adução-rotação interna; dor sugere impacto femoroacetabular.<br/>
                  <b>Mobilidade de ombro</b>: teste "mão nas costas" (Apley); compare os lados.<br/>
                  <b>Overhead squat</b>: agachamento com barra acima da cabeça; observe compensações.
                </div></details>
              <div className="fgrid2">
                {N('Knee to Wall D','kneewall_r','cm')}{N('Knee to Wall E','kneewall_l','cm')}
                {N('SLR D','slr_r','°')}{N('SLR E','slr_l','°')}
                {N('Rotação torácica D','throt_r','°')}{N('Rotação torácica E','throt_l','°')}
                {SEL('Thomas D','thomas_r',['Normal','Encurtado'])}{SEL('Thomas E','thomas_l',['Normal','Encurtado'])}
                {SEL('Ober D','ober_r',['Normal','Encurtado'])}{SEL('Ober E','ober_l',['Normal','Encurtado'])}
                {SEL('Ely D','ely_r',['Normal','Encurtado'])}{SEL('Ely E','ely_l',['Normal','Encurtado'])}
                {SEL('FABER D','faber_r',['Negativo','Positivo'])}{SEL('FABER E','faber_l',['Negativo','Positivo'])}
                {SEL('FADIR D','fadir_r',['Negativo','Positivo'])}{SEL('FADIR E','fadir_l',['Negativo','Positivo'])}
                {SEL('Mob. ombro D','shldr_r',['Normal','Restrito'])}{SEL('Mob. ombro E','shldr_l',['Normal','Restrito'])}
                {SEL('Overhead squat','ohs',['Bom','Compensações leves','Compensações moderadas','Restrito'])}
              </div>
              {badgeLine('Knee to Wall D',classifyKneeWall(f.kneewall_r),f.kneewall_r,'cm')}
              {badgeLine('Knee to Wall E',classifyKneeWall(f.kneewall_l),f.kneewall_l,'cm')}
              {badgeLine('SLR D',classifySLR(f.slr_r),f.slr_r,'°')}
              {badgeLine('SLR E',classifySLR(f.slr_l),f.slr_l,'°')}
              {asymRow('Assimetria dorsiflexão','kneewall_r','kneewall_l',null,1.5)}
              {asymRow('Assimetria SLR','slr_r','slr_l',10,null)}
              <div style={{marginTop:10}}><FTA label="Observações de mobilidade" value={f.mob_obs||''} onChange={e=>upd('mob_obs',e.target.value)} placeholder="Restrições, dor, compensações..."/></div>
            </div>);
          })()}

          {has('balance')&&(()=>{
            const bAge=age(student.dob);
            const bo=classifyBalance(bAge,f.bal_open_r,f.bal_closed_r);
            const boL=classifyBalance(bAge,f.bal_open_l,f.bal_closed_l);
            const ybR=ybComposite(f.yb_ant_r,f.yb_pm_r,f.yb_pl_r),ybL=ybComposite(f.yb_ant_l,f.yb_pm_l,f.yb_pl_l);
            const antAsym=asymmetry(f.yb_ant_r,f.yb_ant_l,null,4);
            return(<div className="sec"><div className="sec-title">Equilíbrio</div>
              <details style={{marginBottom:10}}><summary style={{cursor:'pointer',fontSize:12,color:'var(--text2)'}}>Como realizar</summary>
                <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.7,marginTop:6}}>
                  <b>Apoio unipodal</b>: tempo (s) em pé sobre uma perna, mãos na cintura; olhos abertos e depois fechados.<br/>
                  <b>Y-Balance / SEBT</b>: alcance máximo com o pé livre nas direções anterior, póstero-medial e póstero-lateral (cm). Diferença anterior &gt; 4 cm entre lados indica maior risco de lesão.
                </div></details>
              <div className="fgrid2">
                {N('Unipodal olhos abertos D','bal_open_r','s')}{N('Unipodal olhos abertos E','bal_open_l','s')}
                {N('Unipodal olhos fechados D','bal_closed_r','s')}{N('Unipodal olhos fechados E','bal_closed_l','s')}
              </div>
              <div style={{fontSize:12.5,fontWeight:700,color:'var(--accent)',marginTop:12,marginBottom:6}}>Y-Balance (alcance, cm)</div>
              <div className="fgrid2">
                {N('Anterior D','yb_ant_r','cm')}{N('Anterior E','yb_ant_l','cm')}
                {N('Póstero-medial D','yb_pm_r','cm')}{N('Póstero-medial E','yb_pm_l','cm')}
                {N('Póstero-lateral D','yb_pl_r','cm')}{N('Póstero-lateral E','yb_pl_l','cm')}
              </div>
              {bo?.open&&<div style={{marginTop:8}}><span style={{fontSize:12,color:'var(--text2)'}}>Olhos abertos D:</span> <Badge cls={bo.open.c}>{bo.open.l}</Badge>{boL?.open&&<> · <span style={{fontSize:12,color:'var(--text2)'}}>E:</span> <Badge cls={boL.open.c}>{boL.open.l}</Badge></>}</div>}
              {ybR!=null&&<div style={{marginTop:6,fontSize:12,color:'var(--text2)'}}>Composto Y-Balance: D <strong style={{color:'var(--text)'}}>{ybR} cm</strong>{ybL!=null&&<> · E <strong style={{color:'var(--text)'}}>{ybL} cm</strong></>}</div>}
              {antAsym&&<div style={{marginTop:6}}><span style={{fontSize:12,color:'var(--text2)'}}>Assimetria anterior — {antAsym.diff} cm</span> <Badge cls={antAsym.badge.c}>{antAsym.pct>0&&antAsym.diff>4?'Risco de lesão aumentado':antAsym.badge.l}</Badge></div>}
              <div style={{marginTop:10}}><FTA label="Observações de equilíbrio" value={f.bal_obs||''} onChange={e=>upd('bal_obs',e.target.value)}/></div>
            </div>);
          })()}

          {has('quest')&&(()=>{
            const pq=parqResult(f);const evaC=classifyEVA(f.eva);
            return(<div className="sec"><div className="sec-title">Questionários</div>
              <div style={{fontSize:12.5,fontWeight:700,color:'var(--accent)',marginBottom:6}}>PAR‑Q+ (prontidão para atividade física)</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {PARQ_QUESTIONS.map((q,i)=><div key={i} style={{display:'flex',gap:10,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
                  <span style={{fontSize:12.5,flex:1,minWidth:180}}>{i+1}. {q}</span>
                  <select className="fi" style={{width:110}} value={f['parq_'+(i+1)]||''} onChange={e=>upd('parq_'+(i+1),e.target.value)}>
                    <option value="">—</option><option>Não</option><option>Sim</option></select></div>)}
              </div>
              {pq&&<div className={`alert alert-${pq.c==='br'?'warn':'success'}`} style={{marginTop:10}}>PAR‑Q+: <strong>{pq.l}</strong></div>}
              <div className="fgrid2" style={{marginTop:12}}>
                {N('EVA — dor (0–10)','eva','')}{N('Escala de fadiga (0–10)','fatigue','')}{N('Escala de estresse (0–10)','stress','')}
              </div>
              {evaC&&<div style={{marginTop:8}}><span style={{fontSize:12,color:'var(--text2)'}}>Dor (EVA):</span> <Badge cls={evaC.c}>{evaC.l}</Badge>
                {classifyScale10(f.fatigue)&&<> · Fadiga: <Badge cls={classifyScale10(f.fatigue).c}>{classifyScale10(f.fatigue).l}</Badge></>}
                {classifyScale10(f.stress)&&<> · Estresse: <Badge cls={classifyScale10(f.stress).c}>{classifyScale10(f.stress).l}</Badge></>}</div>}
            </div>);
          })()}

          {has('func')&&<div className="sec"><div className="sec-title">Avaliação funcional</div>
            <details style={{marginBottom:10}}><summary style={{cursor:'pointer',fontSize:12,color:'var(--text2)'}}>Como realizar</summary>
              <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.7,marginTop:6}}>
                <b>TUG</b>: levantar da cadeira, andar 3 m, retornar e sentar — cronometrar (s).<br/>
                <b>5x Sit-to-Stand</b>: tempo para levantar/sentar 5 vezes o mais rápido possível.<br/>
                <b>30s Chair Stand</b>: nº de levantadas completas em 30 s.<br/>
                <b>Wall Sit</b> e <b>Prancha</b>: tempo de sustentação (s).<br/>
                <b>Dead Hang</b>: tempo pendurado na barra (s).<br/>
                <b>Single-leg sit-to-stand</b>: nº de repetições unipodais (compara D/E).
              </div></details>
            <div className="fgrid2">
              {N('Timed Up and Go','func_tug','s')}
              {N('5x Sit-to-Stand','func_sts5','s')}
              {N('30s Chair Stand','func_chair30','reps')}
              {N('Wall Sit','func_wallsit','s')}
              {N('Prancha','func_plank','s')}
              {N('Dead Hang','func_deadhang','s')}
              {N('SL sit-to-stand D','func_slsts_r','reps')}
              {N('SL sit-to-stand E','func_slsts_l','reps')}
            </div>
            {badgeLine('TUG',classifyTUG(f.func_tug),f.func_tug,'s')}
            {badgeLine('5x STS',classifySTS5(f.func_sts5),f.func_sts5,'s')}
            {badgeLine('30s Chair',classifyChair30(f.func_chair30),f.func_chair30,'reps')}
            {badgeLine('Prancha',classifyPlank(f.func_plank),f.func_plank,'s')}
            {badgeLine('Wall Sit',classifyWallSit(f.func_wallsit),f.func_wallsit,'s')}
            {badgeLine('Dead Hang',classifyDeadHang(f.func_deadhang),f.func_deadhang,'s')}
            {(()=>{const as=asymmetry(f.func_slsts_r,f.func_slsts_l,15);return as?<div style={{marginTop:6}}><span style={{fontSize:12,color:'var(--text2)'}}>Assimetria SL sit-to-stand — dif. {as.diff}</span> <Badge cls={as.badge.c}>{as.badge.l}</Badge></div>:null;})()}
            <div style={{marginTop:10}}><FTA label="Observações funcionais" value={f.func_obs||''} onChange={e=>upd('func_obs',e.target.value)}/></div>
          </div>}

          {has('injury')&&<div className="sec"><div className="sec-title">Histórico e screening de lesões</div>
            <BodyMap value={f.injury_map} onChange={v=>upd('injury_map',v)}/>
            <div className="fgrid2" style={{marginTop:14}}>
              {SEL('Cirurgias prévias','inj_surgery',['Não','Sim'])}
              {SEL('Fraturas','inj_fracture',['Não','Sim'])}
              {SEL('Entorses','inj_sprain',['Não','Sim'])}
              {SEL('Tendinites','inj_tendinitis',['Não','Sim'])}
              {SEL('Hérnias','inj_hernia',['Não','Sim'])}
              {SEL('Lesões musculares','inj_muscle',['Não','Sim'])}
            </div>
            <div style={{marginTop:12}}><FTA label="Dor atual" value={f.injury_current||''} onChange={e=>upd('injury_current',e.target.value)} placeholder="Localização, tipo, quando ocorre..."/></div>
            <div style={{marginTop:10}}><FTA label="Histórico de dor / lesões" value={f.injury_history||''} onChange={e=>upd('injury_history',e.target.value)}/></div>
            <div style={{marginTop:10}}><FTA label="Detalhes (cirurgias, fraturas, datas...)" value={f.inj_details||''} onChange={e=>upd('inj_details',e.target.value)}/></div>
          </div>}

          {has('movement')&&(()=>{
            const MOV=[['Agachamento','mq_squat'],['Afundo (lunge)','mq_lunge'],['Flexão (push-up)','mq_pushup'],['Levantamento terra','mq_deadlift'],['Corrida','mq_run'],['Salto','mq_jump']];
            return(<div className="sec"><div className="sec-title">Qualidade do movimento</div>
              <div style={{fontSize:12,color:'var(--text2)',marginBottom:10}}>Nota de 1 (disfuncional) a 5 (excelente) para cada padrão.</div>
              <div className="fgrid2">
                {MOV.map(([lbl,k])=>(
                  <div className="fg" key={k}><label className="flbl">{lbl}</label>
                    <select className="fi" value={f[k]||''} onChange={e=>upd(k,e.target.value)}>
                      <option value="">—</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n+' — '+classifyMove(n).l}</option>)}</select></div>))}
              </div>
              <div style={{marginTop:10}}><FTA label="Observações do movimento" value={f.mq_obs||''} onChange={e=>upd('mq_obs',e.target.value)} placeholder="Compensações, valgo dinâmico, dominância..."/></div>
            </div>);
          })()}

          {has('flex')&&<div className="sec"><div className="sec-title">Flexibilidade &amp; encurtamentos</div>
            <div className="fgrid2">
              {N('Banco de Wells','flex_wells','cm')}
              {N('Mobilidade tornozelo (lunge)','mob_lunge','cm')}
              {SEL('Isquiotibiais','short_hamstring',['Normal','Encurtado leve','Encurtado moderado','Encurtado severo'])}
              {SEL('Iliopsoas (Thomas)','short_iliopsoas',['Normal','Encurtado D','Encurtado E','Encurtado bilateral'])}
              {SEL('Reto femoral','short_rectus',['Normal','Encurtado D','Encurtado E','Encurtado bilateral'])}
              {SEL('Tríceps sural (panturrilha)','short_calf',['Normal','Encurtado leve','Encurtado moderado'])}
              {SEL('Peitoral','short_pec',['Normal','Encurtado leve','Encurtado moderado'])}
            </div>
            {badgeLine('Banco de Wells',wCls,f.flex_wells,'cm')}
            <div style={{marginTop:10}}><FTA label="Observações de flexibilidade" value={f.flex_obs||''} onChange={e=>upd('flex_obs',e.target.value)} placeholder="Outros testes, ângulos, assimetrias..."/></div>
          </div>}

          {has('cardio')&&<div className="sec"><div className="sec-title">Teste cardiorrespiratório (esteira incremental)</div>
            <div className="alert alert-info">Protocolo incremental: aquecer 5 min na velocidade inicial, aumentando <strong>0,5 km/h a cada minuto</strong>; a partir do 5º min, aumentar <strong>1 km/h a cada minuto</strong> até a fadiga. Registre a velocidade final e o tempo. O VO₂máx é estimado pela velocidade final (VAM).</div>
            <div className="fgrid2">
              {N('Velocidade inicial','inc_v0','km/h','6')}
              {N('Velocidade final atingida','inc_vfinal','km/h','15')}
              {N('Tempo total','inc_time','min')}
            </div>
            <details style={{marginTop:10}}><summary style={{cursor:'pointer',fontSize:12,color:'var(--text2)'}}>Outros protocolos (Cooper / VO₂ direto)</summary>
              <div className="fgrid2" style={{marginTop:10}}>
                {N('Cooper — distância (12 min)','cooper_dist','m','2400')}
                {N('VO₂máx (se medido)','vo2max','mL/kg/min')}
              </div></details>
            {vo2!=null&&<div className="alert alert-success" style={{marginTop:12}}>VO₂máx estimado: <strong>{fmt(vo2)} mL/kg/min</strong>{vo2Cls&&<> — <Badge cls={vo2Cls.c}>{vo2Cls.l}</Badge></>}</div>}
          </div>}

          {has('strength')&&<div className="sec"><div className="sec-title">Teste de força — 1‑RM</div>
            <div className="alert alert-info">Informe a carga e as repetições até a falha; o 1‑RM estimado é calculado (fórmula de Brzycki). Para 1‑RM direto, use 1 repetição.</div>
            {[['Supino','bench'],['Agachamento','squat'],['Levantamento terra','dead'],['Desenvolvimento','ohp'],['Remada','row']].map(([lbl,k])=>{
              const e1=est1RM(f['rm_'+k+'_w'],f['rm_'+k+'_r']);
              return(<div key={k} style={{display:'grid',gridTemplateColumns:'1.3fr 1fr 1fr auto',gap:10,alignItems:'end',marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:600,paddingBottom:11}}>{lbl}</div>
                {N('Carga','rm_'+k+'_w','kg')}
                {N('Reps','rm_'+k+'_r','')}
                <div style={{fontSize:12,color:'var(--text2)',paddingBottom:11,minWidth:92}}>1‑RM: <strong style={{color:'var(--accent)'}}>{e1?fmt(e1)+' kg':'—'}</strong></div>
              </div>);
            })}
          </div>}

          {has('power')&&<div className="sec"><div className="sec-title">Potência &amp; velocidade</div>
            <div className="fgrid2">
              {N('Salto vertical (CMJ)','pw_cmj','cm')}
              {N('Salto horizontal','pw_horizontal','cm')}
              {N('Impulsão (Sargent)','pw_sargent','cm')}
              {N('Arremesso medicine ball','pw_medball','m')}
              {N('Squat Jump (SJ)','pw_sj','cm')}
              {N('Drop Jump — altura','pw_dj_h','cm')}
              {N('Drop Jump — contato','pw_dj_ct','ms')}
              {N('Arremesso medicine ball','pw_medball','m')}
            </div>
            <div style={{fontSize:12.5,fontWeight:700,color:'var(--accent)',marginTop:14,marginBottom:6}}>Velocidade &amp; agilidade</div>
            <div className="fgrid2">
              {N('Sprint 5 m','pw_sprint5','s')}
              {N('Sprint 10 m','pw_sprint10','s')}
              {N('Sprint 20 m','pw_sprint20','s')}
              {N('Sprint 30 m','pw_sprint30','s')}
              {N('Agilidade (T-test)','pw_agility_t','s')}
              {N('Illinois','pw_illinois','s')}
              {N('505 D','pw_505_r','s')}
              {N('505 E','pw_505_l','s')}
            </div>
            <div style={{fontSize:12.5,fontWeight:700,color:'var(--accent)',marginTop:14,marginBottom:6}}>Anaeróbio / aeróbio de campo</div>
            <div className="fgrid2">
              {N('RAST — índice de fadiga','pw_rast_fi','%')}
              {N('Yo-Yo IR1 — distância','pw_yoyo','m')}
              {N('Beep test — nível.shuttle','pw_beep','')}
            </div>
            {classifyCMJ(student.gender,f.pw_cmj)&&<div className="alert alert-info" style={{marginTop:12}}>
              Salto vertical (CMJ): <strong>{f.pw_cmj} cm</strong> — <Badge cls={classifyCMJ(student.gender,f.pw_cmj).c}>{classifyCMJ(student.gender,f.pw_cmj).l}</Badge>
              {jumpPower(f.pw_cmj,f.weight)&&<> · Potência de pico estimada: <strong>{jumpPower(f.pw_cmj,f.weight).toLocaleString('pt-BR')} W</strong></>}</div>}
            {rsiCalc(f.pw_dj_h,f.pw_dj_ct)&&<div className="alert alert-info" style={{marginTop:8}}>RSI (Drop Jump): <strong>{rsiCalc(f.pw_dj_h,f.pw_dj_ct)}</strong> — <Badge cls={classifyRSI(rsiCalc(f.pw_dj_h,f.pw_dj_ct)).c}>{classifyRSI(rsiCalc(f.pw_dj_h,f.pw_dj_ct)).l}</Badge></div>}
            {yoyoVO2(f.pw_yoyo)&&<div className="alert alert-success" style={{marginTop:8}}>VO₂máx estimado (Yo-Yo IR1): <strong>{yoyoVO2(f.pw_yoyo)} mL/kg/min</strong></div>}
            {(sprintVel(20,f.pw_sprint20)||sprintVel(30,f.pw_sprint30))&&<div style={{marginTop:8,fontSize:12,color:'var(--text2)'}}>Velocidade média: {sprintVel(20,f.pw_sprint20)&&<>20 m <strong style={{color:'var(--text)'}}>{sprintVel(20,f.pw_sprint20)} m/s</strong> </>}{sprintVel(30,f.pw_sprint30)&&<>· 30 m <strong style={{color:'var(--text)'}}>{sprintVel(30,f.pw_sprint30)} m/s</strong></>}</div>}
            {classifyFatigueIndex(f.pw_rast_fi)&&<div style={{marginTop:8}}><span style={{fontSize:12,color:'var(--text2)'}}>RAST — fadiga:</span> <Badge cls={classifyFatigueIndex(f.pw_rast_fi).c}>{classifyFatigueIndex(f.pw_rast_fi).l}</Badge></div>}
          </div>}

          {has('goals')&&<div className="sec"><div className="sec-title">Metas e projeções</div>
            <div className="fgrid2">
              {N('Peso alvo','goal_weight','kg')}
              {N('% Gordura alvo','goal_fat','%')}
              <div className="fg"><label className="flbl">Próxima reavaliação</label>
                <input className="fi" type="date" value={f.goal_next||''} onChange={e=>upd('goal_next',e.target.value)}/></div>
            </div>
            {(()=>{const proj=projectGoals(f,d);if(!proj)return null;
              return(<div className="alert alert-info" style={{marginTop:12}}>
                <div style={{fontWeight:600,marginBottom:6}}>Projeção até {fmtDate(f.goal_next)} ({proj.weeks} semanas)</div>
                <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                  {proj.scenarios.map(s=><div key={s.l} style={{flex:'1 1 120px',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 10px'}}>
                    <div style={{fontSize:11,color:'var(--text2)',fontWeight:600}}>{s.l}</div>
                    {s.fat!=null&&<div style={{fontSize:13}}>Gordura: <strong>{fmt(s.fat)}%</strong></div>}
                    {s.weight!=null&&<div style={{fontSize:13}}>Peso: <strong>{fmt(s.weight)} kg</strong></div>}
                  </div>)}
                </div></div>);
            })()}
          </div>}

          {has('parecer')&&<div className="sec"><div className="sec-title">Parecer do avaliador</div>
            <div className="fgrid" style={{gridTemplateColumns:'1fr 1fr'}}>
              <FTA label="Pontos fortes" value={f.pt_strong||''} onChange={e=>upd('pt_strong',e.target.value)} placeholder="O que está bem..."/>
              <FTA label="Pontos a melhorar" value={f.pt_improve||''} onChange={e=>upd('pt_improve',e.target.value)} placeholder="Prioridades..."/>
            </div>
            <div style={{marginTop:12}}><FTA label="Estratégia / conduta" value={f.pt_strategy||''} onChange={e=>upd('pt_strategy',e.target.value)} placeholder="Plano de ação, foco do treino, recomendações..."/></div>
          </div>}
          </>);})()}

        <div className="sec"><div className="sec-title">Observações</div>
          <FTA value={f.obs} onChange={e=>upd('obs',e.target.value)} placeholder="Observações desta avaliação..."/></div>
      </div>
    </div>);
}

/* ── StudentDetail ── */
/* Comparativo de fotos (antes/depois) com slider de revelação */
/* Comparar duas avaliações pelos números. Dava para comparar as fotos, mas não
   os dados — e é o número que sustenta a conversa: "seu abdômen caiu 4 cm". */
function CompararAvaliacoes({student,evals,onClose}){
  const ord=[...evals].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const [bId,setB]=useState(ord[0]&&ord[0].id);
  const [aId,setA]=useState(ord[1]&&ord[1].id);
  const A=ord.find(e=>e.id===aId),B=ord.find(e=>e.id===bId);
  const LINHAS=[
    ['Peso','weight','kg',1,'menor'],
    ['% Gordura','_fatPct','%',1,'menor'],
    ['Massa magra','_leanMass','kg',1,'maior'],
    ['Massa gorda','_fatMass','kg',1,'menor'],
    ['IMC','_bmi','kg/m²',1,'menor'],
    ['Cintura','circ_waist','cm',1,'menor'],
    ['Abdômen','circ_abdomen','cm',1,'menor'],
    ['Quadril','circ_hip','cm',1,'menor'],
    ['Tórax','circ_chest','cm',1,'maior'],
    ['Braço D','circ_arm_r','cm',1,'maior'],
    ['Coxa D','circ_thigh_r','cm',1,'maior'],
    ['Preensão D','dyn_r','kgf',1,'maior'],
  ];
  const valor=(ev,campo)=>{
    if(!ev)return null;
    if(campo[0]!=='_')return num(ev[campo]);
    const d=derive(student,ev);
    return num(d[campo.slice(1)]);
  };
  const dias=(A&&B)?Math.abs(Math.round((new Date(B.date)-new Date(A.date))/86400000)):null;
  return(<div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.8)',display:'flex',
      alignItems:'flex-start',justifyContent:'center',padding:16,overflow:'auto'}} onClick={onClose}>
    <div className="card" style={{maxWidth:620,width:'100%',margin:'auto'}} onClick={e=>e.stopPropagation()}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div style={{fontFamily:'var(--serif)',fontSize:19,fontWeight:600}}>Comparar avaliações</div>
        <button className="btn-icon btn-sm" onClick={onClose}>×</button>
      </div>
      <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:150}}><span className="s-meta">De</span>
          <select className="fi" value={aId||''} onChange={e=>setA(e.target.value)}>
            {ord.map(e=><option key={e.id} value={e.id}>{fmtDate(e.date)}</option>)}
          </select></div>
        <div style={{flex:1,minWidth:150}}><span className="s-meta">Para</span>
          <select className="fi" value={bId||''} onChange={e=>setB(e.target.value)}>
            {ord.map(e=><option key={e.id} value={e.id}>{fmtDate(e.date)}</option>)}
          </select></div>
      </div>
      {!A||!B||A.id===B.id?<p className="s-meta">Escolha duas avaliações diferentes.</p>:<>
        <p className="s-meta" style={{marginBottom:10}}>{dias} dias entre as duas.</p>
        <table className="rpt-tbl" style={{width:'100%',fontSize:12.5}}>
          <thead><tr><th style={{textAlign:'left'}}>Medida</th>
            <th>{fmtDate(A.date)}</th><th>{fmtDate(B.date)}</th><th>Diferença</th></tr></thead>
          <tbody>
            {LINHAS.map(([lbl,campo,un,dec,bom])=>{
              const va=valor(A,campo),vb=valor(B,campo);
              if(va==null&&vb==null)return null;
              const d=(va!=null&&vb!=null)?+(vb-va).toFixed(dec):null;
              // verde quando andou para o lado bom daquela medida
              const cor=(d==null||Math.abs(d)<0.05)?'var(--text2)'
                :((bom==='maior')===(d>0))?'var(--green)':'var(--red)';
              return(<tr key={campo}>
                <td style={{fontWeight:600}}>{lbl}</td>
                <td style={{textAlign:'center'}}>{va!=null?fmt(va,dec)+' '+un:'—'}</td>
                <td style={{textAlign:'center'}}>{vb!=null?fmt(vb,dec)+' '+un:'—'}</td>
                <td style={{textAlign:'center',fontWeight:700,color:cor,whiteSpace:'nowrap'}}>
                  {d==null?'—':(d>0?'+':'')+fmt(d,dec)+' '+un}</td>
              </tr>);
            })}
          </tbody>
        </table>
        <p className="s-meta" style={{marginTop:10,fontSize:11.5,lineHeight:1.5}}>
          Verde é o lado bom daquela medida — cintura que desce e massa magra que sobe contam
          como ganho. Medida em branco é a que não foi coletada naquele dia.</p>
        <button className="btn btn-ghost btn-sm no-print" style={{width:'100%',marginTop:10}}
          onClick={()=>window.print()}>Imprimir / PDF</button>
      </>}
    </div>
  </div>);
}

function PhotoCompare({student,evals,onClose}){
  const withPhoto=[...evals].filter(e=>e.post_photo_front||e.post_photo_side||e.post_photo_back).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const poses=[['front','Frente'],['side','Lado'],['back','Costas']].filter(([k])=>withPhoto.some(e=>e['post_photo_'+k]));
  const [pose,setPose]=useState(poses[0]?poses[0][0]:'front');
  const [aId,setA]=useState(withPhoto[0]?.id);
  const [bId,setB]=useState(withPhoto[withPhoto.length-1]?.id);
  const [pos,setPos]=useState(50);
  const A=withPhoto.find(e=>e.id===aId),B=withPhoto.find(e=>e.id===bId);
  const key='post_photo_'+pose;
  const imgA=A&&A[key],imgB=B&&B[key];
  const W='min(340px,80vw)';
  const opt=e=>fmtDate(e.date);
  return(
    <div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.82)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={onClose}>
      <div className="card" style={{maxWidth:440,width:'100%',maxHeight:'92vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:600}}>Comparar fotos</div>
          <button className="btn-icon btn-sm" onClick={onClose}>×</button>
        </div>
        <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:10}}>
          {poses.map(([k,l])=><button key={k} type="button" className={`chip ${pose===k?'active':''}`} onClick={()=>setPose(k)}>{l}</button>)}
        </div>
        <div className="fgrid2" style={{marginBottom:12}}>
          <div className="fg" style={{margin:0}}><label className="flbl">Antes</label>
            <select className="fi" value={aId} onChange={e=>setA(e.target.value)}>{withPhoto.map(e=><option key={e.id} value={e.id}>{opt(e)}</option>)}</select></div>
          <div className="fg" style={{margin:0}}><label className="flbl">Depois</label>
            <select className="fi" value={bId} onChange={e=>setB(e.target.value)}>{withPhoto.map(e=><option key={e.id} value={e.id}>{opt(e)}</option>)}</select></div>
        </div>
        {(!imgA||!imgB)?<div className="alert alert-warn">Uma das avaliações não tem foto nesse ângulo. Escolha outro ângulo ou outra data.</div>:<>
          <div style={{position:'relative',width:W,margin:'0 auto',borderRadius:12,overflow:'hidden',background:'#000',lineHeight:0}}>
            <img src={imgB} alt="" style={{display:'block',width:'100%'}}/>
            <div style={{position:'absolute',top:0,left:0,bottom:0,width:pos+'%',overflow:'hidden',borderRight:'2px solid #fff'}}>
              <img src={imgA} alt="" style={{display:'block',width:W,height:'100%',objectFit:'cover'}}/>
            </div>
            <span style={{position:'absolute',top:6,left:6,background:'rgba(0,0,0,.55)',color:'#fff',fontSize:10.5,padding:'2px 7px',borderRadius:6}}>Antes · {A&&opt(A)}</span>
            <span style={{position:'absolute',top:6,right:6,background:'rgba(0,0,0,.55)',color:'#fff',fontSize:10.5,padding:'2px 7px',borderRadius:6}}>Depois · {B&&opt(B)}</span>
          </div>
          <input type="range" min="0" max="100" value={pos} onChange={e=>setPos(+e.target.value)} style={{width:W,display:'block',margin:'12px auto 0'}}/>
          <p className="s-meta" style={{textAlign:'center',marginTop:6}}>Arraste para revelar o antes sobre o depois.</p>
        </>}
      </div>
    </div>);
}


/* Feedbacks de treino que o aluno mandou */
/* O que o aluno treinou de verdade, sessão por sessão. Sem isto o treinador só
   enxerga "treinou / não treinou" — e não a carga que ele levantou, que é o que
   decide a próxima ficha. */
function TreinosCoach({student,demo}){
  const [hist,setHist]=useState(demo?[]:null);
  const [nomes,setNomes]=useState({});
  const [aberta,setAberta]=useState(null);
  const [tudo,setTudo]=useState(false);
  const carregar=React.useCallback(async()=>{
    if(demo)return;
    const [h,d]=await Promise.all([
      sb.from('train_historico')
        .select('divisao_id,exercicio_id,exercicio_nome,data_treino,tipo_serie,carga,reps,indice_serie,is_pr,observacao,registrado_em')
        .eq('student_id',student.id).order('data_treino',{ascending:false}).order('registrado_em').limit(1200),
      sb.from('train_divisao').select('id,nome').eq('student_id',student.id),
    ]);
    setHist(h.data||[]);
    const m={};(d.data||[]).forEach(x=>m[x.id]=x.nome);setNomes(m);
  },[student.id,demo]);
  useEffect(()=>{carregar().catch(()=>setHist([]));},[carregar]);
  const sessoes=React.useMemo(()=>agruparSessoes(hist),[hist]);
  // Treino em andamento: a sessão de hoje com série registrada há pouco. Sem
  // isso o treinador abre a ficha no meio do treino, lê "1 exercício · 1 série"
  // e acha que o app perdeu o resto — quando o aluno só não tinha feito ainda.
  const emAndamento=sessoes.find(s=>s.data===todayStr()&&s.ultimo
    &&(Date.now()-new Date(s.ultimo).getTime())<90*60000);
  useEffect(()=>{
    if(!emAndamento)return;
    const t=setInterval(()=>{carregar().catch(()=>{});},60000);
    return ()=>clearInterval(t);
  },[!!emAndamento,carregar]);
  if(hist===null)return <div className="card" style={{marginBottom:14}}><div className="sec-title">Treinos</div>
    <div className="center-screen" style={{minHeight:90}}><div className="spinner"/></div></div>;
  const rotulo=s=>{const ns=s.divisoes.map(id=>nomes[id]).filter(Boolean);
    return ns.length?ns.join(' + '):s.soExterno?s.externos.map(e=>e.nome).join(', '):'Treino';};
  const lista=tudo?sessoes:sessoes.slice(0,8);
  // média de séries por sessão: diz se ele está cumprindo a ficha ou cortando
  const comSerie=sessoes.filter(s=>!s.soExterno);
  const media=comSerie.length?Math.round(comSerie.reduce((a,s)=>a+s.series,0)/comSerie.length):0;
  return(<div className="card" style={{marginBottom:14}}>
    <div className="sec-title">Treinos</div>
    {sessoes.length===0?<p className="s-meta">Nenhum treino registrado ainda.</p>:<>
      <p className="s-meta" style={{marginBottom:12}}>
        {plural(sessoes.length,'sessão','sessões')} no total · média de {plural(media,'série')} por treino
        {comSerie.length<sessoes.length&&` · ${sessoes.length-comSerie.length} fora do app`}</p>
      {emAndamento&&<p className="s-meta" style={{marginBottom:12,color:'var(--gold)'}}>
        Treino em andamento — a última série entrou {tempoRel(emAndamento.ultimo)}.
        Os números de hoje ainda vão subir; esta tela se atualiza sozinha.</p>}
      {lista.map(s=>{const open=aberta===s.data;
        return(<div key={s.data} style={{borderBottom:'1px solid var(--border)',padding:'9px 0'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,
              cursor:s.soExterno?'default':'pointer'}}
            onClick={()=>!s.soExterno&&setAberta(open?null:s.data)}>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:600,fontSize:13.5}}>{fmtDate(s.data)} · {rotulo(s)}</div>
              <div className="s-meta" style={{marginTop:2}}>
                {s.soExterno?'Fora do app'+(s.externos[0]&&s.externos[0].obs?' · '+s.externos[0].obs:'')
                  :`${plural(s.exercicios.length,'exercício')} · ${plural(s.series,'série')} · ${fmtTon(s.tonelagem)}`}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
              {emAndamento&&emAndamento.data===s.data&&<span className="info-pill"
                style={{margin:0,borderColor:'rgba(245,158,11,.45)',color:'var(--gold)'}}>treinando agora</span>}
              {s.prs>0&&<span className="info-pill" style={{margin:0,borderColor:'rgba(74,222,128,.35)',color:'var(--green)'}}>{s.prs} PR</span>}
              {!s.soExterno&&<span className="muted">{open?'▾':'▸'}</span>}
            </div>
          </div>
          {open&&<div style={{marginTop:9,paddingLeft:2}}>
            {s.exercicios.map((e,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',
                gap:12,padding:'4px 0',fontSize:12.5}}>
              <span style={{minWidth:0}}>{e.nome}</span>
              <span className="muted" style={{textAlign:'right',flexShrink:0}}>
                {e.sets.map(x=>fmtCarga(x.carga)+(x.reps?'×'+x.reps:'')).join(' · ')} kg</span>
            </div>)}
          </div>}
        </div>);})}
      {sessoes.length>8&&<button className="btn btn-ghost btn-sm" style={{width:'100%',marginTop:10}}
        onClick={()=>setTudo(t=>!t)}>{tudo?'Mostrar menos':`Ver os ${sessoes.length} treinos`}</button>}
    </>}
  </div>);
}

// Irma do FotoThumb, para as fotos que abrem em tela cheia em vez de virar
// link. Mesmo motivo: sem isso o navegador desenha o icone de imagem quebrada.
function ImgFoto({url,alt,onClick,estilo}){
  const [falhou,setFalhou]=useState(false);
  if(falhou)return(<div onClick={onClick} style={{...estilo,display:'flex',alignItems:'center',
    justifyContent:'center',textAlign:'center',fontSize:11,lineHeight:1.4,
    background:'rgba(128,128,128,.16)',opacity:.75}}>foto não<br/>carregou</div>);
  return <img src={url} alt={alt||''} loading="lazy" onClick={onClick}
    onError={()=>setFalhou(true)} style={estilo}/>;
}

// Uma foto que pode nao carregar: link do Storage expirado, arquivo apagado,
// celular sem rede. Sem tratar, o navegador desenha o icone de imagem quebrada
// com o texto alternativo em azul sublinhado — parece defeito do app.
function FotoThumb({url,legenda,alt}){
  const [falhou,setFalhou]=useState(false);
  return(<a className="photo-thumb" href={url} target="_blank" rel="noopener">
    {falhou
      ? <div className="photo-ph"><span className="photo-ph-icon">Foto</span>não carregou</div>
      : <img src={url} alt={alt||''} loading="lazy" onError={()=>setFalhou(true)}/>}
    <div className="photo-cap">{legenda}</div>
  </a>);
}

// As fotos que o aluno manda pelo app dele. Só aparece se ele já mandou alguma.
function FotosProgressoCoach({student,demo}){
  const [fotos,setFotos]=useState([]);
  useEffect(()=>{if(demo||!student.user_id)return;
    sb.from('photos').select('id,url,created_at').eq('student_id',student.user_id).eq('kind','progress')
      .order('created_at',{ascending:false}).limit(24)
      .then(({data})=>setFotos(data||[]),()=>{});},[student.user_id]);
  if(!fotos.length)return null;
  const dias=Math.round((new Date(fotos[0].created_at)-new Date(fotos[fotos.length-1].created_at))/86400000);
  return(<div className="card" style={{marginBottom:14}}>
    <div className="sec-title">Fotos de progresso</div>
    <p className="s-meta" style={{marginBottom:10}}>
      {fotos.length} foto{fotos.length>1?'s':''} enviada{fotos.length>1?'s':''} pelo aluno
      {fotos.length>1&&dias>0?` · ${dias} dias entre a primeira e a última`:''}.</p>
    <div className="photo-grid">{fotos.map(f=>(
      <FotoThumb key={f.id} url={f.url} alt="Foto de progresso" legenda={fmtTime(f.created_at)}/>))}</div>
  </div>);
}

function FeedbacksAluno({student,demo}){
  const [l,setL]=useState(demo?[{id:'f1',data:todayStr(),divisao_nome:'A — Membros inferiores',
    rpe:9,dificuldade:5,dor:3,nota:'A última série do agachamento foi longe demais, senti o joelho.'}]:null);
  useEffect(()=>{if(demo)return;
    sb.from('train_feedback').select('*').eq('student_id',student.id)
      .order('created_at',{ascending:false}).limit(10)
      .then(({data})=>setL(data||[])).catch(()=>setL([]));},[student.id,demo]);
  if(l===null)return null;
  if(l.length===0)return null;

  const DIF=['','Muito fácil','Fácil','Na medida','Difícil','Pesado demais'];
  const DOR=['','Nenhuma','Leve','Moderada','Forte','Muito forte'];
  const corRpe=r=>r>=9?'#b3434f':r>=7?'#c98a3a':'#2f8f4e';

  return(<div className="card" style={{marginBottom:14}}>
    <div style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:600,marginBottom:2}}>Como o aluno sentiu os treinos</div>
    <p className="s-meta" style={{marginBottom:10}}>Respondido por ele logo depois de cada sessão.</p>
    {l.map(f=>(
      <div key={f.id} style={{borderTop:'1px solid var(--border)',padding:'10px 0'}}>
        <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}>
          <span style={{fontWeight:600,fontSize:13.5}}>{f.divisao_nome||'Treino'}</span>
          <span className="s-meta">{fmtDate(f.data)}</span>
          <span style={{flex:1}}/>
          {f.rpe!=null&&<span style={{fontWeight:800,fontSize:13,color:corRpe(f.rpe)}}>esforço {f.rpe}/10</span>}
        </div>
        <div className="s-meta" style={{marginTop:3}}>
          {f.dificuldade?DIF[f.dificuldade]:''}{f.dor>1?` · dor ${DOR[f.dor].toLowerCase()}`:''}
        </div>
        {f.nota&&<div style={{fontSize:13,marginTop:6,fontStyle:'italic',color:'var(--text2)'}}>"{f.nota}"</div>}
      </div>))}
  </div>);
}

const TXT_PASSO_INSTALAR='3. Depois de entrar, adicione o app à tela de início do celular: no iPhone é Compartilhar → “Adicionar à Tela de Início”; no Android é o menu dos três pontinhos → “Instalar aplicativo”. É assim que os avisos chegam.';

function StudentDetail({student,evals,onNewEval,onReassess,onEditEval,onDeleteEval,onReport,onBack,onEdit,onTech,onTrain,onNutri,onPreview}){
  const [cmp,setCmp]=useState(false);
  const [cmpNum,setCmpNum]=useState(false);   // comparar os números, não as fotos
  const [diarioOpen,setDiarioOpen]=useState(false);
  const [metasOpen,setMetasOpen]=useState(false);
  const [acc,setAcc]=useState(null);const [accBusy,setAccBusy]=useState(false);
  const photoEvals=evals.filter(e=>e.post_photo_front||e.post_photo_side||e.post_photo_back).length;
  const genCode=async()=>{setAccBusy(true);const {data,error}=await sb.rpc('aluno_gerar_codigo',{p_student:student.id});setAccBusy(false);if(error){alert('Erro: '+error.message);return;}setAcc(data||'—');};
  // o link leva o código junto: o aluno abre e já cai no cadastro preenchido
  const accLink=()=>location.origin+location.pathname+'?codigo='+encodeURIComponent(acc||'');
  const accTexto=()=>[
    `Olá ${student.name.split(' ')[0]}! Seu acesso ao app MF Performance está pronto.`,
    ``,
    `1. Abra este link: ${accLink()}`,
    `2. Crie sua conta com seu e-mail e uma senha — o código *${acc}* já vem preenchido.`,
    TXT_PASSO_INSTALAR,
    ``,
    `Seus treinos, sua dieta e sua evolução ficam todos aí. Qualquer dúvida é só me chamar.`,
  ].join('\n');
  const [accCopiado,setAccCopiado]=useState(false);
  const accCopiar=()=>{try{navigator.clipboard&&navigator.clipboard.writeText(accTexto());setAccCopiado(true);setTimeout(()=>setAccCopiado(false),2000);}catch(e){}};
  const accWa=()=>{const phone=(student.phone||'').replace(/\D/g,'');const txt=encodeURIComponent(accTexto());
    window.open(phone?`https://wa.me/55${phone}?text=${txt}`:`https://wa.me/?text=${txt}`,'_blank');};
  const a=age(student.dob);
  const sorted=[...evals].sort((x,y)=>new Date(y.date)-new Date(x.date));
  const last=sorted[0];
  const d=last?derive(student,last):null;
  return(
    <div>
      {cmp&&<PhotoCompare student={student} evals={evals} onClose={()=>setCmp(false)}/>}
      {cmpNum&&<CompararAvaliacoes student={student} evals={evals} onClose={()=>setCmpNum(false)}/>}
      {diarioOpen&&<DiarioCoach student={student} onClose={()=>setDiarioOpen(false)}/>}
      {metasOpen&&<MetasCoach student={student} onClose={()=>setMetasOpen(false)}/>}
      {acc!==null&&<div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.8)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={()=>setAcc(null)}>
        <div className="card" style={{maxWidth:380,width:'100%'}} onClick={e=>e.stopPropagation()}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:600}}>Acesso do aluno</div><button className="btn-icon btn-sm" onClick={()=>setAcc(null)}>×</button></div>
          <p className="s-meta" style={{marginBottom:12}}>Gere o código e mande o convite. O link já abre o cadastro preenchido — o aluno só escolhe e-mail e senha, e os treinos aparecem sozinhos.</p>
          {acc?<>
            <div style={{textAlign:'center',fontFamily:'var(--serif)',fontSize:34,fontWeight:700,letterSpacing:5,background:'var(--bg3)',padding:'14px',borderRadius:12,marginBottom:12}}>{acc}</div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-secondary" style={{flex:1}} onClick={accCopiar}>{accCopiado?'Copiado ✓':'Copiar convite'}</button>
              <button className="btn btn-primary" style={{flex:1}} onClick={accWa}>WhatsApp</button>
            </div>
            <p className="s-meta" style={{marginTop:10,lineHeight:1.5}}>
              O convite vai com o link <b>?codigo={acc}</b>: o aluno toca, o cadastro abre já
              marcado como Aluno e com o código preenchido. Ele só escolhe e-mail e senha.</p>
            <button className="btn btn-ghost btn-sm" style={{width:'100%',marginTop:8}} onClick={genCode} disabled={accBusy}>Gerar outro</button>
          </>:<button className="btn btn-primary" style={{width:'100%'}} onClick={genCode} disabled={accBusy}>{accBusy?'Gerando…':'Gerar código de acesso'}</button>}
        </div>
      </div>}
      <div className="abar">
        <div><div className="breadcrumb" onClick={onBack}>← Alunos</div>
          <div style={{display:'flex',alignItems:'center',gap:13}}>
            <div className="avatar" style={{width:52,height:52}}>{student.photo?<img src={student.photo} alt=""/>:initials(student.name)}</div>
            <div><div className="ph-title">{student.name}</div>
              <div className="ph-sub">{a?`${a} anos · `:''}{student.gender==='M'?'Masculino':'Feminino'}{student.activity&&` · ${student.activity}`}</div></div>
          </div>
        </div>
        <div className="bgroup">
          <button className="btn btn-ghost btn-sm" onClick={onEdit}>Editar ficha</button>
          <button className="btn btn-ghost btn-sm" onClick={onTrain}>Treino</button>
          <button className="btn btn-ghost btn-sm" onClick={onNutri}>Nutrição</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>setAcc('')}>Acesso do aluno</button>
          {sb&&!student._demo&&<button className="btn btn-ghost btn-sm" onClick={()=>setDiarioOpen(true)}>Diário de saúde</button>}
          {sb&&!student._demo&&<button className="btn btn-ghost btn-sm" onClick={()=>setMetasOpen(true)}>Metas</button>}
          <button className="btn btn-ghost btn-sm" onClick={onTech}>Avaliação técnica</button>
          {onPreview&&<button className="btn btn-ghost btn-sm" onClick={onPreview}>Visão do aluno</button>}
          {photoEvals>=2&&<button className="btn btn-ghost btn-sm" onClick={()=>setCmp(true)}>Comparar fotos</button>}
          {evals.length>=2&&<button className="btn btn-ghost btn-sm" onClick={()=>setCmpNum(true)}>Comparar números</button>}
          {sorted.length>0&&<button className="btn btn-secondary" onClick={onReassess}>Reavaliação</button>}
          <button className="btn btn-primary" onClick={onNewEval}>+ Nova avaliação</button>
        </div>
      </div>

      <div style={{marginBottom:20,display:'flex',flexWrap:'wrap',gap:0}}>
        {student.goal&&<span className="info-pill">{student.goal}</span>}
        {student.profession&&<span className="info-pill">{student.profession}</span>}
        {student.schedule&&<span className="info-pill">{student.schedule}</span>}
        {student.phone&&<span className="info-pill">{student.phone}</span>}
        {(student.health||student.injuries)&&<span className="info-pill" style={{borderColor:'rgba(234,179,8,.3)',color:'#fde047'}}>Anamnese registrada</span>}
      </div>

      {last&&d&&(
        <div className="stat-grid">
          {last.weight&&<Stat lbl="Peso atual" val={last.weight} unit="kg"/>}
          {last.height&&<Stat lbl="Estatura" val={last.height} unit="cm"/>}
          {d.bmi&&<Stat lbl="IMC" val={fmt(d.bmi)} unit="kg/m²" badge={classifyBMI(d.bmi)}/>}
          {d.fatPct!=null&&<Stat lbl="% Gordura" val={fmt(d.fatPct)} unit="%" badge={classifyFat(student.gender,a||25,d.fatPct)}/>}
          {last.bp_sys&&last.bp_dia&&<Stat lbl="Pressão" val={`${numBR(last.bp_sys)}/${numBR(last.bp_dia)}`} badge={classifyBP(last.bp_sys,last.bp_dia)}/>}
          <Stat lbl="Avaliações" val={evals.length}/>
        </div>)}

      {sb&&!student._demo&&student.user_id&&<Conversa studentId={student.id} avisos={[]} demo={false}/>}
      <FeedbacksAluno student={student} demo={!!student._demo}/>
      {sb&&<TreinosCoach student={student} demo={!!student._demo}/>}
      {sb&&<FotosProgressoCoach student={student} demo={!!student._demo}/>}
      {sb&&<PesoMetaCoach student={student} demo={!!student._demo}/>}
      {sb&&!student._demo&&<FinanceiroCard student={student}/>}

      <div style={{fontSize:15,fontWeight:600,margin:'24px 0 14px'}}>Histórico de avaliações</div>
      {sorted.length===0?(
        <div className="empty">          <div className="empty-title">Nenhuma avaliação registrada</div>
          <p style={{marginBottom:16,fontSize:13}}>Clique em "Nova avaliação" para começar</p>
          <button className="btn btn-primary" onClick={onNewEval}>+ Nova avaliação</button></div>
      ):sorted.map((ev,i)=>{
        const dd=derive(student,ev);
        return(
          <div key={ev.id} className="eval-row">
            <div style={{flex:1,minWidth:180}}>
              <div className="eval-date">{fmtDate(ev.date)}
                {i===0&&<span className="badge bo">mais recente</span>}
                {i<sorted.length-1&&<span style={{fontSize:11,color:'var(--text3)',fontWeight:400}}>nº {sorted.length-i}</span>}</div>
              <div className="eval-meta">
                {ev.weight&&`${fmt(ev.weight)} kg · `}{dd.bmi&&`IMC ${fmt(dd.bmi)} · `}
                {dd.fatPct!=null&&`Gordura ${fmt(dd.fatPct)}% · `}
                {ev.bp_sys&&`PA ${numBR(ev.bp_sys)}/${numBR(ev.bp_dia)} · `}{dd.dynAvg&&`Preensão ${fmt(dd.dynAvg)} kgf`}</div>
            </div>
            <div className="bgroup">
              <button className="btn-icon" title="Editar" onClick={()=>onEditEval(ev)}>Editar</button>
              <button className="btn btn-secondary btn-sm" onClick={()=>onReport(ev)}>Relatório</button>
              <button className="btn-icon" title="Excluir" onClick={()=>{if(confirm('Excluir esta avaliação?'))onDeleteEval(ev.id);}}>Excluir</button>
            </div>
          </div>);
      })}
    </div>);
}

/* ── Comparative pieces ── */
function CmpCard({label,cur,prev,unit,dir}){
  if(cur==null||cur==='')return null;
  const c=parseFloat(cur),p=prev!=null&&prev!==''?parseFloat(prev):null;
  const delta=p!=null?+(c-p).toFixed(1):null;
  const pct=p!=null&&p!==0?+((delta/p)*100).toFixed(1):null;
  let cls='neutral';
  if(delta!=null&&delta!==0&&dir){
    const good=dir==='down'?delta<0:delta>0;
    cls=good?'good':'bad';
  }
  return(
    <div className={`cmp-card ${cls}`}>
      <div className="cmp-lbl">{label}</div>
      <div className="cmp-flow">
        {p!=null&&<><span className="cmp-from">{numBR(p)}{unit?` ${unit}`:''}</span><span className="cmp-arrow">→</span></>}
        <span className="cmp-to">{numBR(c)}{unit?` ${unit}`:''}</span>
      </div>
      {delta!=null&&<div className={`cmp-delta ${cls}`}>
        {delta>0?'▲':delta<0?'▼':'＝'} {delta>0?'+':delta<0?'−':''}{numBR(Math.abs(delta))}{unit?` ${unit}`:''}
        {pct!=null&&delta!==0?` (${pct>0?'+':'−'}${numBR(Math.abs(pct))}%)`:''}
      </div>}
    </div>);
}

function buildHighlights(student,cur,prev){
  if(!prev)return[];
  const dc=derive(student,cur),dp=derive(student,prev);
  const out=[];
  const push=(cond,ico,txt)=>{if(cond)out.push({ico,txt});};
  if(dc.fatMass!=null&&dp.fatMass!=null){
    const dd=+(dc.fatMass-dp.fatMass).toFixed(1);
    if(dd<0)push(true,'',`Redução de ${numBR(Math.abs(dd))} kg de massa gorda.`);
    else if(dd>0)push(true,'',`Aumento de ${numBR(dd)} kg de massa gorda.`);
  }
  if(dc.leanMass!=null&&dp.leanMass!=null){
    const dd=+(dc.leanMass-dp.leanMass).toFixed(1);
    if(dd>0)push(true,'',`Ganho de ${numBR(dd)} kg de massa magra.`);
    else if(dd<0)push(true,'',`Perda de ${numBR(Math.abs(dd))} kg de massa magra — atenção.`);
  }
  if(dc.fatPct!=null&&dp.fatPct!=null){
    const dd=+(dc.fatPct-dp.fatPct).toFixed(1);
    if(dd!==0)push(true,dd<0?'':'',`% de gordura ${dd<0?'reduziu':'aumentou'} ${numBR(Math.abs(dd))} pontos (${fmt(dp.fatPct)}% → ${fmt(dc.fatPct)}%).`);
  }
  const wc=num(cur.circ_waist),wp=num(prev.circ_waist);
  if(wc&&wp){const dd=+(wc-wp).toFixed(1);if(dd!==0)push(true,dd<0?'':'',`Cintura ${dd<0?'reduziu':'aumentou'} ${numBR(Math.abs(dd))} cm.`);}
  if(dc.dynAvg&&dp.dynAvg){const dd=+(dc.dynAvg-dp.dynAvg).toFixed(1);
    if(dd>0)push(true,'',`Força de preensão melhorou ${numBR(dd)} kgf.`);}
  if(out.length===0)push(true,'','Avaliação comparativa registrada. Mantenha a consistência.');
  return out;
}

/* ── Compartilhar resumo no WhatsApp ── */
function shareWhatsApp(student,evalData,prevEval){
  const d=derive(student,evalData);
  const L=[];
  L.push('*MF PERFORMANCE — Avaliação Física*');
  L.push(`*${student.name}* · ${fmtDate(evalData.date)}`);
  L.push('');
  if(evalData.weight)L.push(` Peso: ${evalData.weight} kg`);
  if(d.bmi)L.push(` IMC: ${fmt(d.bmi)} kg/m²${classifyBMI(d.bmi)?' ('+classifyBMI(d.bmi).l+')':''}`);
  if(d.fatPct!=null){const fc=classifyFat(student.gender,age(student.dob)||25,d.fatPct);L.push(` % Gordura: ${fmt(d.fatPct)}%${fc?' ('+fc.l+')':''}`);}
  if(d.leanMass!=null)L.push(` Massa magra: ${d.leanMass} kg`);
  if(evalData.bp_sys&&evalData.bp_dia)L.push(` Pressão: ${numBR(evalData.bp_sys)}/${numBR(evalData.bp_dia)} mmHg`);
  if(d.dynAvg)L.push(` Preensão: ${d.dynAvg} kgf`);
  if(d.hidr)L.push(` Hidratação: ${(d.hidr/1000).toFixed(1).replace('.',',')} L/dia (~${Math.round(d.hidr/250)} copos)`);
  if(prevEval){
    const hi=buildHighlights(student,evalData,prevEval);
    if(hi.length){L.push('');L.push(`*Evolução desde ${fmtDate(prevEval.date)}:*`);hi.forEach(h=>L.push(`${h.ico} ${h.txt}`));}
  }
  L.push('');L.push('_Continue firme nos treinos! _');
  const txt=encodeURIComponent(L.join('\n'));
  const phone=(student.phone||'').replace(/\D/g,'');
  const target=phone?`https://wa.me/55${phone}?text=${txt}`:`https://wa.me/?text=${txt}`;
  window.open(target,'_blank');
}

/* ── Sparkline (SVG, sem libs) ── */
function Sparkline({values,color='#c2410c',w=140,h=40}){
  const vals=values.filter(v=>v!=null&&!isNaN(v));
  if(vals.length<2)return null;
  const min=Math.min(...vals),max=Math.max(...vals),rng=max-min||1;
  const pad=4,iw=w-pad*2,ih=h-pad*2;
  const pts=vals.map((v,i)=>{
    const x=pad+(vals.length===1?iw/2:(i/(vals.length-1))*iw);
    const y=pad+ih-((v-min)/rng)*ih;
    return [x,y];
  });
  const d=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=d+` L${pts[pts.length-1][0].toFixed(1)} ${h-pad} L${pts[0][0].toFixed(1)} ${h-pad} Z`;
  return(
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:'block',width:'100%'}} preserveAspectRatio="none">
      <path d={area} fill={color} opacity="0.1"/>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r={i===pts.length-1?3:2} fill={color}/>)}
    </svg>);
}

/* ── Evolução (vários gráficos) ── */
function EvolutionSection({student,evals}){
  const asc=[...evals].sort((a,b)=>new Date(a.date)-new Date(b.date));
  if(asc.length<2)return null;
  const der=asc.map(e=>derive(student,e));
  const metrics=[
    {key:'weight',label:'Peso',unit:'kg',color:'#c2410c',dir:'down',vals:asc.map(e=>num(e.weight))},
    {key:'fat',label:'% Gordura',unit:'%',color:'#dc2626',dir:'down',vals:der.map(d=>d.fatPct)},
    {key:'lean',label:'Massa magra',unit:'kg',color:'#059669',dir:'up',vals:der.map(d=>d.leanMass)},
    {key:'waist',label:'Cintura',unit:'cm',color:'#2563eb',dir:'down',vals:asc.map(e=>num(e.circ_waist))},
    {key:'musc',label:'Massa muscular',unit:'kg',color:'#7c3aed',dir:'up',vals:asc.map(e=>num(e.bio_muscle))},
    {key:'shoulders',label:'Ombros',unit:'cm',color:'#0d9488',dir:'up',vals:asc.map(e=>num(e.circ_shoulders))},
    {key:'dyn',label:'Preensão',unit:'kgf',color:'#0891b2',dir:'up',vals:der.map(d=>d.dynAvg)},
    {key:'metab',label:'Idade metabólica',unit:'anos',color:'#b45309',dir:'down',vals:asc.map(e=>num(e.bio_metabage))}
  ].filter(m=>m.vals.filter(v=>v!=null&&!isNaN(v)).length>=2);
  if(metrics.length===0)return null;
  // "6/26" é jeito de planilha. Num relatório que o aluno leva para casa a data
  // se lê: "jun/26".
  const MES3=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const dlab=asc.map(e=>{const d=new Date(e.date+'T00:00:00');
    return MES3[d.getMonth()]+'/'+String(d.getFullYear()).slice(2);});
  const trendKeys=['weight','fat','lean'];
  const trends=metrics.filter(m=>trendKeys.includes(m.key)).map(m=>({...m,pts:m.vals.map((v,i)=>({d:dlab[i],v})).filter(p=>p.v!=null&&!isNaN(p.v))}));
  return(
    <div className="rpt-sec">
      <div className="rpt-sec-title">Evolução ao longo do tempo ({asc.length} avaliações)</div>
      {trends.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:18,justifyContent:'center',marginBottom:16}}>
        {trends.map(m=><TrendChart key={m.key} label={m.label} unit={m.unit} color={m.color} points={m.pts}/>)}
      </div>}
      <div className="evo-grid">
        {metrics.map(m=>{
          const clean=m.vals.filter(v=>v!=null&&!isNaN(v));
          const start=clean[0],end=clean[clean.length-1];
          const delta=+(end-start).toFixed(1);
          const good=m.dir==='down'?delta<0:delta>0;
          const col=delta===0?'#6b7280':good?'#15803d':'#b91c1c';
          return(
            <div className="evo-card" key={m.key}>
              <div className="evo-lbl">{m.label}</div>
              <Sparkline values={m.vals} color={m.color}/>
              <div className="evo-vals">
                <span className="evo-start">{numBR(start)}{m.unit} →</span>
                <span className="evo-end">{numBR(end)}<span style={{fontSize:11,color:'#6b7280'}}> {m.unit}</span></span>
              </div>
              <div className="evo-delta" style={{color:col}}>
                {delta>0?'▲ +':delta<0?'▼ −':'＝ '}{delta!==0?numBR(Math.abs(delta))+' '+m.unit:'sem variação'}
              </div>
            </div>);
        })}
      </div>
    </div>);
}

/* ── Medidor de % de gordura ── */
function FatGauge({gender,pct}){
  const p=num(pct);if(p==null)return null;
  const zones=gender==='M'
    ?[{l:'Atlético',lo:5,hi:14,c:'#5a8a4a'},{l:'Bom',lo:14,hi:18,c:'#8ba85a'},{l:'Aceitável',lo:18,hi:25,c:'#c99a3a'},{l:'Elevado',lo:25,hi:35,c:'#c4685e'}]
    :[{l:'Atlético',lo:10,hi:21,c:'#5a8a4a'},{l:'Bom',lo:21,hi:25,c:'#8ba85a'},{l:'Aceitável',lo:25,hi:32,c:'#c99a3a'},{l:'Elevado',lo:32,hi:42,c:'#c4685e'}]
  ;
  const min=zones[0].lo,max=zones[zones.length-1].hi,span=max-min;
  const markPct=((Math.max(min,Math.min(max,p))-min)/span)*100;
  return(
    <div style={{padding:'4px 2px 2px',maxWidth:520,margin:'0 auto'}}>
      <div style={{position:'relative',height:30}}>
        <div style={{position:'absolute',left:markPct+'%',transform:'translateX(-50%)',textAlign:'center',whiteSpace:'nowrap'}}>
          <div style={{fontSize:16,fontWeight:700,color:'var(--text)',lineHeight:1}}>{fmt(p)}%</div>
          <div style={{width:0,height:0,margin:'4px auto 0',borderLeft:'6px solid transparent',borderRight:'6px solid transparent',borderTop:'7px solid var(--text)'}}/>
        </div>
      </div>
      <div style={{display:'flex',height:13,borderRadius:7,overflow:'hidden'}}>
        {zones.map((z,i)=><div key={i} style={{flex:z.hi-z.lo,background:z.c}}/>)}
      </div>
      <div style={{position:'relative',height:14,marginTop:3,fontSize:9.5,color:'var(--text3)'}}>
        {zones.map((z,i)=><span key={i} style={{position:'absolute',left:(((z.lo-min)/span)*100)+'%',transform:'translateX(-50%)'}}>{z.lo}</span>)}
        <span style={{position:'absolute',left:'100%',transform:'translateX(-100%)'}}>{max}%</span>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:'4px 14px',marginTop:7,justifyContent:'center'}}>
        {zones.map((z,i)=><span key={i} style={{fontSize:10.5,color:'var(--text2)',display:'inline-flex',alignItems:'center',gap:5}}>
          <span style={{width:9,height:9,borderRadius:2,background:z.c}}/>{z.l} ({z.lo}–{z.hi}%)</span>)}
      </div>
    </div>);
}

/* Arco SVG entre dois ângulos (graus), y invertido p/ semicírculo superior */
function arcPath(cx,cy,r,a1,a2){
  const P=a=>[cx+r*Math.cos(a*Math.PI/180),cy-r*Math.sin(a*Math.PI/180)];
  const [x1,y1]=P(a1),[x2,y2]=P(a2);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 ${a1>a2?1:0} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
/* Faixa ideal em texto: [lo,hi] dentro da escala [min,max] */
function fmtIdeal(ideal,min,max,unit){
  if(!ideal)return null;const[lo,hi]=ideal;const u=unit?' '+unit:'';
  // a faixa do IMC é 18,5–25, não 18.5–25
  if(lo<=min)return 'até '+numBR(hi)+u;
  if(hi>=max)return numBR(lo)+u+' ou mais';
  return numBR(lo)+'–'+numBR(hi)+u;
}
/* Medidor semicircular clínico: arco fino segmentado + marca em ponto + valor em serifa */
function Gauge({value,min,max,segments,label,unit,badge,decimals=1,ideal}){
  const v=num(value);if(v==null)return null;
  const cx=110,cy=104,R=86,sw=9,gap=1.6;
  const ang=x=>180-((Math.max(min,Math.min(max,x))-min)/(max-min))*180;
  let prev=min;
  const arcs=segments.map((s,i)=>{const a1=ang(prev),a2=ang(s.t);prev=s.t;
    const gA=i>0?gap:0,gB=i<segments.length-1?gap:0;
    return <path key={i} d={arcPath(cx,cy,R,a1-gA,a2+gB)} stroke={s.c} strokeWidth={sw} fill="none" strokeLinecap="round"/>;});
  const va=ang(v),dx=cx+R*Math.cos(va*Math.PI/180),dy=cy-R*Math.sin(va*Math.PI/180);
  let zc=segments[segments.length-1].c;for(const s of segments){if(v<=s.t){zc=s.c;break;}}
  return(
    <div className="ind-card">
      <div className="ind-title">{label}</div>
      <svg viewBox="0 0 220 120" width="100%" style={{maxWidth:172,display:'block',margin:'2px auto 0'}}>
        <path d={arcPath(cx,cy,R,180,0)} stroke="#ece7de" strokeWidth={sw} fill="none" strokeLinecap="round"/>
        {arcs}
        <circle cx={dx.toFixed(2)} cy={dy.toFixed(2)} r="6.5" fill={zc} stroke="#fff" strokeWidth="2.6"/>
        <text x={cx-R} y={cy+14} fontSize="8.5" fill="#b3a898" textAnchor="middle">{min}</text>
        <text x={cx+R} y={cy+14} fontSize="8.5" fill="#b3a898" textAnchor="middle">{max}</text>
      </svg>
      <div className="ind-val">{fmt(v,decimals)}{unit&&<span className="ind-unit"> {unit}</span>}</div>
      {badge&&<span className={`ind-badge ${badge.c}`}>{badge.l}</span>}
      {ideal&&<div className="ind-ref">Faixa ideal <b>{fmtIdeal(ideal,min,max,unit)}</b></div>}
    </div>);
}
/* Gráfico de linha para evolução */
function TrendChart({label,unit,color='#5a1e2e',points}){
  const pts=points.filter(p=>p.v!=null&&!isNaN(p.v));if(pts.length<2)return null;
  const W=300,H=110,padL=34,padR=10,padT=12,padB=22;
  const vals=pts.map(p=>p.v),mn=Math.min(...vals),mx=Math.max(...vals),rng=(mx-mn)||1;
  const x=i=>padL+(i/(pts.length-1))*(W-padL-padR);
  const y=v=>padT+(1-(v-mn)/rng)*(H-padT-padB);
  const line=pts.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p.v).toFixed(1)).join(' ');
  const area=line+` L${x(pts.length-1).toFixed(1)} ${H-padB} L${x(0).toFixed(1)} ${H-padB} Z`;
  return(
    <div style={{minWidth:230}}>
      <div style={{fontSize:11.5,fontWeight:700,color:'var(--accent)',marginBottom:2}}>{label}{unit?` (${unit})`:''}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:'block'}}>
        <line x1={padL} y1={y(mx)} x2={W-padR} y2={y(mx)} stroke="#eceef1" strokeWidth="1"/>
        <line x1={padL} y1={y(mn)} x2={W-padR} y2={y(mn)} stroke="#eceef1" strokeWidth="1"/>
        <text x={padL-4} y={y(mx)+3} fontSize="9" fill="#9ca3af" textAnchor="end">{fmt(mx,1)}</text>
        <text x={padL-4} y={y(mn)+3} fontSize="9" fill="#9ca3af" textAnchor="end">{fmt(mn,1)}</text>
        <path d={area} fill={color} opacity="0.08"/>
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        {pts.map((p,i)=><g key={i}>
          <circle cx={x(i)} cy={y(p.v)} r="3" fill={color}/>
          {/* o rótulo das pontas encosta na borda do desenho e sai cortado se
              ficar centralizado nelas */}
          <text x={x(i)} y={H-8} fontSize="8" fill="#9ca3af"
            textAnchor={i===0?'start':i===pts.length-1?'end':'middle'}>{p.d}</text>
          <text x={x(i)} y={y(p.v)-6} fontSize="8.5" fontWeight="700" fill="#374151" textAnchor="middle">{fmt(p.v,1)}</text>
        </g>)}
      </svg>
    </div>);
}
/* Anel / donut — premium, número central em serifa */
function Donut({pct,color='#5a1e2e',label,center,badge}){
  const p=num(pct);if(p==null)return null;
  const R=37,C=2*Math.PI*R,cl=Math.max(0,Math.min(100,p));
  return(
    <div className="ind-card" style={{justifyContent:'flex-start'}}>
      <div className="ind-title">{label}</div>
      <svg viewBox="0 0 100 100" width="100%" style={{maxWidth:104,margin:'6px auto 2px',display:'block'}}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="#ece7de" strokeWidth="8"/>
        <circle cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C*(1-cl/100)} transform="rotate(-90 50 50)"/>
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontFamily="'Playfair Display',Georgia,serif" fontSize="24" fontWeight="600" fill="#2a2320">{center??fmt(p)}</text>
        {center==null&&<text x="50" y="66" textAnchor="middle" fontSize="9" fill="#b3a898">%</text>}
      </svg>
      {badge&&<span className={`ind-badge ${badge.c}`}>{badge.l}</span>}
    </div>);
}
/* Radar do perfil físico */
function scoreOf(cls){if(!cls)return null;const m={
  'Superior':95,'Excelente':88,'Atlético':92,'Muito bom':80,'Muito boa':85,'Boa massa muscular':78,'Excepcional':96,
  'Bom':68,'Média':52,'Aceitável':52,'Normal':72,'Saudável':85,'Baixo risco':85,'Regular':45,'Abaixo do ideal':58,'Abaixo':46,
  'Razoável':40,'Risco moderado':45,'Cuidado (baixo)':52,'Risco aumentado':38,'Fraco':28,'Ruim':18,'Acima do ideal':26,'Alto risco':20,'Risco alto':20,
  'Peso normal':80,'Sobrepeso':45,'Obesidade I':28,'Obesidade II':18,'Obesidade III':10,'Abaixo do peso':55,
  'Ótima':92,'Limítrofe':52,'HAS Estágio 1':30,'HAS Estágio 2':20,'HAS Estágio 3':12,
  'Adequada':82,'Baixa':48,'Alta':60,'Alto':82,'Baixo':32,'Elevada':45,
  'Leve restrição':55,'Restrito':30,'Leve encurtamento':55,'Encurtado':35,'Reduzida':50,'Limitada':30,
  'Médio':52,'Simétrico':90,'Leve':70,'Moderado':45,'Acentuado':22,
  'Sem dor':92,'Dor leve':72,'Dor moderada':45,'Dor intensa':22,
  'Encurtado leve':58,'Encurtado moderado':42,'Encurtado severo':26,'Encurtado bilateral':40,'Encurtado D':45,'Encurtado E':45,
  'Positivo':30,'Negativo':82};
  return m[cls.l]??null;}
/* Score de força relativa (1-RM / peso) */
function relForceScore(gender,rm,weight){const r=num(rm),w=num(weight);if(!r||!w)return null;const rel=r/w;
  const t=gender==='F'?[1.0,0.8,0.6,0.45]:[1.5,1.2,0.9,0.65];
  if(rel>=t[0])return 92;if(rel>=t[1])return 76;if(rel>=t[2])return 60;if(rel>=t[3])return 45;return 30;}
function Radar({axes}){
  const A=axes.filter(a=>a.score!=null);if(A.length<3)return null;
  const n=A.length,cx=125,cy=118,R=80;
  const pt=(i,r)=>{const a=(-90+i*360/n)*Math.PI/180;return[+(cx+r*Math.cos(a)).toFixed(1),+(cy+r*Math.sin(a)).toFixed(1)];};
  const poly=ps=>ps.map(p=>p.join(',')).join(' ');
  const data=A.map((a,i)=>pt(i,R*Math.max(5,Math.min(100,a.score))/100));
  return(
    <svg viewBox="0 0 250 220" width="100%" style={{maxWidth:320,display:'block',margin:'0 auto'}}>
      {[25,50,75,100].map(rr=><polygon key={rr} points={poly(A.map((_,i)=>pt(i,R*rr/100)))} fill="none" stroke="#e5e7eb" strokeWidth="1"/>)}
      {A.map((_,i)=>{const[x,y]=pt(i,R);return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" strokeWidth="1"/>;})}
      <polygon points={poly(data)} fill="rgba(90,30,46,.16)" stroke="var(--accent)" strokeWidth="2"/>
      {data.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--accent)"/>)}
      {A.map((a,i)=>{const[x,y]=pt(i,R+17);return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="9.5" fontWeight="600" fill="#374151">{a.label}</text>;})}
    </svg>);
}
/* Potência de pico via salto vertical (Sayers) */
function jumpPower(cmj,weightKg){const j=num(cmj),w=num(weightKg);if(!j||!w)return null;return Math.round(60.7*j+45.3*w-2055);}
function classifyCMJ(gender,cm){const v=num(cm);if(v==null)return null;const t=gender==='F'?[40,33,27,20]:[55,45,36,28];
  const labs=[{l:'Excelente',c:'bg'},{l:'Bom',c:'bg'},{l:'Médio',c:'bb'},{l:'Regular',c:'ba'}];
  for(let i=0;i<t.length;i++)if(v>=t[i])return labs[i];return{l:'Fraco',c:'br'};}

/* Achados posturais legíveis a partir das classificações por segmento */
function posturalFindings(ev){
  const defs=[
    {k:'post_head',reg:'Cabeça',normal:'Alinhada',map:{'Leve anteriorização':['Anteriorização leve da cabeça','bb'],'Moderada':['Anteriorização moderada da cabeça','ba'],'Grave':['Anteriorização acentuada da cabeça','br']}},
    {k:'post_shoulders',reg:'Ombros',normal:'Simétricos'},
    {k:'post_scapula',reg:'Escápulas',normal:'Normal'},
    {k:'post_cervical',reg:'Coluna cervical',normal:'Normal',note:{'Hiperlordose':'aumento da lordose cervical','Retificada':'retificação da curvatura'}},
    {k:'post_thoracic',reg:'Coluna torácica',normal:'Normal',note:{'Hipercifose':'aumento da cifose torácica','Retificada':'dorso plano'}},
    {k:'post_lumbar',reg:'Coluna lombar',normal:'Normal',note:{'Hiperlordose':'aumento da lordose lombar','Retificada':'retificação da curvatura'}},
    {k:'post_pelvis',reg:'Pelve',normal:'Neutra',note:{'Anteversão':'báscula pélvica anterior','Retroversão':'báscula pélvica posterior'}},
    {k:'post_knees',reg:'Joelhos',normal:'Normal',note:{'Valgo':'joelhos em X','Varo':'joelhos em O','Recurvato':'hiperextensão (genu recurvatum)','Flexo':'joelhos em flexão'}},
    {k:'post_feet',reg:'Pés',normal:'Normal',note:{'Pronado':'apoio pronado','Supinado':'apoio supinado','Plano':'pé plano','Cavo':'pé cavo'}}
  ];
  const sev=v=>{const s=v.toLowerCase();if(/grave|acentuad|severo/.test(s))return'br';if(/moderad/.test(s))return'ba';return'bb';};
  const out=[];
  defs.forEach(d=>{const v=ev[d.k];if(!v||v===d.normal)return;
    if(d.map&&d.map[v]){out.push({reg:d.reg,txt:d.map[v][0],c:d.map[v][1]});return;}
    const note=d.note&&d.note[v]?' — '+d.note[v]:'';
    out.push({reg:d.reg,txt:d.reg+': '+v+note,c:sev(v)});});
  return out;
}

/* ── Resumo executivo: score por domínio (0-100), pontos fortes/fracos, prioridades, recomendações ── */
function buildExecutive(student,ev,d,prevEval){
  const G=student.gender,a=age(student.dob);
  const avg=arr=>{const v=arr.filter(x=>x!=null&&!isNaN(x));return v.length?Math.round(v.reduce((s,x)=>s+x,0)/v.length):null;};
  const sc=cls=>scoreOf(cls);
  // domínios
  const saude=avg([sc(classifyFat(G,a,d.fatPct)),sc(classifyBMI(d.bmi)),sc(classifyBP(ev.bp_sys,ev.bp_dia)),sc(classifyWater(G,ev.bio_water)),sc(classifyVisceral(ev.bio_visceral)),sc(classifyRCQ(G,d.rcq)),sc(classifyWHtR(d.whtr))]);
  const mobilidade=avg([sc(classifyKneeWall(ev.kneewall_r)),sc(classifyKneeWall(ev.kneewall_l)),sc(classifySLR(ev.slr_r)),sc(classifySLR(ev.slr_l)),sc(classifyThoracicRot(ev.throt_r)),sc(classifyThoracicRot(ev.throt_l))]);
  const flexibilidade=avg([sc(classifyWells(G,a,ev.flex_wells)),...['short_hamstring','short_iliopsoas','short_rectus','short_calf','short_pec'].map(k=>ev[k]?sc({l:ev[k]}):null)]);
  const forca=avg([sc(classifyFFMI(G,d.ffmi)),relForceScore(G,est1RM(ev.rm_squat_w,ev.rm_squat_r),ev.weight),relForceScore(G,est1RM(ev.rm_bench_w,ev.rm_bench_r),ev.weight)]);
  const potencia=sc(classifyCMJ(G,ev.pw_cmj));
  const vo2=num(ev.inc_vfinal)?incVO2(ev.inc_vfinal):(num(ev.cooper_dist)?cooperVO2(ev.cooper_dist):num(ev.vo2max));
  const cardio=sc(classifyVO2(G,a,vo2));
  // postura: 100 menos severidade dos achados
  const finds=posturalFindings(ev);const postW={br:26,ba:15,bb:8};
  const postura=(finds.length||['post_head','post_shoulders','post_pelvis'].some(k=>ev[k]))?Math.max(20,Math.min(100,100-finds.reduce((s,f)=>s+(postW[f.c]||10),0))):null;
  const bal=classifyBalance(a,ev.bal_open_r,ev.bal_closed_r),balL=classifyBalance(a,ev.bal_open_l,ev.bal_closed_l);
  const equilibrio=avg([sc(bal&&bal.open),sc(bal&&bal.closed),sc(balL&&balL.open),sc(balL&&balL.closed)]);
  const performance=avg([potencia,cardio,forca]);
  // risco de lesão (100 = baixo risco)
  let risco=100;const rl=[];
  if(parqResult(ev)&&parqResult(ev).c==='br'){risco-=25;rl.push('PAR‑Q+ com resposta positiva (avaliação médica recomendada)');}
  const eva=classifyEVA(ev.eva);if(eva&&eva.c==='ba')risco-=12;if(eva&&eva.c==='br'){risco-=25;rl.push('Dor atual intensa (EVA)');}
  finds.filter(f=>f.c==='br').forEach(f=>{risco-=8;});
  const asyms=[asymmetry(ev.kneewall_r,ev.kneewall_l,null,1.5),asymmetry(ev.slr_r,ev.slr_l,10),asymmetry(ev.yb_ant_r,ev.yb_ant_l,null,4)].filter(x=>x&&x.badge.c==='br');
  asyms.forEach(()=>risco-=10);if(asyms.length)rl.push(asyms.length===1?'Assimetria funcional detectada':'Assimetrias funcionais detectadas');
  if(equilibrio!=null&&equilibrio<45){risco-=10;rl.push('Equilíbrio reduzido');}
  risco=Math.max(10,Math.min(100,risco));
  const domains=[['Saúde',saude],['Mobilidade',mobilidade],['Flexibilidade',flexibilidade],['Força',forca],['Potência',potencia],['Cardiorrespiratório',cardio],['Postura',postura],['Equilíbrio',equilibrio],['Performance',performance],['Risco de lesão (↑=melhor)',risco]].filter(x=>x[1]!=null);
  const scored=domains.filter(x=>!/Risco/.test(x[0]));
  const overall=avg([...scored.map(x=>x[1]),risco]);
  // textos
  const strengths=domains.filter(x=>x[1]>=75&&!/Risco/.test(x[0])).map(x=>x[0]).slice(0,4);
  const limitations=domains.filter(x=>x[1]<50&&!/Risco/.test(x[0])).map(x=>x[0]);
  const priorities=[...scored].sort((x,y)=>x[1]-y[1]).filter(x=>x[1]<62).slice(0,3).map(x=>x[0]);
  const recTrain={'Força':'Priorizar treino de força (cargas 75–90% 1‑RM, progressão semanal).','Potência':'Incluir pliometria e trabalho de velocidade/potência.','Cardiorrespiratório':'Adicionar treino aeróbio (zonas Z2–Z3) 2–3× por semana.','Saúde':'Ajuste de composição corporal com déficit calórico leve e treino resistido.','Performance':'Periodizar força + potência + condicionamento específico.','Equilíbrio':'Trabalho proprioceptivo e de estabilização unilateral.'};
  const trainingRecs=priorities.map(p=>recTrain[p]).filter(Boolean);
  const mobilityRecs=[];
  if(mobilidade!=null&&mobilidade<62)mobilityRecs.push('Programa de mobilidade articular focado nos segmentos restritos.');
  const ka=asymmetry(ev.kneewall_r,ev.kneewall_l,null,1.5);if(ka&&ka.badge.c==='br')mobilityRecs.push(`Mobilidade de tornozelo (dorsiflexão) — priorizar lado ${ka.side==='D'?'esquerdo':'direito'}.`);
  ['short_hamstring','short_iliopsoas','short_rectus','short_calf','short_pec'].forEach(k=>{if(ev[k]&&/Encurtado/.test(ev[k])){const nm={short_hamstring:'isquiotibiais',short_iliopsoas:'iliopsoas',short_rectus:'reto femoral',short_calf:'tríceps sural',short_pec:'peitoral'}[k];mobilityRecs.push('Alongamento/liberação de '+nm+'.');}});
  finds.filter(f=>f.c!=='bb').slice(0,2).forEach(f=>mobilityRecs.push('Corretivo postural para '+f.reg.toLowerCase()+'.'));
  // síntese em linguagem natural
  const first=n=>student.name.split(' ')[0]||'O avaliado';
  const nivel=overall>=80?'excelente':overall>=65?'bom':overall>=50?'moderado':'a desenvolver';
  let syn=`${first()} apresenta condicionamento geral ${nivel} (${overall}/100)`;
  if(strengths.length)syn+=`, com destaque para ${strengths.slice(0,2).map(s=>s.toLowerCase()).join(' e ')}`;
  if(priorities.length)syn+=`. A conduta deve priorizar ${listaE(priorities.map(p=>p.toLowerCase()))}`;
  if(rl.length)syn+=`, com atenção a ${rl[0].toLowerCase()}`;
  syn+='.';
  return {synthesis:syn,domains,overall,strengths,limitations,priorities,trainingRecs,mobilityRecs:mobilityRecs.slice(0,5),riskFlags:rl};
}

/* Barra de progresso: trilha = jornada início→meta (0%→100%), preenchida pelo progresso */
function GoalBar({label,unit,start,cur,goal,dir,startDate,curDate,defRate}){
  const g=goalProgress({start,cur,goal,dir,startDate,curDate,defRate});if(!g)return null;
  const curN=num(cur),goalN=num(goal),startN=num(start);
  const pct=g.pct;
  const pctColor=g.reached?'#15803d':pct!=null&&pct>=60?'#2f8f4e':pct!=null&&pct>=30?'#b0894f':'#5a1e2e';
  return(
    <div className="goal-item">
      <div className="goal-top">
        <span className="goal-lbl">{label}</span>
        <span className="goal-cur-val">Atual <strong>{fmt(curN)} {unit}</strong>{!g.reached&&<> · faltam {fmt(g.remaining)} {unit}</>}</span>
      </div>
      <div className="goal-track">
        <div className="goal-fill" style={{width:(pct??(g.reached?100:0))+'%',background:pctColor}}/>
        {pct!=null&&!g.reached&&<div className="goal-cur" style={{left:pct+'%',background:pctColor}}/>}
      </div>
      <div className="goal-scale">
        <span><em>{startN!=null?'Início':'Atual'}</em> {fmt(startN!=null?startN:curN)} {unit}</span>
        {g.reached?<span className="badge bg">Meta atingida</span>:pct!=null?<span className="goal-pct" style={{color:pctColor}}>{pct}% concluído</span>:<span/>}
        <span className="goal"><em>Meta</em> {fmt(goalN)} {unit}</span>
      </div>
      {!g.reached&&g.weeks>0&&<div className="goal-meta"><span className="goal-eta">Estimativa: <strong>~{g.weeks} {g.weeks===1?'semana':'semanas'}</strong>{g.eta&&<> (até {g.eta.toLocaleDateString('pt-BR')})</>} · {g.basis} ≈ {fmt(g.rate)} {unit}/sem</span></div>}
    </div>);
}

/* ── Report ── */
function Report({student,evalData,allEvals,onBack,coach}){
  const others=allEvals.filter(e=>e.id!==evalData.id&&new Date(e.date)<=new Date(evalData.date))
    .sort((a,b)=>new Date(b.date)-new Date(a.date));
  const [baseId,setBaseId]=useState(others[0]?.id||'');
  const prevEval=others.find(e=>e.id===baseId)||null;

  const a=age(student.dob)||25;
  const d=derive(student,evalData);
  const dp=prevEval?derive(student,prevEval):null;
  const bmiCls=classifyBMI(d.bmi),bpCls=classifyBP(evalData.bp_sys,evalData.bp_dia),fatCls=classifyFat(student.gender,a,d.fatPct);
  const highlights=buildHighlights(student,evalData,prevEval);

  function Row({lbl,val,unit,prev,badge,strong}){
    if(val==null||val==='')return null;
    const dlt=(prev!=null&&prev!==''&&!isNaN(parseFloat(prev)))?+(parseFloat(val)-parseFloat(prev)).toFixed(1):null;
    return(<tr>
      <td style={strong?{fontWeight:600,color:'var(--text)'}:null}>{lbl}</td>
      <td style={strong?{fontWeight:700}:null}>{numBR(val)}{unit?` ${unit}`:''}{badge&&<span className={`badge ${badge.c}`} style={{marginLeft:7}}>{badge.l}</span>}</td>
      {/* A diferença saía como número cru do JavaScript, sempre com ponto:
          "▼-2.3" ao lado de "24,3". E sem mudança escrevia um "0" solto no meio
          da coluna, que se lê como se o valor fosse zero. */}
      {prevEval&&<td className={`delta ${dlt==null?'d-neutral':dlt>0?'d-bad':dlt<0?'d-good':'d-neutral'}`}>
        {dlt==null||dlt===0?'—':(dlt>0?'▲+':'▼−')+numBR(Math.abs(dlt))}</td>}
    </tr>);
  }
  const hasSF=['sf_chest','sf_midaxillary','sf_triceps','sf_subscapular','sf_abdomen','sf_suprailiac','sf_thigh','sf_biceps','sf_calf'].some(k=>num(evalData[k]));
  const hasCirc=['circ_shoulders','circ_chest','circ_waist','circ_abdomen','circ_hip','circ_arm_r','circ_thigh_r','circ_calf_r'].some(k=>num(evalData[k]));
  const hasBio=['bio_fat','bio_muscle','bio_muscle_pct','bio_lean','bio_water','bio_visceral','bio_bmr','bio_metabage','bio_bone'].some(k=>num(evalData[k]));
  const hasBP=num(evalData.bp_sys)&&num(evalData.bp_dia);
  const hasDyn=num(evalData.dyn_r)||num(evalData.dyn_l);
  const reportNo=`MF-${new Date(evalData.date).getFullYear()}${String(new Date(evalData.date).getMonth()+1).padStart(2,'0')}-${evalData.id.slice(-4).toUpperCase()}`;

  return(
    <div>
      <div className="abar no-print">
        <div><div className="breadcrumb" onClick={onBack}>← Histórico</div>
          <div className="ph-title">Relatório de avaliação</div>
          <div className="ph-sub">{student.name} · {fmtDate(evalData.date)}</div></div>
        <div className="bgroup">
          {others.length>0&&(
            <select className="fi" style={{width:'auto',minWidth:200}} value={baseId} onChange={e=>setBaseId(e.target.value)}>
              <option value="">Sem comparação</option>
              {others.map(e=><option key={e.id} value={e.id}>Comparar com {fmtDate(e.date)}</option>)}
            </select>)}
          <button className="btn btn-secondary" onClick={()=>shareWhatsApp(student,evalData,prevEval)}>WhatsApp</button>
          <button className="btn btn-primary" onClick={()=>window.print()}>Imprimir / PDF</button>
        </div>
      </div>

      <div className="rpt-page" id="rpt">
        {/* Capa dedicada — página 1 */}
        {(()=>{
          const ex=buildExecutive(student,evalData,d,prevEval);
          const sColor=v=>v>=75?'#7bbf92':v>=55?'#d8b573':v>=40?'#d8a35a':'#d47a83';
          const oc=ex.overall!=null?sColor(ex.overall):'#b0894f';
          const R=52,C=2*Math.PI*R;
          return(
          <div className="rpt-cover">
            <div className="rpt-cover-brand">
              {coach?.logo_url?<img src={coach.logo_url} alt="" style={{height:60,maxWidth:130,objectFit:'contain'}}/>:<LogoLifter size={64}/>}
              <div><div className="cv-name">{(coach?.brand_name||'MF PERFORMANCE').toUpperCase()}</div>
                <div className="cv-tag">Avaliação Física &amp; Performance</div></div>
            </div>
            <div style={{marginTop:44}}>
              <div className="rpt-cover-kick">Relatório de</div>
              <div className="rpt-cover-title">Avaliação Física<br/><span className="cv-gold">{prevEval?'Comparativa':'Individual'}</span></div>
            </div>
            <div className="rpt-cover-main">
              <div>
                <div className="rpt-cover-name">{student.name}</div>
                <div className="rpt-cover-meta">
                  {age(student.dob)?`${age(student.dob)} anos · `:''}{student.gender==='M'?'Masculino':'Feminino'}
                  {student.activity&&` · ${student.activity}`}<br/>
                  Avaliado em <strong>{fmtDate(evalData.date)}</strong>
                  {prevEval&&<> · comparado com <strong>{fmtDate(prevEval.date)}</strong></>}
                  {student.goal&&<><br/>Objetivo: <strong>{student.goal}</strong></>}
                </div>
              </div>
              {ex.overall!=null&&(
                <div style={{textAlign:'center'}}>
                  <svg viewBox="0 0 130 130" width="150" height="150">
                    <circle cx="65" cy="65" r={R} fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="8"/>
                    <circle cx="65" cy="65" r={R} fill="none" stroke={oc} strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C*(1-ex.overall/100)} transform="rotate(-90 65 65)"/>
                    <text x="65" y="63" textAnchor="middle" fontFamily="'Playfair Display',Georgia,serif" fontSize="40" fontWeight="600" fill="#fff">{ex.overall}</text>
                    <text x="65" y="82" textAnchor="middle" fontSize="9" letterSpacing="2" fill="rgba(255,255,255,.55)">SCORE / 100</text>
                  </svg>
                  <div style={{fontSize:10.5,letterSpacing:3,textTransform:'uppercase',color:'rgba(255,255,255,.5)',marginTop:2}}>Score Geral</div>
                </div>
              )}
            </div>
            <div className="rpt-cover-foot">
              <span>Relatório nº {reportNo}</span>
              <span>Emitido em {new Date().toLocaleDateString('pt-BR')}</span>
            </div>
          </div>);
        })()}
        <div className="rpt-runhead">
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {coach?.logo_url?<img src={coach.logo_url} alt="" style={{height:26,maxWidth:80,objectFit:'contain'}}/>:<LogoMark size={26}/>}
            <span className="rh-brand">{(coach?.brand_name||'MF PERFORMANCE').toUpperCase()}</span>
          </div>
          <div className="rh-meta">{student.name} · {fmtDate(evalData.date)} · Nº {reportNo}</div>
        </div>

        <div className="rpt-body">
          {/* Resumo executivo + Score geral */}
          {(()=>{
            const ex=buildExecutive(student,evalData,d,prevEval);
            if(ex.overall==null)return null;
            const sColor=v=>v>=75?'#2f8f4e':v>=55?'#b0894f':v>=40?'#c98a3a':'#b3434f';
            const oc=sColor(ex.overall);const R=40,C=2*Math.PI*R;
            return(<div className="rpt-sec"><div className="rpt-sec-title">Resumo executivo</div>
              {ex.synthesis&&<p style={{fontSize:15,lineHeight:1.7,color:'#2a2320',marginBottom:14,fontFamily:'var(--serif2)'}}>{ex.synthesis}</p>}
              <div style={{display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}}>
                <div style={{textAlign:'center',minWidth:130}}>
                  <svg viewBox="0 0 110 110" width="120" height="120">
                    <circle cx="55" cy="55" r={R} fill="none" stroke="#ece7de" strokeWidth="9"/>
                    <circle cx="55" cy="55" r={R} fill="none" stroke={oc} strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C*(1-ex.overall/100)} transform="rotate(-90 55 55)"/>
                    <text x="55" y="52" textAnchor="middle" fontFamily="'Playfair Display',Georgia,serif" fontSize="30" fontWeight="600" fill="#2a2320">{ex.overall}</text>
                    <text x="55" y="70" textAnchor="middle" fontSize="9" fill="#8a8378">SCORE / 100</text>
                  </svg>
                </div>
                <div style={{flex:1,minWidth:220}}>
                  {ex.domains.map(([lbl,v])=>{const c=sColor(v);const isRisk=/Risco/.test(lbl);return(
                    <div key={lbl} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                      <span style={{fontSize:11,color:'#5b6470',width:150,textAlign:'right'}}>{lbl}</span>
                      <div style={{flex:1,height:8,background:'#eee9e1',borderRadius:5,overflow:'hidden'}}><div style={{width:v+'%',height:'100%',background:c,borderRadius:5}}/></div>
                      <span style={{fontSize:11,fontWeight:700,color:c,width:24}}>{v}</span>
                    </div>);})}
                </div>
              </div>
              {(ex.strengths.length>0||ex.limitations.length>0)&&<div className="rpt-grid" style={{marginTop:14}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'#2f8f4e',textTransform:'uppercase',letterSpacing:.4,marginBottom:4}}>Pontos fortes</div>
                  <div style={{fontSize:12.5,lineHeight:1.6}}>{ex.strengths.length?ex.strengths.join(' · '):'—'}</div>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'#b3434f',textTransform:'uppercase',letterSpacing:.4,marginBottom:4}}>Limitações / atenção</div>
                  <div style={{fontSize:12.5,lineHeight:1.6}}>{ex.limitations.length?ex.limitations.join(' · '):'—'}</div>
                </div>
              </div>}
              {ex.priorities.length>0&&<div style={{marginTop:12}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:.4,marginBottom:4}}>Prioridades de intervenção</div>
                <ol style={{margin:'0 0 0 18px',fontSize:12.5,lineHeight:1.7}}>{ex.priorities.map((p,i)=><li key={i}>{p}</li>)}</ol>
              </div>}
              {ex.riskFlags.length>0&&<div className="alert alert-warn" style={{marginTop:12}}><strong>Alertas de risco:</strong> {ex.riskFlags.join(' · ')}.</div>}
              {(ex.trainingRecs.length>0||ex.mobilityRecs.length>0)&&<div className="rpt-grid" style={{marginTop:12}}>
                {ex.trainingRecs.length>0&&<div><div style={{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:.4,marginBottom:4}}>Recomendações de treino</div><ul style={{margin:'0 0 0 16px',fontSize:12.5,lineHeight:1.7}}>{ex.trainingRecs.map((r,i)=><li key={i}>{r}</li>)}</ul></div>}
                {ex.mobilityRecs.length>0&&<div><div style={{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:.4,marginBottom:4}}>Recomendações de mobilidade</div><ul style={{margin:'0 0 0 16px',fontSize:12.5,lineHeight:1.7}}>{ex.mobilityRecs.map((r,i)=><li key={i}>{r}</li>)}</ul></div>}
              </div>}
            </div>);
          })()}

          {/* Resumo */}
          <div className="stat-grid" style={{marginBottom:24}}>
            {d.bmi&&<Stat lbl="IMC" val={fmt(d.bmi)} unit="kg/m²" badge={bmiCls}/>}
            {d.fatPct!=null&&<Stat lbl="% Gordura" val={fmt(d.fatPct)} unit="%" badge={fatCls}/>}
            {hasBP&&<Stat lbl="Pressão" val={`${numBR(evalData.bp_sys)}/${numBR(evalData.bp_dia)}`} badge={bpCls}/>}
            {d.leanMass!=null&&<Stat lbl="Massa magra" val={d.leanMass} unit="kg"/>}
            {d.fatMass!=null&&<Stat lbl="Massa gorda" val={d.fatMass} unit="kg"/>}
            {d.dynAvg&&<Stat lbl="Preensão" val={d.dynAvg} unit="kgf"/>}
            {num(evalData.bio_bmr)&&<Stat lbl="TMB" val={num(evalData.bio_bmr).toLocaleString('pt-BR')} unit="kcal"/>}
            {num(evalData.bio_metabage)&&<Stat lbl="Idade metabólica" val={evalData.bio_metabage} unit="anos" badge={age(student.dob)?(num(evalData.bio_metabage)<=age(student.dob)?{l:`${numBR(+(age(student.dob)-num(evalData.bio_metabage)).toFixed(1))} anos abaixo`,c:'bg'}:{l:`${numBR(+(num(evalData.bio_metabage)-age(student.dob)).toFixed(1))} anos acima`,c:'ba'}):null}/>}
          </div>

          {/* Painel visual (medidores + anel) e radar do perfil */}
          {(()=>{
            const pAge=age(student.dob);
            const Z={slate:'#7e93a6',sage:'#6f8a54',gold:'#c0a35a',clay:'#bb6a5e'};
            const bc={bg:Z.sage,ba:Z.gold,br:Z.clay,bb:Z.slate,bo:'#b0894f'};
            const col=cls=>cls?(bc[cls.c]||'#5a1e2e'):'#5a1e2e';
            const musc=num(evalData.bio_muscle)||d.leanMass;
            const ratio=(musc&&d.fatMass)?+(musc/d.fatMass).toFixed(1):null;
            const vo2r=num(evalData.inc_vfinal)?incVO2(evalData.inc_vfinal):(num(evalData.cooper_dist)?cooperVO2(evalData.cooper_dist):num(evalData.vo2max));
            const vo2Clsr=classifyVO2(student.gender,pAge,vo2r);
            const g=[];
            const fMin=student.gender==='M'?5:10,fMax=student.gender==='M'?35:42;
            const fSeg=student.gender==='M'?[{t:14,c:Z.sage},{t:18,c:Z.sage},{t:25,c:Z.gold},{t:35,c:Z.clay}]:[{t:21,c:Z.sage},{t:25,c:Z.sage},{t:32,c:Z.gold},{t:42,c:Z.clay}];
            if(d.fatPct!=null)g.push(<Gauge key="fat" label="% Gordura" value={d.fatPct} min={fMin} max={fMax} unit="%" badge={fatCls} ideal={student.gender==='M'?[6,18]:[14,25]} segments={fSeg}/>);
            if(d.bmi)g.push(<Gauge key="imc" label="IMC" value={d.bmi} min={15} max={40} unit="kg/m²" badge={bmiCls} ideal={[18.5,25]} segments={[{t:18.5,c:Z.slate},{t:25,c:Z.sage},{t:30,c:Z.gold},{t:40,c:Z.clay}]}/>);
            if(num(evalData.bio_muscle_pct))g.push(<Gauge key="sk" label="Músculo esquelético" value={num(evalData.bio_muscle_pct)} min={20} max={55} unit="%" badge={classifySkeletal(student.gender,evalData.bio_muscle_pct)} ideal={student.gender==='M'?[33,43]:[24,35]} segments={[{t:(student.gender==='M'?33:24),c:Z.gold},{t:(student.gender==='M'?43:35),c:Z.sage},{t:55,c:Z.slate}]}/>);
            if(d.ffmi)g.push(<Gauge key="ffmi" label="FFMI (massa magra)" value={d.ffmi} min={15} max={26} unit="kg/m²" badge={classifyFFMI(student.gender,d.ffmi)} ideal={student.gender==='M'?[20,24]:[16,20]} segments={[{t:(student.gender==='M'?18:15),c:Z.gold},{t:(student.gender==='M'?22:19),c:Z.sage},{t:26,c:Z.slate}]}/>);
            if(num(evalData.bio_water))g.push(<Gauge key="ag" label="Água corporal" value={num(evalData.bio_water)} min={40} max={70} unit="%" badge={classifyWater(student.gender,evalData.bio_water)} ideal={[50,65]} segments={[{t:50,c:Z.gold},{t:65,c:Z.sage},{t:70,c:Z.slate}]}/>);
            if(num(evalData.bio_visceral))g.push(<Gauge key="vi" label="Gordura visceral" value={num(evalData.bio_visceral)} min={1} max={20} decimals={0} badge={classifyVisceral(evalData.bio_visceral)} ideal={[1,9]} segments={[{t:9,c:Z.sage},{t:14,c:Z.gold},{t:20,c:Z.clay}]}/>);
            if(ratio)g.push(<Gauge key="ra" label="Músculo / gordura" value={ratio} min={0} max={3} ideal={[2,3]} segments={[{t:1,c:Z.clay},{t:2,c:Z.gold},{t:3,c:Z.sage}]}/>);
            if(num(evalData.resting_hr))g.push(<Gauge key="fc" label="FC repouso" value={num(evalData.resting_hr)} min={40} max={110} decimals={0} unit="bpm" ideal={[40,60]} segments={[{t:60,c:Z.sage},{t:80,c:Z.gold},{t:110,c:Z.clay}]}/>);
            if(vo2r!=null)g.push(<Gauge key="vo" label="VO₂máx" value={vo2r} min={20} max={65} unit="mL/kg" badge={vo2Clsr} ideal={[42,65]} segments={[{t:30,c:Z.clay},{t:42,c:Z.gold},{t:52,c:Z.sage},{t:65,c:Z.slate}]}/>);
            const axes=[
              {label:'Composição',score:scoreOf(fatCls)},
              {label:'Aeróbio',score:scoreOf(vo2Clsr)},
              {label:'Força',score:scoreOf(classifyFFMI(student.gender,d.ffmi))},
              {label:'Resistência',score:(Math.max(scoreOf(classifyPushup(student.gender,pAge,evalData.res_pushup))||0,scoreOf(classifySitup(student.gender,pAge,evalData.res_situp))||0))||null},
              {label:'Flexibilidade',score:scoreOf(classifyWells(student.gender,pAge,evalData.flex_wells))},
              {label:'Potência',score:scoreOf(classifyCMJ(student.gender,evalData.pw_cmj))}
            ];
            const hasRadar=axes.filter(a=>a.score!=null).length>=3;
            if(g.length===0&&d.fatPct==null&&!hasRadar)return null;
            return(<>
              {g.length>0&&<div className="rpt-sec"><div className="rpt-sec-title">Painel de indicadores</div>
                <div className="ind-grid">{g}</div></div>}
              {hasRadar&&<div className="rpt-sec"><div className="rpt-sec-title">Perfil físico</div>
                <Radar axes={axes}/>
                <div style={{fontSize:10.5,color:'#9ca3af',textAlign:'center',marginTop:2}}>Perfil físico por domínio (0–100).</div>
              </div>}
            </>);
          })()}

          {/* Comparativo */}
          {prevEval&&dp&&(
            <div className="rpt-sec">
              <div className="rpt-sec-title">Evolução desde {fmtDate(prevEval.date)}</div>
              {highlights.length>0&&(
                <div className="highlight-box">
                  <div className="highlight-title">Destaques da evolução</div>
                  {highlights.map((h,i)=><div className="highlight-item" key={i}><span className="ico">{h.ico}</span><span>{h.txt}</span></div>)}
                </div>)}
              <div className="cmp-grid">
                <CmpCard label="Peso" cur={evalData.weight} prev={prevEval.weight} unit="kg" dir={null}/>
                <CmpCard label="% Gordura" cur={d.fatPct} prev={dp.fatPct} unit="%" dir="down"/>
                <CmpCard label="Massa magra" cur={d.leanMass} prev={dp.leanMass} unit="kg" dir="up"/>
                <CmpCard label="Massa gorda" cur={d.fatMass} prev={dp.fatMass} unit="kg" dir="down"/>
                {(num(evalData.bio_muscle)||num(prevEval.bio_muscle))&&<CmpCard label="Massa muscular" cur={evalData.bio_muscle} prev={prevEval.bio_muscle} unit="kg" dir="up"/>}
                <CmpCard label="Cintura" cur={evalData.circ_waist} prev={prevEval.circ_waist} unit="cm" dir="down"/>
                {(d.dynAvg||dp.dynAvg)&&<CmpCard label="Preensão média" cur={d.dynAvg} prev={dp.dynAvg} unit="kgf" dir="up"/>}
                <CmpCard label="IMC" cur={d.bmi?+d.bmi.toFixed(1):null} prev={dp.bmi?+dp.bmi.toFixed(1):null} unit="" dir="down"/>
              </div>
            </div>)}

          {/* Gráfico de evolução */}
          <EvolutionSection student={student} evals={allEvals}/>

          {/* Tabelas detalhadas */}
          <div className="rpt-grid">
            <div>
              <div className="rpt-sec">
                <div className="rpt-sec-title">Antropometria e composição</div>
                <table className="rpt-tbl"><tbody>
                  <Row lbl="Peso" val={evalData.weight} unit="kg" prev={prevEval?.weight}/>
                  <Row lbl="Estatura" val={normHeightCm(evalData.height)} unit="cm" prev={prevEval?prevEval.height&&normHeightCm(prevEval.height):null}/>
                  {d.bmi&&<Row lbl="IMC" val={fmt(d.bmi)} unit="kg/m²" badge={bmiCls} prev={dp?(dp.bmi?fmt(dp.bmi):null):null}/>}
                  {d.fatPct!=null&&<Row lbl="% Gordura" val={fmt(d.fatPct)} unit="%" badge={fatCls} prev={dp?.fatPct}/>}
                  {d.fatMass!=null&&<Row lbl="Massa gorda" val={d.fatMass} unit="kg" badge={fatCls} prev={dp?.fatMass}/>}
                  {d.leanMass!=null&&<Row lbl="Massa magra" val={d.leanMass} unit="kg" prev={dp?.leanMass}/>}
                  {d.ffmi&&<Row lbl="FFMI (índice massa magra)" val={d.ffmi} unit="kg/m²" badge={classifyFFMI(student.gender,d.ffmi)} prev={dp?.ffmi}/>}
                  {d.rcq&&<Row lbl="Rel. cintura/quadril" val={d.rcq} badge={classifyRCQ(student.gender,d.rcq)} prev={dp?.rcq}/>}
                  {d.whtr&&<Row lbl="Rel. cintura/estatura" val={d.whtr} badge={classifyWHtR(d.whtr)} prev={dp?.whtr}/>}
                </tbody></table>
                {(classifyRCQ(student.gender,d.rcq)?.c==='br'||classifyWHtR(d.whtr)?.c==='br')&&
                  <p style={{fontSize:11,color:'#9a3540',marginTop:6,lineHeight:1.5}}>Distribuição de gordura em faixa de <strong>risco cardiometabólico aumentado</strong> — associado a maior risco de doenças cardiovasculares, hipertensão e diabetes tipo 2. Recomenda-se acompanhamento.</p>}
              </div>
              {(hasBP||hasDyn||num(evalData.resting_hr))&&(
                <div className="rpt-sec"><div className="rpt-sec-title">Dados hemodinâmicos</div>
                  <table className="rpt-tbl"><tbody>
                    {num(evalData.resting_hr)&&<Row lbl="FC de repouso" val={evalData.resting_hr} unit="bpm" prev={prevEval?.resting_hr}/>}
                    {hasBP&&<><Row lbl="PA sistólica" val={evalData.bp_sys} unit="mmHg" prev={prevEval?.bp_sys}/>
                    <Row lbl="PA diastólica" val={evalData.bp_dia} unit="mmHg" prev={prevEval?.bp_dia}/>
                    {bpCls&&<tr><td>Classificação PA</td><td><Badge cls={bpCls.c}>{bpCls.l}</Badge></td>{prevEval&&<td/>}</tr>}</>}
                    {num(evalData.dyn_r)&&<Row lbl="Preensão direita" val={evalData.dyn_r} unit="kgf" prev={prevEval?.dyn_r}/>}
                    {num(evalData.dyn_l)&&<Row lbl="Preensão esquerda" val={evalData.dyn_l} unit="kgf" prev={prevEval?.dyn_l}/>}
                    {d.dynAvg&&<Row lbl="Média preensão" val={d.dynAvg} unit="kgf" prev={dp?.dynAvg}/>}
                  </tbody></table>
                </div>)}
              {(d.tmb||d.hidr)&&(
                <div className="rpt-sec"><div className="rpt-sec-title">Indicadores metabólicos</div>
                  <table className="rpt-tbl"><tbody>
                    {/* O número vai cru: formatado, "1.353" chegava no cálculo
                        da diferença e o parseFloat lia 1,353 — a linha saía
                        "1.353 kcal ▼-1342.6". Quem formata agora é a Row. */}
                    {d.tmb&&<Row lbl="Taxa metabólica basal" val={d.tmb} unit="kcal" prev={dp?.tmb}/>}
                    {d.get&&<Row lbl="Gasto energético total" val={d.get} unit="kcal/dia" prev={dp?.get}/>}
                    {num(evalData.bio_metabage)&&<Row lbl="Idade metabólica" val={evalData.bio_metabage} unit="anos" prev={prevEval?.bio_metabage}/>}
                    {d.hidr&&<Row lbl="Hidratação recomendada" val={(d.hidr/1000).toFixed(1).replace('.',',')} unit={`L/dia · ~${Math.round(d.hidr/250)} copos`} strong prev={dp?.hidr?(dp.hidr/1000).toFixed(1).replace('.',','):null}/>}
                  </tbody></table>
                </div>)}
              {hasBio&&(
                <div className="rpt-sec"><div className="rpt-sec-title">Bioimpedância</div>
                  <table className="rpt-tbl"><tbody>
                    <Row lbl="% Gordura corporal" val={evalData.bio_fat} unit="%" badge={num(evalData.bio_fat)?fatCls:null} prev={prevEval?.bio_fat}/>
                    <Row lbl="Massa muscular" val={evalData.bio_muscle} unit="kg" prev={prevEval?.bio_muscle}/>
                    <Row lbl="% Músculo esquelético" val={evalData.bio_muscle_pct} unit="%" badge={classifySkeletal(student.gender,evalData.bio_muscle_pct)} prev={prevEval?.bio_muscle_pct}/>
                    <Row lbl="Massa magra" val={evalData.bio_lean} unit="kg" badge={d.ffmi?classifyFFMI(student.gender,d.ffmi):null} prev={prevEval?.bio_lean}/>
                    <Row lbl="% Água corporal" val={evalData.bio_water} unit="%" badge={classifyWater(student.gender,evalData.bio_water)} prev={prevEval?.bio_water}/>
                    <Row lbl="Massa óssea" val={evalData.bio_bone} unit="kg" prev={prevEval?.bio_bone}/>
                    <Row lbl="Gordura visceral" val={evalData.bio_visceral} unit="" badge={classifyVisceral(evalData.bio_visceral)} prev={prevEval?.bio_visceral}/>
                  </tbody></table>
                </div>)}
            </div>
            <div>
              {hasSF&&(
                <div className="rpt-sec"><div className="rpt-sec-title">Dobras cutâneas (mm)</div>
                  <table className="rpt-tbl"><tbody>
                    <Row lbl="Tríceps" val={evalData.sf_triceps} unit="mm" prev={prevEval?.sf_triceps}/>
                    <Row lbl="Subescapular" val={evalData.sf_subscapular} unit="mm" prev={prevEval?.sf_subscapular}/>
                    <Row lbl="Bíceps" val={evalData.sf_biceps} unit="mm" prev={prevEval?.sf_biceps}/>
                    <Row lbl="Tórax/Peitoral" val={evalData.sf_chest} unit="mm" prev={prevEval?.sf_chest}/>
                    <Row lbl="Axilar média" val={evalData.sf_midaxillary} unit="mm" prev={prevEval?.sf_midaxillary}/>
                    <Row lbl="Suprailíaca" val={evalData.sf_suprailiac} unit="mm" prev={prevEval?.sf_suprailiac}/>
                    <Row lbl="Abdominal" val={evalData.sf_abdomen} unit="mm" prev={prevEval?.sf_abdomen}/>
                    <Row lbl="Coxa" val={evalData.sf_thigh} unit="mm" prev={prevEval?.sf_thigh}/>
                    <Row lbl="Panturrilha" val={evalData.sf_calf} unit="mm" prev={prevEval?.sf_calf}/>
                    {d.jp!=null&&<Row lbl={`% Gordura (${(SF_PROTOCOLS[evalData.sf_protocol||'jp7']||SF_PROTOCOLS.jp7).short})`} val={fmt(d.jp)} unit="%" badge={fatCls} strong prev={dp&&dp.jp!=null?fmt(dp.jp):null}/>}
                  </tbody></table>
                </div>)}
              {hasCirc&&(
                <div className="rpt-sec"><div className="rpt-sec-title">Circunferências (cm)</div>
                  <table className="rpt-tbl"><tbody>
                    <Row lbl="Ombros" val={evalData.circ_shoulders} unit="cm" prev={prevEval?.circ_shoulders}/>
                    <Row lbl="Tórax" val={evalData.circ_chest} unit="cm" prev={prevEval?.circ_chest}/>
                    <Row lbl="Cintura" val={evalData.circ_waist} unit="cm" prev={prevEval?.circ_waist}/>
                    <Row lbl="Abdômen" val={evalData.circ_abdomen} unit="cm" prev={prevEval?.circ_abdomen}/>
                    <Row lbl="Quadril" val={evalData.circ_hip} unit="cm" prev={prevEval?.circ_hip}/>
                    {d.rcq&&<Row lbl="Rel. cintura/quadril" val={d.rcq} unit="" prev={dp?.rcq}/>}
                    <Row lbl="Braço direito" val={evalData.circ_arm_r} unit="cm" prev={prevEval?.circ_arm_r}/>
                    <Row lbl="Braço esquerdo" val={evalData.circ_arm_l} unit="cm" prev={prevEval?.circ_arm_l}/>
                    <Row lbl="Coxa direita" val={evalData.circ_thigh_r} unit="cm" prev={prevEval?.circ_thigh_r}/>
                    <Row lbl="Coxa esquerda" val={evalData.circ_thigh_l} unit="cm" prev={prevEval?.circ_thigh_l}/>
                    <Row lbl="Panturrilha dir." val={evalData.circ_calf_r} unit="cm" prev={prevEval?.circ_calf_r}/>
                    <Row lbl="Panturrilha esq." val={evalData.circ_calf_l} unit="cm" prev={prevEval?.circ_calf_l}/>
                  </tbody></table>
                </div>)}
            </div>
          </div>

          {/* Fotos posturais com fio de prumo */}
          {(()=>{
            const PH=[['Anterior','front'],['Lateral','side'],['Posterior','back']];
            const hasPh=PH.some(([,k])=>evalData['post_photo_'+k]);
            const hasMx=PH.some(([,k])=>(evalData['post_metrics_'+k]||[]).length>0);
            if(!hasPh&&!hasMx)return null;
            return(<div className="rpt-sec"><div className="rpt-sec-title">Análise postural por imagem</div>
              <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
                {PH.map(([lbl,k])=>{const ph=evalData['post_photo_'+k],mx=evalData['post_metrics_'+k]||[];if(!ph&&!mx.length)return null;
                  return(<div key={k} style={{textAlign:'center',minWidth:150}}>
                    {ph&&<div style={{position:'relative',width:150,borderRadius:8,overflow:'hidden',border:'1px solid #e5e7eb',margin:'0 auto'}}>
                      <img src={ph} alt="" style={{display:'block',width:'100%'}}/>
                      {evalData['post_pts_'+k]&&<PostureOverlay view={k} pts={evalData['post_pts_'+k]}/>}
                    </div>}
                    <div style={{fontSize:11,fontWeight:700,color:'var(--accent)',marginTop:5}}>{lbl}</div>
                    {mx.map((x,i)=><div key={i} style={{fontSize:10.5,color:'#374151',lineHeight:1.5}}>{x.l}: <strong>{x.v}{x.u}</strong>{x.badge&&<span className={`badge ${x.badge.c}`} style={{marginLeft:4,fontSize:9,padding:'1px 5px'}}>{x.badge.l}</span>}</div>)}
                  </div>);})}
              </div></div>);
          })()}

          {/* Questionários / prontidão */}
          {(()=>{
            const pq=parqResult(evalData);const anyQ=pq||num(evalData.eva)!=null||num(evalData.fatigue)!=null||num(evalData.stress)!=null;
            if(!anyQ)return null;
            return(<div className="rpt-sec"><div className="rpt-sec-title">Prontidão e questionários</div>
              <table className="rpt-tbl"><tbody>
                {pq&&<tr><td>PAR‑Q+</td><td style={{fontWeight:600}}>{pq.l}<span className={`badge ${pq.c}`} style={{marginLeft:6}}>{pq.c==='br'?'Atenção':'OK'}</span></td></tr>}
                {num(evalData.eva)!=null&&<Row lbl="Dor (EVA 0–10)" val={evalData.eva} unit="" badge={classifyEVA(evalData.eva)} prev={prevEval?.eva}/>}
                {num(evalData.fatigue)!=null&&<Row lbl="Fadiga (0–10)" val={evalData.fatigue} unit="" badge={classifyScale10(evalData.fatigue)} prev={prevEval?.fatigue}/>}
                {num(evalData.stress)!=null&&<Row lbl="Estresse (0–10)" val={evalData.stress} unit="" badge={classifyScale10(evalData.stress)} prev={prevEval?.stress}/>}
              </tbody></table>
            </div>);
          })()}

          {/* Postural / testes físicos */}
          {(()=>{
            const pAge=age(student.dob);const G=student.gender;
            const POST=[['Cabeça','post_head'],['Ombros','post_shoulders'],['Escápulas','post_scapula'],['Coluna cervical','post_cervical'],['Coluna torácica','post_thoracic'],['Coluna lombar','post_lumbar'],['Pelve','post_pelvis'],['Joelhos','post_knees'],['Pés','post_feet']];
            const SHORT=[['Isquiotibiais','short_hamstring'],['Iliopsoas','short_iliopsoas'],['Reto femoral','short_rectus'],['Tríceps sural','short_calf'],['Peitoral','short_pec']];
            const hasPost=POST.some(([,k])=>evalData[k])||evalData.post_obs;
            const hasFlex=num(evalData.flex_wells)!=null||SHORT.some(([,k])=>evalData[k])||evalData.flex_obs;
            const hasRes=['res_pushup','res_situp','res_squat','res_pullup'].some(k=>num(evalData[k]));
            const vo2=num(evalData.inc_vfinal)?incVO2(evalData.inc_vfinal):(num(evalData.cooper_dist)?cooperVO2(evalData.cooper_dist):num(evalData.vo2max));
            const RM=[['Supino','bench'],['Agachamento','squat'],['Levantamento terra','dead'],['Desenvolvimento','ohp'],['Remada','row']];
            const hasRM=RM.some(([,k])=>num(evalData['rm_'+k+'_w']));
            const puCls=classifyPushup(G,pAge,evalData.res_pushup),siCls=classifySitup(G,pAge,evalData.res_situp),sqCls=classifySquat(G,evalData.res_squat),puuCls=classifyPullup(G,evalData.res_pullup),wCls=classifyWells(G,pAge,evalData.flex_wells);
            const vo2Cls=classifyVO2(G,pAge,vo2);
            if(!hasPost&&!hasFlex&&!hasRes&&vo2==null&&!hasRM)return null;
            return(<div className="rpt-grid">
              <div>
                {hasPost&&(()=>{const finds=posturalFindings(evalData);return <div className="rpt-sec"><div className="rpt-sec-title">Avaliação postural</div>
                  {POST.some(([,k])=>evalData[k])&&<div className="post-find">
                    <div className="post-find-hd">{finds.length?`Achados posturais (${finds.length})`:'Achados posturais'}</div>
                    {finds.length?<ul className="post-find-list">
                      {finds.map((f,i)=><li key={i}><span className={`badge ${f.c}`}>{f.c==='br'?'Acentuado':f.c==='ba'?'Moderado':'Leve'}</span><span>{f.txt}</span></li>)}
                    </ul>:<div className="post-find-ok">Sem desvios posturais significativos — segmentos avaliados dentro do padrão de normalidade.</div>}
                  </div>}
                  <table className="rpt-tbl"><tbody>
                    {POST.map(([lbl,k])=>evalData[k]?<tr key={k}><td>{lbl}</td><td style={{textAlign:'left',fontWeight:400}}>{evalData[k]}</td></tr>:null)}
                  </tbody></table>
                  {evalData.post_obs&&<p style={{fontSize:12,color:'var(--text2)',marginTop:8,lineHeight:1.6}}>{evalData.post_obs}</p>}
                </div>;})()}
                {hasFlex&&<div className="rpt-sec"><div className="rpt-sec-title">Flexibilidade &amp; encurtamentos</div>
                  <table className="rpt-tbl"><tbody>
                    {num(evalData.flex_wells)!=null&&<Row lbl="Banco de Wells" val={evalData.flex_wells} unit="cm" badge={wCls} prev={prevEval?.flex_wells}/>}
                    {SHORT.map(([lbl,k])=>evalData[k]?<tr key={k}><td>{lbl}</td><td style={{textAlign:'left',fontWeight:400}}>{evalData[k]}</td></tr>:null)}
                  </tbody></table>
                  {evalData.flex_obs&&<p style={{fontSize:12,color:'var(--text2)',marginTop:8,lineHeight:1.6}}>{evalData.flex_obs}</p>}
                </div>}
                {(()=>{
                  const MOBN=[['Knee to Wall','kneewall',classifyKneeWall,'cm'],['SLR','slr',classifySLR,'°'],['Rotação torácica','throt',classifyThoracicRot,'°']];
                  const MOBS=[['Thomas','thomas'],['Ober','ober'],['Ely','ely'],['FABER','faber'],['FADIR','fadir'],['Mob. ombro','shldr']];
                  const hasMob=MOBN.some(([,k])=>num(evalData[k+'_r'])||num(evalData[k+'_l']))||MOBS.some(([,k])=>evalData[k+'_r']||evalData[k+'_l'])||evalData.ohs;
                  if(!hasMob)return null;
                  const bcell=(cls)=>cls?<span className={`badge ${cls.c}`} style={{marginLeft:6}}>{cls.l}</span>:null;
                  return(<div className="rpt-sec"><div className="rpt-sec-title">Mobilidade articular</div>
                    <table className="rpt-tbl"><tbody>
                      <tr><td></td><td style={{fontWeight:700,color:'#6b7280'}}>Direito</td><td style={{fontWeight:700,color:'#6b7280'}}>Esquerdo</td></tr>
                      {MOBN.map(([lbl,k,fn,u])=>(num(evalData[k+'_r'])||num(evalData[k+'_l']))?<tr key={k}><td>{lbl}</td>
                        <td>{evalData[k+'_r']?`${numBR(evalData[k+'_r'])} ${u}`:'—'}{bcell(fn(evalData[k+'_r']))}</td>
                        <td>{evalData[k+'_l']?`${numBR(evalData[k+'_l'])} ${u}`:'—'}{bcell(fn(evalData[k+'_l']))}</td></tr>:null)}
                      {MOBS.map(([lbl,k])=>(evalData[k+'_r']||evalData[k+'_l'])?<tr key={k}><td>{lbl}</td><td>{numBR(evalData[k+'_r'])||'—'}</td><td>{numBR(evalData[k+'_l'])||'—'}</td></tr>:null)}
                      {evalData.ohs&&<tr><td>Overhead squat</td><td colSpan="2" style={{textAlign:'left',fontWeight:400}}>{evalData.ohs}</td></tr>}
                    </tbody></table>
                    {(()=>{const a=asymmetry(evalData.kneewall_r,evalData.kneewall_l,null,1.5);return a&&a.badge.c==='br'?<p style={{fontSize:11.5,color:'#9a3540',marginTop:6}}>Assimetria de dorsiflexão de {a.diff} cm ({a.side} maior) — priorizar mobilidade do lado restrito.</p>:null;})()}
                    {evalData.mob_obs&&<p style={{fontSize:12,color:'var(--text2)',marginTop:6,lineHeight:1.6}}>{evalData.mob_obs}</p>}
                  </div>);
                })()}
                {(()=>{
                  const bAge=age(student.dob);const bo=classifyBalance(bAge,evalData.bal_open_r,evalData.bal_closed_r),boL=classifyBalance(bAge,evalData.bal_open_l,evalData.bal_closed_l);
                  const ybR=ybComposite(evalData.yb_ant_r,evalData.yb_pm_r,evalData.yb_pl_r),ybL=ybComposite(evalData.yb_ant_l,evalData.yb_pm_l,evalData.yb_pl_l);
                  const antAsym=asymmetry(evalData.yb_ant_r,evalData.yb_ant_l,null,4);
                  const hasBal=['bal_open_r','bal_open_l','bal_closed_r','bal_closed_l'].some(k=>num(evalData[k]))||ybR!=null||ybL!=null;
                  if(!hasBal)return null;
                  const bc=cls=>cls?<span className={`badge ${cls.c}`} style={{marginLeft:6}}>{cls.l}</span>:null;
                  return(<div className="rpt-sec"><div className="rpt-sec-title">Equilíbrio</div>
                    <table className="rpt-tbl"><tbody>
                      <tr><td></td><td style={{fontWeight:700,color:'#6b7280'}}>Direito</td><td style={{fontWeight:700,color:'#6b7280'}}>Esquerdo</td></tr>
                      {(num(evalData.bal_open_r)||num(evalData.bal_open_l))&&<tr><td>Unipodal olhos abertos</td><td>{evalData.bal_open_r?numBR(evalData.bal_open_r)+' s':'—'}{bc(bo?.open)}</td><td>{evalData.bal_open_l?numBR(evalData.bal_open_l)+' s':'—'}{bc(boL?.open)}</td></tr>}
                      {(num(evalData.bal_closed_r)||num(evalData.bal_closed_l))&&<tr><td>Unipodal olhos fechados</td><td>{evalData.bal_closed_r?numBR(evalData.bal_closed_r)+' s':'—'}{bc(bo?.closed)}</td><td>{evalData.bal_closed_l?numBR(evalData.bal_closed_l)+' s':'—'}{bc(boL?.closed)}</td></tr>}
                      {(ybR!=null||ybL!=null)&&<tr><td>Y-Balance (composto)</td><td style={{fontWeight:600}}>{ybR!=null?numBR(ybR)+' cm':'—'}</td><td style={{fontWeight:600}}>{ybL!=null?numBR(ybL)+' cm':'—'}</td></tr>}
                    </tbody></table>
                    {antAsym&&antAsym.diff>4&&<p style={{fontSize:11.5,color:'#9a3540',marginTop:6}}>Assimetria anterior de {antAsym.diff} cm ({antAsym.side} maior) — risco de lesão aumentado; incluir trabalho proprioceptivo unilateral.</p>}
                    {evalData.bal_obs&&<p style={{fontSize:12,color:'var(--text2)',marginTop:6,lineHeight:1.6}}>{evalData.bal_obs}</p>}
                  </div>);
                })()}
                {(vo2!=null)&&<div className="rpt-sec"><div className="rpt-sec-title">Cardiorrespiratório</div>
                  <table className="rpt-tbl"><tbody>
                    {num(evalData.inc_vfinal)&&<Row lbl="Esteira — vel. final" val={evalData.inc_vfinal} unit="km/h" prev={prevEval?.inc_vfinal}/>}
                    {num(evalData.inc_time)&&<Row lbl="Tempo total" val={evalData.inc_time} unit="min" prev={prevEval?.inc_time}/>}
                    {num(evalData.cooper_dist)&&<Row lbl="Cooper (12 min)" val={evalData.cooper_dist} unit="m" prev={prevEval?.cooper_dist}/>}
                    <tr><td><strong>VO₂máx</strong></td><td style={{fontWeight:700}}>{fmt(vo2)} mL/kg/min{vo2Cls&&<span className={`badge ${vo2Cls.c}`} style={{marginLeft:6}}>{vo2Cls.l}</span>}</td>{prevEval&&<td/>}</tr>
                  </tbody></table></div>}
              </div>
              <div>
                {hasRes&&<div className="rpt-sec"><div className="rpt-sec-title">Resistência muscular</div>
                  <table className="rpt-tbl"><tbody>
                    <Row lbl="Flexão de braço" val={evalData.res_pushup} unit="reps" badge={puCls} prev={prevEval?.res_pushup}/>
                    <Row lbl="Abdominal (1 min)" val={evalData.res_situp} unit="reps" badge={siCls} prev={prevEval?.res_situp}/>
                    <Row lbl="Agachamento (1 min)" val={evalData.res_squat} unit="reps" badge={sqCls} prev={prevEval?.res_squat}/>
                    <Row lbl="Barra fixa" val={evalData.res_pullup} unit="reps" badge={puuCls} prev={prevEval?.res_pullup}/>
                  </tbody></table></div>}
                {hasRM&&<div className="rpt-sec"><div className="rpt-sec-title">Força — 1‑RM estimado</div>
                  <table className="rpt-tbl"><tbody>
                    {RM.map(([lbl,k])=>{const e1=est1RM(evalData['rm_'+k+'_w'],evalData['rm_'+k+'_r']);
                      return e1?<tr key={k}><td>{lbl}</td><td style={{fontWeight:600}}>{fmt(e1)} kg <span style={{color:'var(--text3)',fontWeight:400,fontSize:11}}>({numBR(evalData['rm_'+k+'_w'])} kg × {numBR(evalData['rm_'+k+'_r'])||1})</span></td>{prevEval&&<td/>}</tr>:null;})}
                  </tbody></table></div>}
                {(()=>{const FUNC=[['Timed Up and Go','func_tug','s',classifyTUG],['5x Sit-to-Stand','func_sts5','s',classifySTS5],['30s Chair Stand','func_chair30','reps',classifyChair30],['Wall Sit','func_wallsit','s',classifyWallSit],['Prancha','func_plank','s',classifyPlank],['Dead Hang','func_deadhang','s',classifyDeadHang]];
                  if(!FUNC.some(([,k])=>num(evalData[k]))&&!num(evalData.func_slsts_r))return null;
                  const as=asymmetry(evalData.func_slsts_r,evalData.func_slsts_l,15);
                  return(<div className="rpt-sec"><div className="rpt-sec-title">Avaliação funcional</div>
                    <table className="rpt-tbl"><tbody>
                      {FUNC.map(([lbl,k,u,fn])=>num(evalData[k])?<Row key={k} lbl={lbl} val={evalData[k]} unit={u} badge={fn(evalData[k])} prev={prevEval?.[k]}/>:null)}
                      {(num(evalData.func_slsts_r)||num(evalData.func_slsts_l))&&<tr><td>SL sit-to-stand (D / E)</td><td style={{fontWeight:600}}>{numBR(evalData.func_slsts_r)||'—'} / {numBR(evalData.func_slsts_l)||'—'} reps{as&&as.badge.c==='br'&&<span className="badge br" style={{marginLeft:6}}>Assimetria {as.pct}%</span>}</td>{prevEval&&<td/>}</tr>}
                    </tbody></table>
                    {evalData.func_obs&&<p style={{fontSize:12,color:'var(--text2)',marginTop:6,lineHeight:1.6}}>{evalData.func_obs}</p>}
                  </div>);
                })()}
                {['pw_cmj','pw_sj','pw_horizontal','pw_sargent','pw_medball','pw_dj_h','pw_sprint5','pw_sprint10','pw_sprint20','pw_sprint30','pw_agility_t','pw_illinois','pw_505_r','pw_rast_fi','pw_yoyo','pw_beep'].some(k=>num(evalData[k])||evalData[k])&&
                  <div className="rpt-sec"><div className="rpt-sec-title">Potência, velocidade &amp; agilidade</div>
                  <table className="rpt-tbl"><tbody>
                    <Row lbl="Salto vertical (CMJ)" val={evalData.pw_cmj} unit="cm" badge={classifyCMJ(student.gender,evalData.pw_cmj)} prev={prevEval?.pw_cmj}/>
                    {jumpPower(evalData.pw_cmj,evalData.weight)&&<tr><td>Potência de pico (est.)</td><td style={{fontWeight:600}}>{jumpPower(evalData.pw_cmj,evalData.weight).toLocaleString('pt-BR')} W</td>{prevEval&&<td/>}</tr>}
                    <Row lbl="Squat Jump (SJ)" val={evalData.pw_sj} unit="cm" prev={prevEval?.pw_sj}/>
                    <Row lbl="Salto horizontal" val={evalData.pw_horizontal} unit="cm" prev={prevEval?.pw_horizontal}/>
                    {rsiCalc(evalData.pw_dj_h,evalData.pw_dj_ct)&&<tr><td>RSI (Drop Jump)</td><td style={{fontWeight:600}}>{numBR(rsiCalc(evalData.pw_dj_h,evalData.pw_dj_ct))}<span className={`badge ${classifyRSI(rsiCalc(evalData.pw_dj_h,evalData.pw_dj_ct)).c}`} style={{marginLeft:6}}>{classifyRSI(rsiCalc(evalData.pw_dj_h,evalData.pw_dj_ct)).l}</span></td>{prevEval&&<td/>}</tr>}
                    <Row lbl="Arremesso medicine ball" val={evalData.pw_medball} unit="m" prev={prevEval?.pw_medball}/>
                    <Row lbl="Sprint 5 m" val={evalData.pw_sprint5} unit="s" prev={prevEval?.pw_sprint5}/>
                    <Row lbl="Sprint 10 m" val={evalData.pw_sprint10} unit="s" prev={prevEval?.pw_sprint10}/>
                    <Row lbl="Sprint 20 m" val={evalData.pw_sprint20} unit="s" prev={prevEval?.pw_sprint20}/>
                    <Row lbl="Sprint 30 m" val={evalData.pw_sprint30} unit="s" prev={prevEval?.pw_sprint30}/>
                    <Row lbl="Agilidade (T-test)" val={evalData.pw_agility_t} unit="s" prev={prevEval?.pw_agility_t}/>
                    <Row lbl="Illinois" val={evalData.pw_illinois} unit="s" prev={prevEval?.pw_illinois}/>
                    {(num(evalData.pw_505_r)||num(evalData.pw_505_l))&&<tr><td>505 (D / E)</td><td style={{fontWeight:600}}>{numBR(evalData.pw_505_r)||'—'} / {numBR(evalData.pw_505_l)||'—'} s</td>{prevEval&&<td/>}</tr>}
                    {num(evalData.pw_rast_fi)&&<tr><td>RAST — índice de fadiga</td><td style={{fontWeight:600}}>{numBR(evalData.pw_rast_fi)}%<span className={`badge ${classifyFatigueIndex(evalData.pw_rast_fi).c}`} style={{marginLeft:6}}>{classifyFatigueIndex(evalData.pw_rast_fi).l}</span></td>{prevEval&&<td/>}</tr>}
                    {yoyoVO2(evalData.pw_yoyo)&&<tr><td>Yo-Yo IR1 ({numBR(evalData.pw_yoyo)} m)</td><td style={{fontWeight:600}}>VO₂máx ≈ {numBR(yoyoVO2(evalData.pw_yoyo))} mL/kg/min</td>{prevEval&&<td/>}</tr>}
                    {evalData.pw_beep&&<tr><td>Beep test</td><td style={{fontWeight:600}}>Nível {numBR(evalData.pw_beep)}</td>{prevEval&&<td/>}</tr>}
                  </tbody></table></div>}
              </div>
            </div>);
          })()}

          {/* Screening de lesões */}
          {(()=>{
            const map=evalData.injury_map||{};const marks=Object.keys(map).length;
            const hist=[['Cirurgias','inj_surgery'],['Fraturas','inj_fracture'],['Entorses','inj_sprain'],['Tendinites','inj_tendinitis'],['Hérnias','inj_hernia'],['Lesões musculares','inj_muscle']].filter(([,k])=>evalData[k]==='Sim');
            if(!marks&&!hist.length&&!evalData.injury_current&&!evalData.injury_history)return null;
            return(<div className="rpt-sec"><div className="rpt-sec-title">Histórico e screening de lesões</div>
              <div style={{display:'flex',gap:18,flexWrap:'wrap',alignItems:'flex-start'}}>
                {marks>0&&<svg viewBox="0 0 100 100" width="120" style={{flexShrink:0}}>
                  <g fill="none" stroke="#cfc8bd" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
                    <circle cx="50" cy="7" r="5"/><path d="M42 13 Q50 16 58 13 L64 20 66 40 60 41 58 26 57 55 53 92 47 92 43 55 42 26 40 41 34 40 36 20 Z"/><path d="M36 20 L26 48 M64 20 L74 48"/>
                  </g>
                  {BODY_REGIONS.map(r=>{const m=map[r.k];return m?<circle key={r.k} cx={r.x} cy={r.y} r="3" fill={evaColor(m.eva)} stroke="#fff" strokeWidth="0.7"/>:null;})}
                </svg>}
                <div style={{flex:1,minWidth:200}}>
                  {marks>0&&<table className="rpt-tbl" style={{marginBottom:8}}><tbody>
                    {Object.entries(map).map(([k,m])=>{const r=BODY_REGIONS.find(x=>x.k===k);if(!r)return null;return(
                      <tr key={k}><td>{r.l}</td><td style={{textAlign:'left',fontWeight:500}}>{m.eva?`EVA ${m.eva}/10`:'—'}{m.note?` · ${m.note}`:''}</td></tr>);})}
                  </tbody></table>}
                  {hist.length>0&&<div style={{fontSize:12.5,marginBottom:6}}><strong>Histórico:</strong> {hist.map(h=>h[0]).join(' · ')}.</div>}
                  {evalData.injury_current&&<p style={{fontSize:12,color:'var(--text2)',lineHeight:1.6}}><strong style={{color:'var(--text)'}}>Dor atual:</strong> {evalData.injury_current}</p>}
                  {evalData.injury_history&&<p style={{fontSize:12,color:'var(--text2)',lineHeight:1.6}}>{evalData.injury_history}</p>}
                  {evalData.inj_details&&<p style={{fontSize:12,color:'var(--text2)',lineHeight:1.6}}>{evalData.inj_details}</p>}
                </div>
              </div>
            </div>);
          })()}

          {/* Assimetrias */}
          {(()=>{
            const rows=asymmetryPanel(evalData);if(rows.length<2)return null;
            return(<div className="rpt-sec"><div className="rpt-sec-title">Painel de assimetrias</div>
              <table className="rpt-tbl"><tbody>
                <tr><td></td><td style={{fontWeight:700,color:'#6b7280'}}>D / E</td><td style={{fontWeight:700,color:'#6b7280'}}>Diferença</td></tr>
                {rows.map((r,i)=><tr key={i}><td>{r.lbl}</td><td>{numBR(r.r)||'—'} / {numBR(r.l)||'—'}</td>
                  <td style={{fontWeight:600}}>{numBR(r.pct)}%<span className={`badge ${r.badge.c}`} style={{marginLeft:6}}>{r.badge.c==='br'?`${r.side} maior`:'OK'}</span></td></tr>)}
              </tbody></table>
              {rows.some(r=>r.badge.c==='br')&&<p style={{fontSize:11.5,color:'#9a3540',marginTop:6,lineHeight:1.5}}>Assimetrias acima do limiar sugerem trabalho unilateral corretivo do lado deficitário e reavaliação em 6–8 semanas.</p>}
            </div>);
          })()}

          {/* Qualidade do movimento */}
          {(()=>{
            const MOV=[['Agachamento','mq_squat'],['Afundo','mq_lunge'],['Flexão','mq_pushup'],['Levantamento terra','mq_deadlift'],['Corrida','mq_run'],['Salto','mq_jump']];
            if(!MOV.some(([,k])=>num(evalData[k])))return null;
            return(<div className="rpt-sec"><div className="rpt-sec-title">Qualidade do movimento</div>
              <table className="rpt-tbl"><tbody>
                {MOV.map(([lbl,k])=>num(evalData[k])?<tr key={k}><td>{lbl}</td><td style={{fontWeight:600}}>{numBR(evalData[k])}/5<span className={`badge ${classifyMove(evalData[k]).c}`} style={{marginLeft:6}}>{classifyMove(evalData[k]).l}</span></td>{prevEval&&<td/>}</tr>:null)}
              </tbody></table>
              {evalData.mq_obs&&<p style={{fontSize:12,color:'var(--text2)',marginTop:6,lineHeight:1.6}}>{evalData.mq_obs}</p>}
            </div>);
          })()}

          {/* Anamnese resumo. A condição tem de ser exatamente a das linhas
              abaixo: com `goal` aqui dentro, um aluno que só tem objetivo
              preenchido abria a seção e a tabela vinha vazia — título sozinho
              no papel, que é a cara de documento montado por máquina. */}
          {(student.activity||student.train_time||student.health||student.meds
            ||student.injuries||(student.smoker&&student.smoker!=='Não'))&&(
            <div className="rpt-sec"><div className="rpt-sec-title">Perfil &amp; anamnese</div>
              <table className="rpt-tbl"><tbody>
                {student.activity&&<tr><td>Nível de atividade</td><td style={{textAlign:'left',fontWeight:400}}>{student.activity}</td></tr>}
                {student.train_time&&<tr><td>Experiência de treino</td><td style={{textAlign:'left',fontWeight:400}}>{student.train_time}</td></tr>}
                {student.health&&<tr><td>Condições de saúde</td><td style={{textAlign:'left',fontWeight:400}}>{student.health}</td></tr>}
                {student.meds&&<tr><td>Medicamentos</td><td style={{textAlign:'left',fontWeight:400}}>{student.meds}</td></tr>}
                {student.injuries&&<tr><td>Lesões / limitações</td><td style={{textAlign:'left',fontWeight:400}}>{student.injuries}</td></tr>}
                {(student.smoker&&student.smoker!=='Não')&&<tr><td>Fumante</td><td style={{textAlign:'left',fontWeight:400}}>{student.smoker}</td></tr>}
              </tbody></table>
            </div>)}

          {/* Progresso rumo à meta */}
          {(num(evalData.goal_weight)||num(evalData.goal_fat))&&(()=>{
            const asc=[...allEvals].sort((a,b)=>new Date(a.date)-new Date(b.date));
            const baseEv=asc[0];const sameBase=!baseEv||baseEv.id===evalData.id;
            const baseD=(!sameBase)?derive(student,baseEv):null;
            const wGoal=num(evalData.goal_weight),wCur=num(evalData.weight);
            const fGoal=num(evalData.goal_fat),fCur=d.fatPct;
            const bars=[];
            if(wGoal!=null&&wCur!=null)bars.push(<GoalBar key="w" label="Peso corporal" unit="kg" dir={wGoal<wCur?'down':'up'}
              start={sameBase?null:num(baseEv.weight)} cur={wCur} goal={wGoal}
              startDate={sameBase?null:baseEv.date} curDate={evalData.date} defRate={0.5}/>);
            if(fGoal!=null&&fCur!=null)bars.push(<GoalBar key="f" label="% Gordura corporal" unit="%" dir={fGoal<fCur?'down':'up'}
              start={sameBase?null:(baseD?baseD.fatPct:null)} cur={fCur} goal={fGoal}
              startDate={sameBase?null:baseEv.date} curDate={evalData.date} defRate={0.4}/>);
            if(!bars.length)return null;
            return(<div className="rpt-sec"><div className="rpt-sec-title">Progresso rumo à meta</div>
              {bars}
              <div style={{fontSize:10.5,color:'#9ca3af',marginTop:12,lineHeight:1.5}}>Estimativa baseada no ritmo real de evolução do aluno quando há histórico; sem histórico, adota um ritmo saudável e sustentável (≈0,5 kg e 0,4% de gordura por semana). É uma orientação — o resultado depende da adesão ao treino e à dieta.</div>
            </div>);
          })()}

          {/* Zonas de treino */}
          {(()=>{
            const fz=fcZones(age(student.dob),evalData.resting_hr);
            const lifts=[['Supino','bench'],['Agachamento','squat'],['Terra','dead']].map(([l,k])=>({l,rm:est1RM(evalData['rm_'+k+'_w'],evalData['rm_'+k+'_r'])})).filter(x=>x.rm);
            if(!fz&&lifts.length===0)return null;
            return(<div className="rpt-sec"><div className="rpt-sec-title">Zonas de treino</div>
              <div className="rpt-grid">
                {fz&&<div>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--accent)',marginBottom:5}}>Frequência cardíaca — FCmáx {fz.fcmax} bpm</div>
                  <table className="rpt-tbl"><tbody>
                    {fz.zones.map((z,i)=><tr key={i}><td>{z.n}</td><td style={{fontWeight:600}}>{z.lo}–{z.hi} bpm</td></tr>)}
                  </tbody></table>
                  <div style={{fontSize:10,color:'#9ca3af',marginTop:4}}>Método: {fz.method}{fz.rest?` · FC repouso ${numBR(fz.rest)} bpm`:''}.</div>
                </div>}
                {lifts.length>0&&<div>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--accent)',marginBottom:5}}>Cargas por objetivo (% do 1‑RM)</div>
                  {lifts.map(lf=>(<div key={lf.l} style={{marginBottom:8}}>
                    <div style={{fontSize:11.5,fontWeight:600}}>{lf.l} · 1‑RM {fmt(lf.rm)} kg</div>
                    <table className="rpt-tbl"><tbody>
                      {loadZones(lf.rm).map((z,i)=><tr key={i}><td>{z.n} <span style={{color:'#9ca3af',fontSize:10}}>({z.reps})</span></td><td style={{fontWeight:600}}>{z.lo}–{z.hi} kg</td></tr>)}
                    </tbody></table>
                  </div>))}
                </div>}
              </div>
            </div>);
          })()}

          {/* Metas e projeções */}
          {(num(evalData.goal_weight)||num(evalData.goal_fat)||evalData.goal_next)&&(()=>{
            const proj=projectGoals(evalData,d);
            return(<div className="rpt-sec"><div className="rpt-sec-title">Definição de metas e alvos</div>
              <table className="rpt-tbl"><tbody>
                {num(evalData.goal_weight)&&<tr><td>Peso alvo</td><td style={{fontWeight:600}}>{numBR(evalData.goal_weight)} kg</td>{prevEval&&<td/>}</tr>}
                {num(evalData.goal_fat)&&<tr><td>% Gordura alvo</td><td style={{fontWeight:600}}>{numBR(evalData.goal_fat)}%</td>{prevEval&&<td/>}</tr>}
                {evalData.goal_next&&<tr><td>Próxima reavaliação</td><td style={{fontWeight:600}}>{fmtDate(evalData.goal_next)}</td>{prevEval&&<td/>}</tr>}
              </tbody></table>
              {proj&&<div style={{marginTop:10}}>
                <div style={{fontSize:11,color:'#6b7280',marginBottom:6}}>Projeção sugerida em {proj.weeks} semanas (a partir dos dados atuais):</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {proj.scenarios.map(sc=><div key={sc.l} style={{flex:'1 1 130px',background:'#f7f8fa',border:'1px solid #e9ebee',borderRadius:8,padding:'8px 10px'}}>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--accent)'}}>{sc.l}</div>
                    {sc.fat!=null&&<div style={{fontSize:12.5,color:'#111827'}}>Gordura: <strong>{fmt(sc.fat)}%</strong></div>}
                    {sc.weight!=null&&<div style={{fontSize:12.5,color:'#111827'}}>Peso: <strong>{fmt(sc.weight)} kg</strong></div>}
                  </div>)}
                </div></div>}
            </div>);
          })()}

          {/* Parecer do avaliador */}
          {(evalData.pt_strong||evalData.pt_improve||evalData.pt_strategy)&&(
            <div className="rpt-sec"><div className="rpt-sec-title">Parecer do avaliador</div>
              {evalData.pt_strong&&<div style={{marginBottom:8}}><div style={{fontSize:11,fontWeight:700,color:'#15803d',textTransform:'uppercase',letterSpacing:.4}}>Pontos fortes</div><p style={{fontSize:12.5,lineHeight:1.6,color:'#1f2430'}}>{evalData.pt_strong}</p></div>}
              {evalData.pt_improve&&<div style={{marginBottom:8}}><div style={{fontSize:11,fontWeight:700,color:'#9a3540',textTransform:'uppercase',letterSpacing:.4}}>Pontos a melhorar</div><p style={{fontSize:12.5,lineHeight:1.6,color:'#1f2430'}}>{evalData.pt_improve}</p></div>}
              {evalData.pt_strategy&&<div><div style={{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:.4}}>Estratégia / conduta</div><p style={{fontSize:12.5,lineHeight:1.6,color:'#1f2430'}}>{evalData.pt_strategy}</p></div>}
            </div>)}

          {evalData.obs&&(<div className="rpt-sec"><div className="rpt-sec-title">Observações da avaliação</div>
            <p style={{fontSize:12.5,color:'var(--text2)',lineHeight:1.65}}>{evalData.obs}</p></div>)}

          <div className="sig-grid">
            <div className="sig-line">{[coach?.name,coach?.cref&&`CREF ${coach.cref}`].filter(Boolean).join(' · ')||'Avaliador responsável · CREF'}</div>
            <div className="sig-line">{student.name}</div>
          </div>
          <div className="rpt-footer">
            Documento confidencial · Relatório nº {reportNo} · Emitido em {new Date().toLocaleDateString('pt-BR')}
            {[coach?.phone,coach?.instagram].filter(Boolean).length>0&&<><br/>{[coach?.brand_name||coach?.name,coach?.phone,coach?.instagram].filter(Boolean).join(' · ')}</>}
          </div>
        </div>
      </div>
    </div>);
}

/* ── Mapeamento DB <-> objetos do app ── */
const STU_COLS=['name','dob','gender','phone','email','profession','goal','activity','schedule','train_time','health','meds','family_hist','injuries','smoker','alcohol','sleep','obs'];
function stuToRow(s,coachId){const r={coach_id:coachId};STU_COLS.forEach(k=>r[k]=(s[k]===''?null:s[k])??null);r.photo_url=s.photo||null;return r;}
function rowToStu(r){const s={id:r.id,photo:r.photo_url||'',created_at:r.created_at||null,user_id:r.user_id||null,coach_id:r.coach_id||null};STU_COLS.forEach(k=>s[k]=r[k]??'');if(!s.gender)s.gender='M';try{s.profile_type=localStorage.getItem('mfp_ptype_'+r.id)||'';}catch(e){s.profile_type='';}return s;}
const EVAL_META=['id','studentId','date','obs'];
function evalToRow(e,coachId){const data={};Object.keys(e).forEach(k=>{if(!EVAL_META.includes(k))data[k]=e[k];});return{student_id:e.studentId,coach_id:coachId,date:e.date,obs:e.obs||null,data};}
function rowToEval(r){return{id:r.id,studentId:r.student_id,date:r.date,obs:r.obs||'',...(r.data||{})};}

/* Diz se o app já está preparado para abrir sem internet. Vale conferir antes
   de sair para um lugar sem sinal — ou depois de uma atualização, que precisa
   de uma abertura com internet para guardar os arquivos novos. */
function SeloOffline(){
  const [pronto,setPronto]=useState(null);
  useEffect(()=>{let vivo=true;
    (async()=>{
      try{
        if(!('serviceWorker' in navigator)||!('caches' in window)){if(vivo)setPronto(false);return;}
        await navigator.serviceWorker.ready;
        const nomes=await caches.keys();
        for(const n of nomes){
          const c=await caches.open(n);
          if(await c.match('./lib/supabase.js')){if(vivo)setPronto(true);return;}
        }
        if(vivo)setPronto(false);
      }catch(e){if(vivo)setPronto(false);}
    })();
    return()=>{vivo=false;};},[]);
  if(pronto===null)return null;
  return(<div style={{marginTop:5,fontSize:10.5,color:pronto?'var(--green)':'var(--text3)'}}>
    {pronto?'● Pronto para usar sem internet':'○ Preparando o uso sem internet…'}</div>);
}

/* ── Convite para instalar na tela de início ─────────────────
   Sem instalar, o iPhone não entrega notificação nenhuma e o app abre
   com a barra do navegador por cima. Este convite explica o caminho,
   e no Android instala com um toque só. */
const APP_INSTALADO=()=>{try{return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}catch(e){return false;}};
// Um convite de cada vez. Os dois cartoes empilhados viravam um muro antes do
// treino, e no iPhone o aviso so funciona com o app na tela de inicio — entao
// instalar vem primeiro e o convite de avisos espera a vez. Quem dispensa o
// primeiro ve o segundo na proxima abertura, nao no mesmo instante.
const conviteInstalarVisivel=chave=>{
  if(APP_INSTALADO())return false;
  try{return localStorage.getItem('mfp_instalar_'+(chave||'geral'))!=='1';}catch(e){return true;}
};
const EH_IOS=(()=>{try{return /iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}catch(e){return false;}})();
const PASSOS_INSTALAR=EH_IOS
  ?['Toque em Compartilhar — o quadrado com a seta para cima, na barra do Safari.',
    'Role a lista e toque em “Adicionar à Tela de Início”.',
    'Confirme em “Adicionar”. O ícone fica junto dos seus outros apps.',
    'Abra o app pelo ícone. É só por ele que as notificações funcionam.']
  :['Toque no menu do navegador — os três pontinhos, no canto.',
    'Escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.',
    'Confirme. O ícone fica junto dos seus outros apps.'];

function ConviteInstalar({lv,fechavel,chave,titulo,texto}){
  const [pronto,setPronto]=useState(()=>!!window.MFP_INSTALL);
  const [jaTem,setJaTem]=useState(APP_INSTALADO);
  const [aberto,setAberto]=useState(false);
  const [fechado,setFechado]=useState(()=>{try{return localStorage.getItem('mfp_instalar_'+(chave||'geral'))==='1';}catch(e){return false;}});
  useEffect(()=>{
    const f=()=>{setPronto(!!window.MFP_INSTALL);setJaTem(APP_INSTALADO());};
    window.MFP_INSTALL_OUVINTES.push(f);
    let mq=null;
    try{mq=window.matchMedia('(display-mode: standalone)');if(mq.addEventListener)mq.addEventListener('change',f);}catch(e){}
    return()=>{const i=window.MFP_INSTALL_OUVINTES.indexOf(f);if(i>=0)window.MFP_INSTALL_OUVINTES.splice(i,1);
      try{if(mq&&mq.removeEventListener)mq.removeEventListener('change',f);}catch(e){}};
  },[]);
  if(jaTem||fechado)return null;
  const fechar=()=>{setFechado(true);try{localStorage.setItem('mfp_instalar_'+(chave||'geral'),'1');}catch(e){}};
  const instalar=async()=>{
    const p=window.MFP_INSTALL;
    if(!p){setAberto(true);return;}
    try{p.prompt();const r=await p.userChoice;
      if(r&&r.outcome==='accepted'){window.MFP_INSTALL=null;setPronto(false);setJaTem(true);}
    }catch(e){setAberto(true);}
  };
  const tit=titulo||'Deixe o app na tela de início';
  const txt=texto||(EH_IOS
    ?'Abre direto, sem a barra do Safari — e é assim que os avisos chegam no seu celular.'
    :'Abre direto, sem a barra do navegador, e funciona até sem internet.');
  const passos=<ol style={{margin:'12px 0 0',paddingLeft:18,lineHeight:1.7,fontSize:13}}>
    {PASSOS_INSTALAR.map((x,i)=><li key={i}>{x}</li>)}</ol>;

  if(lv)return(<div className="lv-card" style={{borderColor:'var(--lvsel)'}}>
    <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:800,fontSize:15}}>{tit}</div>
        <div className="lv-sub" style={{marginTop:4,lineHeight:1.5}}>{txt}</div>
      </div>
      {fechavel&&<button type="button" onClick={fechar} title="Agora não" aria-label="Agora não"
        style={{cursor:'pointer',color:'var(--lvt3)',fontSize:20,lineHeight:1,padding:'0 2px',background:'none',border:0}}>×</button>}
    </div>
    <button className="lv-btn" style={{marginTop:12}} onClick={pronto?instalar:()=>setAberto(v=>!v)}>
      {pronto?'Instalar agora':aberto?'Fechar o passo a passo':'Ver como instalar'}</button>
    {aberto&&<div className="lv-sub" style={{color:'var(--lvt2)'}}>{passos}</div>}
  </div>);

  return(<div className="card" style={{marginBottom:16,borderColor:'var(--accent)'}}>
    <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:600}}>{tit}</div>
        <p className="s-meta" style={{marginTop:4,lineHeight:1.5}}>{txt}</p>
      </div>
      {fechavel&&<button className="btn-icon btn-sm" title="Agora não" aria-label="Agora não" onClick={fechar}>×</button>}
    </div>
    <div className="bgroup" style={{marginTop:12}}>
      <button className="btn btn-primary btn-sm" onClick={pronto?instalar:()=>setAberto(v=>!v)}>
        {pronto?'Instalar agora':aberto?'Fechar o passo a passo':'Ver como instalar'}</button>
      {pronto&&<button className="btn btn-ghost btn-sm" onClick={()=>setAberto(v=>!v)}>{aberto?'Fechar':'Passo a passo'}</button>}
    </div>
    {aberto&&<div style={{color:'var(--text2)'}}>{passos}</div>}
  </div>);
}

/* ── Proteção de senha vazada ────────────────────────────────
   Mesma checagem que o Supabase faz internamente, feita aqui no app: só os 5
   primeiros caracteres do SHA-1 saem do aparelho (k-anonymity), então a senha
   em si nunca viaja nem fica registrada em lugar nenhum. Se não houver rede ou
   o serviço não responder, deixa passar — criar conta precisa de internet de
   qualquer jeito, e travar o cadastro por causa disso seria pior. */
async function senhaVazada(senha){
  try{
    if(!(window.crypto&&crypto.subtle))return false;
    const bytes=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(senha));
    const hash=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    const r=await comPrazo(fetch('https://api.pwnedpasswords.com/range/'+hash.slice(0,5)),6000);
    if(!r||!r.ok)return false;
    const lista=await r.text(), fim=hash.slice(5);
    return lista.split('\n').some(l=>l.split(':')[0].trim()===fim);
  }catch(e){return false;}
}

/* ── Abrir o app sem internet ────────────────────────────────
   Sem isto o app trava no spinner (ou pior: cai em "saia e entre
   novamente", e aí o treinador perde o acesso justamente quando está
   sem rede, no meio de uma avaliação). Guardamos o perfil no aparelho e
   sabemos ler a sessão que o Supabase já deixou no localStorage. */
const REF_SUPA=(()=>{try{const m=(CFG.SUPABASE_URL||'').match(/^https?:\/\/([^.]+)\./);return m?m[1]:null;}catch(e){return null;}})();
const sessaoGuardada=()=>{try{
  if(!REF_SUPA)return null;
  let bruto=localStorage.getItem('sb-'+REF_SUPA+'-auth-token');
  if(!bruto)return null;
  if(bruto.startsWith('base64-'))bruto=atob(bruto.slice(7));
  const s=JSON.parse(bruto);
  const ses=(s&&s.currentSession)||s;
  return (ses&&ses.user)?ses:null;
}catch(e){return null;}};
const perfilGuardadoLer=id=>{try{return JSON.parse(localStorage.getItem('mfp_perfil_'+id)||'null');}catch(e){return null;}};
const perfilGuardadoGravar=p=>{try{if(p&&p.id)localStorage.setItem('mfp_perfil_'+p.id,JSON.stringify(p));}catch(e){}};

/* ── Tela de autenticação (treinadores) ── */
function AuthScreen(){
  // convite do treinador: mfperformance.app/?codigo=AB12CD já abre no
  // cadastro de aluno com o código digitado
  const convite=(()=>{try{return (new URLSearchParams(location.search).get('codigo')||'').trim().toUpperCase();}catch(e){return '';}})();
  const [mode,setMode]=useState(convite?'signup':'login');
  const [acct,setAcct]=useState(convite?'aluno':'coach');
  const [name,setName]=useState('');const [email,setEmail]=useState('');const [pass,setPass]=useState('');const [acode,setAcode]=useState(convite);
  // guarda o código mesmo se o aluno já tiver conta e escolher Entrar:
  // o vínculo é feito na primeira abertura do app do aluno
  useEffect(()=>{if(!convite)return;
    try{localStorage.setItem('mfp_aluno_code',convite);}catch(e){}
    // tira o código da barra de endereço: já está guardado, e assim ele não
    // fica no histórico do navegador nem em print de tela compartilhado
    try{history.replaceState(null,'',location.pathname+location.hash);}catch(e){}
  },[]);
  const [busy,setBusy]=useState(false);const [msg,setMsg]=useState(null);
  const isAluno=acct==='aluno';
  async function submit(e){
    e.preventDefault();setMsg(null);
    if(!email||!pass){setMsg({type:'error',text:'Preencha e-mail e senha.'});return;}
    if(mode==='signup'&&!name.trim()){setMsg({type:'error',text:'Informe seu nome.'});return;}
    if(mode==='signup'&&!acode.trim()){setMsg({type:'error',text:isAluno?'Informe o código do seu treinador.':'Informe o código de acesso de treinador.'});return;}
    setBusy(true);
    if(mode==='signup'){
      if(pass.length<8){setMsg({type:'error',text:'Use pelo menos 8 caracteres na senha.'});setBusy(false);return;}
      if(await senhaVazada(pass)){
        setMsg({type:'error',text:'Essa senha já apareceu em vazamentos públicos na internet, então é das primeiras que alguém tentaria. Escolha outra.'});
        setBusy(false);return;
      }
    }
    try{
      if(mode==='login'){
        const {error}=await sb.auth.signInWithPassword({email:email.trim(),password:pass});
        if(error)throw error;
      }else if(isAluno){
        try{localStorage.setItem('mfp_aluno_code',acode.trim().toUpperCase());}catch(e){}
        const {data,error}=await sb.auth.signUp({email:email.trim(),password:pass,
          options:{data:{role:'student',name:name.trim()}}});
        if(error)throw error;
        if(data.user&&!data.session){setMsg({type:'success',text:'Conta criada! Confirme pelo e-mail e faça login. Seus treinos aparecem sozinhos.'});setMode('login');setBusy(false);return;}
      }else{
        const {data:ok}=await sb.rpc('coach_invite_valid',{p_code:acode.trim()});
        if(!ok){setMsg({type:'error',text:'Código de acesso inválido ou esgotado. Fale com o administrador.'});setBusy(false);return;}
        const {data,error}=await sb.auth.signUp({email:email.trim(),password:pass,
          options:{data:{role:'coach',name:name.trim(),coach_signup_code:acode.trim()}}});
        if(error)throw error;
        if(data.user&&!data.session){setMsg({type:'success',text:'Conta criada! Confirme pelo e-mail e faça login.'});setMode('login');setBusy(false);return;}
      }
    }catch(err){
      let t=err.message||'Erro';
      if(/invalid login/i.test(t))t='E-mail ou senha incorretos.';
      if(/already registered/i.test(t))t='Este e-mail já tem conta. Faça login.';
      if(/at least 6/i.test(t))t='A senha precisa ter ao menos 6 caracteres.';
      if(/database error|invalid_coach/i.test(t))t='Código de acesso de treinador inválido.';
      setMsg({type:'error',text:t});
    }
    setBusy(false);
  }
  return(
    <div className="center-screen auth-clean">
      <div className="auth-wrap">
        <div className="auth-card">
          <div style={{display:'flex',justifyContent:'center',marginBottom:6}}><LogoLifter size={96}/></div>
          <p className="auth-tag">Saúde, avaliação, treino e nutrição num app só</p>
          {/* versao visivel ANTES do login: e o jeito de conferir se a atualizacao chegou
              no aparelho sem precisar entrar e abrir o menu lateral */}
          <div style={{textAlign:'center',marginBottom:20,display:'flex',gap:10,justifyContent:'center',alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:11,color:'var(--text3)'}}>versão {APP_VERSION}</span>
            <button className="link" style={{fontSize:11,background:'none',border:'none',padding:0,cursor:'pointer'}}
              onClick={()=>window.MFP_forcarAtualizacao&&window.MFP_forcarAtualizacao()}>atualizar app</button>
          </div>
          <div className="seg">
            <button type="button" className={acct==='coach'?'on':''} onClick={()=>{setAcct('coach');setMsg(null);}}>Sou treinador</button>
            <button type="button" className={acct==='aluno'?'on':''} onClick={()=>{setAcct('aluno');setMsg(null);}}>Sou aluno</button>
          </div>
          <div className="seg">
            <button className={mode==='login'?'on':''} onClick={()=>{setMode('login');setMsg(null);}}>Entrar</button>
            <button className={mode==='signup'?'on':''} onClick={()=>{setMode('signup');setMsg(null);}}>Criar conta</button>
          </div>
          {convite&&!msg&&<div className="alert alert-success">
            Convite recebido. Seu código já está preenchido — crie a conta com seu e-mail e senha
            que os treinos aparecem sozinhos.</div>}
          {msg&&<div className={`alert alert-${msg.type==='error'?'error':msg.type==='success'?'success':'info'}`}>{msg.text}</div>}
          <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:13}}>
            {mode==='signup'&&<>
              <FI label="Nome" value={name} onChange={e=>setName(e.target.value)} placeholder="Seu nome"/>
              <FI label={isAluno?'Código de acesso':'Código de acesso (treinador)'} value={acode} onChange={e=>setAcode(e.target.value.toUpperCase())} placeholder={isAluno?'Código que seu treinador gerou':'Fornecido pelo administrador'} style={{textTransform:'uppercase',letterSpacing:1}}/>
              {isAluno&&!convite&&<div className="alert alert-info" style={{marginTop:-4}}>Peça ao seu treinador o seu <b>código de acesso</b> (ele gera no app dele).</div>}
            </>}
            <FI label="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@exemplo.com" autoComplete="email"/>
            <FI label="Senha" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••" autoComplete={mode==='login'?'current-password':'new-password'}/>
            {mode==='signup'&&<div style={{fontSize:11.5,color:'var(--text3)',marginTop:-6,lineHeight:1.45}}>
              Pelo menos 8 caracteres. O app confere se ela já apareceu em vazamentos conhecidos — sua senha não sai do aparelho nessa conferência.</div>}
            <button className="btn btn-primary btn-block" disabled={busy}>{busy?'Aguarde…':(mode==='login'?'Entrar':'Criar conta')}</button>
          </form>
          <p style={{textAlign:'center',fontSize:12,color:'var(--text3)',marginTop:16}}>
            {mode==='login'?<>É treinador e ainda não tem conta? <span className="link" onClick={()=>{setMode('signup');setMsg(null);}}>Criar agora</span></>
            :<>Já tem conta? <span className="link" onClick={()=>{setMode('login');setMsg(null);}}>Entrar</span></>}
          </p>
        </div>
        <div style={{marginTop:16}}>
          <ConviteInstalar fechavel chave="login"
            titulo="Guarde o app na tela do celular"
            texto="Depois de instalado você abre pelo ícone, sem digitar endereço, e recebe os avisos do treino."/>
        </div>
      </div>
    </div>);
}

/* ── Telas de bloqueio (perfil errado / assinatura) ── */
function BlockScreen({title,children}){
  return(
    <div className="center-screen"><div className="auth-wrap"><div className="auth-card" style={{textAlign:'center'}}>
      <div style={{display:'flex',justifyContent:'center',marginBottom:14}}><LogoLifter size={110}/></div>
      <div style={{fontFamily:'var(--serif)',fontSize:19,fontWeight:600,marginBottom:8}}>{title}</div>
      <div style={{fontSize:13.5,color:'var(--text2)',lineHeight:1.6,marginBottom:18}}>{children}</div>
      <button className="btn btn-ghost btn-block" onClick={()=>sb.auth.signOut()}>Sair</button>
    </div></div></div>);
}

/* ── Painel de Admin (dono) ── */
function AdminScreen({onBack}){
  const [coaches,setCoaches]=useState(null);
  const [invites,setInvites]=useState([]);
  const [code,setCode]=useState('');const [label,setLabel]=useState('');const [days,setDays]=useState('30');const [maxUses,setMaxUses]=useState('1');const [app,setApp]=useState('perf');
  const [busy,setBusy]=useState(false);const [msg,setMsg]=useState(null);
  const reload=async()=>{
    const [c,i]=await Promise.all([sb.rpc('admin_list_coaches'),sb.rpc('admin_list_invites')]);
    setCoaches(c.data||[]);setInvites(i.data||[]);
  };
  useEffect(()=>{reload();},[]);
  const gen=()=>setCode(Array.from({length:6},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join(''));
  const create=async()=>{
    if(!code.trim()){setMsg({t:'error',x:'Defina um código.'});return;}
    setBusy(true);
    const {error}=await sb.rpc('admin_create_invite',{p_code:code.trim(),p_label:label.trim(),p_max:maxUses===''?null:parseInt(maxUses),p_days:days===''?null:parseInt(days),p_app:app});
    setBusy(false);
    if(error){setMsg({t:'error',x:error.message});return;}
    setMsg({t:'success',x:`Código ${code.trim().toUpperCase()} criado (${app==='both'?'ambos':app==='perf'?'Performance':'Nutrition'}).`});setCode('');setLabel('');reload();
  };
  /* Painel de administração: liberar e bloquear acesso de treinador. Aqui a
     gravação calada é a pior de todas — "bloqueei o acesso dele" é o tipo de
     coisa que ninguém confere depois. O reload() em seguida mostrava o estado
     antigo e parecia que a tela só não tinha atualizado. */
  const setApp_=async(c,ap,d)=>{
    await gravarAvisando(sb.rpc('admin_set_app',{p_coach:c.id,p_app:ap,p_days:d}),'O acesso');reload();};
  const blockApp=async(c,ap)=>{if(confirm(`Bloquear ${ap==='perf'?'Performance':'Nutrition'} de ${c.name||c.email}?`)){
    await gravarAvisando(sb.rpc('admin_block_app',{p_coach:c.id,p_app:ap}),'O bloqueio');reload();}};
  const toggleInvite=async(iv)=>{
    await gravarAvisando(sb.rpc('admin_set_invite_active',{p_code:iv.code,p_active:!iv.active}),'O convite');reload();};
  const dleft=d=>d?Math.ceil((new Date(d+'T00:00:00')-new Date(todayStr()+'T00:00:00'))/86400000):null;
  const APPLBL={perf:'Performance',nutri:'Nutrition',both:'Ambos'};
  function AppRow({c,ap}){
    const dl=dleft(c[ap+'_until']);const exp=dl==null||dl<0;
    return(
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginTop:8}}>
        <span style={{fontSize:12,fontWeight:600,width:88}}>{ap==='perf'?' Performance':' Nutrition'}</span>
        <span className={`badge ${exp?'br':dl<=7?'bo':'bg'}`}>{c[ap+'_until']?(exp?'expirado':`${dl}d`):'sem acesso'}</span>
        <button className="btn btn-secondary btn-sm" onClick={()=>setApp_(c,ap,30)}>+30d</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>setApp_(c,ap,365)}>+1 ano</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>setApp_(c,ap,36500)}>Vitalício</button>
        {!exp&&<button className="btn btn-ghost btn-sm" onClick={()=>blockApp(c,ap)}>Bloquear</button>}
      </div>);
  }

  return(
    <div>
      <div className="abar">
        <div><div className="breadcrumb" onClick={onBack}>← Dashboard</div>
          <div className="ph-title">Administração</div>
          <div className="ph-sub">Treinadores e códigos de acesso</div></div>
      </div>

      <div className="card">
        <div className="sec-title" style={{marginBottom:14}}>Gerar código de acesso (venda)</div>
        {msg&&<div className={`alert alert-${msg.t==='error'?'error':msg.t==='warn'?'warn':'success'}`}>{msg.x}</div>}
        <div className="fgrid">
          <div className="fg"><label className="flbl">Código</label>
            <div style={{display:'flex',gap:8}}>
              <input className="fi" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="EX: JOAO2026" style={{textTransform:'uppercase',letterSpacing:1}}/>
              <button className="btn btn-secondary btn-sm" type="button" onClick={gen}>Gerar</button></div></div>
          <FI label="Nome / referência" value={label} onChange={e=>setLabel(e.target.value)} placeholder="Ex: João Personal"/>
          <div className="fg"><label className="flbl">App liberado</label>
            <select className="fi" value={app} onChange={e=>setApp(e.target.value)}>
              <option value="perf"> Performance</option>
              <option value="nutri"> Nutrition</option>
              <option value="both">Ambos</option>
            </select></div>
          <FI label="Dias de acesso" type="number" value={days} onChange={e=>setDays(e.target.value)} placeholder="30"/>
          <FI label="Usos (vazio = ilimitado)" type="number" value={maxUses} onChange={e=>setMaxUses(e.target.value)} placeholder="1"/>
        </div>
        <button className="btn btn-primary" style={{marginTop:14}} disabled={busy} onClick={create}>{busy?'…':'Criar código'}</button>
      </div>

      <div className="card">
        <div className="sec-title" style={{marginBottom:14}}>Códigos</div>
        {invites.length===0?<div className="muted" style={{fontSize:13}}>Nenhum código ainda.</div>:
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {invites.map(iv=>(
              <div key={iv.code} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'10px 12px',background:'var(--bg3)',borderRadius:12,flexWrap:'wrap'}}>
                <div><span style={{fontWeight:700,letterSpacing:1,fontFamily:'monospace'}}>{iv.code}</span>
                  <span className="muted" style={{fontSize:12,marginLeft:8}}>{iv.label||'—'} · {APPLBL[iv.app]||'Ambos'} · {iv.uses}/{iv.max_uses??'∞'} usos · {iv.grant_days??30}d{!iv.active&&' · inativo'}</span></div>
                <button className="btn btn-ghost btn-sm" onClick={()=>toggleInvite(iv)}>{iv.active?'Desativar':'Ativar'}</button>
              </div>))}
          </div>}
      </div>

      <div className="card">
        <div className="sec-title" style={{marginBottom:14}}>Treinadores ({coaches?coaches.length:'…'})</div>
        {coaches===null?<div className="spinner"/>:coaches.length===0?<div className="muted" style={{fontSize:13}}>Nenhum treinador ainda.</div>:
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {coaches.map(c=>(
              <div key={c.id} style={{padding:'12px 13px',background:'var(--bg3)',borderRadius:12}}>
                <div><div style={{fontWeight:600}}>{c.name||'(sem nome)'}</div>
                  <div className="muted" style={{fontSize:12}}>{c.email} · cód. {c.coach_code}</div></div>
                <AppRow c={c} ap="perf"/>
                <AppRow c={c} ap="nutri"/>
              </div>))}
          </div>}
      </div>
    </div>);
}

/* ── Protocolos (referência: passo a passo + normas) ── */
function Proto({title,children,open,search}){
  return(<details open={open} style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:14,padding:'4px 4px',marginBottom:10,boxShadow:'var(--shadow)'}}>
    <summary style={{cursor:'pointer',padding:'14px 16px',fontFamily:'var(--serif)',fontSize:16,fontWeight:600,listStyle:'none'}}>{title}</summary>
    <div style={{padding:'0 18px 16px',fontSize:13.5,lineHeight:1.7,color:'var(--text)'}}>
      {children}
      {search&&<a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(search)}`} target="_blank" rel="noopener noreferrer"
        style={{display:'inline-flex',alignItems:'center',gap:7,marginTop:14,padding:'8px 14px',borderRadius:9,background:'var(--accent)',color:'var(--cream)',fontSize:12.5,fontWeight:600,textDecoration:'none'}}>
        <span style={{fontSize:10}}>▶</span> Ver vídeo-aulas no YouTube ↗</a>}
    </div>
  </details>);
}
function Steps({items}){return <ol style={{margin:'8px 0 8px 18px',display:'flex',flexDirection:'column',gap:6}}>{items.map((s,i)=><li key={i}>{s}</li>)}</ol>;}
function ProtoLabel({children}){return <div style={{fontWeight:700,color:'var(--accent)',fontSize:12,textTransform:'uppercase',letterSpacing:.5,marginTop:12,marginBottom:2}}>{children}</div>;}
function ProtocolsScreen({onBack}){
  const bands=['20','30','40','50','60'];const bandLbl={'20':'20–29','30':'30–39','40':'40–49','50':'50–59','60':'60–69'};
  const cats=['Excelente','Muito bom','Bom','Razoável','Ruim'];
  const rangeText=(mins,i)=>{ // mins=[exc,mb,bom,raz]; i categoria
    if(i===0)return `≥ ${mins[0]}`;
    if(i<4)return `${mins[i]}–${mins[i-1]-1}`;
    return `≤ ${mins[3]-1}`;
  };
  return(
    <div>
      <div className="abar"><div>
        <div className="breadcrumb" onClick={onBack}>← Dashboard</div>
        <div className="ph-title">Protocolos de avaliação</div>
        <div className="ph-sub">Passo a passo, valores de referência (base: ACSM) e vídeo-aulas</div></div>
      </div>
      <div className="alert alert-info" style={{marginBottom:14}}>Cada protocolo tem um botão <b>Ver vídeo-aulas no YouTube</b> que abre uma busca com o termo técnico daquele teste — sempre trazendo conteúdo atualizado de canais de educação física.</div>

      <Proto title="Dobras cutâneas (JP7, JP3, Guedes, Faulkner)" search="protocolo dobras cutâneas Jackson Pollock Guedes Faulkner 3 7 dobras técnica adipômetro">
        <ProtoLabel>Como fazer</ProtoLabel>
        <Steps items={[
          'Marque o ponto de cada dobra do lado direito do corpo.',
          'Pince a dobra com os dedos ~1 cm acima do ponto e aplique o adipômetro perpendicular à dobra.',
          'Leia após ~2 segundos; repita 2–3 vezes e use a média.',
          'Some as dobras do protocolo escolhido para o cálculo do percentual de gordura.'
        ]}/>
        <ProtoLabel>Protocolos disponíveis no app</ProtoLabel>
        <div style={{fontSize:12.5,lineHeight:1.7,color:'var(--text2)'}}>
          <div>• <b>Jackson-Pollock 7 dobras</b> — tórax, axilar média, tríceps, subescapular, abdominal, suprailíaca e coxa (ambos os sexos). Densidade → Siri.</div>
          <div>• <b>Jackson-Pollock 3 dobras</b> — homens: tórax, abdominal, coxa; mulheres: tríceps, suprailíaca, coxa. Densidade → Siri.</div>
          <div>• <b>Guedes 3 dobras</b> — homens: tríceps, suprailíaca, abdominal; mulheres: subescapular, suprailíaca, coxa. Referência brasileira.</div>
          <div>• <b>Faulkner 4 dobras</b> — tríceps, subescapular, suprailíaca, abdominal. Fórmula direta de % de gordura (prática e difundida no Brasil).</div>
          <div style={{marginTop:6,color:'var(--text3)',fontSize:11}}>Escolha o protocolo no topo da seção “Dobras cutâneas”. As dobras marcadas com ★ são as exigidas pelo protocolo/sexo selecionado; o cálculo é automático.</div>
        </div>
      </Proto>

      <Proto title="Perimetria (circunferências)" search="medida de circunferências perimetria avaliação física técnica fita métrica">
        <ProtoLabel>Como fazer</ProtoLabel>
        <Steps items={[
          'Use fita métrica inelástica, sem comprimir o tecido.',
          'Padronize os pontos (cintura na menor curvatura, quadril na maior, braço contraído no ponto médio).',
          'Meça 2 vezes cada ponto e registre a média; mantenha o mesmo avaliador entre reavaliações.'
        ]}/>
      </Proto>

      <Proto title="Bioimpedância" search="bioimpedância avaliação composição corporal orientações jejum hidratação">
        <ProtoLabel>Preparo do avaliado</ProtoLabel>
        <Steps items={[
          'Estar bem hidratado, sem álcool nas 24 h e sem exercício intenso nas horas anteriores.',
          'Bexiga vazia; sem refeição volumosa na hora anterior.',
          'Remover objetos metálicos; pés e mãos limpos para bom contato com os eletrodos.'
        ]}/>
      </Proto>

      <Proto title="Frequência cardíaca e pressão arterial" search="aferição pressão arterial frequência cardíaca de repouso técnica correta">
        <ProtoLabel>Como fazer</ProtoLabel>
        <Steps items={[
          'Avaliado sentado, em repouso de 5 minutos, sem falar.',
          'FC de repouso: pulso radial/carotídeo por 60 s ou frequencímetro.',
          'PA: manguito na altura do coração, braço apoiado; registre sistólica/diastólica.'
        ]}/>
      </Proto>

      <Proto title="Avaliação postural" open search="avaliação postural fotogrametria pontos anatômicos educação física">
        <ProtoLabel>Objetivo</ProtoLabel>Identificar desalinhamentos e assimetrias nos planos anterior, posterior e lateral.
        <ProtoLabel>Como fazer</ProtoLabel>        <Steps items={[
          'Posicione o aluno em pé, descalço, postura natural, contra um fundo neutro (ou simetrógrafo).',
          'Vista anterior: observe cabeça, ombros, cristas ilíacas, joelhos e pés (nivelamento e rotações).',
          'Vista posterior: escápulas, coluna (escoliose), pregas glúteas e tornozelos.',
          'Vista lateral: alinhamento da orelha–ombro–quadril–joelho–tornozelo; cifose torácica e lordose lombar.',
          'Registre cada segmento e anote compensações/encurtamentos observados.'
        ]}/>
      </Proto>

      <Proto title="Flexão de braço (resistência de MMSS)" search="teste de flexão de braço push up test protocolo ACSM">
        <ProtoLabel>Como fazer</ProtoLabel>        <Steps items={[
          'Homens: apoio nas pontas dos pés; mulheres: apoio nos joelhos (flexão modificada), corpo alinhado.',
          'Descer até o cotovelo formar ~90° (queixo próximo ao solo), mantendo o tronco reto.',
          'Subir estendendo completamente os cotovelos — conta 1 repetição.',
          'Executar o máximo de repetições contínuas, sem descanso.',
          'Encerrar quando a técnica falhar por duas repetições seguidas.'
        ]}/>
        <ProtoLabel>Referência — repetições por idade e sexo</ProtoLabel>        <div style={{overflowX:'auto'}}>
          <table className="rpt-tbl" style={{minWidth:520,marginTop:6}}><thead>
            <tr><td style={{fontWeight:700}}>Categoria</td>{bands.map(b=><td key={b} style={{fontWeight:700}}>{bandLbl[b]} H / M</td>)}</tr>
          </thead><tbody>
            {cats.map((cat,i)=><tr key={cat}><td style={{color:'var(--accent)',fontWeight:600}}>{cat}</td>
              {bands.map(b=><td key={b} style={{textAlign:'left'}}>{rangeText(PUSHUP_NORMS.M[b],i)} / {rangeText(PUSHUP_NORMS.F[b],i)}</td>)}</tr>)}
          </tbody></table>
        </div>
        <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>H = homens · M = mulheres. Fonte: ACSM / Canadian Society for Exercise Physiology.</div>
      </Proto>

      <Proto title="Abdominal, agachamento e barra fixa" search="teste abdominal 1 minuto agachamento barra fixa avaliação física">
        <ProtoLabel>Abdominal (1 min)</ProtoLabel>Deitado, joelhos flexionados a ~90°; elevar o tronco e voltar. Contar repetições completas em 60 s.
        <ProtoLabel>Agachamento (1 min)</ProtoLabel>Pés na largura dos ombros; descer até coxas ~paralelas ao solo e subir. Contar repetições válidas em 60 s.
        <ProtoLabel>Barra fixa</ProtoLabel>Pegada pronada, braços estendidos; elevar até o queixo passar da barra e descer com controle. Contar o máximo de repetições sem pausa.
      </Proto>

      <Proto title="Flexibilidade — Banco de Wells &amp; encurtamentos" search="teste sentar e alcançar banco de Wells testes de encurtamento muscular Thomas">
        <ProtoLabel>Banco de Wells (sentar-e-alcançar)</ProtoLabel>        <Steps items={[
          'Aluno sentado, pernas estendidas e pés apoiados na base do banco (descalço).',
          'Braços estendidos, uma mão sobre a outra; inclinar o tronco lentamente à frente.',
          'Empurrar o cursor o mais longe possível e sustentar ~2 s, sem flexionar os joelhos.',
          'Registrar a maior das 3 tentativas, em centímetros.'
        ]}/>
        <ProtoLabel>Testes de encurtamento (registre Normal / Encurtado)</ProtoLabel>        <Steps items={[
          'Isquiotibiais: elevação da perna estendida (ou ângulo poplíteo) — limitação indica encurtamento.',
          'Iliopsoas / reto femoral (Teste de Thomas): deitado, um joelho ao peito; a coxa oposta que se eleva indica encurtamento.',
          'Tríceps sural: dorsiflexão do tornozelo com joelho estendido.',
          'Peitoral: em decúbito, ombro que não encosta na maca indica encurtamento.'
        ]}/>
      </Proto>

      <Proto title="Teste incremental de esteira (VO₂máx / resistência)" search="teste incremental esteira VO2 máximo protocolo velocidade progressiva">
        <ProtoLabel>Protocolo</ProtoLabel>        <Steps items={[
          'Aquecer 5 minutos na velocidade inicial (ex.: 6 km/h).',
          'Nesses 5 min, aumentar 0,5 km/h a cada minuto.',
          'A partir do 5º minuto, aumentar 1 km/h a cada minuto.',
          'Manter até a fadiga voluntária (aluno não sustenta o ritmo).',
          'Registrar a velocidade final atingida e o tempo total.'
        ]}/>
        <ProtoLabel>Estimativa</ProtoLabel>        VO₂máx (mL/kg/min) ≈ velocidade final (km/h) × 3,5. O app calcula e classifica por idade e sexo. Também aceita o teste de Cooper (distância em 12 min) como alternativa.
      </Proto>

      <Proto title="Teste de Cooper (alternativa)" search="teste de Cooper 12 minutos VO2 máximo como aplicar">
        <ProtoLabel>Como fazer</ProtoLabel>        <Steps items={[
          'Aquecer 5 minutos em intensidade leve.',
          'Percorrer a maior distância possível em 12 minutos.',
          'Registrar a distância total em metros.'
        ]}/>
        <ProtoLabel>Cálculo</ProtoLabel>        VO₂máx (mL/kg/min) = (distância em metros − 504,9) ÷ 44,73.
      </Proto>

      <Proto title="Teste de 1‑RM (força máxima)" search="teste de 1RM uma repetição máxima supino agachamento protocolo">
        <ProtoLabel>Como fazer</ProtoLabel>        <Steps items={[
          'Realizar após familiarização com o exercício (supino, agachamento, terra, etc.).',
          'Aquecer com uma série leve de repetições no próprio exercício.',
          'Escolher uma carga inicial em torno de 50–70% da percebida como máxima.',
          'Aumentar progressivamente (5–10%) a cada tentativa bem-sucedida, com 3 a 5 min de descanso.',
          'O 1‑RM é a maior carga levantada uma única vez com técnica correta (idealmente em até 4 tentativas).'
        ]}/>
        <ProtoLabel>Estimativa (sem ir à falha máxima)</ProtoLabel>        No app, informe carga × repetições e o 1‑RM é estimado pela fórmula de Brzycki.
      </Proto>

      <Proto title="Potência, velocidade e agilidade" search="teste salto vertical CMJ sprint 20m teste de agilidade T-test avaliação">
        <ProtoLabel>Salto vertical (CMJ)</ProtoLabel>Com as mãos na cintura, agachar e saltar o mais alto possível; medir a altura alcançada. Potência de pico estimada pela fórmula de Sayers.
        <ProtoLabel>Salto horizontal</ProtoLabel>Pés paralelos, saltar à frente o máximo possível; medir a distância do ponto de saída ao calcanhar mais próximo.
        <ProtoLabel>Impulsão (Sargent / jump-and-reach)</ProtoLabel>Diferença entre o alcance em pé e o alcance no ponto máximo do salto.
        <ProtoLabel>Arremesso de medicine ball</ProtoLabel>Sentado ou em pé, arremessar a bola à frente; medir a distância.
        <ProtoLabel>Sprint 20 m</ProtoLabel>Tempo para percorrer 20 m em velocidade máxima (idealmente com fotocélula).
        <ProtoLabel>Agilidade (T-test)</ProtoLabel>Percurso em "T" com deslocamentos frontal, laterais e ré; registrar o tempo.
      </Proto>

      <Proto title="Referências científicas">
        <div style={{fontSize:12.5,lineHeight:1.7,color:'var(--text2)'}}>
          <div>• ACSM. Diretrizes do ACSM para os Testes de Esforço e sua Prescrição — normas de flexão de braço, VO₂máx e classificações.</div>
          <div>• Canadian Society for Exercise Physiology (CSEP) — normas de flexão e de sentar-e-alcançar.</div>
          <div>• Cooper KH (1968), JAMA — teste de 12 minutos e estimativa de VO₂máx.</div>
          <div>• Brzycki M (1993), JOPERD — estimativa de 1‑RM a partir de repetições.</div>
          <div>• ACSM Metabolic Equations — VO₂ na corrida em esteira (protocolo incremental).</div>
          <div>• Katch &amp; McArdle / Mifflin-St Jeor — taxa metabólica basal.</div>
          <div>• Organização Mundial da Saúde (OMS) — relação cintura/quadril e cintura/estatura e risco cardiometabólico.</div>
          <div style={{marginTop:8,color:'var(--text3)',fontSize:11}}>Algumas tabelas de referência (abdominal, agachamento, barra, Wells) usam valores normativos gerais dessas fontes; se você tiver as tabelas específicas do seu material, é possível ajustá-las.</div>
        </div>
      </Proto>
    </div>);
}

/* ── Meu perfil / marca (white-label) ── */
/* ── Juntar cadastros repetidos do mesmo aluno ──────────────────────
   Quando o aluno já estava na sua ficha e depois criou conta pelo app,
   ficam dois cadastros: um com o histórico, outro com o login. Aqui você
   escolhe qual fica e o resto é movido para ele. */
function DuplicadosScreen({coach,onBack,onMudou}){
  const demo=!!coach._demo;
  const [linhas,setLinhas]=useState(undefined);
  const [principal,setPrincipal]=useState({});
  const [busy,setBusy]=useState(null);
  const [msg,setMsg]=useState(null);

  const carregar=async()=>{
    if(demo){setLinhas([]);return;}
    const {data,error}=await sb.rpc('alunos_duplicados');
    if(error){setMsg({t:'err',m:'Erro ao buscar: '+error.message});setLinhas([]);return;}
    const rows=data||[];
    setLinhas(rows);
    // já sugere quem tem mais histórico como o cadastro que fica
    const escolha={};
    rows.forEach(r=>{
      const peso=r.avaliacoes*10+r.treinos*3+r.divisoes*2+r.avisos;
      const atual=escolha[r.chave];
      if(!atual||peso>atual.peso)escolha[r.chave]={id:r.student_id,peso};
    });
    setPrincipal(Object.fromEntries(Object.entries(escolha).map(([k,v])=>[k,v.id])));
    /* Já marca o que quase certamente é a mesma pessoa: cadastro SEM login.
       Quem tem login próprio fica desmarcado — ele que decida, com o e-mail na
       frente. É o caso do Jefferson: a ficha antiga sem conta, com as duas
       avaliações, do lado da conta que ele usa para treinar. */
    setMarcados(Object.fromEntries(rows.filter(r=>!r.vinculado).map(r=>[r.student_id,true])));
  };
  useEffect(()=>{carregar();},[]);

  /* Quais cadastros do grupo vão ser juntados.
     Antes o botão juntava o GRUPO INTEIRO de uma vez. Como o agrupamento é por
     primeiro nome, isso significava oferecer "juntar em um só" para três Biancas
     que são três pessoas diferentes, com três e-mails diferentes. Um clique
     errado ali apaga o cadastro de uma aluna.
     Agora ele marca um a um, e quem tem login próprio começa DESMARCADO — é o
     sinal mais forte de que são pessoas diferentes. */
  const [marcados,setMarcados]=useState({});   // {student_id: true}
  const marcar=(id,v)=>setMarcados(m=>({...m,[id]:v}));
  const vaiJuntar=(chave,grupo)=>grupo.filter(r=>r.student_id!==principal[chave]&&marcados[r.student_id]);

  const juntar=async(chave,grupo)=>{
    const alvo=principal[chave];
    const outros=vaiJuntar(chave,grupo);
    if(!alvo||!outros.length)return;
    const rAlvo=grupo.find(r=>r.student_id===alvo)||{};
    const nomeAlvo=rAlvo.nome;
    if(!confirm('Juntar '+plural(outros.length,'cadastro')+' em "'+nomeAlvo+'"?\n\n'
      +'Avaliações, treinos, histórico e avisos vão para ele. Os outros cadastros somem.\n'
      +'Isso não tem desfazer.'))return;
    setBusy(chave);setMsg(null);
    try{
      for(const o of outros){
        let {data,error}=await sb.rpc('aluno_fundir',{p_principal:alvo,p_secundario:o.student_id});
        if(error)throw error;
        // dois logins = quase sempre duas pessoas. Pergunta com os e-mails na frente.
        if(data&&data.dois_logins){
          const ok=confirm('Atenção: os dois cadastros têm login próprio.\n\n'
            +'• '+nomeAlvo+' — '+(data.email_principal||'sem e-mail')+'\n'
            +'• '+o.nome+' — '+(data.email_secundario||'sem e-mail')+'\n\n'
            +'Se forem pessoas diferentes, cancele agora. Se juntar, "'+o.nome+'" perde o acesso '
            +'e a dieta dele some da sua lista.\n\nJuntar mesmo assim?');
          if(!ok)continue;
          const r2=await sb.rpc('aluno_fundir',{p_principal:alvo,p_secundario:o.student_id,p_dois_logins_ok:true});
          if(r2.error)throw r2.error;
          data=r2.data;
        }
        if(data&&data.ok===false)throw new Error(data.erro||'não deu');
      }
      setMsg({t:'ok',m:'Pronto — "'+nomeAlvo+'" ficou com tudo.'});
      await carregar();
      if(onMudou)onMudou();
    }catch(e){setMsg({t:'err',m:'Não consegui juntar: '+(e.message||e)});}
    setBusy(null);
  };

  const grupos=(()=>{const g={};(linhas||[]).forEach(r=>{(g[r.chave]=g[r.chave]||[]).push(r);});return Object.entries(g);})();

  return(<div>
    <div className="abar"><div>
      <div className="breadcrumb" onClick={onBack}>← Dashboard</div>
      <div className="ph-title">Cadastros repetidos</div>
      <div className="ph-sub">Junta o mesmo aluno que ficou em dois cadastros</div></div>
    </div>
    {msg&&<div className={`alert ${msg.t==='err'?'alert-danger':'alert-success'}`}>{msg.m}</div>}
    {linhas===undefined?<div className="center-screen"><div className="spinner"/></div>:
     grupos.length===0?<div className="empty">
       <div className="empty-title">Nenhum cadastro repetido</div>
       <p className="s-meta">Está tudo limpo por aqui.</p></div>:
     <>
      <div className="alert alert-info">
        Agrupei por primeiro nome, então <b>a lista mostra xarás também</b> — e xará aqui é
        pessoa de verdade, não cadastro repetido. Confira o e-mail de cada linha: duas alunas
        Bianca com contas diferentes são duas pessoas.
        <br/><br/>
        Já deixei marcado o que quase certamente é a mesma pessoa: <b>cadastro sem login</b>,
        normalmente a ficha antiga que ficou com as avaliações. Quem tem login próprio começa
        desmarcado. Escolha qual <b>fica</b> e marque só quem entra nele.
      </div>
      {grupos.map(([chave,grupo])=>(
        <div className="card" key={chave} style={{marginBottom:14}}>
          <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:600,marginBottom:10}}>
            <span style={{textTransform:'capitalize'}}>{chave}</span>
            <span className="s-meta" style={{fontWeight:400}}> · {grupo.length} cadastros</span>
          </div>
          {grupo.map(r=>{
            const ehPrincipal=principal[chave]===r.student_id;
            const vazio=!r.avaliacoes&&!r.treinos&&!r.divisoes&&!r.avisos;
            return(
              <div key={r.student_id} style={{display:'flex',gap:11,alignItems:'flex-start',padding:'10px 0',
                borderBottom:'1px solid var(--border)'}}>
                {/* o principal fica com tudo; os outros só entram se ele marcar */}
                {ehPrincipal
                  ? <input type="radio" name={'g'+chave} checked readOnly style={{marginTop:4}}/>
                  : <input type="checkbox" checked={!!marcados[r.student_id]} style={{marginTop:4}}
                      onChange={e=>marcar(r.student_id,e.target.checked)}/>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600}}>{r.nome}
                    {ehPrincipal&&<span className="badge" style={{marginLeft:8,background:'var(--accent-dim)',color:'var(--accent)'}}>fica este</span>}
                    {r.vinculado&&<span className="badge" style={{marginLeft:6,background:'var(--green-dim)',color:'var(--green)'}}>tem conta</span>}
                  </div>
                  {/* o e-mail é o que separa duas pessoas de mesmo primeiro nome */}
                  {r.email&&<div style={{fontSize:12.5,color:'var(--text2)',marginTop:2}}>{r.email}</div>}
                  <div className="s-meta">
                    {vazio&&!r.refeicoes?'sem histórico':[
                      r.avaliacoes?r.avaliacoes+(r.avaliacoes>1?' avaliações':' avaliação'):null,
                      r.divisoes?r.divisoes+' treino'+(r.divisoes>1?'s':'')+' na ficha':null,
                      r.treinos?r.treinos+' série'+(r.treinos>1?'s':'')+' no histórico':null,
                      r.refeicoes?r.refeicoes+' refeiç'+(r.refeicoes>1?'ões':'ão')+' no cardápio':null,
                      r.avisos?r.avisos+' aviso'+(r.avisos>1?'s':''):null,
                    ].filter(Boolean).join(' · ')}
                    {' · criado em '+new Date(r.criado+'T00:00:00').toLocaleDateString('pt-BR')}
                  </div>
                  {!ehPrincipal&&r.vinculado&&<div className="s-meta" style={{color:'var(--gold)',marginTop:3,lineHeight:1.45}}>
                    Tem login próprio — quase sempre é outra pessoa. Só marque se conferiu o e-mail.
                  </div>}
                  {!ehPrincipal&&<button className="btn btn-ghost btn-sm" style={{marginTop:6,padding:'2px 8px',fontSize:11.5}}
                    onClick={()=>setPrincipal(p=>({...p,[chave]:r.student_id}))}>Este é que fica</button>}
                </div>
              </div>);
          })}
          {(()=>{const alvo=grupo.find(r=>r.student_id===principal[chave]);
            const n=vaiJuntar(chave,grupo).length;
            return(<button className="btn btn-primary btn-sm" style={{marginTop:12}}
              disabled={busy===chave||!n} onClick={()=>juntar(chave,grupo)}>
              {busy===chave?'Juntando…':!n?'Marque quem entra em cima'
                :'Juntar '+plural(n,'cadastro')+' em “'+((alvo&&alvo.nome)||'')+'”'}
            </button>);})()}
        </div>))}
     </>}
  </div>);
}

function BrandScreen({profile,setProfile,onBack}){
  const stored=(()=>{try{return JSON.parse(localStorage.getItem('mfp_brand_'+profile.id)||'{}');}catch{return{};}})();
  const [f,setF]=useState({brand_name:profile.brand_name||stored.brand_name||'',name:profile.name||stored.name||'',cref:profile.cref||stored.cref||'',phone:profile.phone||stored.phone||'',instagram:profile.instagram||stored.instagram||'',logo_url:profile.logo_url||stored.logo_url||''});
  const [busy,setBusy]=useState(false);const [msg,setMsg]=useState(null);
  const [avisoOn,setAvisoOn]=useState(false);
  const [avisoBusy,setAvisoBusy]=useState(false);
  const [avisoMsg,setAvisoMsg]=useState(null);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const ref=useRef();

  // já está inscrito neste aparelho?
  useEffect(()=>{if(profile._demo||!sb)return;(async()=>{
    try{
      if(!pushSuportado()||Notification.permission!=='granted')return;
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.getSubscription();
      if(!sub)return;
      const {data}=await sb.from('train_push').select('endpoint')
        .eq('endpoint',sub.toJSON().endpoint).eq('papel','treinador').maybeSingle();
      setAvisoOn(!!data);
    }catch(e){}
  })();},[]);

  const alternarAviso=async()=>{
    if(profile._demo){setAvisoOn(v=>!v);return;}
    setAvisoBusy(true);setAvisoMsg(null);
    if(avisoOn){const r=await desativarPush();setAvisoOn(false);if(!r.ok&&r.msg)setMsg({t:'warn',x:r.msg});}
    else{const r=await ativarPushTreinador();if(r.ok)setAvisoOn(true);else setAvisoMsg(r.msg);}
    setAvisoBusy(false);
  };
  const pickLogo=file=>{if(!file)return;const r=new FileReader();
    r.onload=e=>{const src=e.target.result;const img=new Image();
      img.onload=()=>{try{
        const c=document.createElement('canvas');const m=512;let w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
        if(!w||!h){s('logo_url',src);return;}
        const sc=Math.min(m/w,m/h,1);c.width=Math.max(1,Math.round(w*sc));c.height=Math.max(1,Math.round(h*sc));
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        let out;try{out=c.toDataURL('image/png');}catch{out=c.toDataURL('image/jpeg',0.85);}
        s('logo_url',out.length>1500000?c.toDataURL('image/jpeg',0.8):out);
      }catch{s('logo_url',src);}};
      img.onerror=()=>s('logo_url',src);
      img.src=src;};
    r.onerror=()=>alert('Não foi possível ler a imagem. Tente outra.');
    r.readAsDataURL(file);};
  const save=async()=>{
    setBusy(true);
    const upd={brand_name:f.brand_name||null,name:f.name||null,cref:f.cref||null,phone:f.phone||null,instagram:f.instagram||null,logo_url:f.logo_url||null};
    try{localStorage.setItem('mfp_brand_'+profile.id,JSON.stringify(upd));}catch(e){}
    /* A gravação no servidor era calada, e a mensagem dizia "salva neste
       dispositivo" — o que é verdade e engana ao mesmo tempo: a marca é o que
       vai no cabeçalho e na assinatura do relatório, e precisa acompanhar o
       treinador para outro aparelho. Agora a mensagem diz onde ela ficou. */
    let noServidor=false;
    if(sb&&!profile._demo){
      try{await gravar(sb.from('profiles').update(upd).eq('id',profile.id));noServidor=true;}
      catch(e){noServidor=false;}
    }else noServidor=true;
    setProfile({...profile,...upd});
    setBusy(false);
    setMsg(noServidor
      ?{t:'success',x:'Marca salva. Já aparece nos seus relatórios.'}
      :{t:'warn',x:'Marca salva só neste aparelho — não consegui gravar no servidor. '
        +'Em outro aparelho ela não vai aparecer; abra com internet e salve de novo.'});
  };
  return(
    <div>
      <div className="abar"><div>
        <div className="breadcrumb" onClick={onBack}>← Dashboard</div>
        <div className="ph-title">Meu perfil / marca</div>
        <div className="ph-sub">Aparece no cabeçalho e na assinatura dos seus relatórios</div></div>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy?'…':' Salvar'}</button>
      </div>
      {msg&&<div className={`alert alert-${msg.t==='error'?'error':msg.t==='warn'?'warn':'success'}`}>{msg.x}</div>}

      <div className="card" style={{marginBottom:16}}>
        <h4 style={{margin:'0 0 4px'}}>Aviso no celular</h4>
        <p className="s-meta" style={{marginBottom:12}}>
          Receba uma notificação na tela do celular assim que um aluno terminar o treino,
          com a divisão, o número de séries, o volume e os recordes.
        </p>
        {avisoMsg&&<div className="alert alert-warn" style={{marginBottom:12}}>{avisoMsg}</div>}
        <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <button className={'btn '+(avisoOn?'btn-secondary':'btn-primary')} disabled={avisoBusy} onClick={alternarAviso}>
            {avisoBusy?'…':avisoOn?'Desligar avisos neste aparelho':'Ativar avisos neste aparelho'}
          </button>
          <span style={{fontSize:12.5,color:avisoOn?'var(--green)':'var(--text3)',fontWeight:600}}>
            {avisoOn?'Ligado neste aparelho':'Desligado'}
          </span>
        </div>
        <div style={{fontSize:11.5,color:'var(--text3)',marginTop:10,lineHeight:1.5}}>
          Vale por aparelho — ative em cada celular que você usa.
          No iPhone, adicione o app à Tela de Início (Compartilhar → Adicionar à Tela de Início) e ative por lá.
        </div>
      </div>

      <div className="card">
        <div style={{display:'flex',gap:20,alignItems:'flex-start',flexWrap:'wrap',marginBottom:16}}>
          <div className="fg"><label className="flbl">Logo (aparece no relatório)</label>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <div className="photo-up" style={{width:96,height:96}} onClick={()=>ref.current.click()}>
                {f.logo_url?<img src={f.logo_url} alt="" style={{objectFit:'contain'}}/>:<div className="photo-ph"><span className="photo-ph-icon">Logo</span>Logo</div>}</div>
              {f.logo_url&&<button className="btn btn-ghost btn-sm" onClick={()=>s('logo_url','')}>Remover</button>}
              <input ref={ref} type="file" accept="image/*" style={{display:'none'}} onChange={e=>pickLogo(e.target.files[0])}/>
            </div>
            <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Sem logo, usa o emblema padrão.</div>
          </div>
          <div style={{flex:1,minWidth:220}}>
            <FI label="Nome da marca / estúdio" value={f.brand_name} onChange={e=>s('brand_name',e.target.value)} placeholder="Ex: João Personal Training"/>
            <div style={{marginTop:12}}><FI label="Seu nome (avaliador)" value={f.name} onChange={e=>s('name',e.target.value)} placeholder="Nome que assina o laudo"/></div>
          </div>
        </div>
        <div className="fgrid">
          <FI label="CREF" value={f.cref} onChange={e=>s('cref',e.target.value)} placeholder="000000-G/UF"/>
          <FI label="Telefone / WhatsApp" value={f.phone} onChange={e=>s('phone',e.target.value)} placeholder="(00) 00000-0000"/>
          <FI label="Instagram" value={f.instagram} onChange={e=>s('instagram',e.target.value)} placeholder="@seu_perfil"/>
        </div>
        <div className="alert alert-info" style={{marginTop:16}}>Prévia da assinatura: <strong>{f.name||f.brand_name||'Avaliador'}</strong>{f.cref?` · CREF ${f.cref}`:''}</div>
      </div>
    </div>);
}

/* ── Agenda / agendamento de avaliações ── */
function fmtSlot(iso){try{const d=new Date(iso);return d.toLocaleString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return iso;}}
function slotDayKey(iso){try{const d=new Date(iso);return d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});}catch{return '';}}
function slotTime(iso){try{return new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}catch{return '';}}

function AgendaScreen({coach,students,preStudent,onBack}){
  const demo=!!coach._demo;
  const [slots,setSlots]=useState(demo?[]:null);
  const [date,setDate]=useState('');
  const [times,setTimes]=useState('08:00, 09:00, 10:00');
  const [dur,setDur]=useState(60);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState(null);
  const [linkStu,setLinkStu]=useState(preStudent?preStudent.id:'');
  const [linkKind,setLinkKind]=useState('agendar');

  const load=async()=>{if(demo){return;}
    const {data,error}=await sb.from('assess_slots').select('*').eq('coach_id',coach.id).order('starts_at');
    if(error){setMsg({t:'err',m:'Erro ao carregar agenda: '+error.message});setSlots([]);return;}
    setSlots(data||[]);};
  useEffect(()=>{load();},[]);

  const addSlots=async()=>{
    if(!date){setMsg({t:'err',m:'Escolha uma data.'});return;}
    const tl=times.split(',').map(t=>t.trim()).filter(Boolean);
    if(!tl.length){setMsg({t:'err',m:'Informe ao menos um horário.'});return;}
    const rows=tl.map(t=>{const iso=new Date(`${date}T${t}:00`).toISOString();return{coach_id:coach.id,starts_at:iso,duration_min:+dur,status:'open'};});
    if(demo){setSlots(p=>[...p,...rows.map((r,i)=>({...r,id:'d'+Date.now()+i}))].sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)));setMsg({t:'ok',m:'Horários adicionados (demo, não salvos).'});return;}
    setBusy(true);const {error}=await sb.from('assess_slots').insert(rows);setBusy(false);
    if(error){setMsg({t:'err',m:'Erro ao salvar: '+error.message});return;}
    setMsg({t:'ok',m:rows.length===1?'1 horário adicionado.':`${rows.length} horários adicionados.`});load();
  };
  const delSlot=async(id)=>{
    if(demo){setSlots(p=>p.filter(s=>s.id!==id));return;}
    const {error}=await sb.from('assess_slots').delete().eq('id',id);
    if(error){setMsg({t:'err',m:'Erro ao remover: '+error.message});return;}
    setSlots(p=>p.filter(s=>s.id!==id));
  };

  const base=location.origin+location.pathname;
  const stu=students.find(s=>s.id===linkStu);
  const link=base+'?'+(linkKind==='ficha'?'ficha':'agendar')+'='+coach.id+(linkStu?'&aluno='+linkStu:'');
  const openCount=(slots||[]).filter(s=>s.status==='open'&&new Date(s.starts_at)>=new Date()).length;
  const copyLink=()=>{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(link).then(()=>setMsg({t:'ok',m:'Link copiado.'})).catch(()=>setMsg({t:'ok',m:'Copie o link abaixo:'}));
    }else setMsg({t:'ok',m:'Copie o link abaixo:'});
  };
  const waLink=()=>{
    const phone=(stu?.phone||'').replace(/\D/g,'');
    const msgTxt=linkKind==='ficha'
      ?`Olá${stu?', '+stu.name.split(' ')[0]:''}! Preencha sua ficha de avaliação online por aqui:\n${link}`
      :`Olá${stu?', '+stu.name.split(' ')[0]:''}! Segue o link para você escolher o horário da sua avaliação física:\n${link}`;
    window.open(phone?`https://wa.me/55${phone}?text=${encodeURIComponent(msgTxt)}`:`https://wa.me/?text=${encodeURIComponent(msgTxt)}`,'_blank');
  };

  const grouped=(()=>{const g={};(slots||[]).forEach(s=>{const k=slotDayKey(s.starts_at);(g[k]=g[k]||[]).push(s);});return Object.entries(g);})();

  return(
    <div>
      <div className="abar">
        <div><div className="breadcrumb" onClick={onBack}>← Painel</div>
          <div className="ph-title">Agenda de avaliações</div>
          <div className="ph-sub">{openCount} horário{openCount!==1?'s':''} disponível{openCount!==1?'is':''}</div></div>
      </div>

      {msg&&<div className={`alert ${msg.t==='err'?'alert-danger':'alert-success'}`} style={{marginBottom:14}}>{msg.m}</div>}
      {demo&&<div className="alert alert-warn" style={{marginBottom:14}}>Modo demonstração: os horários não são salvos.</div>}

      <div className="dash-panel" style={{marginBottom:16}}>
        <h4>Enviar link para o aluno</h4>
        <div className="chips" style={{marginBottom:10}}>
          <button type="button" className={`chip ${linkKind==='agendar'?'active':''}`} onClick={()=>setLinkKind('agendar')}>Agendamento</button>
          <button type="button" className={`chip ${linkKind==='ficha'?'active':''}`} onClick={()=>setLinkKind('ficha')}>Ficha remota (online)</button>
        </div>
        <p className="s-meta" style={{marginBottom:10}}>{linkKind==='ficha'?'O aluno preenche a ficha (medidas, fotos, PAR-Q, rotina) e você recebe em Fichas online para importar como avaliação.':'O aluno abre o link, vê seus horários livres e confirma um. Você recebe o horário marcado aqui na agenda.'}</p>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:10}}>
          <select className="fi" aria-label="Para qual aluno é o link" style={{width:'auto',minWidth:200}} value={linkStu} onChange={e=>setLinkStu(e.target.value)}>
            <option value="">Link geral (qualquer aluno)</option>
            {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={copyLink}>Copiar link</button>
          <button className="btn btn-primary" onClick={waLink}>Enviar por WhatsApp</button>
        </div>
        <div style={{fontSize:11.5,color:'var(--text3)',wordBreak:'break-all',background:'var(--bg3)',padding:'8px 10px',borderRadius:8}}>{link}</div>
      </div>

      <div className="dash-panel" style={{marginBottom:16}}>
        <h4>Adicionar horários livres</h4>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
          <label className="fg" style={{margin:0}}><span className="flbl">Data</span>
            <input className="fi" type="date" value={date} min={todayStr()} onChange={e=>setDate(e.target.value)}/></label>
          <label className="fg" style={{margin:0,flex:1,minWidth:160}}><span className="flbl">Horários (separados por vírgula)</span>
            <input className="fi" value={times} onChange={e=>setTimes(e.target.value)} placeholder="08:00, 09:00, 10:00"/></label>
          <label className="fg" style={{margin:0}}><span className="flbl">Duração</span>
            <select className="fi" value={dur} onChange={e=>setDur(e.target.value)} style={{width:110}}>
              <option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option><option value={90}>90 min</option></select></label>
          <button className="btn btn-primary" disabled={busy} onClick={addSlots}>Adicionar</button>
        </div>
      </div>

      {slots===null?<div className="center-screen"><div className="spinner"/></div>:
       slots.length===0?<div className="empty"><div className="empty-title">Nenhum horário na agenda</div>
         <p className="s-meta">Adicione horários livres acima para o aluno poder agendar.</p></div>:
       grouped.map(([day,ss])=>(
        <div key={day} style={{marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:'var(--text2)',marginBottom:8}}>{maiusculaInicial(day)}</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:9}}>
            {ss.map(s=>(
              <div key={s.id} style={{border:'1px solid var(--border2)',borderRadius:10,padding:'9px 12px',background:s.status==='booked'?'var(--bg3)':'var(--bg2)',minWidth:150}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                  <span style={{fontWeight:700,fontSize:14}}>{slotTime(s.starts_at)}</span>
                  <button className="btn-icon btn-sm" title="Remover" onClick={()=>delSlot(s.id)}>×</button>
                </div>
                <div style={{fontSize:11,color:'var(--text3)'}}>{s.duration_min} min</div>
                {s.status==='booked'?<span className="badge bg" style={{marginTop:5,display:'inline-block'}}>{s.student_name||'Agendado'}</span>
                  :<span className="badge bb" style={{marginTop:5,display:'inline-block'}}>Livre</span>}
              </div>))}
          </div>
        </div>))}
    </div>);
}

/* ── Dissuasão de captura de tela nas páginas do aluno ──
   Observação honesta: não existe bloqueio 100% de screenshot em navegador
   (o SO faz a captura fora do controle da página). Isto reduce o casual:
   bloqueia menu/seleção/arrastar, impressão e Ctrl+P/S/C, borra ao trocar
   de app/aba e ao apertar PrintScreen (limpando a área de transferência). */
function useAntiCapture(active=true){
  useEffect(()=>{
    if(!active)return;
    const b=document.body;b.classList.add('nc-on');
    const noMenu=e=>e.preventDefault();
    const flash=()=>{b.classList.add('nc-flash');setTimeout(()=>b.classList.remove('nc-flash'),1300);};
    const keyGuard=e=>{
      const k=(e.key||'');
      if(k==='PrintScreen'){try{navigator.clipboard&&navigator.clipboard.writeText&&navigator.clipboard.writeText(' ');}catch(_){}flash();e.preventDefault();return;}
      if((e.ctrlKey||e.metaKey)&&['p','s','c','u'].includes(k.toLowerCase())){e.preventDefault();}
    };
    const vis=()=>b.classList.toggle('nc-hidden',document.hidden);
    const blur=()=>b.classList.add('nc-hidden');
    const focus=()=>b.classList.remove('nc-hidden');
    document.addEventListener('contextmenu',noMenu);
    document.addEventListener('keydown',keyGuard,true);
    document.addEventListener('visibilitychange',vis);
    window.addEventListener('blur',blur);window.addEventListener('focus',focus);
    return()=>{
      document.removeEventListener('contextmenu',noMenu);
      document.removeEventListener('keydown',keyGuard,true);
      document.removeEventListener('visibilitychange',vis);
      window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);
      b.classList.remove('nc-on','nc-hidden','nc-flash');
    };
  },[active]);
}

/* ── Página pública de agendamento (aluno) ── */
function BookingPage({coachId,studentId}){
  useAntiCapture(true);
  const [data,setData]=useState(undefined);
  const [name,setName]=useState('');
  const [picked,setPicked]=useState(null);
  const [done,setDone]=useState(null);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState(null);

  useEffect(()=>{(async()=>{
    if(!sb){setData(null);return;}
    const {data:d,error}=await sb.rpc('assess_open_slots',{p_coach:coachId,p_student:studentId||null});
    if(error){setErr(error.message);setData(null);return;}
    setData(d||{});if(d&&d.student_name)setName(d.student_name);
  })();},[]);

  const confirm=async()=>{
    if(!picked)return;if(!name.trim()){setErr('Informe seu nome.');return;}
    setBusy(true);setErr(null);
    const {data:r,error}=await sb.rpc('assess_book_slot',{p_slot:picked,p_name:name.trim(),p_student:studentId||null});
    setBusy(false);
    if(error){setErr(error.message);return;}
    if(r&&r.ok===false){setErr(r.message||'Este horário não está mais disponível.');
      const {data:d}=await sb.rpc('assess_open_slots',{p_coach:coachId,p_student:studentId||null});setData(d||{});setPicked(null);return;}
    setDone(r);
  };

  const brand=(data&&data.brand)||'MF Performance';
  return(
    <div className="center-screen nc-guard" style={{padding:'24px 14px',alignItems:'flex-start'}}>
      <div className="auth-card" style={{maxWidth:460,width:'100%'}}>
        <div style={{display:'flex',justifyContent:'center',marginBottom:12}}><LogoLifter size={92}/></div>
        <div style={{textAlign:'center',marginBottom:6}}><div style={{fontFamily:'var(--serif)',fontSize:20,fontWeight:600}}>{brand}</div>
          <div className="s-meta">Agendamento de Avaliação Física</div></div>

        {data===undefined&&<div className="center-screen" style={{minHeight:120}}><div className="spinner"/></div>}
        {data===null&&<div className="alert alert-danger" style={{marginTop:14}}>Não foi possível carregar os horários.{err?' ('+err+')':''}</div>}

        {done?<div style={{textAlign:'center',marginTop:16}}>
            <div className="badge bg" style={{fontSize:14,padding:'8px 16px'}}>Agendamento confirmado</div>
            <p style={{marginTop:14,fontSize:15,lineHeight:1.6}}>Sua avaliação foi marcada para<br/><strong style={{fontSize:17}}>{fmtSlot(done.starts_at)}</strong></p>
            <p className="s-meta" style={{marginTop:8}}>Guarde esta data. Em caso de imprevisto, avise seu treinador.</p>
          </div>
         :data&&<>
          <div className="fg" style={{marginTop:16}}><label className="flbl">Seu nome</label>
            <input className="fi" value={name} onChange={e=>setName(e.target.value)} placeholder="Nome completo"/></div>
          <div className="flbl" style={{marginBottom:8}}>Escolha um horário disponível</div>
          {(!data.slots||data.slots.length===0)?<div className="alert alert-warn">Nenhum horário disponível no momento. Fale com seu treinador.</div>:
            <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:320,overflowY:'auto'}}>
              {data.slots.map(s=>(
                <button key={s.id} type="button" onClick={()=>setPicked(s.id)}
                  style={{textAlign:'left',border:'1.5px solid '+(picked===s.id?'var(--accent)':'var(--border2)'),background:picked===s.id?'var(--bg3)':'var(--bg2)',borderRadius:10,padding:'11px 13px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontWeight:600}}>{maiusculaInicial(fmtSlot(s.starts_at))}</span>
                  <span className="s-meta">{s.duration_min} min</span>
                </button>))}
            </div>}
          {err&&<div className="alert alert-danger" style={{marginTop:12}}>{err}</div>}
          <button className="btn btn-primary" style={{width:'100%',marginTop:16}} disabled={busy||!picked} onClick={confirm}>{busy?'Confirmando…':'Confirmar agendamento'}</button>
        </>}
      </div>
    </div>);
}

/* ── Uploader de foto compacto (ficha remota) ── */
function IntakePhoto({label,value,onChange}){
  const ref=useRef();
  const pick=file=>{if(!file)return;const r=new FileReader();r.onload=e=>{const img=new Image();
    img.onload=()=>{const c=document.createElement('canvas');const m=900;let w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
      const sc=Math.min(m/w,m/h,1);c.width=Math.round(w*sc);c.height=Math.round(h*sc);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);onChange(c.toDataURL('image/jpeg',0.7));};
    img.src=e.target.result;};r.readAsDataURL(file);};
  return(
    <div className="fg" style={{margin:0}}><label className="flbl">{label}</label>
      {value?<div style={{position:'relative',maxWidth:150}}>
        <img src={value} alt="" style={{width:'100%',borderRadius:10,border:'1px solid var(--border2)'}}/>
        <button type="button" className="btn-icon btn-sm" style={{position:'absolute',top:4,right:4,background:'var(--bg2)'}} onClick={()=>onChange('')}>×</button>
      </div>:
      <div className="photo-up" style={{width:150,height:120}} onClick={()=>ref.current.click()}>
        <div className="photo-ph"><span className="photo-ph-icon">Foto</span>toque</div></div>}
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>pick(e.target.files[0])}/>
    </div>);
}

/* ── Página pública: ficha de avaliação remota (aluno preenche) ── */
function RemoteIntakePage({coachId,studentId}){
  const [info,setInfo]=useState(undefined);
  const [f,setF]=useState({gender:'M'});
  const [photos,setPhotos]=useState({front:'',side:'',back:''});
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [err,setErr]=useState(null);
  const u=(k,v)=>setF(p=>({...p,[k]:v}));

  useEffect(()=>{(async()=>{
    if(!sb){setInfo(null);return;}
    const {data,error}=await sb.rpc('assess_intake_info',{p_coach:coachId,p_student:studentId||null});
    if(error){setErr(error.message);setInfo(null);return;}
    setInfo(data||{});if(data&&data.student_name)u('name',data.student_name);
  })();},[]);

  const NI=(label,key,unit,ph)=>(
    <div className="fg"><label className="flbl">{label}{unit&&<span style={{color:'var(--text3)',marginLeft:3}}>({unit})</span>}</label>
      <input className="fi" type="number" inputMode="decimal" step="0.1" value={f[key]||''} onChange={e=>u(key,e.target.value)} placeholder={ph||''}/></div>);

  const submit=async()=>{
    if(!(f.name||'').trim()){setErr('Informe seu nome.');window.scrollTo(0,0);return;}
    setBusy(true);setErr(null);
    const evalKeys=['weight','height','resting_hr','bp_sys','bp_dia','circ_shoulders','circ_chest','circ_waist','circ_abdomen','circ_hip','circ_arm_r','circ_arm_l','circ_thigh_r','circ_thigh_l','circ_calf_r','circ_calf_l','eva','fatigue','stress'];
    const evalData={};evalKeys.forEach(k=>{if(f[k]!=null&&f[k]!=='')evalData[k]=f[k];});
    for(let i=1;i<=PARQ_QUESTIONS.length;i++)if(f['parq_'+i])evalData['parq_'+i]=f['parq_'+i];
    const student={gender:f.gender||'M',dob:f.dob||'',goal:f.goal||'',activity:f.activity||'',schedule:f.schedule||'',health:f.health||'',meds:f.meds||'',injuries:f.injuries||'',sleep:f.sleep||''};
    const payload={name:f.name.trim(),student,eval:evalData,photos};
    const {data:r,error}=await sb.rpc('assess_submit_intake',{p_coach:coachId,p_name:f.name.trim(),p_data:payload,p_student:studentId||null});
    setBusy(false);
    if(error){setErr(error.message);return;}
    if(r&&r.ok===false){setErr(r.message||'Não foi possível enviar.');return;}
    setDone(true);window.scrollTo(0,0);
  };

  const brand=(info&&info.brand)||'MF Performance';
  const PARQ_YN=i=>(
    <div className="fg"><label className="flbl" style={{fontWeight:500,lineHeight:1.4}}>{i+1}. {PARQ_QUESTIONS[i]}</label>
      <select className="fi" style={{maxWidth:140}} value={f['parq_'+(i+1)]||''} onChange={e=>u('parq_'+(i+1),e.target.value)}>
        <option value="">—</option><option value="Não">Não</option><option value="Sim">Sim</option></select></div>);

  if(done)return(
    <div className="center-screen" style={{padding:'24px 14px'}}><div className="auth-card" style={{maxWidth:460,textAlign:'center'}}>
      <div style={{display:'flex',justifyContent:'center',marginBottom:12}}><LogoLifter size={92}/></div>
      <div className="badge bg" style={{fontSize:14,padding:'8px 16px'}}>Ficha enviada</div>
      <p style={{marginTop:14,fontSize:15,lineHeight:1.6}}>Recebemos suas informações. Seu treinador vai analisar e montar sua avaliação.</p>
    </div></div>);

  return(
    <div style={{maxWidth:640,margin:'0 auto',padding:'22px 14px'}}>
      <div style={{textAlign:'center',marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'center',marginBottom:8}}><LogoLifter size={88}/></div>
        <div style={{fontFamily:'var(--serif)',fontSize:21,fontWeight:600}}>{brand}</div>
        <div className="s-meta">Ficha de Avaliação — Consultoria Online</div>
      </div>
      {info===undefined&&<div className="center-screen" style={{minHeight:120}}><div className="spinner"/></div>}
      {info===null&&<div className="alert alert-danger">Não foi possível abrir a ficha.{err?' ('+err+')':''}</div>}
      {info&&<>
        {err&&<div className="alert alert-danger">{err}</div>}
        <div className="sec"><div className="sec-title">Identificação</div>
          <div className="fgrid2">
            <div className="fg"><label className="flbl">Nome completo</label><input className="fi" value={f.name||''} onChange={e=>u('name',e.target.value)}/></div>
            <div className="fg"><label className="flbl">Sexo</label>
              <select className="fi" value={f.gender} onChange={e=>u('gender',e.target.value)}><option value="M">Masculino</option><option value="F">Feminino</option></select></div>
            <div className="fg"><label className="flbl">Data de nascimento</label><input className="fi" type="date" value={f.dob||''} onChange={e=>u('dob',e.target.value)}/></div>
            <div className="fg"><label className="flbl">Objetivo principal</label><input className="fi" value={f.goal||''} onChange={e=>u('goal',e.target.value)} placeholder="Ex.: emagrecimento, hipertrofia"/></div>
          </div>
        </div>
        <div className="sec"><div className="sec-title">Medidas (você mesmo mede)</div>
          <div className="alert alert-info">Peso em jejum, sem calçado. Circunferências com fita justa (sem apertar), relaxado. Cintura na menor curvatura; quadril na parte mais larga; braço relaxado.</div>
          <div className="fgrid2">{NI('Peso','weight','kg')}{NI('Altura','height','cm')}
            {NI('Cintura','circ_waist','cm')}{NI('Quadril','circ_hip','cm')}{NI('Abdômen','circ_abdomen','cm')}
            {NI('Tórax','circ_chest','cm')}{NI('Braço direito','circ_arm_r','cm')}{NI('Braço esquerdo','circ_arm_l','cm')}
            {NI('Coxa direita','circ_thigh_r','cm')}{NI('Coxa esquerda','circ_thigh_l','cm')}</div>
        </div>
        <div className="sec"><div className="sec-title">Prontidão para atividade física (PAR-Q+)</div>
          {PARQ_QUESTIONS.map((_,i)=><React.Fragment key={i}>{PARQ_YN(i)}</React.Fragment>)}
        </div>
        <div className="sec"><div className="sec-title">Saúde &amp; rotina</div>
          <div className="fgrid2">
            <div className="fg"><label className="flbl">Nível de atividade</label>
              <select className="fi" value={f.activity||''} onChange={e=>u('activity',e.target.value)}>
                <option value="">—</option><option>Sedentário</option><option>Levemente ativo</option><option>Moderadamente ativo</option><option>Muito ativo</option><option>Extremamente ativo</option></select></div>
            <div className="fg"><label className="flbl">Frequência semanal de treino</label><input className="fi" value={f.schedule||''} onChange={e=>u('schedule',e.target.value)} placeholder="Ex.: 3x por semana"/></div>
            {NI('Dor atual (0–10)','eva','')}{NI('Fadiga (0–10)','fatigue','')}{NI('Estresse (0–10)','stress','')}
            <div className="fg"><label className="flbl">Qualidade do sono</label><input className="fi" value={f.sleep||''} onChange={e=>u('sleep',e.target.value)} placeholder="Ex.: 7h, boa"/></div>
          </div>
          <div className="fg"><label className="flbl">Problemas de saúde / condições</label><textarea className="fi" rows="2" value={f.health||''} onChange={e=>u('health',e.target.value)}/></div>
          <div className="fg"><label className="flbl">Medicamentos em uso</label><textarea className="fi" rows="2" value={f.meds||''} onChange={e=>u('meds',e.target.value)}/></div>
          <div className="fg"><label className="flbl">Lesões / dores</label><textarea className="fi" rows="2" value={f.injuries||''} onChange={e=>u('injuries',e.target.value)}/></div>
        </div>
        <div className="sec"><div className="sec-title">Fotos (opcional)</div>
          <div className="alert alert-info">Fotos de corpo inteiro, roupa justa, fundo neutro. Ajudam na análise postural e de evolução.</div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            <IntakePhoto label="Frente" value={photos.front} onChange={v=>setPhotos(p=>({...p,front:v}))}/>
            <IntakePhoto label="Lado" value={photos.side} onChange={v=>setPhotos(p=>({...p,side:v}))}/>
            <IntakePhoto label="Costas" value={photos.back} onChange={v=>setPhotos(p=>({...p,back:v}))}/>
          </div>
        </div>
        <button className="btn btn-primary" style={{width:'100%',marginTop:8}} disabled={busy} onClick={submit}>{busy?'Enviando…':'Enviar ficha'}</button>
        <p className="s-meta" style={{textAlign:'center',marginTop:10}}>Seus dados vão direto para o seu treinador.</p>
      </>}
    </div>);
}

/* ── Caixa de entrada: fichas remotas recebidas (treinador) ── */
function IntakeInbox({coach,students,onImport,onBack}){
  const demo=!!coach._demo;
  const [items,setItems]=useState(demo?[]:null);
  const [sel,setSel]=useState(null);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState(null);
  const load=async()=>{if(demo){setItems([]);return;}
    const {data,error}=await sb.from('assess_intakes').select('*').eq('coach_id',coach.id).eq('status','pending').order('created_at',{ascending:false});
    if(error){setMsg({t:'err',m:'Erro ao carregar: '+error.message});setItems([]);return;}
    setItems(data||[]);};
  useEffect(()=>{load();},[]);
  const doImport=async(it)=>{setBusy(true);const stu=await onImport(it);setBusy(false);
    if(stu){setItems(p=>p.filter(x=>x.id!==it.id));setSel(null);setMsg({t:'ok',m:`Ficha importada como avaliação de ${stu.name}.`});}};
  const doArchive=async(it)=>{if(demo){setItems(p=>p.filter(x=>x.id!==it.id));setSel(null);return;}
    const {error}=await sb.from('assess_intakes').update({status:'archived'}).eq('id',it.id);
    if(error){setMsg({t:'err',m:'Erro: '+error.message});return;}
    setItems(p=>p.filter(x=>x.id!==it.id));setSel(null);};

  const Field=({l,v})=>v?<div style={{marginBottom:6}}><span className="s-meta">{l}: </span><strong>{v}</strong></div>:null;
  if(sel){
    const d=sel.data||{},ps=d.student||{},ed=d.eval||{},ph=d.photos||{};
    const existing=students.find(s=>s.id===sel.student_id);
    const circ=[['Cintura',ed.circ_waist],['Quadril',ed.circ_hip],['Abdômen',ed.circ_abdomen],['Tórax',ed.circ_chest],['Braço D',ed.circ_arm_r],['Braço E',ed.circ_arm_l],['Coxa D',ed.circ_thigh_r],['Coxa E',ed.circ_thigh_l]].filter(x=>x[1]);
    const parqYes=PARQ_QUESTIONS.map((q,i)=>ed['parq_'+(i+1)]==='Sim'?i+1:null).filter(Boolean);
    return(
      <div>
        <div className="abar"><div><div className="breadcrumb" onClick={()=>setSel(null)}>← Fichas recebidas</div>
          <div className="ph-title">{sel.student_name||'Ficha remota'}</div>
          <div className="ph-sub">Enviada em {fmtDate((sel.created_at||'').slice(0,10))}{existing?' · aluno já cadastrado':' · aluno novo'}</div></div>
          <div className="bgroup">
            <button className="btn btn-ghost" onClick={()=>doArchive(sel)}>Arquivar</button>
            <button className="btn btn-primary" disabled={busy} onClick={()=>doImport(sel)}>{busy?'Importando…':existing?'Importar avaliação':'Criar aluno + avaliação'}</button>
          </div>
        </div>
        <div className="dash-panels">
          <div className="dash-panel"><h4>Dados &amp; medidas</h4>
            <Field l="Sexo" v={ps.gender==='F'?'Feminino':'Masculino'}/><Field l="Nascimento" v={ps.dob&&fmtDate(ps.dob)}/><Field l="Objetivo" v={ps.goal}/>
            <Field l="Peso" v={ed.weight&&ed.weight+' kg'}/><Field l="Altura" v={ed.height&&ed.height+' cm'}/>
            {circ.length>0&&<div style={{marginTop:6}}><span className="s-meta">Circunferências: </span>{circ.map(c=>c[0]+' '+c[1]).join(' · ')}</div>}
          </div>
          <div className="dash-panel"><h4>Saúde &amp; rotina</h4>
            <Field l="Atividade" v={ps.activity}/><Field l="Frequência" v={ps.schedule}/><Field l="Sono" v={ps.sleep}/>
            <Field l="Dor (EVA)" v={ed.eva}/><Field l="Fadiga" v={ed.fatigue}/><Field l="Estresse" v={ed.stress}/>
            <Field l="Saúde" v={ps.health}/><Field l="Medicamentos" v={ps.meds}/><Field l="Lesões" v={ps.injuries}/>
            <div style={{marginTop:6}}><span className="s-meta">PAR-Q: </span>{parqYes.length?<span className="badge br">{plural(parqYes.length,'resposta')} "Sim" — encaminhar avaliação médica</span>:<span className="badge bg">Sem respostas positivas</span>}</div>
          </div>
        </div>
        {(ph.front||ph.side||ph.back)&&<div className="dash-panel"><h4>Fotos</h4>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {['front','side','back'].map(k=>ph[k]?<img key={k} src={ph[k]} alt="" style={{width:150,borderRadius:10,border:'1px solid var(--border)'}}/>:null)}
          </div></div>}
        {msg&&<div className={`alert ${msg.t==='err'?'alert-danger':'alert-success'}`} style={{marginTop:12}}>{msg.m}</div>}
      </div>);
  }

  return(
    <div>
      <div className="abar"><div><div className="breadcrumb" onClick={onBack}>← Painel</div>
        <div className="ph-title">Fichas recebidas</div>
        <div className="ph-sub">Consultoria online · avaliações enviadas pelos alunos</div></div>
      </div>
      {msg&&<div className={`alert ${msg.t==='err'?'alert-danger':'alert-success'}`} style={{marginBottom:14}}>{msg.m}</div>}
      {demo&&<div className="alert alert-warn" style={{marginBottom:14}}>Modo demonstração: sem fichas reais.</div>}
      {items===null?<div className="center-screen"><div className="spinner"/></div>:
       items.length===0?<div className="empty"><div className="empty-title">Nenhuma ficha pendente</div>
         <p className="s-meta">Envie o link de ficha remota para seus alunos (botão na Agenda ou no card do aluno).</p></div>:
       <div className="student-grid">
         {items.map(it=>{const d=it.data||{},ed=d.eval||{};const has=[];if(ed.weight||ed.circ_waist)has.push('Medidas');if((d.photos||{}).front||(d.photos||{}).side)has.push('Fotos');if(PARQ_QUESTIONS.some((_,i)=>ed['parq_'+(i+1)]))has.push('PAR-Q');if(d.student?.health||d.student?.meds)has.push('Anamnese');
           return(
           <div key={it.id} className="student-card" onClick={()=>{setSel(it);setMsg(null);}}>
             <span className="badge ba" style={{marginBottom:6,display:'inline-block'}}>Pendente</span>
             <div className="s-name">{it.student_name||'Aluno'}</div>
             <div className="s-meta">Enviada em {fmtDate((it.created_at||'').slice(0,10))}<br/>{has.join(' · ')||'Sem dados'}</div>
           </div>);})}
       </div>}
    </div>);
}

/* ══════════════ Avaliação Técnica por Vídeo ══════════════ */
const TECH_EXERCISES=[
  {key:'agachamento',label:'Agachamento Livre'},{key:'leg_press',label:'Leg Press'},
  {key:'supino',label:'Supino'},{key:'remada',label:'Remada'},
  {key:'desenvolvimento',label:'Desenvolvimento'},{key:'terra',label:'Levantamento Terra'},
  {key:'afundo',label:'Afundo'},{key:'stiff',label:'Stiff'}
];
const TECH_ERRORS={
  agachamento:['Joelhos entrando para dentro (valgo)','Calcanhares levantando','Pouca amplitude','Retroversão pélvica (butt wink)','Excesso de inclinação do tronco','Falta de estabilidade','Descontrole excêntrico','Valgo dinâmico'],
  terra:['Lombar em flexão (perda do neutro)','Barra afastada do corpo','Quadril sobe antes do tronco','Hiperextensão no topo','Falta de ativação dorsal','Joelhos travam cedo'],
  supino:['Cotovelos muito abertos','Perda de retração escapular','Ponte lombar excessiva','Amplitude incompleta','Trajetória da barra desalinhada','Descontrole excêntrico'],
  remada:['Uso de impulso (roubo)','Falta de retração escapular','Tronco oscilando','Amplitude curta','Punho quebrado'],
  desenvolvimento:['Hiperextensão lombar','Amplitude incompleta','Cotovelos muito à frente','Falta de estabilidade de core','Elevação dos ombros (trapézio)'],
  leg_press:['Quadril sai do apoio','Joelhos para dentro','Amplitude curta','Extensão travada dos joelhos','Posicionamento dos pés inadequado'],
  afundo:['Joelho ultrapassa muito a ponta do pé','Valgo do joelho','Tronco muito inclinado','Passada curta','Instabilidade / perda de equilíbrio'],
  stiff:['Lombar fletida','Joelhos muito estendidos','Sem alongar posterior de coxa','Barra afastada do corpo','Hiperextensão no topo']
};
const TECH_ERRORS_GENERIC=['Amplitude incompleta','Falta de estabilidade','Descontrole excêntrico','Compensação postural','Ritmo/tempo inadequado','Respiração incorreta'];
const techErrors=k=>TECH_ERRORS[k]||TECH_ERRORS_GENERIC;
const techExLabel=k=>{const e=TECH_EXERCISES.find(x=>x.key===k);return e?e.label:k;};
async function techUpload(file,coachId,assessId,sub){
  const ext=((file.name||'').split('.').pop()||'mp4').toLowerCase().replace(/[^a-z0-9]/g,'')||'mp4';
  const path=`${coachId}/${assessId}/${sub}/${uid()}${Date.now().toString(36)}.${ext}`;
  const {error}=await sb.storage.from('assess-videos').upload(path,file,{contentType:file.type||'video/mp4',upsert:false});
  if(error)throw error;return path;}
async function techSignedUrl(path){if(!path)return null;try{const {data}=await sb.storage.from('assess-videos').createSignedUrl(path,3600);return data?data.signedUrl:null;}catch(e){return null;}}
function techScores(a){return Object.values(a||{}).map(x=>num(x&&x.score)).filter(v=>v!=null);}
function techAvg(a){const s=techScores(a);return s.length?+(s.reduce((x,y)=>x+y,0)/s.length).toFixed(1):null;}
const techScoreColor=v=>v==null?'var(--text3)':v>=8?'#2f8f4e':v>=6?'#b0894f':v>=4?'#c98a3a':'#b3434f';

/* Player que resolve a signed URL sob demanda (profissional autenticado) */
function TechPlayer({path,url,poster,compact}){
  const [src,setSrc]=useState(url||null);
  useEffect(()=>{let a=true;if(!url&&path)techSignedUrl(path).then(u=>{if(a)setSrc(u);});return()=>{a=false;};},[path,url]);
  if(url&&/youtube|youtu\.be|drive\.google/.test(url))
    return <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noopener">Abrir vídeo ↗</a>;
  if(!src)return <div style={{height:compact?120:200,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg3)',borderRadius:10,color:'var(--text3)',fontSize:12}}>{path?'carregando vídeo…':'sem vídeo'}</div>;
  return <video src={src} controls playsInline preload="metadata" style={{width:'100%',borderRadius:10,background:'#000',maxHeight:compact?220:420}}/>;
}

/* ── Página pública: aluno grava/envia os vídeos ── */
function TechVideoInput({label,file,note,onFile,onNote}){
  const ref=useRef();const [preview,setPreview]=useState(null);
  useEffect(()=>{if(!file){setPreview(null);return;}const u=URL.createObjectURL(file);setPreview(u);return()=>URL.revokeObjectURL(u);},[file]);
  return(
    <div className="sec" style={{marginBottom:12}}>
      <div className="sec-title">{label}</div>
      {preview?<>
        <video src={preview} controls playsInline style={{width:'100%',maxWidth:320,borderRadius:10,background:'#000'}}/>
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={()=>{onFile(null);}}>Regravar / trocar</button>
        </div>
      </>:
        <div className="photo-up" style={{width:'100%',maxWidth:320,height:120}} onClick={()=>ref.current.click()}>
          <div className="photo-ph"><span className="photo-ph-icon">Vídeo</span>gravar ou enviar da galeria</div></div>}
      <input ref={ref} type="file" accept="video/*" capture="environment" style={{display:'none'}} onChange={e=>{const f=e.target.files[0];if(f)onFile(f);}}/>
      <div className="fg" style={{marginTop:8}}><label className="flbl">Observação (opcional)</label>
        <input className="fi" value={note||''} onChange={e=>onNote(e.target.value)} placeholder="Ex.: senti desconforto no ombro"/></div>
    </div>);
}
function TechIntakePage({token}){
  const [info,setInfo]=useState(undefined);
  const [files,setFiles]=useState({});
  const [notes,setNotes]=useState({});
  const [busy,setBusy]=useState(false);
  const [prog,setProg]=useState('');
  const [done,setDone]=useState(false);
  const [err,setErr]=useState(null);
  useEffect(()=>{(async()=>{
    if(!sb){setInfo(null);return;}
    const {data,error}=await sb.rpc('tech_get',{p_token:token});
    if(error||!data||data.ok===false){setErr(error?error.message:'Avaliação não encontrada.');setInfo(null);return;}
    setInfo(data);setNotes(()=>{const n={};(data.exercises||[]).forEach(ex=>{const it=(data.items||{})[ex.key];if(it&&it.note)n[ex.key]=it.note;});return n;});
  })();},[]);
  const exs=(info&&info.exercises)||[];
  const submit=async()=>{
    const missing=exs.filter(ex=>!files[ex.key]);
    if(missing.length===exs.length){setErr('Envie ao menos um vídeo.');return;}
    setBusy(true);setErr(null);
    try{
      const items={...(info.items||{})};
      let i=0;for(const ex of exs){const f=files[ex.key];if(f){i++;setProg(`Enviando ${i}/${exs.filter(e=>files[e.key]).length}: ${ex.label}…`);
        const path=await techUpload(f,info.coach_id,info.id,ex.key);
        items[ex.key]={...(items[ex.key]||{}),video_path:path,note:notes[ex.key]||''};}
        else if(notes[ex.key]){items[ex.key]={...(items[ex.key]||{}),note:notes[ex.key]};}}
      setProg('Finalizando…');
      const {data:r,error}=await sb.rpc('tech_submit',{p_token:token,p_items:items});
      if(error||(r&&r.ok===false))throw new Error(error?error.message:(r&&r.message)||'Falha ao enviar.');
      setDone(true);window.scrollTo(0,0);
    }catch(e){setErr('Erro: '+(e.message||e));}
    setBusy(false);setProg('');
  };
  const brand=(info&&info.brand)||'MF Performance';
  if(done)return(
    <div className="center-screen" style={{padding:'24px 14px'}}><div className="auth-card" style={{maxWidth:460,textAlign:'center'}}>
      <div style={{display:'flex',justifyContent:'center',marginBottom:12}}><LogoLifter size={92}/></div>
      <div className="badge bg" style={{fontSize:14,padding:'8px 16px'}}>Vídeos enviados</div>
      <p style={{marginTop:14,fontSize:15,lineHeight:1.6}}>Seu treinador vai analisar a execução e te dar o retorno técnico.</p>
    </div></div>);
  return(
    <div style={{maxWidth:640,margin:'0 auto',padding:'22px 14px'}}>
      <div style={{textAlign:'center',marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'center',marginBottom:8}}><LogoLifter size={88}/></div>
        <div style={{fontFamily:'var(--serif)',fontSize:21,fontWeight:600}}>{brand}</div>
        <div className="s-meta">Avaliação Técnica{info&&info.title?' — '+info.title:''}</div>
      </div>
      {info===undefined&&<div className="center-screen" style={{minHeight:120}}><div className="spinner"/></div>}
      {info===null&&<div className="alert alert-danger">Não foi possível abrir a avaliação.{err?' ('+err+')':''}</div>}
      {info&&info.status==='reviewed'&&<div className="alert alert-warn">Esta avaliação já foi concluída pelo seu treinador.</div>}
      {info&&<>
        <div className="alert alert-info">Grave cada exercício de um ângulo que mostre o corpo inteiro (de lado costuma ser melhor). Você pode gravar na hora ou enviar da galeria, revisar e regravar antes de enviar.</div>
        {err&&<div className="alert alert-danger">{err}</div>}
        {exs.map(ex=><TechVideoInput key={ex.key} label={ex.label} file={files[ex.key]} note={notes[ex.key]}
          onFile={f=>setFiles(p=>({...p,[ex.key]:f}))} onNote={v=>setNotes(p=>({...p,[ex.key]:v}))}/>)}
        {prog&&<div className="alert alert-info">{prog}</div>}
        <button className="btn btn-primary" style={{width:'100%',marginTop:8}} disabled={busy} onClick={submit}>{busy?'Enviando…':'Enviar avaliação'}</button>
        <p className="s-meta" style={{textAlign:'center',marginTop:10}}>Os vídeos vão direto e em segurança para o seu treinador.</p>
      </>}
    </div>);
}

/* Gravador de áudio (feedback do profissional) via MediaRecorder */
function AudioRecorder({onBlob,existingUrl}){
  const [recing,setRecing]=useState(false);const [url,setUrl]=useState(existingUrl||null);
  const mr=useRef(null),chunks=useRef([]);
  const start=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks.current=[];
    const m=new MediaRecorder(stream);mr.current=m;m.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data);};
    m.onstop=()=>{const b=new Blob(chunks.current,{type:chunks.current[0]?.type||'audio/webm'});setUrl(URL.createObjectURL(b));onBlob(b);stream.getTracks().forEach(t=>t.stop());};
    m.start();setRecing(true);}catch(e){alert('Não foi possível acessar o microfone.');}};
  const stop=()=>{if(mr.current&&recing){mr.current.stop();setRecing(false);}};
  return(<div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
    {!recing?<button type="button" className="btn btn-secondary btn-sm" onClick={start}>● Gravar áudio</button>
      :<button type="button" className="btn btn-primary btn-sm" onClick={stop}>■ Parar</button>}
    {url&&<audio src={url} controls style={{height:34}}/>}
    {url&&!recing&&<button type="button" className="btn btn-ghost btn-sm" onClick={()=>{setUrl(null);onBlob(null);}}>×</button>}
  </div>);
}

/* Painel de análise de um exercício */
function TechItemAnalysis({exKey,an,onChange}){
  const a=an||{};const errs=techErrors(exKey);const selErr=a.errors||[];
  const toggleErr=e=>onChange({...a,errors:selErr.includes(e)?selErr.filter(x=>x!==e):[...selErr,e]});
  return(<div style={{marginTop:10}}>
    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10,flexWrap:'wrap'}}>
      <label className="flbl" style={{margin:0}}>Nota técnica</label>
      <input type="range" min="0" max="10" step="0.1" value={a.score??5} onChange={e=>onChange({...a,score:+e.target.value})} style={{flex:1,minWidth:140}}/>
      <span style={{fontFamily:'var(--serif)',fontSize:22,fontWeight:600,color:techScoreColor(a.score),minWidth:44,textAlign:'right'}}>{a.score!=null?fmt(a.score):'—'}</span>
    </div>
    <label className="flbl">Erros comuns</label>
    <div style={{display:'flex',flexWrap:'wrap',gap:7,marginBottom:10}}>
      {errs.map(e=><button key={e} type="button" className={`chip ${selErr.includes(e)?'active':''}`} onClick={()=>toggleErr(e)}>{e}</button>)}
    </div>
    <div className="fgrid2">
      <div className="fg"><label className="flbl">Pontos positivos</label><textarea className="fi" rows="2" value={a.positives||''} onChange={e=>onChange({...a,positives:e.target.value})}/></div>
      <div className="fg"><label className="flbl">Pontos a corrigir</label><textarea className="fi" rows="2" value={a.corrections||''} onChange={e=>onChange({...a,corrections:e.target.value})}/></div>
    </div>
    <div className="fg"><label className="flbl">Recomendações</label><textarea className="fi" rows="2" value={a.recs||''} onChange={e=>onChange({...a,recs:e.target.value})}/></div>
    <div className="fg"><label className="flbl">Observações gerais</label><textarea className="fi" rows="2" value={a.notes||''} onChange={e=>onChange({...a,notes:e.target.value})}/></div>
  </div>);
}

/* Revisão de uma avaliação técnica */
function TechReview({assess,studentName,history,coach,onBack,onSave,onDelete}){
  const [an,setAn]=useState(assess.analysis||{});
  const [fb,setFb]=useState(assess.feedback||{});
  const [audioBlob,setAudioBlob]=useState(null);
  const [videoFile,setVideoFile]=useState(null);
  const [busy,setBusy]=useState(false);const [msg,setMsg]=useState(null);const [openHist,setOpenHist]=useState(null);
  const [aiBusy,setAiBusy]=useState(false);const [aiErr,setAiErr]=useState(null);
  const items=assess.items||{};const exs=assess.exercises||[];
  const vidRef=useRef();
  const genAI=async()=>{
    setAiBusy(true);setAiErr(null);
    try{
      if(coach._demo){await new Promise(r=>setTimeout(r,600));setFb(p=>({...p,ai_summary:'Comparado com a avaliação anterior, houve melhora na estabilidade do joelho e maior amplitude no agachamento, com melhor controle excêntrico. Ainda recomenda-se trabalhar mobilidade de tornozelo e controle do tronco. Esta é uma análise de apoio e não substitui a avaliação do profissional.'}));setAiBusy(false);return;}
      const {data,error}=await sb.functions.invoke('tech-ai-summary',{body:{assessId:assess.id}});
      if(error)throw new Error(error.message||'Falha ao chamar a IA.');
      if(!data||data.ok===false)throw new Error((data&&data.message)||'A IA não retornou um resumo.');
      setFb(p=>({...p,ai_summary:data.summary||''}));
    }catch(e){setAiErr('Erro: '+(e.message||e));}
    setAiBusy(false);
  };
  const save=async(markReviewed)=>{
    setBusy(true);setMsg(null);
    try{
      const fb2={...fb};
      if(audioBlob){const p=await techUpload(new File([audioBlob],'fb.webm',{type:audioBlob.type}),coach.id,assess.id,'feedback');fb2.audio_path=p;}
      if(audioBlob===false)fb2.audio_path=null;
      if(videoFile){const p=await techUpload(videoFile,coach.id,assess.id,'feedback');fb2.video_path=p;}
      const patch={analysis:an,feedback:fb2};if(markReviewed){patch.status='reviewed';patch.reviewed_at=new Date().toISOString();}
      await onSave(assess.id,patch);setFb(fb2);setAudioBlob(null);setVideoFile(null);
      setMsg({t:'ok',m:markReviewed?'Avaliação concluída e salva.':'Análise salva.'});
    }catch(e){setMsg({t:'err',m:'Erro ao salvar: '+(e.message||e)});}
    setBusy(false);
  };
  return(
    <div>
      <div className="abar"><div><div className="breadcrumb" onClick={onBack}>← Avaliações técnicas</div>
        <div className="ph-title">{assess.title||'Avaliação técnica'}</div>
        <div className="ph-sub">{studentName} · {fmtDate((assess.created_at||'').slice(0,10))} · <span className={`badge ${assess.status==='reviewed'?'bg':assess.status==='submitted'?'bb':'ba'}`}>{assess.status==='reviewed'?'Concluída':assess.status==='submitted'?'Enviada':'Aguardando aluno'}</span></div></div>
        <div className="bgroup">
          <button className="btn btn-ghost" onClick={()=>{if(confirm('Excluir esta avaliação técnica e seus vídeos?'))onDelete(assess.id);}}>Excluir</button>
          <button className="btn btn-secondary" disabled={busy} onClick={()=>save(false)}>Salvar</button>
          <button className="btn btn-primary" disabled={busy} onClick={()=>save(true)}>{busy?'Salvando…':'Concluir'}</button>
        </div>
      </div>
      {msg&&<div className={`alert ${msg.t==='err'?'alert-danger':'alert-success'}`}>{msg.m}</div>}
      {assess.status==='requested'&&<div className="alert alert-warn">O aluno ainda não enviou os vídeos.</div>}

      {exs.map(ex=>{const it=items[ex.key]||{};const hist=(history||[]).map(h=>({date:h.created_at,score:(h.analysis||{})[ex.key]?.score,notes:(h.analysis||{})[ex.key]?.notes})).filter(h=>h.score!=null);
        return(
        <div key={ex.key} className="dash-panel" style={{marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
            <h4 style={{margin:0}}>{ex.label}</h4>
            {hist.length>0&&<button type="button" className="btn btn-ghost btn-sm" onClick={()=>setOpenHist(openHist===ex.key?null:ex.key)}>Histórico ({hist.length})</button>}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1.1fr)',gap:16,marginTop:10,alignItems:'start'}} className="tech-grid">
            <div>
              {(it.video_path||it.video_url)?<TechPlayer path={it.video_path} url={it.video_url}/>:<div style={{padding:20,textAlign:'center',color:'var(--text3)',background:'var(--bg3)',borderRadius:10,fontSize:12}}>Sem vídeo enviado</div>}
              {it.note&&<div style={{marginTop:8,fontSize:12.5,color:'var(--text2)'}}><b>Aluno:</b> {it.note}</div>}
              {openHist===ex.key&&<div style={{marginTop:10,borderTop:'1px solid var(--border)',paddingTop:8}}>
                {hist.map((h,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0'}}>
                  <span className="s-meta">{fmtDate((h.date||'').slice(0,10))}</span><span style={{fontWeight:600,color:techScoreColor(h.score)}}>{fmt(h.score)}</span></div>)}
              </div>}
            </div>
            <TechItemAnalysis exKey={ex.key} an={an[ex.key]} onChange={v=>setAn(p=>({...p,[ex.key]:v}))}/>
          </div>
        </div>);})}

      <div className="dash-panel" style={{marginBottom:14}}><h4>Feedback ao aluno</h4>
        <div className="fg"><label className="flbl">Mensagem (texto)</label><textarea className="fi" rows="3" value={fb.text||''} onChange={e=>setFb(p=>({...p,text:e.target.value}))} placeholder="Resumo do retorno técnico…"/></div>
        <label className="flbl">Áudio</label>
        <AudioRecorder existingUrl={null} onBlob={b=>setAudioBlob(b===null?false:b)}/>
        {fb.audio_path&&!audioBlob&&<div className="s-meta" style={{marginTop:4}}>Áudio já salvo nesta avaliação.</div>}
        <div className="fg" style={{marginTop:10}}><label className="flbl">Vídeo curto demonstrativo</label>
          {videoFile?<div className="s-meta">Vídeo selecionado: {videoFile.name} <button className="btn btn-ghost btn-sm" onClick={()=>setVideoFile(null)}>×</button></div>
            :<button type="button" className="btn btn-secondary btn-sm" onClick={()=>vidRef.current.click()}>Gravar / enviar vídeo</button>}
          {fb.video_path&&!videoFile&&<div className="s-meta" style={{marginTop:4}}>Vídeo de feedback já salvo.</div>}
          <input ref={vidRef} type="file" accept="video/*" capture="environment" style={{display:'none'}} onChange={e=>{const f=e.target.files[0];if(f)setVideoFile(f);}}/>
        </div>
        <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
            <label className="flbl" style={{margin:0}}>Resumo por IA <span style={{color:'var(--text3)',fontWeight:400}}>(apoio — não substitui sua avaliação)</span></label>
            <button type="button" className="btn btn-secondary btn-sm" disabled={aiBusy||assess.status==='requested'} onClick={genAI}>{aiBusy?'Gerando…':fb.ai_summary?'Regerar':'Gerar resumo'}</button>
          </div>
          {aiErr&&<div className="alert alert-danger" style={{marginTop:8}}>{aiErr}</div>}
          {(fb.ai_summary||aiBusy)&&<textarea className="fi" rows="4" style={{marginTop:8}} value={fb.ai_summary||''} placeholder={aiBusy?'A IA está analisando…':''} onChange={e=>setFb(p=>({...p,ai_summary:e.target.value}))}/>}
        </div>
      </div>
    </div>);
}

/* Comparação entre duas avaliações */
function TechCompare({list,students,preStudent,onBack}){
  const withVid=list.filter(a=>Object.values(a.items||{}).some(it=>it&&(it.video_path||it.video_url)));
  const [aId,setAId]=useState(withVid[withVid.length-1]?.id||'');
  const [bId,setBId]=useState(withVid[0]?.id||'');
  const A=list.find(x=>x.id===aId),B=list.find(x=>x.id===bId);
  const commonEx=(A&&B)?(A.exercises||[]).filter(e=>(B.exercises||[]).some(x=>x.key===e.key)):[];
  const [exKey,setExKey]=useState('');
  const ex=exKey||commonEx[0]?.key;
  const itA=A&&(A.items||{})[ex],itB=B&&(B.items||{})[ex];
  const scA=A&&(A.analysis||{})[ex]?.score,scB=B&&(B.analysis||{})[ex]?.score;
  const diff=(scA!=null&&scB!=null)?+(scB-scA).toFixed(1):null;
  const opt=a=>`${students.find(s=>s.id===a.student_id)?.name||'Aluno'} · ${a.title||fmtDate((a.created_at||'').slice(0,10))}`;
  return(
    <div>
      <div className="abar"><div><div className="breadcrumb" onClick={onBack}>← Avaliações técnicas</div>
        <div className="ph-title">Comparar avaliações</div></div></div>
      <div className="dash-panel" style={{marginBottom:14}}>
        <div className="fgrid2">
          <div className="fg"><label className="flbl">Avaliação A (antes)</label><select className="fi" value={aId} onChange={e=>setAId(e.target.value)}>{withVid.map(a=><option key={a.id} value={a.id}>{opt(a)}</option>)}</select></div>
          <div className="fg"><label className="flbl">Avaliação B (depois)</label><select className="fi" value={bId} onChange={e=>setBId(e.target.value)}>{withVid.map(a=><option key={a.id} value={a.id}>{opt(a)}</option>)}</select></div>
        </div>
        {commonEx.length>0&&<div className="fg"><label className="flbl">Exercício</label><select className="fi" style={{maxWidth:280}} value={ex} onChange={e=>setExKey(e.target.value)}>{commonEx.map(e=><option key={e.key} value={e.key}>{e.label}</option>)}</select></div>}
      </div>
      {diff!=null&&<div className="kpi-row" style={{marginBottom:14}}>
        <div className="kpi"><div className="kpi-lbl">Nota A</div><div className="kpi-val" style={{color:techScoreColor(scA)}}>{fmt(scA)}</div></div>
        <div className="kpi"><div className="kpi-lbl">Nota B</div><div className="kpi-val" style={{color:techScoreColor(scB)}}>{fmt(scB)}</div></div>
        <div className={`kpi ${diff>0?'k-good':diff<0?'k-bad':''}`}><div className="kpi-lbl">Evolução</div><div className="kpi-val" style={{color:diff>0?'#2f8f4e':diff<0?'var(--red)':'var(--text3)'}}>{diff>0?'+':''}{fmt(diff)}</div></div>
      </div>}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}} className="tech-grid">
        {[[A,itA,scA,'A'],[B,itB,scB,'B']].map(([av,it,sc],i)=>(
          <div key={i} className="dash-panel"><h4>{i===0?'Antes':'Depois'} — {av?opt(av):''}</h4>
            {it&&(it.video_path||it.video_url)?<TechPlayer path={it.video_path} url={it.video_url} compact/>:<div style={{padding:16,textAlign:'center',color:'var(--text3)',fontSize:12}}>Sem vídeo</div>}
            <div style={{marginTop:8}}><span className="s-meta">Nota: </span><b style={{color:techScoreColor(sc)}}>{sc!=null?fmt(sc):'—'}</b></div>
            {av&&(av.analysis||{})[ex]?.notes&&<div style={{fontSize:12.5,marginTop:6,color:'var(--text2)'}}>{(av.analysis||{})[ex].notes}</div>}
          </div>))}
      </div>
    </div>);
}

/* Hub das avaliações técnicas (lista + dashboard + criação) */
function TechScreen({coach,students,preStudent,onBack}){
  const demo=!!coach._demo;
  const [list,setList]=useState(demo?[]:null);
  const [mode,setMode]=useState('list');
  const [selId,setSelId]=useState(null);
  const [stuFilter,setStuFilter]=useState(preStudent?preStudent.id:'');
  const [msg,setMsg]=useState(null);
  // criação
  const [cStu,setCStu]=useState(preStudent?preStudent.id:'');
  const [cTitle,setCTitle]=useState('Avaliação inicial');
  const [cEx,setCEx]=useState(TECH_EXERCISES.slice(0,4).map(e=>e.key));
  const [linkRow,setLinkRow]=useState(null);

  const load=async()=>{if(demo){setList([]);return;}
    const {data,error}=await sb.from('assess_tech').select('*').eq('coach_id',coach.id).order('created_at',{ascending:false});
    if(error){setMsg({t:'err',m:'Erro ao carregar: '+error.message});setList([]);return;}setList(data||[]);};
  useEffect(()=>{load();},[]);
  const savePatch=async(id,patch)=>{setList(p=>p.map(x=>x.id===id?{...x,...patch}:x));if(!demo){const {error}=await sb.from('assess_tech').update(patch).eq('id',id);if(error)throw error;}};
  /* Some da lista na hora, mas se o servidor recusar volta: a tela não pode
     ficar mostrando uma avaliação a menos do que o banco tem. */
  const del=async(id)=>{setList(p=>p.filter(x=>x.id!==id));setMode('list');setSelId(null);
    if(!demo&&!(await gravarAvisando(sb.from('assess_tech').delete().eq('id',id),'A avaliação técnica')))await load();};

  const filtered=(list||[]).filter(a=>!stuFilter||a.student_id===stuFilter);
  const sel=(list||[]).find(a=>a.id===selId);
  const stuName=id=>students.find(x=>x.id===id)?.name||'Aluno';
  const base=location.origin+location.pathname;

  const create=async()=>{
    if(!cStu){setMsg({t:'err',m:'Escolha o aluno.'});return;}
    if(!cEx.length){setMsg({t:'err',m:'Escolha ao menos um exercício.'});return;}
    const exercises=cEx.map(k=>({key:k,label:techExLabel(k)}));
    if(demo){const row={id:'d'+Date.now(),token:'demo-token',coach_id:coach.id,student_id:cStu,title:cTitle,status:'requested',exercises,items:{},analysis:{},feedback:{},created_at:new Date().toISOString()};setList(p=>[row,...p]);setLinkRow(row);setMode('list');return;}
    const {data,error}=await sb.from('assess_tech').insert({coach_id:coach.id,student_id:cStu,title:cTitle,status:'requested',exercises}).select().single();
    if(error){setMsg({t:'err',m:'Erro: '+error.message});return;}
    setList(p=>[data,...p]);setLinkRow(data);setMode('list');setMsg({t:'ok',m:'Avaliação criada. Envie o link para o aluno gravar.'});
  };
  const rowLink=r=>base+'?tecnica='+r.token;
  const sendWa=r=>{const s=students.find(x=>x.id===r.student_id);const phone=(s?.phone||'').replace(/\D/g,'');const txt=encodeURIComponent(`Olá${s?', '+s.name.split(' ')[0]:''}! Grave seus exercícios para avaliação técnica por aqui:\n${rowLink(r)}`);window.open(phone?`https://wa.me/55${phone}?text=${txt}`:`https://wa.me/?text=${txt}`,'_blank');};
  const copy=r=>{const l=rowLink(r);if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(l).then(()=>setMsg({t:'ok',m:'Link copiado.'})).catch(()=>{});};

  if(mode==='review'&&sel)return <TechReview assess={sel} studentName={stuName(sel.student_id)} coach={coach}
    history={(list||[]).filter(a=>a.student_id===sel.student_id&&a.id!==sel.id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))}
    onBack={()=>{setMode('list');setSelId(null);}} onSave={savePatch} onDelete={del}/>;
  if(mode==='compare')return <TechCompare list={filtered.length>1?filtered:(list||[])} students={students} preStudent={preStudent} onBack={()=>setMode('list')}/>;

  // dashboard resumo
  const withV=filtered.filter(a=>a.status!=='requested');
  const totalVids=filtered.reduce((s,a)=>s+Object.values(a.items||{}).filter(it=>it&&(it.video_path||it.video_url)).length,0);
  const allScores=filtered.flatMap(a=>techScores(a.analysis));
  const avgScore=allScores.length?+(allScores.reduce((x,y)=>x+y,0)/allScores.length).toFixed(1):null;
  const exSet=new Set(filtered.flatMap(a=>(a.exercises||[]).map(e=>e.key)));
  const evo=[...filtered].filter(a=>techAvg(a.analysis)!=null).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).map(a=>techAvg(a.analysis));
  const pending=filtered.filter(a=>a.status==='submitted').length;

  return(
    <div>
      <div className="abar"><div><div className="breadcrumb" onClick={onBack}>← Painel</div>
        <div className="ph-title">Avaliação Técnica por Vídeo</div>
        <div className="ph-sub">Execução dos exercícios · histórico técnico</div></div>
        <div className="bgroup">
          <button className="btn btn-secondary" onClick={()=>setMode('compare')}>Comparar</button>
          <button className="btn btn-primary" onClick={()=>{setLinkRow(null);setMode('create');}}>Nova avaliação técnica</button>
        </div>
      </div>
      {msg&&<div className={`alert ${msg.t==='err'?'alert-danger':'alert-success'}`}>{msg.m}</div>}
      {demo&&<div className="alert alert-warn">Modo demonstração: dados não são salvos.</div>}

      {mode==='create'?<div className="dash-panel" style={{marginBottom:16}}>
        <h4>Nova avaliação técnica</h4>
        <div className="fgrid2">
          <div className="fg"><label className="flbl">Aluno</label><select className="fi" value={cStu} onChange={e=>setCStu(e.target.value)}><option value="">Selecione…</option>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="fg"><label className="flbl">Título</label><input className="fi" value={cTitle} onChange={e=>setCTitle(e.target.value)} placeholder="Ex.: Reavaliação 30 dias"/></div>
        </div>
        <label className="flbl">Exercícios a gravar</label>
        <div style={{display:'flex',flexWrap:'wrap',gap:7,marginBottom:12}}>
          {TECH_EXERCISES.map(e=><button key={e.key} type="button" className={`chip ${cEx.includes(e.key)?'active':''}`} onClick={()=>setCEx(p=>p.includes(e.key)?p.filter(x=>x!==e.key):[...p,e.key])}>{e.label}</button>)}
        </div>
        <div className="bgroup"><button className="btn btn-ghost" onClick={()=>setMode('list')}>Cancelar</button>
          <button className="btn btn-primary" onClick={create}>Criar e gerar link</button></div>
      </div>:<>

      {students.length>0&&<div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
        <select className="fi" style={{width:'auto',minWidth:200}} value={stuFilter} onChange={e=>setStuFilter(e.target.value)}>
          <option value="">Todos os alunos</option>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>}

      {filtered.length>0&&<div className="kpi-row">
        <div className="kpi"><div className="kpi-lbl">Avaliações</div><div className="kpi-val">{filtered.length}</div><div className="kpi-sub">{pending>0?`${pending} para revisar`:'realizadas'}</div></div>
        <div className="kpi"><div className="kpi-lbl">Vídeos enviados</div><div className="kpi-val">{totalVids}</div></div>
        <div className="kpi"><div className="kpi-lbl">Exercícios avaliados</div><div className="kpi-val">{exSet.size}</div></div>
        <div className="kpi"><div className="kpi-lbl">Nota técnica média</div><div className="kpi-val" style={{color:techScoreColor(avgScore)}}>{avgScore??'—'}</div>
          {evo.length>=2&&<div style={{marginTop:6}}><Sparkline values={evo} color={techScoreColor(avgScore)} w={110} h={30}/></div>}</div>
      </div>}

      {linkRow&&<div className="dash-panel" style={{marginBottom:16}}>
        <h4>Enviar link para {stuName(linkRow.student_id)}</h4>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
          <button className="btn btn-secondary" onClick={()=>copy(linkRow)}>Copiar link</button>
          <button className="btn btn-primary" onClick={()=>sendWa(linkRow)}>Enviar por WhatsApp</button>
        </div>
        <div style={{fontSize:11.5,color:'var(--text3)',wordBreak:'break-all',background:'var(--bg3)',padding:'8px 10px',borderRadius:8}}>{rowLink(linkRow)}</div>
      </div>}

      {list===null?<div className="center-screen"><div className="spinner"/></div>:
       filtered.length===0?<div className="empty"><div className="empty-title">Nenhuma avaliação técnica</div>
         <p className="s-meta">Crie uma avaliação e envie o link para o aluno gravar os exercícios.</p></div>:
       <div className="student-grid">
        {filtered.map(a=>{const nv=Object.values(a.items||{}).filter(it=>it&&(it.video_path||it.video_url)).length;const avg=techAvg(a.analysis);
          return(
          <div key={a.id} className="student-card" onClick={()=>{setSelId(a.id);setMode('review');}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <span className={`badge ${a.status==='reviewed'?'bg':a.status==='submitted'?'bb':'ba'}`} style={{marginBottom:6}}>{a.status==='reviewed'?'Concluída':a.status==='submitted'?'Enviada':'Aguardando'}</span>
              {avg!=null&&<span style={{fontFamily:'var(--serif)',fontSize:20,fontWeight:600,color:techScoreColor(avg)}}>{fmt(avg)}</span>}
            </div>
            <div className="s-name">{a.title||'Avaliação técnica'}</div>
            <div className="s-meta">{stuName(a.student_id)}<br/>{fmtDate((a.created_at||'').slice(0,10))} · {nv}/{(a.exercises||[]).length} vídeos</div>
            <div className="card-actions" onClick={e=>e.stopPropagation()}>
              <button className="btn btn-ghost" onClick={()=>{setLinkRow(a);window.scrollTo(0,0);}}>Link</button>
            </div>
          </div>);})}
       </div>}
      </>}
    </div>);
}

/* ══════════════ Módulo Treino — montador de ficha (coach) ══════════════ */
const TRAIN_TIERS=['Aquecimento','Preparatoria','Valida'];
// O banco guarda o tipo sem acento (Valida, Preparatoria). Na tela vai
// acentuado: quem treina nao tem que ver o valor cru da coluna.
const tierNome=t=>t==='Preparatoria'?'Preparatória':t==='Valida'?'Válida':(t||'');
const tierColor=t=>t==='Valida'?'#2f8f4e':t==='Preparatoria'?'#b0894f':'#8a8378';
const TRAIN_GRUPOS=['Peito','Costas','Ombro','Bíceps','Tríceps','Antebraço','Quadríceps','Posterior de Coxa','Glúteos','Adutores','Abdutores','Panturrilha','Abdômen','Lombar','Cardio','Mobilidade'];
const openVideo=(url,name)=>{const u=(url&&url.trim())?url.trim():('https://www.youtube.com/results?search_query='+encodeURIComponent((name||'exercício')+' execução técnica'));window.open(u,'_blank');};
const ytEmbed=url=>{const m=(url||'').match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/);return m?('https://www.youtube-nocookie.com/embed/'+m[1]):null;};
/* URL publica de um arquivo enviado para o bucket de demonstracoes */
const exMediaUrl=path=>{
  if(!path||!sb)return null;
  try{return sb.storage.from('exercicios').getPublicUrl(path).data.publicUrl;}catch(e){return null;}
};
/* Demonstração do exercício embutida (gif/imagem/vídeo/youtube), sem sair do app.
   Prioridade: arquivo enviado pelo treinador > link colado. */
/* Os desenhos do free-exercise-db vêm em dois quadros (0.jpg e 1.jpg).
   Alternar os dois dá o movimento — é o "gif" do exercício. */
function GifDoisQuadros({base,name}){
  const q0=base, q1=base.replace(/\/0\.jpg$/i,'/1.jpg');
  const [on,setOn]=useState(false);
  useEffect(()=>{
    if(SEM_MOTION)return;
    const t=setInterval(()=>setOn(v=>!v),620);
    return()=>clearInterval(t);
  },[]);
  return(<div style={{background:'#fff',borderRadius:12,overflow:'hidden'}}>
    <img src={on?q1:q0} alt={name||''} loading="lazy"
      style={{width:'100%',display:'block',aspectRatio:'4 / 3',objectFit:'contain'}}/>
    <img src={q1} alt="" aria-hidden="true" style={{display:'none'}}/>
  </div>);
}

function ExDemo({url,path,name,dicas}){
  const u=(exMediaUrl(path)||url||'').trim();
  if(/free-exercise-db/.test(u)&&/\/0\.jpg$/i.test(u))return(<div>
    <GifDoisQuadros base={u} name={name}/>
    {dicas&&<div style={{marginTop:8,fontSize:12.5,lineHeight:1.5,color:'var(--lvt2,#a2a2b0)'}}>{dicas}</div>}
  </div>);
  if(!u)return <div style={{padding:14,color:'var(--lvt3,#6c6c7c)',background:'var(--lvc2,#23232d)',borderRadius:12,fontSize:12.5,lineHeight:1.55}}>
    {dicas
      ? <span style={{color:'var(--lvt2,#a2a2b0)'}}>{dicas}</span>
      : <span>Sem demonstração ainda.</span>}
    <div style={{marginTop:8,textAlign:'center'}}><button className="lv-ghost" onClick={()=>openVideo(null,name)}>Ver no YouTube ↗</button></div></div>;
  if(/\.(gif|png|jpe?g|webp|avif)(\?|$)/i.test(u))return <img src={u} alt={name} loading="lazy" style={{width:'100%',borderRadius:12,display:'block'}}/>;
  if(/\.(mp4|webm|mov)(\?|$)/i.test(u))return <video src={u} autoPlay loop muted playsInline controls style={{width:'100%',borderRadius:12,display:'block',background:'#000'}}/>;
  const yt=ytEmbed(u);
  if(yt)return <div style={{position:'relative',paddingBottom:'56%',borderRadius:12,overflow:'hidden'}}><iframe src={yt} title={name} style={{position:'absolute',inset:0,width:'100%',height:'100%',border:0}} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/></div>;
  if(path)return <video src={u} autoPlay loop muted playsInline controls style={{width:'100%',borderRadius:12,display:'block',background:'#000'}}/>;
  return <button className="lv-ghost" onClick={()=>openVideo(u,name)}>Abrir vídeo ↗</button>;
}

/* Biblioteca de exercícios do treinador (com vídeo) */
function ExerciseLibrary({coach,onBack}){
  const demo=!!coach._demo;
  const [lib,setLib]=useState(demo?[{id:'x1',nome:'Agachamento Livre',grupo_muscular:'Quadríceps',coach_id:null},{id:'x2',nome:'Supino Reto',grupo_muscular:'Peito',coach_id:null}]:null);
  const [q,setQ]=useState('');const [msg,setMsg]=useState(null);
  const [nf,setNf]=useState({nome:'',grupo_muscular:'Peito',video_url:''});
  const [subindo,setSubindo]=useState(null);
  const [verDemo,setVerDemo]=useState(null);
  const [grupoFiltro,setGrupoFiltro]=useState('Todos');
  const fileRef=useRef();
  const alvoRef=useRef(null);
  const load=async()=>{if(demo)return;
    const {data}=await lerCopia('lib-completa',
      sb.from('train_exercicios').select('*').order('grupo_muscular').order('nome'));
    setLib(data||[]);};
  useEffect(()=>{load();},[]);
  const add=async()=>{const nome=(nf.nome||'').trim();if(!nome)return;
    if(demo){setLib(p=>[{id:'d'+Date.now(),nome,grupo_muscular:nf.grupo_muscular,video_url:nf.video_url,coach_id:coach.id},...p]);setNf({nome:'',grupo_muscular:nf.grupo_muscular,video_url:''});return;}
    const {data,error}=await sb.from('train_exercicios').insert({coach_id:coach.id,nome,grupo_muscular:nf.grupo_muscular,video_url:nf.video_url||null}).select().single();
    if(error){setMsg({t:'err',m:'Erro: '+error.message});return;}
    setLib(p=>[data,...p]);setNf({nome:'',grupo_muscular:nf.grupo_muscular,video_url:''});setMsg({t:'ok',m:'Exercício adicionado.'});
  };
  const setVideo=async(ex)=>{const url=prompt('Cole o link do vídeo (YouTube) de "'+ex.nome+'":',ex.video_url||'');if(url===null)return;
    if(demo){setLib(p=>p.map(x=>x.id===ex.id?{...x,video_url:url}:x));return;}
    const {error}=await sb.rpc('exercicio_definir_video',{p_exercicio:ex.id,p_path:null,p_url:url||null});
    if(error){setMsg({t:'err',m:'Erro ao salvar o link: '+error.message});return;}
    await load();};

  const escolherArquivo=(ex)=>{alvoRef.current=ex;if(fileRef.current){fileRef.current.value='';fileRef.current.click();}};

  const enviarArquivo=async(file)=>{
    const ex=alvoRef.current;if(!ex||!file)return;
    if(demo){setMsg({t:'err',m:'Modo demonstração: o vídeo não é enviado.'});return;}
    const MAX=50*1024*1024;
    if(file.size>MAX){setMsg({t:'err',m:'Vídeo muito grande ('+(file.size/1048576).toFixed(0)+' MB). O limite é 50 MB. Grave de 5 a 15 segundos.'});return;}
    setSubindo(ex.id);setMsg(null);
    try{
      const ext=(file.name.split('.').pop()||'mp4').toLowerCase().replace(/[^a-z0-9]/g,'');
      const path=coach.id+'/'+uid()+'.'+ext;
      const {error:upErr}=await sb.storage.from('exercicios').upload(path,file,{contentType:file.type||'video/mp4',upsert:false});
      if(upErr)throw upErr;
      const {error}=await sb.rpc('exercicio_definir_video',{p_exercicio:ex.id,p_path:path,p_url:null});
      if(error)throw error;
      await load();
      setMsg({t:'ok',m:'Demonstração de "'+ex.nome+'" enviada.'});
    }catch(e){
      const m=e.message||String(e);
      setMsg({t:'err',m:/exceeded|too large|payload/i.test(m)
        ?'O arquivo passou do limite do servidor. Corte o vídeo para 5 a 15 segundos e tente de novo.'
        :'Não consegui enviar: '+m});
    }
    setSubindo(null);alvoRef.current=null;
  };

  const removerVideo=async(ex)=>{
    if(!confirm('Remover a demonstração de "'+ex.nome+'"?'))return;
    if(demo){setLib(p=>p.map(x=>x.id===ex.id?{...x,video_url:null,video_path:null}:x));return;}
    const {error}=await sb.rpc('exercicio_remover_video',{p_exercicio:ex.id});
    if(error){setMsg({t:'err',m:'Erro: '+error.message});return;}
    await load();};
  const del=async(ex)=>{if(ex.coach_id!==coach.id)return;if(!confirm('Remover "'+ex.nome+'"?'))return;
    setLib(p=>p.filter(x=>x.id!==ex.id));
    if(!demo&&!(await gravarAvisando(sb.from('train_exercicios').delete().eq('id',ex.id),'O exercício')))await load();};
  const list=(lib||[]).filter(e=>e.nome.toLowerCase().includes(q.toLowerCase()))
    .filter(e=>grupoFiltro==='Todos'||(e.grupo_muscular||'Outros')===grupoFiltro);
  const gruposDisponiveis=['Todos',...[...new Set((lib||[]).map(e=>e.grupo_muscular||'Outros'))].sort()];
  const groups=(()=>{const g={};list.forEach(e=>{(g[e.grupo_muscular||'Outros']=g[e.grupo_muscular||'Outros']||[]).push(e);});return Object.entries(g);})();
  const comDemo=(lib||[]).filter(e=>e.video_path||e.video_url).length;
  return(<div>
    <input ref={fileRef} type="file" accept="video/*,image/gif" style={{display:'none'}}
      onChange={ev=>{const f=ev.target.files&&ev.target.files[0];if(f)enviarArquivo(f);}}/>
    <div className="abar"><div><div className="breadcrumb" onClick={onBack}>← Treino</div>
      <div className="ph-title">Biblioteca de exercícios</div>
      <div className="ph-sub">{(lib||[]).length} exercícios · {comDemo} com demonstração</div></div></div>
    <div className="alert alert-info">
      Os exercícios da base já vêm com demonstração ilustrada, que toca dentro do app, sem anúncio.
      Para gravar a sua: toque em <b>Enviar vídeo</b> e escolha da <b>galeria</b> ou grave na hora —
      5 a 15 segundos, celular na horizontal. O vídeo do treinador substitui a ilustração para os alunos dele.</div>
    {msg&&<div className={`alert ${msg.t==='err'?'alert-danger':'alert-success'}`}>{msg.m}</div>}
    <div className="dash-panel" style={{marginBottom:16}}><h4>Adicionar exercício</h4>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
        <div className="fg" style={{margin:0,flex:1,minWidth:150}}><label className="flbl">Nome</label><input className="fi" value={nf.nome} onChange={e=>setNf(p=>({...p,nome:e.target.value}))} placeholder="Ex.: Cadeira Extensora"/></div>
        <div className="fg" style={{margin:0}}><label className="flbl">Grupo</label><select className="fi" style={{width:150}} value={nf.grupo_muscular} onChange={e=>setNf(p=>({...p,grupo_muscular:e.target.value}))}>{TRAIN_GRUPOS.map(g=><option key={g}>{g}</option>)}</select></div>
        <div className="fg" style={{margin:0,flex:1,minWidth:150}}><label className="flbl">Vídeo (link, opcional)</label><input className="fi" value={nf.video_url} onChange={e=>setNf(p=>({...p,video_url:e.target.value}))} placeholder="https://youtube.com/..."/></div>
        <button className="btn btn-primary" disabled={!(nf.nome||'').trim()} onClick={add}>Adicionar</button>
      </div>
    </div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:14}}>
      <div className="search-wrap" style={{margin:0}}><span className="search-icon"><IconBusca/></span>
        <input className="fi" placeholder="Buscar exercício..." value={q} onChange={e=>setQ(e.target.value)}/></div>
      <select className="fi" style={{width:'auto',minWidth:160}} value={grupoFiltro} onChange={e=>setGrupoFiltro(e.target.value)}>
        {gruposDisponiveis.map(g=><option key={g} value={g}>{g==='Todos'?'Todos os grupos':g}</option>)}
      </select>
      <span style={{fontSize:12.5,color:'var(--text3)'}}>{list.length} exercício{list.length===1?'':'s'}</span>
    </div>
    {lib===null?<div className="center-screen"><div className="spinner"/></div>:
     groups.map(([g,items])=>(<div key={g} style={{marginBottom:14}}>
       <div style={{fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:1,color:'var(--text3)',marginBottom:8}}>{g}</div>
       {items.map(e=>{const temDemo=!!(e.video_path||e.video_url||e.dicas);const meu=e.coach_id===coach.id;return(
         <div key={e.id} style={{border:'1px solid var(--border)',borderRadius:10,marginBottom:6,background:'var(--bg2)',overflow:'hidden'}}>
           <div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',flexWrap:'wrap'}}>
             <span style={{flex:1,minWidth:130,fontWeight:600}}>{e.nome}
               <span style={{marginLeft:7,fontSize:11,fontWeight:700,color:temDemo?'#2f8f4e':'var(--text3)'}}>
                 {e.video_path?'vídeo próprio':e.video_url?'demonstração':e.dicas?'como fazer':'sem demo'}</span></span>
             {temDemo&&<button className="btn btn-ghost btn-sm" onClick={()=>setVerDemo(v=>v===e.id?null:e.id)}>
               {verDemo===e.id?'Fechar':'Ver'}</button>}
             <button className="btn btn-primary btn-sm" disabled={subindo===e.id} onClick={()=>escolherArquivo(e)}>
               {subindo===e.id?'Enviando…':(e.video_path?'Trocar vídeo':'Enviar vídeo')}</button>
             <button className="btn btn-secondary btn-sm" onClick={()=>setVideo(e)}>{e.video_url?'Trocar link':'Link'}</button>
             {temDemo&&meu&&<button className="btn btn-ghost btn-sm" onClick={()=>removerVideo(e)}>Remover demo</button>}
             {meu&&<button className="btn-icon btn-sm" title="Excluir exercício" onClick={()=>del(e)}>×</button>}
           </div>
           {verDemo===e.id&&<div style={{padding:'0 12px 12px',maxWidth:420}}>
             <ExDemo url={e.video_url} path={e.video_path} name={e.nome} dicas={e.dicas}/></div>}
         </div>);})}
     </div>))}
  </div>);
}

/* ── Modelos de ficha ───────────────────────────────────────
   Os que já vêm no app (coach_id null) e os que o treinador salvou.
   Aplicar um modelo cria as divisões e a prescrição inteira de uma vez. */
// Copiar a ficha de um aluno para outro. Ja dava para fazer em tres passos
// (salvar como modelo -> abrir fichas prontas -> aplicar), mas no dia a dia o
// treinador so quer dar ao aluno novo o mesmo que montou para outro.
function CopiarDeAlunoPicker({alvo,onUsar,onClose,busy}){
  const [linhas,setLinhas]=useState(null);
  const [busca,setBusca]=useState('');
  useEffect(()=>{(async()=>{
    try{
      const {data}=await sb.from('train_divisao').select('student_id,nome,ordem').order('ordem');
      const porAluno=new Map();
      (data||[]).forEach(d=>{
        if(!porAluno.has(d.student_id))porAluno.set(d.student_id,[]);
        porAluno.get(d.student_id).push(d.nome);
      });
      const ids=[...porAluno.keys()].filter(id=>id!==(alvo&&alvo.id));
      if(!ids.length){setLinhas([]);return;}
      const {data:als}=await sb.from('assess_students').select('id,name').in('id',ids);
      setLinhas((als||[]).map(a=>({id:a.id,nome:a.name,divs:porAluno.get(a.id)||[]}))
        .sort((x,y)=>x.nome.localeCompare(y.nome)));
    }catch(e){setLinhas([]);}
  })();},[alvo&&alvo.id]);
  const vis=(linhas||[]).filter(l=>{
    const q=busca.trim().toLowerCase();
    return !q||l.nome.toLowerCase().includes(q)||l.divs.join(' ').toLowerCase().includes(q);
  });
  return(<div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.8)',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:16,overflowY:'auto'}} onClick={()=>!busy&&onClose()}>
    <div className="card" style={{maxWidth:560,width:'100%',margin:'auto'}} onClick={e=>e.stopPropagation()}>
      <div style={{fontFamily:'var(--serif)',fontSize:19,fontWeight:600}}>Copiar de outro aluno</div>
      <p className="s-meta" style={{margin:'4px 0 12px'}}>
        As divisões entram depois das que {alvo?alvo.name.split(' ')[0]:'o aluno'} já tem — nada é sobrescrito.
        As cargas não vão junto: cada um registra a sua.</p>
      <div className="search-wrap" style={{marginBottom:12}}><span className="search-icon"><IconBusca/></span>
        <input className="fi" placeholder="Buscar aluno ou divisão..." value={busca} onChange={e=>setBusca(e.target.value)}/></div>
      {linhas===null?<div className="center-screen" style={{minHeight:90}}><div className="spinner"/></div>:
       vis.length===0?<p className="s-meta">{(linhas||[]).length?'Nenhum aluno com esse filtro.':'Nenhum outro aluno tem ficha montada ainda.'}</p>:
       vis.map(l=>(<div key={l.id} className="dash-panel" style={{marginBottom:10,display:'flex',gap:10,alignItems:'center'}}>
         <div style={{flex:1,minWidth:0}}>
           <div className="s-name">{l.nome}</div>
           <div className="s-meta" style={{marginTop:3,lineHeight:1.5}}>
             {plural(l.divs.length,'divisão','divisões')} · {l.divs.join(' · ')}</div>
         </div>
         <button className="btn btn-primary btn-sm" disabled={busy} onClick={()=>onUsar(l)}>Copiar</button>
       </div>))}
      <button className="btn btn-ghost btn-sm" style={{marginTop:6}} disabled={busy} onClick={onClose}>Fechar</button>
    </div>
  </div>);
}

function FichaModeloPicker({onUsar,onClose,busy}){
  const [mods,setMods]=useState(null);
  const [aberto,setAberto]=useState(null);
  const [obj,setObj]=useState('Todos');
  const [freq,setFreq]=useState('Todas');
  const [busca,setBusca]=useState('');
  useEffect(()=>{sb.from('train_ficha_modelo').select('*')
    .then(({data})=>setMods(data||[])).catch(()=>setMods([]));},[]);
  const lista=(mods||[]).slice().sort((a,b)=>
    (a.coach_id?0:1)-(b.coach_id?0:1) || (a.dias||0)-(b.dias||0) || a.nome.localeCompare(b.nome));
  const objetivos=['Todos',...[...new Set(lista.map(m=>m.objetivo).filter(Boolean))]];
  // A frequência semanal mora no NOME, não no campo dias: o Arnold Split tem
  // três divisões e é feito 6x por semana. Filtrar por dias enganaria.
  const freqDe=m=>{const x=/(\d)x por semana/.exec(m.nome||'');return x?x[1]+'x':null;};
  const freqs=['Todas',...[...new Set(lista.map(freqDe).filter(Boolean))].sort()];
  // a busca também acha pelo nome do exercício: "elástico", "hip thrust", "cadeira"
  const casa=(m,q)=>{
    if(!q)return true;
    const alvo=[m.nome,m.objetivo,m.nivel,m.resumo,
      ...(m.divisoes||[]).map(d=>d.nome),
      ...(m.divisoes||[]).flatMap(d=>(d.exercicios||[]).map(e=>e.nome))].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(t=>alvo.includes(t));
  };
  const vis=lista.filter(m=>(obj==='Todos'||m.objetivo===obj)
    &&(freq==='Todas'||freqDe(m)===freq)&&casa(m,busca));
  const apagar=async(ev,m)=>{ev.stopPropagation();
    if(!confirm('Apagar o modelo "'+m.nome+'"? As fichas já montadas não mudam.'))return;
    setMods(p=>p.filter(x=>x.id!==m.id));
    // se o servidor recusar, o modelo volta para a lista em vez de "sumir"
    if(!(await gravarAvisando(sb.from('train_ficha_modelo').delete().eq('id',m.id),'O modelo')))
      setMods(p=>[...p,m].sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR')));};
  const contaEx=m=>(m.divisoes||[]).reduce((a,d)=>a+((d.exercicios||[]).length),0);
  return(<div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.8)',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:16,overflow:'auto'}} onClick={onClose}>
    <div className="card" style={{maxWidth:660,width:'100%',margin:'auto'}} onClick={e=>e.stopPropagation()}>
      <div style={{fontFamily:'var(--serif)',fontSize:19,fontWeight:600}}>Fichas prontas</div>
      <p className="s-meta" style={{margin:'4px 0 12px'}}>{(mods||[]).length} fichas montadas — cria as divisões com séries, repetições e descanso já preenchidos. Depois é só ajustar o que quiser.</p>
      {objetivos.length>2&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
        {objetivos.map(o=>(<button key={o} type="button" className={'btn btn-sm '+(obj===o?'btn-primary':'btn-ghost')} onClick={()=>setObj(o)}>{o}</button>))}
      </div>}
      {freqs.length>2&&<div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',marginBottom:10}}>
        <span className="s-meta" style={{fontSize:11.5,marginRight:2}}>Dias por semana:</span>
        {freqs.map(f=>(<button key={f} type="button" className={'btn btn-sm '+(freq===f?'btn-primary':'btn-ghost')} onClick={()=>setFreq(f)}>{f}</button>))}
      </div>}
      <div className="search-wrap" style={{marginBottom:12}}><span className="search-icon"><IconBusca/></span>
        <input className="fi" placeholder="Buscar por nome, objetivo ou exercício..." value={busca} onChange={e=>setBusca(e.target.value)}/></div>
      {mods===null?<div className="center-screen" style={{minHeight:90}}><div className="spinner"/></div>:
       vis.length===0?<p className="s-meta">Nenhuma ficha com esse filtro.</p>:
       vis.map(m=>{const open=aberto===m.id;
        return(<div key={m.id} className="dash-panel" style={{marginBottom:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div className="s-name">{m.nome}</div>
              <div className="s-meta" style={{marginTop:4,lineHeight:1.5}}>{m.resumo}</div>
              <div style={{marginTop:8,fontSize:11.5,color:'var(--text3)'}}>
                {(m.divisoes||[]).length} {(m.divisoes||[]).length===1?'divisão':'divisões'} · {contaEx(m)} {contaEx(m)===1?'exercício':'exercícios'}
                {m.nivel?' · '+m.nivel:''}{m.coach_id?' · modelo seu':''}</div>
            </div>
            {m.coach_id&&<button className="btn-icon btn-sm" title="Apagar modelo" onClick={ev=>apagar(ev,m)}>×</button>}
          </div>
          <div className="bgroup" style={{marginTop:10}}>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={()=>onUsar(m)}>{busy?'Aplicando…':'Usar esta ficha'}</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setAberto(open?null:m.id)}>{open?'Fechar':'Ver exercícios'}</button>
          </div>
          {open&&<div style={{marginTop:10}}>
            {(m.divisoes||[]).map((d,i)=>(<div key={i} style={{marginTop:8}}>
              <div style={{fontWeight:600,fontSize:13}}>{d.nome}</div>
              <table className="rpt-tbl" style={{width:'100%'}}><tbody>
                {(d.exercicios||[]).map((e,j)=>(<tr key={j}>
                  <td>{e.nome}</td>
                  <td style={{whiteSpace:'nowrap'}}>{e.qtd_series}×{e.faixa_reps}</td>
                  <td style={{whiteSpace:'nowrap',color:'var(--text3)'}}>{e.intervalo_seg_min?e.intervalo_seg_min+'s':'—'}</td>
                </tr>))}
              </tbody></table>
            </div>))}
          </div>}
        </div>);})}
      <button className="btn btn-ghost" style={{width:'100%',marginTop:8}} onClick={onClose}>Fechar</button>
    </div></div>);
}

/* Quem está esperando resposta. Mensagem de aluno sem resposta é a coisa que
   mais rápido faz ele voltar para o WhatsApp — então tem lugar próprio. */
function RecadosScreen({naoLidas,students,onAbrir,onBack}){
  const byId=Object.fromEntries((students||[]).map(s=>[s.id,s]));
  return(<div>
    <div className="abar"><div><div className="breadcrumb" onClick={onBack}>← Painel</div>
      <div className="ph-title">Recados</div>
      <div className="ph-sub">Alunos esperando sua resposta</div></div></div>
    {(!naoLidas||naoLidas.length===0)?<div className="empty">
      <div className="empty-title">Ninguém esperando</div>
      <p style={{fontSize:13}}>Quando um aluno escrever, ele aparece aqui — e você recebe no celular.</p>
    </div>:
    <div className="card">
      {naoLidas.map(n=>(
        <div key={n.student_id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 0',
          borderBottom:'1px solid var(--border)',cursor:byId[n.student_id]?'pointer':'default'}}
          onClick={()=>{const s=byId[n.student_id];if(s&&onAbrir)onAbrir(s);}}>
          <div className="avatar" style={{width:38,height:38,fontSize:13}}>{initials(n.nome||'?')}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:14}}>{n.nome||'Aluno'}</div>
            <div className="s-meta">{n.quantas} {n.quantas>1?'mensagens':'mensagem'} sem resposta · {tempoRel(n.ultima)}</div>
          </div>
          <span className="info-pill" style={{margin:0,borderColor:'rgba(185,28,28,.4)',color:'#fca5a5'}}>{n.quantas}</span>
        </div>))}
      <p className="s-meta" style={{marginTop:12}}>Toque no aluno para abrir a ficha dele e responder.</p>
    </div>}
  </div>);
}

/* Treinador sem nenhum aluno caía numa busca sobre o vazio: Treino e
   Periodização não diziam nada abaixo do campo, e a Nutrição dizia "nenhum
   aluno encontrado", que é a frase de uma busca que falhou, não a de uma conta
   que ainda não começou. Quem abre o app no primeiro dia precisa da mesma
   coisa nas três: o que falta e o botão que resolve. */
function SemAlunos({oque,onNovo}){
  return(<div className="empty">
    <div className="empty-title">Nenhum aluno cadastrado ainda</div>
    <p style={{fontSize:13,maxWidth:420,margin:'6px auto 0'}}>
      {oque} Cadastre o primeiro aluno e ele aparece aqui.</p>
    {onNovo&&<button className="btn btn-primary" style={{marginTop:14}} onClick={onNovo}>+ Novo aluno</button>}
  </div>);
}

/* ── Mensalidades: todo mundo numa tela ──
   O card de financeiro existia dentro da ficha de cada aluno, no fim de uma
   rolagem de 2,7 telas no celular. Para acertar 22 alunos eram 22 idas até o
   fundo — e o banco mostra o resultado disso: ZERO mensalidades cadastradas,
   nunca. Não era falta de vontade, era o caminho.
   Aqui é uma tela só: o valor, o dia e o pago de cada um, e no topo o número
   que faz valer a pena manter isso em dia — quanto entra no mês, quanto já
   caiu e quanto está em aberto. */
function MensalidadesScreen({students,demo,onBack,onSelect,onNovoAluno}){
  const comp=todayStr().slice(0,7);
  const [linhas,setLinhas]=useState(demo?{}:undefined);   // {student_id:{valor,dia,pago}}
  const [erro,setErro]=useState(null);
  const [salvando,setSalvando]=useState(null);
  useEffect(()=>{if(demo)return;(async()=>{
    try{
      const [{data:mm,error:e1},{data:pp,error:e2}]=await Promise.all([
        comPrazo(sb.from('train_mensalidade').select('student_id,valor,dia_venc')),
        comPrazo(sb.from('train_pagamento').select('student_id,pago').eq('competencia',comp)),
      ]);
      if(e1)throw e1;if(e2)throw e2;
      const m={};(mm||[]).forEach(r=>{m[r.student_id]={valor:r.valor??'',dia:r.dia_venc??'',pago:false};});
      (pp||[]).forEach(r=>{m[r.student_id]={...(m[r.student_id]||{valor:'',dia:''}),pago:!!r.pago};});
      setLinhas(m);
    }catch(e){setErro(isNetErr(e)?'A internet falhou ao carregar.':'Não consegui carregar: '+((e&&e.message)||e));setLinhas({});}
  })();},[]);
  const de=id=>(linhas&&linhas[id])||{valor:'',dia:'',pago:false};
  const mexer=(id,campo,v)=>setLinhas(l=>({...l,[id]:{...de(id),[campo]:v}}));
  /* Grava ao sair do campo, não a cada tecla: digitar "250" mandaria 2, 25 e
     250 para o servidor. E confere o erro — dinheiro é o último lugar do app
     onde a tela pode afirmar o que não gravou. */
  const gravarLinha=async(id)=>{
    if(demo)return;
    const r=de(id);setSalvando(id);setErro(null);
    try{await gravar(sb.rpc('mensalidade_salvar',
      {p_student:id,p_valor:r.valor===''?null:num(r.valor),p_dia:r.dia?parseInt(r.dia):null}));}
    catch(e){setErro(porQueFalhou(e));}
    setSalvando(null);
  };
  const marcarPago=async(id)=>{
    const nv=!de(id).pago;mexer(id,'pago',nv);setErro(null);
    if(demo)return;
    try{await gravar(sb.rpc('pagamento_marcar',{p_student:id,p_competencia:comp,p_pago:nv}));}
    catch(e){mexer(id,'pago',!nv);setErro(porQueFalhou(e));}
  };
  const lista=(students||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  const soma=lista.reduce((a,s)=>{const r=de(s.id);const v=num(r.valor)||0;
    return {previsto:a.previsto+v,recebido:a.recebido+(r.pago?v:0),comValor:a.comValor+(v?1:0)};},
    {previsto:0,recebido:0,comValor:0});
  const reais=v=>'R$ '+(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const mesLbl=maiusculaInicial(new Date(comp+'-01T00:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}));
  return(<div>
    <div className="abar"><div>
      <div className="breadcrumb" onClick={onBack}>← Dashboard</div>
      <div className="ph-title">Mensalidades</div>
      <div className="ph-sub">{mesLbl} · o valor de cada aluno e quem já pagou</div></div>
    </div>
    {erro&&<div className="alert alert-danger">{erro}</div>}
    {linhas===undefined?<div className="center-screen"><div className="spinner"/></div>
     :!lista.length?<SemAlunos oque="A mensalidade é sempre de alguém." onNovo={onNovoAluno}/>:<>
      <div className="dash-panel" style={{marginBottom:16,display:'flex',gap:22,flexWrap:'wrap'}}>
        <div><div style={{fontSize:24,fontWeight:800}}>{reais(soma.previsto)}</div>
          <div className="s-meta" style={{margin:0}}>previsto no mês</div></div>
        <div><div style={{fontSize:24,fontWeight:800,color:'var(--green)'}}>{reais(soma.recebido)}</div>
          <div className="s-meta" style={{margin:0}}>já recebido</div></div>
        <div><div style={{fontSize:24,fontWeight:800,color:soma.previsto-soma.recebido>0?'var(--gold)':'var(--text3)'}}>
          {reais(soma.previsto-soma.recebido)}</div>
          <div className="s-meta" style={{margin:0}}>em aberto</div></div>
        <div><div style={{fontSize:24,fontWeight:800}}>{soma.comValor}<span style={{fontSize:15,fontWeight:400,color:'var(--text3)'}}>/{lista.length}</span></div>
          <div className="s-meta" style={{margin:0}}>com valor definido</div></div>
      </div>
      {lista.map(s=>{const r=de(s.id);const temValor=num(r.valor)>0;
        const hojeDia=new Date().getDate();
        const atrasado=temValor&&!r.pago&&r.dia&&parseInt(r.dia)<hojeDia;
        return(
        <div key={s.id} className="dash-panel" style={{marginBottom:8,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
          <div className="avatar" style={{width:36,height:36,fontSize:13}}>{initials(s.name)}</div>
          <div style={{flex:'1 1 150px',minWidth:0,cursor:onSelect?'pointer':'default'}}
            onClick={()=>onSelect&&onSelect(s)}>
            <div style={{fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
            {atrasado&&<div className="s-meta" style={{margin:0,color:'var(--gold)'}}>venceu dia {r.dia}</div>}
          </div>
          <input className="fi" type="number" inputMode="decimal" style={{width:104}} placeholder="R$"
            value={r.valor} onChange={e=>mexer(s.id,'valor',e.target.value)} onBlur={()=>gravarLinha(s.id)}/>
          <input className="fi" type="number" min="1" max="31" style={{width:74}} placeholder="dia"
            value={r.dia} onChange={e=>mexer(s.id,'dia',e.target.value)} onBlur={()=>gravarLinha(s.id)}/>
          <button className={'btn btn-sm '+(r.pago?'btn-primary':'btn-ghost')}
            disabled={!temValor||salvando===s.id} onClick={()=>marcarPago(s.id)}>
            {r.pago?'✓ Pago':'Marcar pago'}</button>
        </div>);})}
      <p className="s-meta" style={{marginTop:14}}>
        O valor e o dia ficam salvos quando você sai do campo. O “pago” vale só para este mês:
        no mês que vem a lista recomeça em aberto, com os mesmos valores.
      </p>
     </>}
  </div>);
}

/* ── O mês do treinador: os alunos todos numa tela ──
   O painel do dia diz o que está pegando fogo hoje. O que faltava era a
   pergunta do fim do mês: quem treinou, quem caiu e quem sumiu. Sem isso, o
   aluno que parou de aparecer só é notado quando cancela.
   Uma consulta só (o histórico do mês e do anterior; a RLS já limita ao coach)
   e a lista sai ordenada por quem precisa de um contato hoje. */
function MesScreen({students,onBack,onSelect,onNovoAluno,demo}){
  const hoje=new Date();
  const [ref,setRef]=useState({a:hoje.getFullYear(),m:hoje.getMonth()});
  const [hist,setHist]=useState(demo?[]:undefined);
  const [comFicha,setComFicha]=useState(demo?new Set():null);
  const [erro,setErro]=useState(false);

  const chave=(a,m)=>a+'-'+String(m+1).padStart(2,'0');
  const mesAtual=chave(ref.a,ref.m);
  const ant=ref.m===0?{a:ref.a-1,m:11}:{a:ref.a,m:ref.m-1};
  const mesAnterior=chave(ant.a,ant.m);
  const eOMesCorrente=ref.a===hoje.getFullYear()&&ref.m===hoje.getMonth();

  useEffect(()=>{if(demo)return;(async()=>{
    setHist(undefined);setErro(false);
    const de=mesAnterior+'-01';
    const ate=chave(ref.m===11?ref.a+1:ref.a,ref.m===11?0:ref.m+1)+'-01';
    try{
      const [h,d]=await Promise.all([
        sb.from('train_historico').select('student_id,data_treino,carga,reps,is_pr')
          .gte('data_treino',de).lt('data_treino',ate),
        sb.from('train_divisao').select('student_id'),
      ]);
      if(h.error)throw h.error;
      setHist(h.data||[]);
      setComFicha(new Set((d.data||[]).map(x=>x.student_id)));
    }catch(e){setErro(true);setHist([]);setComFicha(new Set());}
  })();},[mesAtual,demo]);

  const linhas=React.useMemo(()=>{
    const porAluno={};
    const zero=()=>({treinos:new Set(),ton:0,prs:0});
    (hist||[]).forEach(h=>{
      const q=(h.data_treino||'').slice(0,7);
      const alvo=q===mesAtual?'agora':q===mesAnterior?'antes':null;
      if(!alvo)return;
      const r=porAluno[h.student_id]||(porAluno[h.student_id]={agora:zero(),antes:zero(),ultimo:null});
      r[alvo].treinos.add(h.data_treino);
      r[alvo].ton+=(num(h.carga)||0)*(num(h.reps)||0);
      if(h.is_pr)r[alvo].prs++;
      if(!r.ultimo||h.data_treino>r.ultimo)r.ultimo=h.data_treino;
    });
    return (students||[]).map(s=>{
      const r=porAluno[s.id]||{agora:zero(),antes:zero(),ultimo:null};
      const n=r.agora.treinos.size, nAntes=r.antes.treinos.size;
      const temFicha=comFicha?comFicha.has(s.id):true;
      // a ordem é a da urgência de um contato, não a do número
      let grupo;
      if(!temFicha)grupo='semficha';
      else if(n===0)grupo='sumiu';
      else if(nAntes>0&&n<nAntes)grupo='caiu';
      else grupo='firme';
      return{s,n,nAntes,ton:r.agora.ton,prs:r.agora.prs,ultimo:r.ultimo,temFicha,grupo};
    });
  },[hist,students,comFicha,mesAtual,mesAnterior]);

  const G=[['semficha','Sem ficha','Abrem o app e não veem treino nenhum.'],
    ['sumiu','Não treinaram no mês','Um contato hoje costuma resolver — depois vira cancelamento.'],
    ['caiu','Treinaram menos que no mês passado','Queda de ritmo antes de sumir de vez.'],
    ['firme','Mantiveram ou subiram','']];
  const grupos=G.map(([k,t,d])=>[k,t,d,linhas.filter(l=>l.grupo===k)
    .sort((a,b)=>(b.n-a.n)||a.s.name.localeCompare(b.s.name))]).filter(g=>g[3].length);

  const tot=linhas.reduce((a,l)=>({treinaram:a.treinaram+(l.n>0?1:0),treinos:a.treinos+l.n,
    ton:a.ton+l.ton,prs:a.prs+l.prs}),{treinaram:0,treinos:0,ton:0,prs:0});

  const mover=d=>{const m=ref.m+d;setRef(m<0?{a:ref.a-1,m:11}:m>11?{a:ref.a+1,m:0}:{a:ref.a,m});};
  const naFrente=eOMesCorrente;

  return(<div>
    <div className="abar"><div><div className="breadcrumb" onClick={onBack}>← Painel</div>
      <div className="ph-title">{MESES[ref.m]} de {ref.a}</div>
      <div className="ph-sub">Quem treinou, quem caiu e quem sumiu — os {plural((students||[]).length,'aluno')} numa tela</div></div>
      <div style={{display:'flex',gap:8}}>
        <button className="btn btn-ghost btn-sm" onClick={()=>mover(-1)}>‹ Mês anterior</button>
        <button className="btn btn-ghost btn-sm" disabled={naFrente} onClick={()=>mover(1)}>Próximo mês ›</button>
      </div></div>

    {erro&&<div className="alert alert-danger" style={{marginBottom:14}}>
      Não consegui carregar o histórico. Confira a internet e abra de novo.</div>}

    {hist===undefined?<div className="center-screen" style={{minHeight:200}}><div className="spinner"/></div>
     /* "0 de 0 alunos treinaram" é conta feita em cima do vazio */
     :!(students||[]).length?<SemAlunos oque="O mês é o resumo do que seus alunos fizeram." onNovo={onNovoAluno}/>:<>
      <div className="dash-panel" style={{marginBottom:16}}>
        <div style={{display:'flex',gap:18,flexWrap:'wrap'}}>
          {[[tot.treinaram+' de '+(students||[]).length,'alunos treinaram'],
            [tot.treinos,rotuloN(tot.treinos,'treino')],
            [fmtTon(tot.ton),'movidos'],
            [tot.prs,rotuloN(tot.prs,'recorde')]].map(([v,l],i)=>(
            <div key={i} style={{minWidth:110}}>
              <div style={{fontSize:24,fontWeight:800}}>{v}</div>
              <div className="s-meta" style={{margin:0}}>{l}</div></div>))}
        </div>
        {equivalePeso(tot.ton)&&<div className="s-meta" style={{marginTop:10,marginBottom:0}}>
          Mais ou menos o peso de {equivalePeso(tot.ton)}, somando todo mundo.</div>}
      </div>

      {!grupos.length&&<div className="empty"><div className="empty-title">Nenhum aluno cadastrado</div></div>}

      {grupos.map(([k,titulo,ajuda,lista])=>(
        <div key={k} style={{marginBottom:18}}>
          <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:8}}>
            <h4 style={{margin:0}}>{titulo}</h4>
            <span className="s-meta" style={{margin:0}}>{lista.length}</span>
          </div>
          {ajuda&&<div className="s-meta" style={{marginTop:0,marginBottom:8}}>{ajuda}</div>}
          {lista.map(l=>(
            <div key={l.s.id} className="dash-panel"
              style={{marginBottom:8,display:'flex',gap:12,alignItems:'center',cursor:onSelect?'pointer':'default'}}
              onClick={()=>onSelect&&onSelect(l.s)}>
              <div className="avatar" style={{width:36,height:36,fontSize:13}}>{initials(l.s.name)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600}}>{l.s.name}</div>
                <div className="s-meta" style={{margin:0}}>
                  {!l.temFicha?'sem ficha montada'
                   :l.n===0?(l.ultimo?'último treino em '+fmtDate(l.ultimo):'nenhum treino registrado')
                   :plural(l.n,'treino')+(l.ton?' · '+fmtTon(l.ton):'')
                     +(l.prs?' · '+plural(l.prs,'recorde'):'')}
                </div>
              </div>
              {l.temFicha&&(l.n>0||l.nAntes>0)&&<div style={{textAlign:'right',minWidth:74}}>
                <div style={{fontSize:20,fontWeight:800}}>{l.n}</div>
                <div className="s-meta" style={{margin:0,fontSize:11}}>
                  {/* "estreou" seria afirmar que foi o primeiro mês dele, e a
                      consulta só enxerga dois meses: quem voltou depois de uma
                      pausa longa apareceria como estreante */}
                  {l.nAntes===0?'nada no mês passado'
                   :l.n===l.nAntes?'igual ao mês passado'
                   :(l.n>l.nAntes?'+':'')+(l.n-l.nAntes)+' vs mês passado'}</div>
              </div>}
            </div>))}
        </div>))}
    </>}
  </div>);
}

/* Aluno com conta e sem treino é aluno que abre o app e não vê nada. Esta tela
   junta todos eles numa lista e aplica uma ficha pronta em quantos ele marcar,
   de uma vez. O trabalho pesado é a RPC ficha_aplicar_modelo, que faz tudo
   dentro de uma transação — se a internet cair, ninguém fica com meia ficha. */
function SemTreinoScreen({coach,onBack,onFeito}){
  const [lista,setLista]=useState(null);
  const [marcados,setMarcados]=useState({});
  const [picker,setPicker]=useState(false);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState(null);
  const carregar=async()=>{
    try{const {data,error}=await sb.rpc('alunos_sem_treino');
      if(error)throw error;setLista(data||[]);}
    catch(e){setLista([]);setMsg({t:'err',m:'Não consegui carregar: '+(e.message||e)});}
  };
  useEffect(()=>{carregar();},[]);
  const marcadosIds=Object.keys(marcados).filter(k=>marcados[k]);
  const todos=(lista||[]).length>0&&marcadosIds.length===(lista||[]).length;
  const aplicar=async(m)=>{
    if(!marcadosIds.length){setPicker(false);return;}
    setBusy(true);setMsg(null);
    try{
      const {data,error}=await sb.rpc('ficha_aplicar_modelo',{p_modelo:m.id,p_alunos:marcadosIds});
      if(error)throw error;
      const n=data||0;
      setPicker(false);setMarcados({});
      // n é quantos alunos o servidor realmente atendeu — pode ser menos do que
      // foi marcado, e nesse caso quem está usando precisa saber
      if(!n)throw new Error('o servidor não aplicou a ficha em nenhum dos alunos marcados.');
      const faltou=marcadosIds.length-n;
      setMsg({t:faltou?'err':'ok',m:`Ficha “${m.nome}” aplicada em ${n} aluno${n>1?'s':''}.`
        +(faltou?` ${faltou} não ${faltou>1?'foram atendidos':'foi atendido'} — recarregue a página e tente de novo.`:'')
        +' Abra o treino de cada um para ajustar carga e descanso.'});
      await carregar();
      if(onFeito)onFeito();
    }catch(e){setMsg({t:'err',m:'Não deu para aplicar: '+(e.message||e)});}
    setBusy(false);
  };
  const comConta=(lista||[]).filter(a=>a.tem_conta).length;
  return(<div>
    {picker&&<FichaModeloPicker busy={busy} onUsar={aplicar} onClose={()=>!busy&&setPicker(false)}/>}
    <div className="abar"><div><div className="breadcrumb" onClick={onBack}>← Painel</div>
      <div className="ph-title">Alunos sem treino</div>
      <div className="ph-sub">Marque quem vai receber e escolha uma ficha pronta — vale para todos de uma vez</div></div></div>
    {msg&&<div className={'alert '+(msg.t==='ok'?'alert-ok':'alert-danger')} style={{marginBottom:14}}>{msg.m}</div>}
    {lista===null?<div className="center-screen" style={{minHeight:180}}><div className="spinner"/></div>:
     lista.length===0?<div className="empty">
       <div className="empty-title">Todo mundo com treino montado</div>
       <p style={{fontSize:13}}>Nenhum aluno seu está sem ficha.</p></div>:<>
      <div className="card" style={{marginBottom:14}}>
        <p className="s-meta" style={{marginBottom:0,lineHeight:1.55}}>
          <b>{lista.length} aluno{lista.length>1?'s':''}</b> ainda sem ficha
          {comConta>0&&<> — <b>{comConta}</b> já {comConta>1?'têm':'tem'} conta no app e {comConta>1?'abrem':'abre'} numa tela vazia.</>}
        </p>
      </div>
      <div className="card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:10}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>{
            if(todos)setMarcados({});
            else{const m={};lista.forEach(a=>m[a.id]=true);setMarcados(m);}
          }}>{todos?'Desmarcar todos':'Marcar todos'}</button>
          <span className="s-meta">{marcadosIds.length} marcado{marcadosIds.length===1?'':'s'}</span>
        </div>
        {lista.map(a=>(
          <label key={a.id} style={{display:'flex',alignItems:'center',gap:11,padding:'10px 0',
            borderBottom:'1px solid var(--border)',cursor:'pointer'}}>
            <input type="checkbox" checked={!!marcados[a.id]}
              onChange={e=>setMarcados(p=>({...p,[a.id]:e.target.checked}))}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:14}}>{a.nome||'Sem nome'}</div>
              <div className="s-meta">{a.tem_conta?'Já entrou no app':'Ainda sem conta'}
                {a.dias_desde_cadastro!=null&&` · cadastrado há ${a.dias_desde_cadastro} dia${a.dias_desde_cadastro===1?'':'s'}`}</div>
            </div>
            {a.tem_conta&&<span className="info-pill" style={{margin:0,borderColor:'rgba(234,179,8,.35)',color:'#fde047'}}>esperando ficha</span>}
          </label>))}
        <button className="btn btn-primary" style={{width:'100%',marginTop:14}}
          disabled={!marcadosIds.length||busy} onClick={()=>setPicker(true)}>
          {busy?'Aplicando…':marcadosIds.length?`Escolher ficha para ${marcadosIds.length} aluno${marcadosIds.length>1?'s':''}`:'Marque pelo menos um aluno'}</button>
        <p className="s-meta" style={{marginTop:8,lineHeight:1.5}}>
          A ficha entra igual para todos os marcados. Depois é só abrir o treino de cada um e
          ajustar o que for específico — carga, descanso ou trocar um exercício.</p>
      </div>
    </>}
  </div>);
}

/* Ficha em papel. Nem todo aluno tem celular bom, e tem quem simplesmente
   prefira a folha presa na prancheta. Imprime a ficha inteira com espaço para
   anotar a carga de cada semana. */
function FichaImpressa({coach,stu,divs,onFechar}){
  const [tudo,setTudo]=useState(null);
  useEffect(()=>{(async()=>{
    const out=[];
    for(const d of divs||[]){
      const {data}=await sb.from('train_serie_prescrita').select('*').eq('divisao_id',d.id).order('ordem');
      out.push({...d,series:data||[]});
    }
    setTudo(out);
  })().catch(()=>setTudo([]));},[]);
  const marca=(coach&&(coach.brand_name||coach.name))||'MF Performance';
  return(<div>
    <div className="abar no-print"><div>
      <div className="breadcrumb" onClick={onFechar}>← Ficha</div>
      <div className="ph-title">Ficha para imprimir</div>
      <div className="ph-sub">Sai com colunas em branco para anotar a carga de cada semana</div></div>
      <button className="btn btn-primary" onClick={()=>window.print()}>Imprimir / PDF</button>
    </div>
    {tudo===null?<div className="center-screen" style={{minHeight:200}}><div className="spinner"/></div>:
    <div className="rpt-page">
      <div className="rpt-body">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',
          borderBottom:'2px solid #1c1a17',paddingBottom:8,marginBottom:16}}>
          <div>
            <div style={{fontFamily:'var(--serif)',fontSize:22,fontWeight:700}}>{stu.name}</div>
            <div style={{fontSize:11.5,color:'#6b665e'}}>Ficha de treino{stu.goal?' · '+stu.goal:''}</div>
          </div>
          <div style={{textAlign:'right',fontSize:11.5,color:'#6b665e'}}>
            <div style={{fontWeight:700,color:'#1c1a17'}}>{marca}</div>
            {coach&&coach.cref&&<div>CREF {coach.cref}</div>}
            <div>{new Date().toLocaleDateString('pt-BR')}</div>
          </div>
        </div>
        {tudo.length===0?<p className="s-meta">Este aluno ainda não tem divisão montada.</p>:
         tudo.map(d=>(<div key={d.id} className="rpt-sec" style={{marginBottom:18}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
            <div style={{fontWeight:700,fontSize:14}}>{d.nome||'Divisão'}</div>
            {(d.dias_semana||[]).length>0&&<div style={{fontSize:11,color:'#6b665e'}}>{listaDias(d.dias_semana)}</div>}
          </div>
          <table className="rpt-tbl" style={{width:'100%',fontSize:11}}>
            <thead><tr>
              <th style={{textAlign:'left'}}>Exercício</th>
              <th>Séries × reps</th><th>Descanso</th>
              <th className="sem" style={{width:'11%'}}>Sem 1</th><th className="sem" style={{width:'11%'}}>Sem 2</th>
              <th className="sem" style={{width:'11%'}}>Sem 3</th><th className="sem" style={{width:'11%'}}>Sem 4</th>
            </tr></thead>
            <tbody>
              {d.series.length===0
                ? <tr><td colSpan={7} style={{color:'#6b665e'}}>Sem exercício nesta divisão.</td></tr>
                : d.series.map(s=>{const iv=s.intervalo_seg_min||60;
                  return(<tr key={s.id}>
                    <td style={{fontWeight:600}}>{s.exercicio_nome}
                      {s.tipo_serie&&s.tipo_serie!=='Valida'&&
                        <span style={{fontWeight:400,color:'#6b665e'}}> ({s.tipo_serie==='Preparatoria'?'preparatória':s.tipo_serie.toLowerCase()})</span>}</td>
                    <td style={{textAlign:'center',whiteSpace:'nowrap'}}>{s.qtd_series}×{s.faixa_reps}</td>
                    <td style={{textAlign:'center',whiteSpace:'nowrap'}}>{Math.floor(iv/60)}:{String(iv%60).padStart(2,'0')}</td>
                    <td className="sem"/><td className="sem"/><td className="sem"/><td className="sem"/>
                  </tr>);})}
            </tbody>
          </table>
        </div>))}
        <div style={{marginTop:20,fontSize:10.5,color:'#6b665e',borderTop:'1px solid #ece7de',paddingTop:8}}>
          Anote a carga usada em cada semana. Dor, formigamento ou falta de ar: pare e avise o treinador.
        </div>
      </div>
    </div>}
  </div>);
}

function TrainScreen({coach,students,preStudent,onBack,onNovoAluno}){
  const demo=!!coach._demo;
  const [stu,setStu]=useState(preStudent||null);
  const [showLib,setShowLib]=useState(false);
  const [imprimir,setImprimir]=useState(false);   // ficha em papel
  const [q,setQ]=useState('');
  const [lib,setLib]=useState([]);
  const [divs,setDivs]=useState(null);
  const [series,setSeries]=useState({});   // divisaoId -> [serie]
  const [quantos,setQuantos]=useState({}); // divisaoId -> nº de exercícios, sem abrir
  const [openId,setOpenId]=useState(null);
  const [nd,setNd]=useState('');
  const [novaDiv,setNovaDiv]=useState(false);
  const [msg,setMsg]=useState(null);
  const blankEx={nome:'',grupo:'Todos',tipo_serie:'Valida',qtd_series:3,faixa_reps:'8-12',intervalo_seg_min:60};
  const [verEx,setVerEx]=useState(null);
  const [ex,setEx]=useState(blankEx);
  const [showMod,setShowMod]=useState(false);
  const [busyMod,setBusyMod]=useState(false);
  const [showCopia,setShowCopia]=useState(false);
  const libGrupos=['Todos',...[...new Set((lib||[]).map(x=>x.grupo_muscular).filter(Boolean))].sort()];
  const libFiltered=(lib||[]).filter(x=>ex.grupo==='Todos'||x.grupo_muscular===ex.grupo);
  const exSelecionado=(lib||[]).find(x=>x.nome.toLowerCase()===(ex.nome||'').trim().toLowerCase())||null;

  useEffect(()=>{(async()=>{
    if(demo){setLib([{id:'x1',nome:'Agachamento Livre'},{id:'x2',nome:'Leg Press'},{id:'x3',nome:'Cadeira Extensora'},{id:'x4',nome:'Stiff'}]);return;}
    const {data}=await lerCopia('lib-completa',
      sb.from('train_exercicios').select('*').order('grupo_muscular').order('nome'));
    setLib([...(data||[])].sort((a,b)=>(a.nome||'').localeCompare(b.nome||'')));
  })();},[]);
  const loadDivs=async s=>{if(demo){setDivs([]);setQuantos({});return;}
    const {data,error}=await lerCopia('divs-'+s.id,sb.from('train_divisao').select('*').eq('student_id',s.id).order('ordem'));
    if(error){setMsg({t:'err',m:'Erro: '+error.message});setDivs([]);return;}setDivs(data||[]);
    // Quantos exercícios cada divisão tem, ANTES de abrir. Antes disso o
    // treinador tinha de abrir uma por uma só para descobrir onde mexer — e a
    // divisão vazia, que é a que o aluno abre e não acha nada, não aparecia.
    if((data||[]).length){
      const {data:pres}=await lerCopia('pres-conta-'+s.id,
        sb.from('train_serie_prescrita').select('divisao_id').in('divisao_id',data.map(d=>d.id)));
      const c={};(data||[]).forEach(d=>{c[d.id]=0;});
      (pres||[]).forEach(p=>{c[p.divisao_id]=(c[p.divisao_id]||0)+1;});
      setQuantos(c);
    }else setQuantos({});
  };
  useEffect(()=>{if(stu)loadDivs(stu);else setDivs(null);},[stu&&stu.id]);
  const loadSeries=async id=>{if(demo)return;
    const {data}=await lerCopia('series-'+id,sb.from('train_serie_prescrita').select('*').eq('divisao_id',id).order('ordem'));
    setSeries(p=>({...p,[id]:data||[]}));};
  const toggleDiv=id=>{const n=openId===id?null:id;setOpenId(n);if(n&&!series[n])loadSeries(n);};

  const addDiv=async()=>{
    const nome=(nd||'').trim();if(!nome){return;}
    const ordem=(divs||[]).length;
    if(demo){const row={id:'d'+Date.now(),student_id:stu.id,nome,ordem};setDivs(p=>[...p,row]);setNd('');
      setSeries(p=>({...p,[row.id]:[]}));setQuantos(p=>({...p,[row.id]:0}));setOpenId(row.id);setNovaDiv(false);return;}
    const {data,error}=await sb.from('train_divisao').insert({coach_id:coach.id,student_id:stu.id,nome,ordem}).select().single();
    if(error){setMsg({t:'err',m:'Erro: '+error.message});return;}
    setDivs(p=>[...p,data]);setNd('');setSeries(p=>({...p,[data.id]:[]}));
    setQuantos(p=>({...p,[data.id]:0}));setOpenId(data.id);setNovaDiv(false);
  };
  // Apagar divisão não tem desfazer, e uma ficha já se perdeu assim. O aviso
  // diz o NOME e quantos exercícios vão junto: um "tem certeza?" genérico é
  // exatamente o que se aceita no automático.
  const delDiv=async id=>{
    const dv=(divs||[]).find(d=>d.id===id);
    const n=(series[id]||[]).length||quantos[id]||0;
    const nome=(dv&&dv.nome)||'esta divisão';
    if(!confirm('Excluir '+nome+' da ficha de '+stu.name.split(' ')[0]+'?'
      +(n?'\n\nOs '+plural(n,'exercício')+' dela vão junto.':'')
      +'\n\nIsso não tem como desfazer.'))return;
    setDivs(p=>p.filter(d=>d.id!==id));
    setQuantos(p=>{const c={...p};delete c[id];return c;});
    if(demo)return;
    /* A divisão saía da tela antes de o servidor confirmar. Se ele recusasse,
       o treinador continuava montando a ficha em cima de uma divisão que ainda
       existia no banco — e ela reaparecia na próxima abertura, com exercícios
       dentro. Aqui: falhou, avisa e traz a lista de volta do servidor. */
    const {error}=await comPrazo(sb.from('train_divisao').delete().eq('id',id));
    if(error){setMsg({t:'err',m:'Não consegui excluir a divisão: '+error.message});await loadDivs(stu);}};
  const addEx=async divId=>{
    const nome=(ex.nome||'').trim();if(!nome){return;}
    const cur=series[divId]||[];const ordem=cur.length;
    let exId=lib.find(x=>x.nome.toLowerCase()===nome.toLowerCase())?.id||null;
    if(demo){const row={id:'s'+Date.now(),divisao_id:divId,exercicio_id:exId,exercicio_nome:nome,tipo_serie:ex.tipo_serie,qtd_series:+ex.qtd_series,faixa_reps:ex.faixa_reps,intervalo_seg_min:+ex.intervalo_seg_min,ordem};setSeries(p=>({...p,[divId]:[...cur,row]}));setEx(blankEx);return;}
    if(!exId){const {data:nx}=await sb.from('train_exercicios').insert({coach_id:coach.id,nome}).select('id,nome').single();if(nx){exId=nx.id;setLib(p=>[...p,nx]);}}
    const {data,error}=await sb.from('train_serie_prescrita').insert({coach_id:coach.id,divisao_id:divId,exercicio_id:exId,exercicio_nome:nome,tipo_serie:ex.tipo_serie,qtd_series:+ex.qtd_series,faixa_reps:ex.faixa_reps,intervalo_seg_min:+ex.intervalo_seg_min,ordem}).select().single();
    if(error){setMsg({t:'err',m:'Erro: '+error.message});return;}
    setSeries(p=>({...p,[divId]:[...cur,data]}));setEx(blankEx);
  };
  // Em que dias a divisão cai. Vazio = sem dia fixo, e o rodízio livre segue
  // valendo — quem não usar isso não muda nada.
  const updDias=async(divId,dias)=>{
    setDivs(p=>(p||[]).map(d=>d.id===divId?{...d,dias_semana:dias}:d));
    if(!demo){const {error}=await sb.from('train_divisao').update({dias_semana:dias}).eq('id',divId);
      if(error)setMsg({t:'err',m:'Não salvou os dias: '+error.message});}
  };
  const delEx=async(divId,id)=>{setSeries(p=>({...p,[divId]:(p[divId]||[]).filter(s=>s.id!==id)}));
    if(demo)return;
    // mesma regra da divisão: o exercício só some de verdade se o banco deixou
    const {error}=await comPrazo(sb.from('train_serie_prescrita').delete().eq('id',id));
    if(error){setMsg({t:'err',m:'Não consegui remover o exercício: '+error.message});await loadSeries(divId);}};
  // dá para ajustar séries, reps e descanso sem apagar e cadastrar de novo
  const updEx=async(divId,id,campos)=>{
    setSeries(p=>({...p,[divId]:(p[divId]||[]).map(s=>s.id===id?{...s,...campos}:s)}));
    if(!demo){const {error}=await sb.from('train_serie_prescrita').update(campos).eq('id',id);
      if(error)setMsg({t:'err',m:'Não salvou: '+error.message});}
  };
  // move o exercício na ordem em que o aluno vai executar
  const moverEx=async(divId,id,dir)=>{
    const lista=[...(series[divId]||[])];
    const i=lista.findIndex(s=>s.id===id);const j=i+dir;
    if(i<0||j<0||j>=lista.length)return;
    [lista[i],lista[j]]=[lista[j],lista[i]];
    setSeries(p=>({...p,[divId]:lista}));
    if(!demo)await Promise.all(lista.map((s,k)=>sb.from('train_serie_prescrita').update({ordem:k}).eq('id',s.id)));
  };

  // ── Modelos de ficha ──────────────────────────────────────
  // As divisões entram DEPOIS das que já existem, para nunca sobrescrever a
  // ficha que o aluno já usa.
  // Aplicar a ficha era dezenas de requisições daqui: uma por divisão e um lote
  // por exercício. Numa internet de academia, cair no meio deixava o aluno com
  // meia ficha. Agora quem monta é o servidor, numa transação só.
  const aplicarModelo=async(m)=>{
    if(demo){setShowMod(false);setMsg({t:'err',m:'Modo demonstração: a ficha não é salva.'});return;}
    setBusyMod(true);setMsg(null);
    try{
      const {data:feitos,error}=await comPrazo(sb.rpc('ficha_aplicar_modelo',{p_modelo:m.id,p_alunos:[stu.id]}),30000);
      if(error)throw error;
      // a RPC devolve em quantos alunos aplicou. Zero significa que ela recusou
      // (aluno de outro treinador, por exemplo) — dizer "aplicada" seria mentira
      if(!feitos)throw new Error('o servidor não aplicou a ficha neste aluno.');
      // recarrega do servidor: é ele quem sabe o que ficou gravado
      const {data:dv}=await sb.from('train_divisao').select('*').eq('student_id',stu.id).order('ordem');
      setDivs(dv||[]);
      const novos={};
      await Promise.all((dv||[]).map(async d=>{
        const {data:sp}=await sb.from('train_serie_prescrita').select('*').eq('divisao_id',d.id).order('ordem');
        novos[d.id]=sp||[];
      }));
      setSeries(novos);
      setShowMod(false);
      setMsg({t:'ok',m:'Ficha “'+m.nome+'” aplicada. Abra cada divisão para ajustar carga, séries e descanso.'});
    }catch(e){setMsg({t:'err',m:'Não deu para aplicar: '+(e.message||e)});}
    setBusyMod(false);
  };

  // Mesmo desenho do aplicarModelo: quem monta e o servidor, numa transacao so.
  // Aqui tambem vale a regra de nao mentir: se a RPC servir zero alunos, isso e
  // erro, nao sucesso.
  const copiarDeAluno=async(origem)=>{
    if(demo){setShowCopia(false);setMsg({t:'err',m:'Modo demonstração: a ficha não é salva.'});return;}
    setBusyMod(true);setMsg(null);
    try{
      const {data:feitos,error}=await comPrazo(
        sb.rpc('ficha_copiar_de_aluno',{p_origem:origem.id,p_alunos:[stu.id]}),30000);
      if(error)throw error;
      if(!feitos)throw new Error('o servidor não copiou a ficha para este aluno.');
      const {data:dv}=await sb.from('train_divisao').select('*').eq('student_id',stu.id).order('ordem');
      setDivs(dv||[]);
      const novos={};
      await Promise.all((dv||[]).map(async d=>{
        const {data:sp}=await sb.from('train_serie_prescrita').select('*').eq('divisao_id',d.id).order('ordem');
        novos[d.id]=sp||[];
      }));
      setSeries(novos);
      setShowCopia(false);
      setMsg({t:'ok',m:'Ficha de '+origem.nome.split(' ')[0]+' copiada para '+stu.name.split(' ')[0]+'.'});
    }catch(e){setMsg({t:'err',m:'Não deu para copiar: '+(e.message||e)});}
    setBusyMod(false);
  };

  const salvarComoModelo=async()=>{
    if(!divs||!divs.length){setMsg({t:'err',m:'Monte pelo menos uma divisão antes de salvar o modelo.'});return;}
    const nome=prompt('Nome do modelo:','Ficha de '+stu.name.split(' ')[0]);
    if(!nome)return;
    if(demo){setMsg({t:'err',m:'Modo demonstração: o modelo não é salvo.'});return;}
    setBusyMod(true);setMsg(null);
    try{
      const pacote=[];
      for(let i=0;i<divs.length;i++){
        const d=divs[i];
        let ss=series[d.id];
        if(!ss){const {data}=await sb.from('train_serie_prescrita').select('*').eq('divisao_id',d.id).order('ordem');ss=data||[];}
        pacote.push({nome:d.nome,ordem:i,exercicios:ss.map((x,j)=>({nome:x.exercicio_nome,
          tipo_serie:x.tipo_serie,qtd_series:x.qtd_series,faixa_reps:x.faixa_reps,
          intervalo_seg_min:x.intervalo_seg_min,ordem:j}))});
      }
      const {error}=await sb.from('train_ficha_modelo').insert({coach_id:coach.id,nome,
        nivel:null,dias:divs.length,
        resumo:'Modelo salvo a partir da ficha de '+stu.name.split(' ')[0]+'.',
        divisoes:pacote});
      if(error)throw error;
      setMsg({t:'ok',m:'Modelo “'+nome+'” salvo. Ele já aparece em “Usar ficha pronta”.'});
    }catch(e){setMsg({t:'err',m:'Não deu para salvar: '+(e.message||e)});}
    setBusyMod(false);
  };

  if(showLib)return <ExerciseLibrary coach={coach} onBack={()=>setShowLib(false)}/>;
  if(imprimir&&stu)return <FichaImpressa coach={coach} stu={stu} divs={divs||[]} onFechar={()=>setImprimir(false)}/>;
  // seleção de aluno
  if(!stu){
    const list=students.filter(s=>s.name.toLowerCase().includes(q.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
    return(<div>
      <div className="abar"><div><div className="breadcrumb" onClick={onBack}>← Painel</div>
        <div className="ph-title">Treino</div><div className="ph-sub">Escolha o aluno para montar a ficha</div></div>
        <button className="btn btn-secondary" onClick={()=>setShowLib(true)}>Biblioteca de exercícios</button></div>
      {demo&&<div className="alert alert-warn">Modo demonstração: as fichas não são salvas.</div>}
      {(students||[]).length>0&&<div className="search-wrap" style={{marginBottom:16}}><span className="search-icon"><IconBusca/></span>
        <input className="fi" placeholder="Buscar aluno..." value={q} onChange={e=>setQ(e.target.value)}/></div>}
      <div className="student-grid">{list.map(s=>(
        <div key={s.id} className="student-card" onClick={()=>setStu(s)}>
          <div className="avatar" style={{marginBottom:10}}>{s.photo?<img src={s.photo} alt=""/>:initials(s.name)}</div>
          <div className="s-name">{s.name}</div>
          <div className="s-meta">{s.goal||'Montar ficha de treino'}</div>
        </div>))}</div>
      {students.length===0
        ? <SemAlunos oque="A ficha de treino é sempre de alguém." onNovo={onNovoAluno}/>
        : list.length===0&&<div className="empty"><div className="empty-title">Nenhum aluno com esse nome</div></div>}
    </div>);
  }

  return(<div>
    <div className="abar"><div><div className="breadcrumb" onClick={()=>{setStu(null);setOpenId(null);}}>← Treino</div>
      <div className="ph-title">Ficha de {stu.name.split(' ')[0]}</div>
      <div className="ph-sub">{(divs||[]).length} {(divs||[]).length===1?'divisão':'divisões'}</div></div>
    </div>
    {msg&&<div className={`alert ${msg.t==='err'?'alert-danger':'alert-success'}`}>{msg.m}</div>}

    <datalist id="trainlib">{lib.map(x=><option key={x.id} value={x.nome}/>)}</datalist>

    <div className="bgroup" style={{marginBottom:12}}>
      <button className="btn btn-secondary btn-sm" disabled={busyMod} onClick={()=>setShowMod(true)}>Usar ficha pronta</button>
      <button className="btn btn-secondary btn-sm" disabled={busyMod} onClick={()=>setShowCopia(true)}>Copiar de outro aluno</button>
      <button className="btn btn-ghost btn-sm" onClick={()=>setImprimir(true)}>Imprimir ficha</button>
      {(divs||[]).length>0&&<button className="btn btn-ghost btn-sm" disabled={busyMod} onClick={salvarComoModelo}>Salvar como modelo</button>}
    </div>

    {divs===null?<div className="center-screen"><div className="spinner"/></div>:
     divs.length===0?<div className="empty"><div className="empty-title">Nenhuma divisão ainda</div><p className="s-meta">O caminho curto é “Usar ficha pronta” ou “Copiar de outro aluno”, aí é só ajustar. Do zero, use “+ Nova divisão” logo abaixo.</p></div>:
     divs.map(dv=>{const ss=series[dv.id]||[];const open=openId===dv.id;
      // quantos exercícios tem dentro: da lista já aberta, senão da contagem
      // que veio junto com as divisões
      const n=series[dv.id]?ss.length:quantos[dv.id];
      return(<div key={dv.id} className="dash-panel" style={{marginBottom:12}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>toggleDiv(dv.id)}>
          <div style={{minWidth:0}}>
            <h4 style={{margin:0}}>{dv.nome||'Divisão'}</h4>
            <div className="s-meta" style={{margin:'3px 0 0'}}>
              {n==null?'toque para abrir'
                :n===0?'sem exercício — o aluno abre e não acha nada'
                :plural(n,'exercício')}
              {(dv.dias_semana||[]).length>0&&' · '+listaDias(dv.dias_semana)}
            </div>
          </div>
          <span style={{color:'var(--text3)',fontSize:18,flexShrink:0}}>{open?'▾':'▸'}</span>
        </div>
        {open&&<div style={{marginTop:12}}>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:12}}>
            <span className="s-meta" style={{margin:0}}>Dias da semana:</span>
            {DIAS_SEMANA.map(([n,lb])=>{const on=(dv.dias_semana||[]).includes(n);
              return(<button key={n} type="button" className={'btn btn-sm '+(on?'btn-primary':'btn-ghost')}
                style={{padding:'4px 10px'}}
                onClick={()=>updDias(dv.id,on?(dv.dias_semana||[]).filter(x=>x!==n):[...(dv.dias_semana||[]),n])}>{lb}</button>);})}
            {(dv.dias_semana||[]).length===0&&<span className="s-meta" style={{margin:0,fontSize:11.5}}>sem dia fixo — entra no rodízio</span>}
          </div>
          {ss.length>0&&<table className="rpt-tbl" style={{width:'100%',marginBottom:10}}><tbody>
            {ss.map((s,i)=>{const dem=lib.find(x=>x.id===s.exercicio_id);return(<tr key={s.id}>
              <td style={{fontWeight:600}}>
                {s.exercicio_nome}
                {dem&&(dem.video_url||dem.video_path)
                  ? <button className="link" style={{marginLeft:8,fontSize:11,background:'none',border:'none',padding:0,cursor:'pointer'}}
                      onClick={()=>setVerEx(v=>v===s.id?null:s.id)}>{verEx===s.id?'fechar':'ver'}</button>
                  : <span style={{marginLeft:8,fontSize:11,color:'var(--text3)'}}>sem demo</span>}
                {verEx===s.id&&dem&&<div style={{marginTop:8,maxWidth:280}}><ExDemo url={dem.video_url} path={dem.video_path} name={dem.nome} dicas={dem.dicas}/></div>}
              </td>
              <td><span className="badge" style={{background:'transparent',color:tierColor(s.tipo_serie),border:'1px solid '+tierColor(s.tipo_serie)}}>{tierNome(s.tipo_serie)}</span></td>
              <td style={{whiteSpace:'nowrap'}}>
                <input className="fi" type="number" min="1" style={{width:52,padding:'4px 6px',display:'inline-block'}}
                  defaultValue={s.qtd_series} onBlur={e=>{const v=parseInt(e.target.value)||1;if(v!==s.qtd_series)updEx(dv.id,s.id,{qtd_series:v});}}/>
                <span style={{margin:'0 4px'}}>×</span>
                <input className="fi" style={{width:72,padding:'4px 6px',display:'inline-block'}}
                  defaultValue={s.faixa_reps||''} onBlur={e=>{const v=e.target.value.trim();if(v!==(s.faixa_reps||''))updEx(dv.id,s.id,{faixa_reps:v});}}/>
              </td>
              <td style={{whiteSpace:'nowrap'}}>
                <input className="fi" type="number" min="0" step="15" style={{width:64,padding:'4px 6px',display:'inline-block'}}
                  defaultValue={s.intervalo_seg_min||60} onBlur={e=>{const v=parseInt(e.target.value)||0;if(v!==s.intervalo_seg_min)updEx(dv.id,s.id,{intervalo_seg_min:v});}}/>
                <span style={{marginLeft:4,color:'var(--text3)'}}>s</span>
              </td>
              <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                <button className="btn-icon btn-sm" title="Subir" disabled={i===0} onClick={()=>moverEx(dv.id,s.id,-1)}>↑</button>
                <button className="btn-icon btn-sm" title="Descer" disabled={i===ss.length-1} onClick={()=>moverEx(dv.id,s.id,1)}>↓</button>
                <button className="btn-icon btn-sm" title="Remover" onClick={()=>delEx(dv.id,s.id)}>×</button>
              </td>
            </tr>);})}
          </tbody></table>}
          <datalist id="trainlibf">{libFiltered.map(x=><option key={x.id} value={x.nome}/>)}</datalist>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end',background:'var(--bg3)',padding:10,borderRadius:10}}>
            <div className="fg" style={{margin:0,minWidth:140}}><label className="flbl">Grupo muscular</label>
              <select className="fi" value={ex.grupo} onChange={e=>setEx(p=>({...p,grupo:e.target.value,nome:''}))}>{libGrupos.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
            <div className="fg" style={{margin:0,flex:1,minWidth:150}}><label className="flbl">Exercício</label>
              <input className="fi" list="trainlibf" value={ex.nome} onChange={e=>setEx(p=>({...p,nome:e.target.value}))} placeholder={ex.grupo==='Todos'?'Nome do exercício':'Exercícios de '+ex.grupo}/></div>
            <div className="fg" style={{margin:0}}><label className="flbl">Tipo</label>
              <select className="fi" style={{width:120}} value={ex.tipo_serie} onChange={e=>setEx(p=>({...p,tipo_serie:e.target.value}))}>{TRAIN_TIERS.map(t=><option key={t} value={t}>{tierNome(t)}</option>)}</select></div>
            <div className="fg" style={{margin:0}}><label className="flbl">Séries</label>
              <input className="fi" type="number" style={{width:70}} value={ex.qtd_series} onChange={e=>setEx(p=>({...p,qtd_series:e.target.value}))}/></div>
            <div className="fg" style={{margin:0}}><label className="flbl">Reps</label>
              <input className="fi" style={{width:80}} value={ex.faixa_reps} onChange={e=>setEx(p=>({...p,faixa_reps:e.target.value}))}/></div>
            <div className="fg" style={{margin:0}}><label className="flbl">Descanso (s)</label>
              <input className="fi" type="number" style={{width:90}} value={ex.intervalo_seg_min} onChange={e=>setEx(p=>({...p,intervalo_seg_min:e.target.value}))}/></div>
            <button className="btn btn-secondary" disabled={!(ex.nome||'').trim()} onClick={()=>addEx(dv.id)}>Adicionar</button>
            <div style={{flexBasis:'100%',display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              <span style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5}}>Descanso rápido</span>
              {[30,45,60,90,120,180].map(v=>(
                <button key={v} type="button"
                  className={'btn btn-sm '+(String(ex.intervalo_seg_min)===String(v)?'btn-primary':'btn-ghost')}
                  onClick={()=>setEx(p=>({...p,intervalo_seg_min:v}))}>{v>=60?(v/60)+' min':v+'s'}</button>))}
            </div>
            {exSelecionado&&(exSelecionado.video_url||exSelecionado.video_path)&&
              <div style={{flexBasis:'100%',maxWidth:300}}>
                <ExDemo url={exSelecionado.video_url} path={exSelecionado.video_path} name={exSelecionado.nome} dicas={exSelecionado.dicas}/></div>}
          </div>
          {/* Excluir a divisão mora aqui dentro, e não ao lado do nome: lá ele
              ficava maior que o "abrir" e era o alvo fácil do dedo. */}
          <div style={{marginTop:14,textAlign:'right'}}>
            <button className="btn btn-ghost btn-sm" style={{color:'var(--danger,#b3261e)'}}
              onClick={()=>delDiv(dv.id)}>Excluir esta divisão</button>
          </div>
        </div>}
      </div>);})}

    {/* Criar divisão é o que ele faz de vez em quando; ver as que existem é o
        que ele faz sempre. Por isso o formulário desceu e virou botão. */}
    {divs!==null&&(novaDiv
      ? <div className="dash-panel" style={{marginBottom:16}}>
          <h4>Nova divisão</h4>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            <input className="fi" style={{flex:1,minWidth:180}} autoFocus placeholder="Ex.: A — Membros inferiores"
              value={nd} onChange={e=>setNd(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')addDiv();}}/>
            <button className="btn btn-primary" disabled={!(nd||'').trim()} onClick={addDiv}>Adicionar</button>
            <button className="btn btn-ghost" onClick={()=>{setNovaDiv(false);setNd('');}}>Cancelar</button>
          </div>
        </div>
      : <button className="btn btn-ghost btn-sm" style={{marginBottom:16}} onClick={()=>setNovaDiv(true)}>
          + Nova divisão</button>)}
    {showMod&&<FichaModeloPicker busy={busyMod} onUsar={aplicarModelo} onClose={()=>setShowMod(false)}/>}
    {showCopia&&<CopiarDeAlunoPicker alvo={stu} busy={busyMod} onUsar={copiarDeAluno} onClose={()=>setShowCopia(false)}/>}
  </div>);
}

/* ── Offline (IndexedDB): cache de leitura + fila de gravação ── */
const IDB=(()=>{
  let dbp=null;
  const db=()=>{if(dbp)return dbp;dbp=new Promise((res,rej)=>{try{const r=indexedDB.open('mfp-offline',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}catch(e){rej(e);}});return dbp;};
  const get=async k=>{try{const d=await db();return await new Promise((res,rej)=>{const t=d.transaction('kv','readonly').objectStore('kv').get(k);t.onsuccess=()=>res(t.result);t.onerror=()=>rej(t.error);});}catch(e){return undefined;}};
  const set=async(k,v)=>{try{const d=await db();await new Promise((res,rej)=>{const q=d.transaction('kv','readwrite').objectStore('kv').put(v,k);q.onsuccess=()=>res();q.onerror=()=>rej(q.error);});}catch(e){}};
  return {get,set};
})();
const isLocalId=id=>typeof id==='string'&&id.startsWith('local-');
const offSnapLoad=c=>IDB.get('snap-'+c);
const offSnapSave=(c,students,evals)=>IDB.set('snap-'+c,{students,evals,ts:Date.now()});
const offQueueLoad=async c=>(await IDB.get('queue-'+c))||[];
const offQueueSave=(c,q)=>IDB.set('queue-'+c,q);
/* Toda chamada de rede leva prazo. Sem isso, no wifi da academia que conecta
   mas não navega, o navigator.onLine continua "true", o fetch fica pendurado
   para sempre e a avaliação nem chega a entrar na fila do aparelho — que é
   exatamente o caso de "salvei e sumiu". */
const PRAZO_MS=12000;
const comPrazo=(p,ms=PRAZO_MS)=>new Promise((ok,falha)=>{
  const t=setTimeout(()=>{const e=new Error('A internet não respondeu a tempo.');e.semRede=true;falha(e);},ms);
  Promise.resolve(p).then(v=>{clearTimeout(t);ok(v);},e=>{clearTimeout(t);falha(e);});
});
const isNetErr=e=>!navigator.onLine||(e&&e.semRede)||(e&&/network|fetch|Failed to fetch|timeout|aborted|Load failed/i.test(e.message||''));
/* Gravar conferindo o erro.
   O cliente do Supabase NÃO lança quando o servidor recusa: devolve {error}.
   Então `try{ await sb.from(x).insert(y) }catch(e){...}` não pega nada — o
   catch nunca roda e a tela segue afirmando o que não aconteceu. Foi assim que
   apareceram o "Plano salvo" e o "✓ Pago" sem nada ter sido gravado.
   Aqui o erro do servidor vira exceção de verdade, e vai com prazo. */
const gravar=async(q,ms)=>{const r=await comPrazo(Promise.resolve(q),ms);
  if(r&&r.error)throw r.error;return r;};
// Mensagem para o usuário a partir de um erro de gravação.
const porQueFalhou=e=>isNetErr(e)?'A internet falhou. Não foi salvo — tente de novo.'
  :'Não consegui salvar: '+((e&&e.message)||e);
/* Gravação do lado do treinador que não tinha para onde levar o erro.
   São as telas de bastidor — modelos, periodização, suplementos, metas — onde
   a tela pinta o resultado na hora e nunca mais confere. Quando o servidor
   recusava, o treinador via a mudança acontecer e ela sumia na próxima vez que
   abrisse a tela; pior, um modelo de cardápio podia ser salvo VAZIO e ele só
   descobrir na hora de usar com o aluno.
   Não invento um canto na tela para cada uma dessas: aviso na cara e devolvo
   se deu certo, para quem chamou desfazer o que já tinha pintado. */
const gravarAvisando=async(q,oQue)=>{
  try{await gravar(q);return true;}
  catch(e){alert(oQue+': '+porQueFalhou(e));return false;}
};

/* ── Ler com cópia no aparelho ───────────────────────────────
   Toda leitura que o app precisa mostrar offline passa por aqui: tenta a rede
   com prazo e guarda o resultado; sem rede, devolve o que foi lido da última
   vez. É isto que faz a ficha, a dieta e o histórico aparecerem com o celular
   no modo avião — antes o app abria, mas vinha tudo em branco. */
/* ── Fila de gravação do aluno ───────────────────────────────
   O aluno treina em academia sem sinal. Cada série concluída entra nesta fila
   e sobe sozinha depois — antes ia direto para o servidor e, sem rede, o
   treino inteiro se perdia. */
const FILA_ALUNO='fila-aluno';
async function filaAluno(){return (await IDB.get(FILA_ALUNO))||[];}
async function enfileirarAluno(item){
  const q=await filaAluno();q.push({...item,em:Date.now()});
  await IDB.set(FILA_ALUNO,q);
  try{window.dispatchEvent(new CustomEvent('mfp-fila',{detail:q.length}));}catch(e){}
  return q.length;
}
let escoando=false;
async function escoarFilaAluno(){
  if(escoando||!sb||!navigator.onLine)return 0;
  escoando=true;let subiram=0;
  try{
    let q=await filaAluno();
    while(q.length){
      const it=q[0];
      try{
        // Três formas de gravação cabem na fila:
        //   {tabela,linha}            grava e ignora se já existe (série de treino:
        //                             a política do aluno só permite INSERT)
        //   {tabela,linha,conflito}   grava por cima da linha do dia (refeição marcada)
        //   {tabela,apagar}           desfaz (refeição desmarcada)
        if(it.tabela){
          if(it.apagar){const {error}=await comPrazo(sb.from(it.tabela).delete().match(it.apagar));
            if(error)throw error;}
          else{const {error}=await comPrazo(sb.from(it.tabela).upsert(it.linha,
            it.conflito?{onConflict:it.conflito}:{onConflict:'id',ignoreDuplicates:true}));
            if(error)throw error;}
        }
        else if(it.rpc){
          const {data,error}=await comPrazo(sb.rpc(it.rpc,it.args||{}));if(error)throw error;
          // feedback que estava na fila: se tinha dor alta, o treinador
          // precisa saber agora que o sinal voltou
          if(it.rpc==='treino_feedback'&&(it.args||{}).p_dor>=4)
            semEsperar(avisarDorAoTreinador(data&&data.id));
          // mensagem que ficou na fila: o outro lado precisa ser avisado agora
          if(it.rpc==='conversa_enviar'&&data&&data.id)
            semEsperar(avisarMensagem(data.id));
        }
      }catch(e){
        if(isNetErr(e))break;         // sem rede: fica na fila, tenta depois
        /* erro definitivo: sai da fila para não travar o resto */
      }
      q.shift();subiram++;await IDB.set(FILA_ALUNO,q);
    }
    try{window.dispatchEvent(new CustomEvent('mfp-fila',{detail:q.length}));}catch(e){}
  }finally{escoando=false;}
  return subiram;
}
if(typeof window!=='undefined'){
  window.addEventListener('online',()=>{escoarFilaAluno();});
  // O evento 'online' só dispara na TRANSIÇÃO. Quem treinou sem sinal, fechou o
  // app e abriu de novo já com internet nunca passava por essa transição: a
  // fila ficava parada e o treino nunca chegava ao treinador. Agora também
  // escoa ao abrir e ao voltar para o app.
  const tentarEscoar=()=>{if(navigator.onLine)semEsperar(escoarFilaAluno());};
  window.addEventListener('load',tentarEscoar);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')tentarEscoar();});
  tentarEscoar();
}

/* Mostra JA a copia local e atualiza por tras.
   lerCopia sempre espera a rede primeiro e so cai no cache se ela falhar: quem
   ja abriu o app antes fica olhando spinner por dado que o aparelho tem.
   Aqui e o contrario — quem tem copia ve a tela na hora, e o dado fresco
   entra sozinho quando chega. Na primeira vez (sem copia) espera a rede,
   como antes. */
async function lerJa(chave,consulta,aplicar,ms){
  let mostrou=false;
  try{
    const c=await IDB.get('ler-'+chave);
    if(c){aplicar(c.dado,true);mostrou=true;}
  }catch(e){}
  try{
    const r=await comPrazo(Promise.resolve(consulta),ms);
    if(r&&r.error)throw r.error;
    const dado=(r&&'data' in r)?r.data:r;
    IDB.set('ler-'+chave,{dado,ts:Date.now()});
    aplicar(dado,false);
    return dado;
  }catch(e){
    if(!mostrou&&!isNetErr(e))throw e;   // sem copia e erro de verdade: quem chamou decide
    return null;
  }
}

async function lerCopia(chave,consulta,ms){
  try{
    const r=await comPrazo(Promise.resolve(consulta),ms);
    if(r&&r.error)throw r.error;
    const dado=(r&&'data' in r)?r.data:r;
    IDB.set('ler-'+chave,{dado,ts:Date.now()});
    return r;
  }catch(e){
    const c=await IDB.get('ler-'+chave);
    if(c)return {data:c.dado,error:null,daCopia:true,copiaEm:c.ts};
    if(isNetErr(e))return {data:null,error:null,daCopia:true,semCopia:true};
    throw e;
  }
}

/* ── App ── */
/* ════════════════════════════════════════════════════════════
   NUTRIÇÃO (treinador) — plano alimentar dentro do Performance.
   Escreve nas MESMAS tabelas do MF Nutrition. Atenção: o student_id
   dessas tabelas é o id do PERFIL (auth.user), não o id da ficha —
   por isso o aluno precisa ter ativado a conta (assess_students.user_id).
   ════════════════════════════════════════════════════════════ */
async function loadTemplateTree(templateId){
  const {data:meals}=await sb.from('template_meals').select('*').eq('template_id',templateId).order('order_index');
  const mealIds=(meals||[]).map(m=>m.id);
  let items=[],subs=[];
  if(mealIds.length){
    const ri=await sb.from('template_items').select('*').in('template_meal_id',mealIds).order('order_index');items=ri.data||[];
    const itemIds=items.map(i=>i.id);
    if(itemIds.length){const rs=await sb.from('template_subs').select('*').in('template_item_id',itemIds);subs=rs.data||[];}
  }
  return (meals||[]).map(m=>({
    id:genId(), name:m.name, time:m.time, notes:m.notes,
    items: items.filter(i=>i.template_meal_id===m.id).map(i=>({
      id:genId(), food:i.food, qty:i.qty, kcal:i.kcal, protein:i.protein, carb:i.carb, fat:i.fat, prep:i.prep||'',
      subs: subs.filter(s=>s.template_item_id===i.id).map(s=>({id:genId(),food:s.food,qty:s.qty,kcal:s.kcal,protein:s.protein,carb:s.carb,fat:s.fat}))
    }))
  }));
}
function buildTemplatePayload(meals, templateId){
  const mealsP=[], itemsP=[], subsP=[];
  meals.forEach((m,mi)=>{
    const tmId=genId(); mealsP.push({id:tmId,template_id:templateId,name:m.name,time:m.time||null,notes:m.notes||null,order_index:mi});
    m.items.forEach((it,ii)=>{
      const tiId=genId();
      itemsP.push({id:tiId,template_meal_id:tmId,food:it.food,qty:it.qty,kcal:n0(it.kcal),protein:n0(it.protein),carb:n0(it.carb),fat:n0(it.fat),prep:it.prep||null,order_index:ii});
      (it.subs||[]).forEach(s=>subsP.push({id:genId(),template_item_id:tiId,food:s.food,qty:s.qty,kcal:n0(s.kcal),protein:n0(s.protein),carb:n0(s.carb),fat:n0(s.fat)}));
    });
  });
  return {mealsP,itemsP,subsP};
}

function NutriTotais({s,label,meta,peso}){
  const it=[['kcal','Kcal','','kcal_alvo'],['protein','Proteína','g','prot_alvo'],['carb','Carbo','g','carb_alvo'],['fat','Gordura','g','fat_alvo']];
  const temMeta=meta&&n0(meta.kcal_alvo)>0;
  // 5% de folga para cima ou para baixo é o que se considera "fechado"
  const situacao=(v,alvo)=>{
    if(!alvo)return null;
    const d=(v-alvo)/alvo;
    if(Math.abs(d)<=0.05)return{cor:'var(--green)',txt:'na meta'};
    return d<0?{cor:'var(--gold)',txt:r0(alvo-v)+' abaixo'}:{cor:'var(--red)',txt:r0(v-alvo)+' acima'};
  };
  return(<div>
    <div style={{display:'flex',gap:10,marginTop:12}}>
      {it.map(([k,l,u,mk])=>{
        const alvo=temMeta?n0(meta[mk]):0;
        const st=situacao(n0(s[k]),alvo);
        const pct=alvo?Math.min(100,Math.round((n0(s[k])/alvo)*100)):0;
        return(<div key={k} style={{flex:1,textAlign:'center',background:'var(--bg3,#f7f4ef)',borderRadius:12,padding:'10px 4px'}}>
          <div style={{fontFamily:'var(--serif)',fontSize:19,fontWeight:700,color:'var(--accent)'}}>{r0(s[k])}<span style={{fontSize:11,fontWeight:600}}>{u}</span></div>
          <div style={{fontSize:10.5,color:'var(--text2)',textTransform:'uppercase',letterSpacing:.5,fontWeight:700}}>{l}</div>
          {alvo>0&&<>
            <div style={{height:4,borderRadius:3,background:'var(--bg4,#e9ddd3)',margin:'7px 6px 4px',overflow:'hidden'}}>
              <div style={{height:'100%',width:pct+'%',background:st?st.cor:'var(--accent)',borderRadius:3,transition:'width .4s'}}/>
            </div>
            <div style={{fontSize:10,color:st?st.cor:'var(--text3)',fontWeight:700}}>
              meta {r0(alvo)}{u} · {st?st.txt:''}</div>
          </>}
        </div>);
      })}
    </div>
    {temMeta&&n0(peso)>0&&
      <div style={{fontSize:11.5,color:'var(--text2)',textAlign:'center',marginTop:8}}>
        Proteína do cardápio: <b>{(n0(s.protein)/n0(peso)).toFixed(1).replace('.',',')} g por kg</b> de peso
        {(n0(s.protein)/n0(peso))<1.4?' — pouco para quem treina força':''}
      </div>}
    {label&&<div style={{fontSize:11,color:'var(--text3)',textAlign:'center',marginTop:6}}>{label}</div>}
  </div>);
}

/* ── Meta calórica do plano ──────────────────────────────────────────
   Gasto energético por Mifflin-St Jeor (o mais usado em consultório),
   fator de atividade e ajuste pelo objetivo. Proteína e gordura saem de
   g por kg; o carboidrato fecha a conta do que sobra. */
const FATORES=[
  ['1.2','Sedentário — só trabalho e casa'],
  ['1.375','Leve — treina 1 a 3× por semana'],
  ['1.55','Moderado — treina 3 a 5× por semana'],
  ['1.725','Intenso — treina 6 a 7× por semana'],
  ['1.9','Atleta — 2 sessões por dia ou trabalho pesado'],
];
const OBJETIVOS=[
  ['-20','Emagrecer rápido (−20%)'],
  ['-15','Emagrecer (−15%)'],
  ['-10','Emagrecer devagar (−10%)'],
  ['0','Manter o peso'],
  ['10','Ganhar massa (+10%)'],
  ['15','Ganhar massa (+15%)'],
];
function NutriMeta({plan,setPlan,studentUid,demo,total}){
  const calc=(plan&&plan.calc)||{};
  const [f,setF]=useState({
    sexo:calc.sexo||'M', idade:calc.idade||'', peso:calc.peso||'', altura:calc.altura||'',
    fator:calc.fator||'1.55', objetivo:calc.objetivo!=null?String(calc.objetivo):'0',
    ptn:calc.ptn||'1.8', gord:calc.gord||'0.9',
  });
  const [aberto,setAberto]=useState(!n0(plan&&plan.kcal_alvo));
  const [buscando,setBuscando]=useState(false);
  const [aviso,setAviso]=useState(null);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));

  // puxa peso, altura, idade e sexo da última avaliação física do aluno
  const puxarDaAvaliacao=async()=>{
    if(demo||!sb)return;
    setBuscando(true);setAviso(null);
    try{
      const {data:st}=await sb.from('assess_students').select('id,gender,dob').eq('user_id',studentUid).limit(1);
      const aluno=st&&st[0];
      if(!aluno){setAviso('Este aluno ainda não tem cadastro de avaliação física.');setBuscando(false);return;}
      const {data:av}=await sb.from('assessments').select('data,date').eq('student_id',aluno.id)
        .order('date',{ascending:false}).limit(1);
      const d=(av&&av[0]&&av[0].data)||{};
      const peso=d.weight??d.peso, altura=d.height??d.altura;
      const idade=aluno.dob?Math.floor((Date.now()-new Date(aluno.dob).getTime())/31557600000):null;
      setF(p=>({...p,
        sexo:aluno.gender==='F'?'F':'M',
        peso:peso!=null?String(peso):p.peso,
        altura:altura!=null?String(altura):p.altura,
        idade:idade?String(idade):p.idade}));
      if(peso==null)setAviso('A última avaliação não tem peso registrado — preencha à mão.');
    }catch(e){setAviso('Não consegui buscar: '+(e.message||e));}
    setBuscando(false);
  };

  const peso=n0(f.peso), altura=n0(f.altura), idade=n0(f.idade);
  const tmb=(peso&&altura&&idade)
    ? Math.round(10*peso + 6.25*altura - 5*idade + (f.sexo==='F'?-161:5)) : 0;
  const get=tmb?Math.round(tmb*parseFloat(f.fator)):0;
  const kcal=get?Math.round(get*(1+parseFloat(f.objetivo)/100)):0;
  const prot=peso?Math.round(peso*parseFloat(f.ptn)):0;
  const gord=peso?Math.round(peso*parseFloat(f.gord)):0;
  const carb=kcal?Math.max(0,Math.round((kcal-prot*4-gord*9)/4)):0;
  const pronto=kcal>0;

  const aplicar=()=>{
    setPlan({...plan,kcal_alvo:kcal,prot_alvo:prot,carb_alvo:carb,fat_alvo:gord,
      calc:{sexo:f.sexo,idade:idade,peso:peso,altura:altura,fator:f.fator,objetivo:f.objetivo,ptn:f.ptn,gord:f.gord,tmb:tmb,get:get}});
    setAberto(false);
  };

  const alvoAtual=n0(plan&&plan.kcal_alvo);
  return(<div className="dash-panel" style={{marginBottom:14}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
      <h4 style={{margin:0}}>Meta do plano</h4>
      <button className="btn btn-ghost btn-sm" onClick={()=>setAberto(a=>!a)}>{aberto?'Fechar':alvoAtual?'Recalcular':'Calcular meta'}</button>
    </div>
    {!aberto&&alvoAtual>0&&
      <p className="s-meta" style={{marginTop:6}}>
        {r0(alvoAtual)} kcal · {r0(plan.prot_alvo)} g de proteína · {r0(plan.carb_alvo)} g de carboidrato · {r0(plan.fat_alvo)} g de gordura
        {calc.get?' (gasto estimado '+r0(calc.get)+' kcal)':''}
      </p>}
    {!aberto&&!alvoAtual&&
      <p className="s-meta" style={{marginTop:6}}>Sem meta definida — o cardápio fica sem referência de quanto fechar no dia.</p>}

    {aberto&&<div style={{marginTop:12}}>
      {aviso&&<div className="alert alert-warn" style={{marginBottom:10}}>{aviso}</div>}
      {!demo&&<button className="btn btn-secondary btn-sm" style={{marginBottom:12}} disabled={buscando} onClick={puxarDaAvaliacao}>
        {buscando?'Buscando…':'Puxar da última avaliação'}</button>}
      <div className="fgrid">
        <div className="fg"><label className="flbl">Sexo</label>
          <select className="fi" value={f.sexo} onChange={e=>set('sexo',e.target.value)}>
            <option value="M">Masculino</option><option value="F">Feminino</option></select></div>
        <FI label="Idade" unit="anos" type="number" value={f.idade} onChange={e=>set('idade',e.target.value)}/>
        <FI label="Peso" unit="kg" type="number" value={f.peso} onChange={e=>set('peso',e.target.value)}/>
        <FI label="Altura" unit="cm" type="number" value={f.altura} onChange={e=>set('altura',e.target.value)}/>
      </div>
      <div className="fgrid" style={{marginTop:10}}>
        <div className="fg"><label className="flbl">Nível de atividade</label>
          <select className="fi" value={f.fator} onChange={e=>set('fator',e.target.value)}>
            {FATORES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
        <div className="fg"><label className="flbl">Objetivo</label>
          <select className="fi" value={f.objetivo} onChange={e=>set('objetivo',e.target.value)}>
            {OBJETIVOS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
        <FI label="Proteína" unit="g/kg" type="number" step="0.1" value={f.ptn} onChange={e=>set('ptn',e.target.value)}/>
        <FI label="Gordura" unit="g/kg" type="number" step="0.1" value={f.gord} onChange={e=>set('gord',e.target.value)}/>
      </div>
      <div style={{fontSize:11.5,color:'var(--text3)',marginTop:8,lineHeight:1.5}}>
        Referência: 1,6 a 2,2 g de proteína por kg para quem treina força; gordura não deve ficar
        abaixo de 0,6 g/kg. O carboidrato preenche o que sobrar das calorias.
      </div>
      {pronto?(<>
        <div style={{display:'flex',gap:10,marginTop:14,flexWrap:'wrap'}}>
          {[['Gasto de repouso',tmb+' kcal'],['Gasto total',get+' kcal'],['Meta do plano',kcal+' kcal']].map(([l,v])=>(
            <div key={l} style={{flex:1,minWidth:120,textAlign:'center',background:'var(--bg3)',borderRadius:12,padding:'10px 6px'}}>
              <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:700,color:'var(--accent)'}}>{v}</div>
              <div style={{fontSize:10.5,color:'var(--text2)',textTransform:'uppercase',letterSpacing:.5,fontWeight:700}}>{l}</div>
            </div>))}
        </div>
        <p className="s-meta" style={{marginTop:10}}>
          Divisão: <b>{prot} g</b> de proteína · <b>{carb} g</b> de carboidrato · <b>{gord} g</b> de gordura
          {carb<50?' — carboidrato muito baixo, reveja a proteína ou a gordura':''}
        </p>
        <button className="btn btn-primary" style={{marginTop:12}} onClick={aplicar}>Usar esta meta no plano</button>
      </>):(
        <p className="s-meta" style={{marginTop:12}}>Preencha idade, peso e altura para calcular.</p>
      )}
    </div>}
  </div>);
}

function NutriFoodPicker({foods,onPick,onClose,coachId,onAdded}){
  const [q,setQ]=useState('');const [cat,setCat]=useState('Todas');
  const [sel,setSel]=useState(null);const [grams,setGrams]=useState('100');
  const [adding,setAdding]=useState(false);const [busy,setBusy]=useState(false);
  const [nf,setNf]=useState({name:'',category:'Proteínas',kcal:'',protein:'',carb:'',fat:'',preparo:''});
  const cats=['Todas',...Array.from(new Set(foods.map(f=>f.category)))];
  const list=foods.filter(f=>(cat==='Todas'||f.category===cat)&&f.name.toLowerCase().includes(q.toLowerCase())).slice(0,300);
  const fct=sel?n0(grams)/100:0;
  const saveFood=async()=>{
    if(!nf.name.trim()){alert('Dê um nome ao alimento.');return;}
    setBusy(true);
    try{
      const {error}=await sb.from('foods').insert({owner_id:coachId,name:nf.name.trim(),category:nf.category,
        kcal:n0(nf.kcal),protein:n0(nf.protein),carb:n0(nf.carb),fat:n0(nf.fat),preparo:nf.preparo||null});
      if(error) throw error;
      clearFoodsCache(); if(onAdded) await onAdded();
      setAdding(false);setNf({name:'',category:'Proteínas',kcal:'',protein:'',carb:'',fat:'',preparo:''});
    }catch(e){alert('Não foi possível salvar o alimento.\n\n'+(e.message||e));}
    setBusy(false);
  };
  return(<div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.8)',display:'flex',alignItems:'center',justifyContent:'center',padding:16,overflow:'auto'}} onClick={onClose}>
    <div className="card" style={{maxWidth:520,width:'100%'}} onClick={e=>e.stopPropagation()}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontFamily:'var(--serif)',fontSize:19,fontWeight:600}}>Base de alimentos</div>
        <button className="btn-icon btn-sm" onClick={onClose}>×</button>
      </div>
      {adding?(<>
        <span className="link" style={{fontSize:13,cursor:'pointer'}} onClick={()=>setAdding(false)}>← voltar</span>
        <div style={{margin:'10px 0 4px',fontFamily:'var(--serif)',fontSize:18}}>Cadastrar alimento</div>
        <p className="s-meta" style={{marginBottom:12}}>Valores por 100 g (ou 100 ml). Fica salvo só na sua base.</p>
        <FI label="Nome" value={nf.name} onChange={e=>setNf({...nf,name:e.target.value})} placeholder="Ex: Pão low carb"/>
        <div className="fg"><label className="flbl">Categoria</label>
          <select className="fi" value={nf.category} onChange={e=>setNf({...nf,category:e.target.value})}>
            {Object.keys(FOOD_GROUPS).map(c=><option key={c}>{c}</option>)}</select></div>
        <div className="fgrid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
          <FI label="Kcal" type="number" value={nf.kcal} onChange={e=>setNf({...nf,kcal:e.target.value})}/>
          <FI label="Prot" type="number" value={nf.protein} onChange={e=>setNf({...nf,protein:e.target.value})}/>
          <FI label="Carb" type="number" value={nf.carb} onChange={e=>setNf({...nf,carb:e.target.value})}/>
          <FI label="Gord" type="number" value={nf.fat} onChange={e=>setNf({...nf,fat:e.target.value})}/>
        </div>
        <FI label="Forma de preparo (opcional)" value={nf.preparo} onChange={e=>setNf({...nf,preparo:e.target.value})}/>
        <button className="btn btn-primary" style={{width:'100%',marginTop:8}} disabled={busy} onClick={saveFood}>{busy?'Salvando…':'Salvar na base'}</button>
      </>):!sel?(<>
        <input className="fi" placeholder="Buscar alimento..." value={q} onChange={e=>setQ(e.target.value)} autoFocus/>
        <div style={{display:'flex',gap:6,overflowX:'auto',padding:'11px 0'}}>
          {cats.map(c=><button key={c} className={`btn btn-sm ${cat===c?'btn-primary':'btn-ghost'}`} style={{flexShrink:0}} onClick={()=>setCat(c)}>{c}</button>)}
        </div>
        <div style={{maxHeight:'44vh',overflowY:'auto'}}>
          {list.map(f=>(<div key={f.id} onClick={()=>{setSel(f);setGrams('100');}}
            style={{padding:'11px 4px',borderBottom:'1px solid var(--border)',cursor:'pointer',display:'flex',justifyContent:'space-between',gap:10}}>
            <div><div style={{fontWeight:600,fontSize:14}}>{f.name}{!f.native&&<span style={{color:'var(--gold)',fontSize:10,marginLeft:5}}>★ meu</span>}</div>
              <div style={{fontSize:11,color:'var(--text2)'}}>{f.category} · por 100g</div></div>
            <div style={{textAlign:'right',fontSize:11,color:'var(--text2)',whiteSpace:'nowrap'}}>{r0(f.kcal)} kcal<br/>P{r0(f.protein)} C{r0(f.carb)} G{r0(f.fat)}</div>
          </div>))}
          {list.length===0&&<div className="muted" style={{padding:20,textAlign:'center'}}>Nada encontrado.</div>}
        </div>
        <button className="btn btn-ghost btn-sm" style={{width:'100%',marginTop:10}} onClick={()=>setAdding(true)}>+ Cadastrar alimento próprio</button>
      </>):(<>
        <span className="link" style={{fontSize:13,cursor:'pointer'}} onClick={()=>setSel(null)}>← voltar à lista</span>
        <div style={{margin:'12px 0 4px',fontFamily:'var(--serif)',fontSize:20}}>{sel.name}</div>
        <FI label="Quantidade (gramas / ml)" type="number" value={grams} onChange={e=>setGrams(e.target.value)} autoFocus/>
        <NutriTotais s={{kcal:sel.kcal*fct,protein:sel.protein*fct,carb:sel.carb*fct,fat:sel.fat*fct}}/>
        {sel.preparo&&<div className="alert alert-info" style={{marginTop:10}}>{sel.preparo}</div>}
        <button className="btn btn-primary" style={{width:'100%',marginTop:10}} disabled={!n0(grams)} onClick={()=>onPick(sel,n0(grams))}>Adicionar ao plano</button>
      </>)}
    </div></div>);
}

function NutriTemplatePicker({coachId,onPick,onClose}){
  const [tpls,setTpls]=useState(null);
  useEffect(()=>{sb.from('plan_templates').select('*').eq('coach_id',coachId).order('created_at',{ascending:false})
    .then(({data})=>setTpls(data||[])).catch(()=>setTpls([]));},[coachId]);
  return(<div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.8)',display:'flex',alignItems:'center',justifyContent:'center',padding:16,overflow:'auto'}} onClick={onClose}>
    <div className="card" style={{maxWidth:460,width:'100%'}} onClick={e=>e.stopPropagation()}>
      <div style={{fontFamily:'var(--serif)',fontSize:19,fontWeight:600,marginBottom:12}}>Usar cronograma salvo</div>
      {tpls===null?<div className="center-screen" style={{minHeight:80}}><div className="spinner"/></div>:
       tpls.length===0?<p className="s-meta">Você ainda não salvou nenhum cronograma. Monte um plano e clique em “Salvar como cronograma”.</p>:
       tpls.map(t=>(<div key={t.id} className="student-card" style={{marginBottom:9}} onClick={()=>onPick(t)}>
         <div style={{fontWeight:600,fontFamily:'var(--serif)',fontSize:16}}>{t.title}</div>
         <div style={{fontSize:12,color:'var(--text2)',marginTop:2}}>{t.notes||'Sem observações'}</div></div>))}
      <button className="btn btn-ghost" style={{width:'100%',marginTop:10}} onClick={onClose}>Cancelar</button>
    </div></div>);
}

function NutriMealsEditor({meals,setMeals,foods,coachId,onFoodsChange}){
  const [pickFor,setPickFor]=useState(null);
  const addMeal=()=>setMeals(m=>[...m,{id:genId(),name:'Nova refeição',time:'',notes:'',items:[]}]);
  const updMeal=(id,k,v)=>setMeals(m=>m.map(x=>x.id===id?{...x,[k]:v}:x));
  const delMeal=id=>setMeals(m=>m.filter(x=>x.id!==id));
  const addItem=(mid,item)=>setMeals(m=>m.map(x=>x.id===mid?{...x,items:[...x.items,item||{id:genId(),food:'',qty:'',kcal:'',protein:'',carb:'',fat:'',prep:'',subs:[]}]}:x));
  const updItem=(mid,iid,k,v)=>setMeals(m=>m.map(x=>x.id!==mid?x:{...x,items:x.items.map(i=>i.id===iid?{...i,[k]:v}:i)}));
  const delItem=(mid,iid)=>setMeals(m=>m.map(x=>x.id!==mid?x:{...x,items:x.items.filter(i=>i.id!==iid)}));
  const addSub=(mid,iid)=>setMeals(m=>m.map(x=>x.id!==mid?x:{...x,items:x.items.map(i=>i.id!==iid?i:{...i,subs:[...(i.subs||[]),{id:genId(),food:'',qty:'',kcal:'',protein:'',carb:'',fat:''}]})}))

  /* Trocas equivalentes: procura na base alimentos da MESMA categoria e
     ajusta a quantidade para casar as calorias do item original. É assim
     que se monta substituição em consultório — mesmo papel no prato,
     mesma energia. */
  const sugerirSubs=(mid,it)=>{
    const alvoKcal=n0(it.kcal);
    if(!alvoKcal){alert('Preencha as calorias do item para eu calcular as trocas.');return;}
    const base=(foods||[]).find(f=>f.name.toLowerCase()===(it.food||'').trim().toLowerCase());
    const cat=base?base.category:null;
    const candidatos=(foods||[])
      .filter(f=>f.kcal>0)
      .filter(f=>cat?f.category===cat:true)
      .filter(f=>f.name.toLowerCase()!==(it.food||'').trim().toLowerCase())
      .map(f=>{
        // quanto desse alimento dá as mesmas calorias
        const g=Math.round((alvoKcal/f.kcal)*100);
        const prot=+(f.protein*g/100).toFixed(1);
        // quanto mais perto da proteína do item, melhor a troca
        const dist=Math.abs(prot-n0(it.protein));
        return {f,g,prot,dist,carb:+(f.carb*g/100).toFixed(1),fat:+(f.fat*g/100).toFixed(1)};
      })
      .filter(c=>c.g>=10&&c.g<=600)
      .sort((a,b)=>a.dist-b.dist)
      .slice(0,3);
    if(!candidatos.length){
      alert(cat?'Não achei troca equivalente em "'+cat+'".':'Escolha o alimento pela base para eu sugerir trocas.');
      return;
    }
    const novos=candidatos.map(c=>({id:genId(),food:c.f.name,qty:c.g+' g',
      kcal:Math.round(alvoKcal),protein:c.prot,carb:c.carb,fat:c.fat}));
    setMeals(m=>m.map(x=>x.id!==mid?x:{...x,items:x.items.map(i=>i.id!==it.id?i:
      {...i,subs:[...(i.subs||[]),...novos]})}));
  };;
  const updSub=(mid,iid,sid,k,v)=>setMeals(m=>m.map(x=>x.id!==mid?x:{...x,items:x.items.map(i=>i.id!==iid?i:{...i,subs:i.subs.map(s=>s.id===sid?{...s,[k]:v}:s)})}));
  const delSub=(mid,iid,sid)=>setMeals(m=>m.map(x=>x.id!==mid?x:{...x,items:x.items.map(i=>i.id!==iid?i:{...i,subs:i.subs.filter(s=>s.id!==sid)})}));
  const onPickFood=(food,grams)=>{
    const f=grams/100;
    addItem(pickFor,{id:genId(),food:food.name,qty:grams+' g',kcal:Math.round(food.kcal*f),
      protein:+(food.protein*f).toFixed(1),carb:+(food.carb*f).toFixed(1),fat:+(food.fat*f).toFixed(1),prep:food.preparo||'',subs:[]});
    setPickFor(null);
  };
  return(<>
    {meals.map(m=>{const ms=sumItems(m.items);return(
      <div className="card" key={m.id} style={{marginTop:12}}>
        <div className="fgrid" style={{gridTemplateColumns:'2fr 1fr auto'}}>
          <FI label="Refeição" value={m.name} onChange={e=>updMeal(m.id,'name',e.target.value)} placeholder="Café da manhã"/>
          <FI label="Horário" type="time" value={String(m.time||'').slice(0,5)} onChange={e=>updMeal(m.id,'time',e.target.value)}/>
          <div style={{display:'flex',alignItems:'flex-end'}}><button className="btn-icon" onClick={()=>delMeal(m.id)} title="Excluir refeição">×</button></div>
        </div>
        <div style={{margin:'12px 0 4px',fontSize:11,color:'var(--text2)'}}>{r0(ms.kcal)} kcal · P {r0(ms.protein)}g · C {r0(ms.carb)}g · G {r0(ms.fat)}g</div>
        {m.items.map(it=>(
          <div key={it.id} style={{background:'var(--bg3,#f7f4ef)',borderRadius:12,padding:12,marginTop:9}}>
            <div className="fgrid" style={{gridTemplateColumns:'2fr 1fr auto'}}>
              <FI value={it.food} onChange={e=>updItem(m.id,it.id,'food',e.target.value)} placeholder="Alimento"/>
              <FI value={it.qty} onChange={e=>updItem(m.id,it.id,'qty',e.target.value)} placeholder="Qtd (100g)"/>
              <div style={{display:'flex',alignItems:'center'}}><button className="btn-icon" onClick={()=>delItem(m.id,it.id)}>✕</button></div>
            </div>
            <div className="fgrid" style={{gridTemplateColumns:'repeat(4,1fr)',marginTop:8}}>
              <FI label="Kcal" type="number" value={it.kcal} onChange={e=>updItem(m.id,it.id,'kcal',e.target.value)} placeholder="kcal"/>
              <FI label="Prot (g)" type="number" value={it.protein} onChange={e=>updItem(m.id,it.id,'protein',e.target.value)} placeholder="Prot g"/>
              <FI label="Carb (g)" type="number" value={it.carb} onChange={e=>updItem(m.id,it.id,'carb',e.target.value)} placeholder="Carb g"/>
              <FI label="Gord (g)" type="number" value={it.fat} onChange={e=>updItem(m.id,it.id,'fat',e.target.value)} placeholder="Gord g"/>
            </div>
            <input className="fi" style={{marginTop:8,fontSize:13.5}} value={it.prep||''} onChange={e=>updItem(m.id,it.id,'prep',e.target.value)} placeholder="Forma de preparo (opcional)"/>
            {(it.subs||[]).map(s=>(
              <div key={s.id} className="fgrid" style={{gridTemplateColumns:'2fr 1fr auto',marginTop:7,paddingLeft:10,borderLeft:'2px solid var(--accent)'}}>
                <FI value={s.food} onChange={e=>updSub(m.id,it.id,s.id,'food',e.target.value)} placeholder="Substituir por…"/>
                <FI value={s.qty} onChange={e=>updSub(m.id,it.id,s.id,'qty',e.target.value)} placeholder="Qtd"/>
                <div style={{display:'flex',alignItems:'center'}}><button className="btn-icon" onClick={()=>delSub(m.id,it.id,s.id)}>✕</button></div>
              </div>))}
            <div className="bgroup" style={{marginTop:8}}>
              <button className="btn btn-secondary btn-sm" onClick={()=>sugerirSubs(m.id,it)}>Sugerir trocas</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>addSub(m.id,it.id)}>Adicionar substituição</button>
            </div>
          </div>))}
        <div className="bgroup" style={{marginTop:11}}>
          <button className="btn btn-secondary btn-sm" onClick={()=>setPickFor(m.id)}>Da base de alimentos</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>addItem(m.id)}>+ Manual</button>
        </div>
      </div>);})}
    <button className="btn btn-secondary" style={{width:'100%',marginTop:14}} onClick={addMeal}>+ Adicionar refeição</button>
    {pickFor&&<NutriFoodPicker foods={foods} onPick={onPickFood} onClose={()=>setPickFor(null)} coachId={coachId} onAdded={onFoodsChange}/>}
  </>);
}

/* Lista de compras: junta os itens do cardápio, multiplica pelos dias e
   agrupa por categoria, na ordem em que se anda no mercado. */
const ORDEM_COMPRAS=['Proteínas','Laticínios','Carboidratos','Leguminosas','Legumes e verduras',
  'Frutas','Gorduras e oleaginosas','Bebidas','Suplementos','Doces e ultraprocessados','Outros'];

function ListaCompras({meals,foods,studentName,onClose}){
  const [dias,setDias]=useState(7);
  const [copiado,setCopiado]=useState(false);

  // "150 g" → {n:150, u:'g'} · "3 unidades" → {n:3, u:'unidades'}
  const parseQtd=(q)=>{
    const t=String(q||'').trim().replace(',','.');
    const m=t.match(/^([\d.]+)\s*(.*)$/);
    if(!m)return{n:null,u:t};
    return{n:parseFloat(m[1]),u:(m[2]||'un').trim().toLowerCase()};
  };
  const catDe=(nome)=>{
    const alvo=String(nome||'').trim().toLowerCase();
    if(!alvo)return'Outros';
    const lista=foods||[];
    let f=lista.find(x=>x.name.toLowerCase()===alvo);
    if(!f)f=lista.find(x=>{const n=x.name.toLowerCase();return n.includes(alvo)||alvo.includes(n);});
    if(!f){
      // compara pelas palavras: "frango grelhado" acha "Peito de frango grelhado"
      const palavras=alvo.split(/\s+/).filter(w=>w.length>3);
      if(palavras.length)f=lista.find(x=>{const n=x.name.toLowerCase();return palavras.every(w=>n.includes(w));})
        ||lista.find(x=>{const n=x.name.toLowerCase();return palavras.some(w=>n.includes(w));});
    }
    return f?f.category:'Outros';
  };

  const grupos=React.useMemo(()=>{
    const acc={};
    (meals||[]).forEach(m=>(m.items||[]).forEach(it=>{
      const nome=String(it.food||'').trim();
      if(!nome)return;
      const {n,u}=parseQtd(it.qty);
      const chave=nome.toLowerCase()+'|'+u;
      if(!acc[chave])acc[chave]={nome,unidade:u,total:0,vezes:0,cat:catDe(nome),semQtd:n==null};
      acc[chave].vezes+=1;
      if(n!=null)acc[chave].total+=n;
    }));
    const porCat={};
    Object.values(acc).forEach(x=>{(porCat[x.cat]=porCat[x.cat]||[]).push(x);});
    return ORDEM_COMPRAS.filter(c=>porCat[c]).map(c=>[c,porCat[c].sort((a,b)=>a.nome.localeCompare(b.nome))])
      .concat(Object.keys(porCat).filter(c=>!ORDEM_COMPRAS.includes(c)).map(c=>[c,porCat[c]]));
  },[meals,foods]);

  const fmtQtd=(x)=>{
    if(x.semQtd)return x.vezes*dias+'× no período';
    const t=x.total*dias;
    if(x.unidade==='g'&&t>=1000)return (t/1000).toFixed(t%1000?1:0).replace('.',',')+' kg';
    if(x.unidade==='ml'&&t>=1000)return (t/1000).toFixed(t%1000?1:0).replace('.',',')+' L';
    return (Math.round(t*10)/10).toString().replace('.',',')+' '+x.unidade;
  };

  const texto=()=>{
    const l=['Lista de compras — '+(studentName||'aluno')+' ('+dias+' dias)',''];
    grupos.forEach(([cat,itens])=>{
      l.push(cat.toUpperCase());
      itens.forEach(x=>l.push('- '+x.nome+': '+fmtQtd(x)));
      l.push('');
    });
    return l.join('\n');
  };
  const copiar=async()=>{
    try{await navigator.clipboard.writeText(texto());setCopiado(true);setTimeout(()=>setCopiado(false),1800);}
    catch(e){alert('Não consegui copiar. Selecione o texto na tela.');}
  };
  const zap=()=>window.open('https://wa.me/?text='+encodeURIComponent(texto()),'_blank');

  const total=grupos.reduce((a,[,itens])=>a+itens.length,0);
  return(<div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.8)',display:'flex',
      alignItems:'center',justifyContent:'center',padding:16,overflow:'auto'}} onClick={onClose}>
    <div className="card" style={{maxWidth:560,width:'100%',maxHeight:'90vh',overflow:'auto'}} onClick={e=>e.stopPropagation()}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <div style={{fontFamily:'var(--serif)',fontSize:19,fontWeight:600}}>Lista de compras</div>
        <button className="btn-icon btn-sm" onClick={onClose}>×</button>
      </div>
      <p className="s-meta">{studentName?studentName+' · ':''}{total} {total===1?'item':'itens'} do cardápio</p>

      <div className="bgroup" style={{margin:'12px 0'}}>
        {[3,5,7,15,30].map(d=>(
          <button key={d} className={'btn btn-sm '+(dias===d?'btn-primary':'btn-ghost')} onClick={()=>setDias(d)}>
            {d} dias</button>))}
      </div>

      {total===0?<div className="empty"><div className="empty-title">Cardápio vazio</div>
        <p className="s-meta">Monte as refeições primeiro.</p></div>:
       grupos.map(([cat,itens])=>(
        <div key={cat} style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:1,
            color:'var(--text3)',marginBottom:6}}>{cat}</div>
          {itens.map(x=>(
            <div key={x.nome+x.unidade} style={{display:'flex',justifyContent:'space-between',gap:10,
              padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
              <span>{x.nome}</span>
              <b style={{whiteSpace:'nowrap'}}>{fmtQtd(x)}</b>
            </div>))}
        </div>))}

      {total>0&&<div className="bgroup" style={{marginTop:8}}>
        <button className="btn btn-primary btn-sm" onClick={copiar}>{copiado?'Copiado':'Copiar lista'}</button>
        <button className="btn btn-secondary btn-sm" onClick={zap}>Enviar no WhatsApp</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>window.print()}>Imprimir</button>
      </div>}
      <p className="s-meta" style={{marginTop:10,fontSize:11.5}}>
        Some as quantidades do cardápio de um dia e multiplica pelos dias escolhidos.
        Itens sem quantidade numérica aparecem pela contagem de vezes.
      </p>
    </div>
  </div>);
}

function NutriPlanEditor({coach,studentUid,studentName,demo}){
  const [plan,setPlan]=useState(undefined);
  const [meals,setMeals]=useState([]);
  const [orig,setOrig]=useState({meals:[],items:[],subs:[]});
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(false);
  const [foods,setFoods]=useState([]);
  const [showTpl,setShowTpl]=useState(false);
  const [showCompras,setShowCompras]=useState(false);
  useEffect(()=>{if(demo){setFoods(NATIVE_FOODS);return;}getFoods().then(setFoods);},[]);

  const load=useCallback(async()=>{
    if(demo){
      setPlan({id:'demo-plan',title:_DEMO_DIETA.title,notes:'Beba pelo menos 3 L de água por dia.',water_goal_ml:3000});
      setMeals(_DEMO_DIETA.meals.map(m=>({...m,items:m.items.map(i=>({...i,subs:i.subs||[]}))})));
      setOrig({meals:[],items:[],subs:[]});return;
    }
    const p=await getActivePlan(studentUid);
    if(!p){setPlan(null);setMeals([]);return;}
    const tree=await loadPlanTree(p.id);
    setPlan(p);setMeals(tree);
    setOrig({meals:tree.map(m=>m.id),items:tree.flatMap(m=>m.items.map(i=>i.id)),
      subs:tree.flatMap(m=>m.items.flatMap(i=>i.subs.map(s=>s.id)))});
  },[studentUid,demo]);
  useEffect(()=>{load();},[load]);

  const createPlan=async()=>{
    if(demo){setPlan({id:'demo-plan',title:'Plano alimentar',water_goal_ml:3000});setMeals([]);return;}
    const {data,error}=await sb.from('meal_plans').insert({
      student_id:studentUid, coach_id:coach.id, title:'Plano alimentar', water_goal_ml:3000, active:true
    }).select().single();
    if(error){alert('Erro ao criar plano: '+error.message);return;}
    setPlan(data);setMeals([]);setOrig({meals:[],items:[],subs:[]});
  };

  const save=async()=>{
    if(demo){setSaved(true);setTimeout(()=>setSaved(false),1600);return;}
    setBusy(true);
    try{
      /* Salvar são seis idas ao servidor em sequência e não existe transação
         aqui. A ordem antiga apagava a refeição ANTES de gravar os itens: com a
         internet caindo no meio (medido com sonda), o DELETE passava e o resto
         não. A refeição sumia de vez — e no banco `meals` tem cascata para
         `meal_items` E para `checkins`, então ia junto o histórico de refeições
         que o aluno marcou. O treinador lia "erro ao salvar" e achava que nada
         tinha acontecido.
         Agora grava tudo primeiro e só depois apaga. Quebrando no meio, o pior
         que acontece é sobrar no plano algo que devia ter saído — visível, e o
         próximo salvar resolve. Nada que ele escreveu se perde. */
      const passo=p=>comPrazo(p).then(r=>{if(r&&r.error)throw r.error;return r;});
      await passo(sb.from('meal_plans').update({title:plan.title,notes:plan.notes,water_goal_ml:n0(plan.water_goal_ml),
        kcal_alvo:plan.kcal_alvo??null,prot_alvo:plan.prot_alvo??null,
        carb_alvo:plan.carb_alvo??null,fat_alvo:plan.fat_alvo??null,calc:plan.calc??null}).eq('id',plan.id));

      const mealsPayload=meals.map((m,i)=>({id:m.id,plan_id:plan.id,name:m.name,time:m.time,notes:m.notes,order_index:i}));
      if(mealsPayload.length) await passo(sb.from('meals').upsert(mealsPayload));
      const itemsPayload=[];meals.forEach(m=>m.items.forEach((it,i)=>itemsPayload.push(
        {id:it.id,meal_id:m.id,food:it.food,qty:it.qty,kcal:n0(it.kcal),protein:n0(it.protein),carb:n0(it.carb),fat:n0(it.fat),prep:it.prep||null,order_index:i})));
      if(itemsPayload.length) await passo(sb.from('meal_items').upsert(itemsPayload));
      const subsPayload=[];meals.forEach(m=>m.items.forEach(it=>(it.subs||[]).forEach(s=>subsPayload.push(
        {id:s.id,meal_item_id:it.id,food:s.food,qty:s.qty,kcal:n0(s.kcal),protein:n0(s.protein),carb:n0(s.carb),fat:n0(s.fat)}))));
      if(subsPayload.length) await passo(sb.from('substitutions').upsert(subsPayload));

      // agora sim, o que o treinador tirou do cardápio (de dentro para fora)
      const curS=subsPayload.map(s=>s.id), delS=orig.subs.filter(id=>!curS.includes(id));
      if(delS.length) await passo(sb.from('substitutions').delete().in('id',delS));
      const curI=itemsPayload.map(i=>i.id), delI=orig.items.filter(id=>!curI.includes(id));
      if(delI.length) await passo(sb.from('meal_items').delete().in('id',delI));
      const curM=meals.map(m=>m.id), delM=orig.meals.filter(id=>!curM.includes(id));
      if(delM.length) await passo(sb.from('meals').delete().in('id',delM));

      await load();setSaved(true);setTimeout(()=>setSaved(false),1600);
    }catch(e){
      // "Erro ao salvar" sozinho faz o treinador achar que nada foi gravado, e
      // parte pode ter ido. Melhor dizer o que ele precisa fazer.
      alert('Não consegui salvar o plano inteiro'+(isNetErr(e)?' — a internet falhou no meio.':': '+(e.message||e))
        +'\n\nParte pode ter sido gravada. Confira o cardápio e salve de novo.');
      await load();
    }
    setBusy(false);
  };

  const applyTemplate=async(t)=>{
    setShowTpl(false);
    if(demo)return;
    const tree=await loadTemplateTree(t.id);
    setPlan(p=>({...p,title:t.title,notes:t.notes,water_goal_ml:t.water_goal_ml}));
    setMeals(tree);
  };
  const saveAsTemplate=async()=>{
    const title=prompt('Nome do cronograma:',plan.title||'Cronograma');if(!title)return;
    if(demo){alert('Modo demonstração: o cronograma não é salvo.');return;}
    try{
      const {data:t,error}=await sb.from('plan_templates').insert({coach_id:coach.id,title,notes:plan.notes||null,water_goal_ml:n0(plan.water_goal_ml)}).select().single();
      if(error) throw error;
      const {mealsP,itemsP,subsP}=buildTemplatePayload(meals,t.id);
      /* Só a linha de cima conferia o erro. As três de baixo — que são o
         cronograma inteiro: refeições, alimentos e substituições — gravavam
         sem ninguém ler a resposta. Se uma falhasse, sobrava um cronograma
         VAZIO no banco e a tela dizia "salvo!". O treinador só descobria na
         hora de aplicar num aluno, dias depois. Agora, se qualquer parte
         falhar, o cabeçalho órfão é desfeito e ele fica sabendo na hora. */
      try{
        if(mealsP.length) await gravar(sb.from('template_meals').insert(mealsP));
        if(itemsP.length) await gravar(sb.from('template_items').insert(itemsP));
        if(subsP.length) await gravar(sb.from('template_subs').insert(subsP));
      }catch(e){
        await comPrazo(sb.from('plan_templates').delete().eq('id',t.id)).catch(()=>{});
        throw e;
      }
      alert('Cronograma “'+title+'” salvo! Já pode aplicar em outros alunos.');
    }catch(e){alert('Erro ao salvar cronograma: '+(e.message||e));}
  };

  if(plan===undefined)return <div className="center-screen" style={{minHeight:200}}><div className="spinner"/></div>;
  if(plan===null)return(
    <div className="empty">      <div className="empty-title">Nenhum plano ainda</div>
      <p className="s-meta" style={{marginBottom:16}}>Crie o plano alimentar de {studentName||'este aluno'}.</p>
      <button className="btn btn-primary" onClick={createPlan}>+ Criar plano</button></div>);

  const total=sumMeals(meals);
  return(<div>
    <div className="card" style={{marginBottom:14}}>
      <div className="bgroup" style={{marginBottom:14}}>
        <button className="btn btn-secondary btn-sm" onClick={()=>setShowTpl(true)}>Usar cronograma salvo</button>
        {meals.length>0&&<button className="btn btn-ghost btn-sm" onClick={saveAsTemplate}>Salvar como cronograma</button>}
        {meals.length>0&&<button className="btn btn-ghost btn-sm" onClick={()=>setShowCompras(true)}>Lista de compras</button>}
      </div>
      <div className="fgrid">
        <FI label="Título do plano" value={plan.title||''} onChange={e=>setPlan({...plan,title:e.target.value})}/>
        <FI label="Meta de água" unit="ml" type="number" value={plan.water_goal_ml||''} onChange={e=>setPlan({...plan,water_goal_ml:e.target.value})}/>
      </div>
      <div style={{marginTop:12}}><FTA label="Observações gerais" value={plan.notes||''} onChange={e=>setPlan({...plan,notes:e.target.value})} placeholder="Beba água, evite frituras, etc."/></div>
      <NutriTotais s={total} meta={plan} peso={plan.calc&&plan.calc.peso} label="Totais diários do plano"/>
    </div>
    <NutriMeta plan={plan} setPlan={setPlan} studentUid={studentUid} demo={demo} total={total}/>
    {showCompras&&<ListaCompras meals={meals} foods={foods} studentName={studentName} onClose={()=>setShowCompras(false)}/>}
    <NutriMealsEditor meals={meals} setMeals={setMeals} foods={foods} coachId={coach.id} onFoodsChange={()=>getFoods().then(setFoods)}/>
    <div style={{position:'sticky',bottom:0,padding:'14px 0',marginTop:8}}>
      <button className="btn btn-primary" style={{width:'100%'}} disabled={busy} onClick={save}>{busy?'Salvando…':saved?'✓ Plano salvo':'Salvar plano'}</button>
    </div>
    {showTpl&&<NutriTemplatePicker coachId={coach.id} onPick={applyTemplate} onClose={()=>setShowTpl(false)}/>}
  </div>);
}


/* ════════════ SUPLEMENTAÇÃO (vindo do MF Nutrition) ════════════ */
const SUPP_LIBRARY=[
  {cat:'Performance',name:'Creatina monohidratada',dose:'3-5 g',timing:'Qualquer horário, todos os dias',notes:'Força e hipertrofia. Uso contínuo, não precisa ciclar.'},
  {cat:'Performance',name:'Whey protein',dose:'25-35 g',timing:'Pós-treino ou lanche',notes:'Completa a proteína do dia.'},
  {cat:'Performance',name:'Cafeína (pré-treino)',dose:'100-200 mg',timing:'30-40 min antes do treino',notes:'Foco e desempenho. Evite à noite.'},
  {cat:'Performance',name:'Beta-alanina',dose:'3-5 g',timing:'Diário, qualquer horário',notes:'Resistência em séries longas.'},
  {cat:'Performance',name:'BCAA / EAA',dose:'5-10 g',timing:'Durante o treino',notes:'Opcional se a proteína diária já está alta.'},
  {cat:'Performance',name:'Glutamina',dose:'5 g',timing:'Pós-treino ou antes de dormir',notes:'Recuperação e saúde intestinal.'},
  {cat:'Vitaminas',name:'Vitamina D3',dose:'1000-2000 UI',timing:'Manhã, com gordura',notes:'Imunidade, ossos e hormônios. Ideal ajustar por exame.'},
  {cat:'Vitaminas',name:'Vitamina B12',dose:'500-1000 mcg',timing:'Manhã',notes:'Energia e sistema nervoso (atenção redobrada p/ vegetarianos).'},
  {cat:'Vitaminas',name:'Vitamina C',dose:'500-1000 mg',timing:'Qualquer horário',notes:'Antioxidante e imunidade.'},
  {cat:'Vitaminas',name:'Multivitamínico',dose:'1 dose',timing:'Café da manhã',notes:'Cobre lacunas de micronutrientes.'},
  {cat:'Vitaminas',name:'Complexo B',dose:'1 dose',timing:'Manhã',notes:'Metabolismo energético.'},
  {cat:'Saúde',name:'Ômega 3 (EPA/DHA)',dose:'1-2 g',timing:'Com uma refeição',notes:'Anti-inflamatório e saúde cardiovascular.'},
  {cat:'Saúde',name:'Magnésio',dose:'200-400 mg',timing:'À noite',notes:'Sono, relaxamento muscular e cãibras.'},
  {cat:'Saúde',name:'Zinco',dose:'15-30 mg',timing:'Com refeição',notes:'Imunidade e função hormonal.'},
  {cat:'Saúde',name:'Colágeno',dose:'10 g',timing:'Qualquer horário',notes:'Pele, cabelo e articulações.'},
  {cat:'Saúde',name:'Probiótico',dose:'1 dose',timing:'Conforme o rótulo',notes:'Saúde intestinal e digestão.'},
  {cat:'Saúde',name:'Melatonina',dose:'0,5-3 mg',timing:'30 min antes de dormir',notes:'Ajuda no sono. Comece pela menor dose.'},
  {cat:'Saúde',name:'Coenzima Q10',dose:'100 mg',timing:'Com refeição',notes:'Energia celular.'},
  {cat:'Emagrecimento',name:'Termogênico',dose:'Conforme rótulo',timing:'Manhã / pré-treino',notes:'Auxílio no gasto calórico. Evite à noite.'},
  {cat:'Emagrecimento',name:'Cromo (picolinato)',dose:'200 mcg',timing:'Com refeição',notes:'Auxílio no controle da glicemia/vontade de doce.'},
];

function SuppPicker({onPick,onClose}){
  const [cat,setCat]=useState('Todas');
  const cats=['Todas',...Array.from(new Set(SUPP_LIBRARY.map(x=>x.cat)))];
  const list=SUPP_LIBRARY.filter(x=>cat==='Todas'||x.cat===cat);
  return(<div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.8)',display:'flex',alignItems:'center',justifyContent:'center',padding:16,overflow:'auto'}} onClick={onClose}>
    <div className="card" style={{maxWidth:460,width:'100%'}} onClick={e=>e.stopPropagation()}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontFamily:'var(--serif)',fontSize:19,fontWeight:600}}>Biblioteca de suplementos</div>
        <button className="btn-icon btn-sm" onClick={onClose}>×</button></div>
      <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:11}}>
        {cats.map(c=><button key={c} className={`btn btn-sm ${cat===c?'btn-primary':'btn-ghost'}`} style={{flexShrink:0}} onClick={()=>setCat(c)}>{c}</button>)}
      </div>
      <div style={{maxHeight:'52vh',overflowY:'auto'}}>
        {list.map(x=>(<div key={x.name} onClick={()=>onPick(x)}
          style={{padding:'11px 4px',borderBottom:'1px solid var(--border)',cursor:'pointer'}}>
          <div style={{fontWeight:600,fontSize:14}}>{x.name}</div>
          <div style={{fontSize:11.5,color:'var(--text2)',marginTop:2}}>{x.dose} · {x.timing}</div>
          {x.notes&&<div style={{fontSize:11.5,color:'var(--text3)',marginTop:2}}>{x.notes}</div>}
        </div>))}
      </div>
    </div></div>);
}

function NutriSuplementos({coach,studentUid,studentName,demo}){
  const [items,setItems]=useState(demo?[]:null);
  const [orig,setOrig]=useState([]);
  const [picker,setPicker]=useState(false);
  const [busy,setBusy]=useState(false);const [saved,setSaved]=useState(false);
  const load=useCallback(async()=>{
    if(demo)return;
    const {data}=await sb.from('supplements').select('*').eq('student_id',studentUid).order('order_index');
    setItems((data||[]).map(x=>({...x})));setOrig((data||[]).map(x=>x.id));
  },[studentUid,demo]);
  useEffect(()=>{load();},[load]);
  const addLib=x=>setItems(a=>[...(a||[]),{id:genId(),name:x.name,dose:x.dose,timing:x.timing,notes:x.notes}]);
  const addManual=()=>setItems(a=>[...(a||[]),{id:genId(),name:'',dose:'',timing:'',notes:''}]);
  const upd=(id,k,v)=>setItems(a=>a.map(i=>i.id===id?{...i,[k]:v}:i));
  const del=id=>setItems(a=>a.filter(i=>i.id!==id));
  const save=async()=>{
    if(demo){setSaved(true);setTimeout(()=>setSaved(false),1500);return;}
    setBusy(true);
    try{
      const payload=(items||[]).map((i,idx)=>({id:i.id,student_id:studentUid,coach_id:coach.id,
        name:i.name,dose:i.dose||null,timing:i.timing||null,notes:i.notes||null,order_index:idx}));
      /* Gravar primeiro, apagar depois — e conferindo as duas. Do jeito que
         estava, o catch não pegava nada e o "✓ Salvo" aparecia igual. */
      if(payload.length) await gravar(sb.from('supplements').upsert(payload));
      const cur=payload.map(x=>x.id), rm=orig.filter(id=>!cur.includes(id));
      if(rm.length) await gravar(sb.from('supplements').delete().in('id',rm));
      await load();setSaved(true);setTimeout(()=>setSaved(false),1500);
    }catch(e){alert('Erro ao salvar: '+(e.message||e));}
    setBusy(false);
  };
  if(items===null)return <div className="center-screen" style={{minHeight:160}}><div className="spinner"/></div>;
  return(<div>
    <div className="alert alert-warn">Prescreva os suplementos de <b>{(studentName||'aluno').split(' ')[0]}</b>.
      As sugestões da biblioteca são gerais: ajuste por avaliação e exames. Doses específicas de vitaminas
      idealmente com acompanhamento médico.</div>
    <button className="btn btn-secondary" style={{width:'100%',marginBottom:12}} onClick={()=>setPicker(true)}>Adicionar da biblioteca</button>
    {(items||[]).map(it=>(
      <div className="card" key={it.id} style={{marginBottom:11}}>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:9}}>
          <FI value={it.name} onChange={e=>upd(it.id,'name',e.target.value)} placeholder="Suplemento"/>
          <button className="btn-icon" onClick={()=>del(it.id)}>×</button>
        </div>
        <div className="fgrid" style={{gridTemplateColumns:'1fr 1fr'}}>
          <FI value={it.dose||''} onChange={e=>upd(it.id,'dose',e.target.value)} placeholder="Dose (ex: 5 g)"/>
          <FI value={it.timing||''} onChange={e=>upd(it.id,'timing',e.target.value)} placeholder="Horário (ex: pós-treino)"/>
        </div>
        <div style={{marginTop:9}}><FI value={it.notes||''} onChange={e=>upd(it.id,'notes',e.target.value)} placeholder="Observação (opcional)"/></div>
      </div>))}
    <button className="btn btn-ghost btn-sm" style={{width:'100%'}} onClick={addManual}>Adicionar manual</button>
    <div style={{position:'sticky',bottom:0,padding:'14px 0',marginTop:8}}>
      <button className="btn btn-primary" style={{width:'100%'}} disabled={busy} onClick={save}>
        {busy?'Salvando…':saved?'Salvo':'Salvar suplementação'}</button>
    </div>
    {picker&&<SuppPicker onPick={x=>{addLib(x);setPicker(false);}} onClose={()=>setPicker(false)}/>}
  </div>);
}

/* Registros do aluno: fotos de refeição, cardio, adesão e peso.
   O peso vem do train_diario (fonte única), não mais do weight_logs. */
function NutriRegistros({fichaId,studentUid,demo}){
  const [d,setD]=useState(demo?{photos:[],cardio:[],peso:[],checks:[]}:null);
  useEffect(()=>{if(demo)return;(async()=>{
    const [ph,cd,pe,ck]=await Promise.all([
      sb.from('photos').select('*').eq('student_id',studentUid).order('created_at',{ascending:false}).limit(30),
      sb.from('cardio_logs').select('*').eq('student_id',studentUid).order('day',{ascending:false}).limit(15),
      sb.from('train_diario').select('data,peso').eq('student_id',fichaId).not('peso','is',null).order('data',{ascending:false}).limit(15),
      sb.from('checkins').select('day').eq('student_id',studentUid).order('day',{ascending:false}).limit(60),
    ]);
    setD({photos:ph.data||[],cardio:cd.data||[],peso:pe.data||[],checks:ck.data||[]});
  })().catch(()=>setD({photos:[],cardio:[],peso:[],checks:[]}));},[studentUid,fichaId,demo]);

  if(!d)return <div className="center-screen" style={{minHeight:160}}><div className="spinner"/></div>;
  const dias7=[...new Set(d.checks.map(c=>c.day))].filter(x=>{
    const diff=(new Date(todayStr())-new Date(x))/86400000;return diff>=0&&diff<7;}).length;
  const box=(lbl,val,un)=>(<div style={{flex:1,minWidth:110,background:'var(--bg3,#f7f4ef)',borderRadius:14,padding:'12px 13px'}}>
    <div style={{fontSize:10.5,color:'var(--text2)',textTransform:'uppercase',letterSpacing:.5,fontWeight:700}}>{lbl}</div>
    <div style={{fontFamily:'var(--serif)',fontSize:23,fontWeight:700,color:'var(--accent)',marginTop:3}}>
      {val}{un&&<span style={{fontSize:12,fontWeight:600}}> {un}</span>}</div></div>);
  return(<div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16}}>
      {box('Adesão (7 dias)',dias7,'/7')}
      {box('Cardios',d.cardio.length,'')}
      {box('Peso atual',d.peso[0]?d.peso[0].peso:'—','kg')}
      {box('Fotos',d.photos.length,'')}
    </div>
    <div className="card" style={{marginBottom:14}}>
      <div className="sec-title">Fotos enviadas</div>
      {d.photos.length===0?<p className="s-meta">Nenhuma foto ainda.</p>:
        <div className="photo-grid">{d.photos.map(x=>(
          <FotoThumb key={x.id} url={x.url} alt={x.kind==='progress'?'Foto de progresso':'Foto da refeição'}
            legenda={(x.kind==='progress'?'Progresso':'Refeição')+' · '+fmtTime(x.created_at)}/>))}</div>}
    </div>
    <div className="card" style={{marginBottom:14}}>
      <div className="sec-title">Cardio</div>
      {d.cardio.length===0?<p className="s-meta">Nenhum registro.</p>:
        d.cardio.map(c=>(<div key={c.id} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
          <span>{fmtDate(c.day)} · {c.type}</span>
          <span className="muted">{c.duration_min} min · {r0(c.kcal)} kcal</span></div>))}
    </div>
    <div className="card">
      <div className="sec-title">Peso</div>
      {d.peso.length===0?<p className="s-meta">Nenhum registro no diário.</p>:
        d.peso.map(w=>(<div key={w.data} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
          <span>{fmtDate(w.data)}</span><span className="muted">{w.peso} kg</span></div>))}
    </div>
  </div>);
}

/* A pergunta que faltava antes de criar um cadastro.
   Mostra o que cada cadastro já carrega — avaliações, treinos, séries — porque
   é isso que se perde quando o treinador cria um paralelo por engano. E deixa
   "criar um novo" à mão, sem esconder: xará existe de verdade. */
function CandidatosModal({dados,imp,onLigar,onNova,onFechar}){
  const {perfil,lista}=dados;
  const busy=imp===perfil.id;
  const oQueTem=c=>{
    const p=[];
    if(c.avaliacoes)p.push(c.avaliacoes+(c.avaliacoes>1?' avaliações':' avaliação'));
    if(c.divisoes)p.push(c.divisoes+' treino'+(c.divisoes>1?'s':'')+' na ficha');
    if(c.treinos)p.push(c.treinos+' série'+(c.treinos>1?'s':'')+' no histórico');
    return p.length?p.join(' · '):'sem histórico ainda';
  };
  return(<div style={{position:'fixed',inset:0,zIndex:120,background:'rgba(10,8,10,.8)',display:'flex',alignItems:'center',justifyContent:'center',padding:16,overflow:'auto'}} onClick={onFechar}>
    <div className="card" style={{maxWidth:500,width:'100%'}} onClick={e=>e.stopPropagation()}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
        <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:600}}>Você já tem esta pessoa?</div>
        <button className="btn-icon btn-sm" onClick={onFechar}>×</button>
      </div>
      <p className="s-meta" style={{marginBottom:12,lineHeight:1.5}}>
        <b>{perfil.name||'Este aluno'}</b> vem do Nutrition. Achei {lista.length===1?'um cadastro seu':lista.length+' cadastros seus'} com
        o mesmo primeiro nome e sem conta ligada. Se for a mesma pessoa, ligue a conta nele — o
        histórico continua onde está. Se for outra pessoa, crie um cadastro novo.
      </p>
      {lista.map(c=>(
        <div key={c.student_id} style={{display:'flex',gap:10,alignItems:'center',padding:'10px 0',borderTop:'1px solid var(--border)'}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600}}>{c.nome}</div>
            <div className="s-meta">{oQueTem(c)}</div>
            <div className="s-meta">
              {[c.nascimento?'nasc. '+new Date(c.nascimento+'T00:00:00').toLocaleDateString('pt-BR'):null,
                c.telefone||null,
                'criado em '+new Date(c.criado+'T00:00:00').toLocaleDateString('pt-BR')].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={()=>onLigar(c)}>É esta</button>
        </div>))}
      <button className="btn btn-ghost btn-sm" style={{width:'100%',marginTop:14}} disabled={busy} onClick={onNova}>
        {busy?'…':'Nenhuma delas — criar um cadastro novo'}
      </button>
    </div>
  </div>);
}
function NutriScreen({coach,students,preStudent,onBack,onNovoAluno}){
  const demo=!!coach._demo;
  const [stu,setStu]=useState(preStudent||null);
  const [q,setQ]=useState('');
  const [uid_,setUid]=useState(undefined);   // undefined=carregando, null=aluno sem conta ativa
  const [aba,setAba]=useState('plano');
  const [semFicha,setSemFicha]=useState([]);
  const [imp,setImp]=useState(null);

  useEffect(()=>{if(demo){setSemFicha([]);return;}
    sb.rpc('alunos_sem_ficha').then(({data})=>setSemFicha(data||[])).catch(()=>setSemFicha([]));},[]);

  useEffect(()=>{if(!stu){setUid(undefined);return;}
    if(demo){setUid('demo-uid');return;}
    setUid(undefined);
    sb.from('assess_students').select('user_id').eq('id',stu.id).maybeSingle()
      .then(({data})=>setUid(data&&data.user_id?data.user_id:null)).catch(()=>setUid(null));},[stu&&stu.id]);

  /* Trazer um aluno da Nutrição para o Performance.
     Isto aqui criava cadastro novo SEMPRE. Só conferia se já existia cadastro
     com aquele login — nunca se o treinador já tinha aquela pessoa cadastrada
     sem conta ligada. Em 12/08 foi assim que nasceram onze cadastros paralelos:
     o Jefferson ganhou uma segunda ficha, e as duas avaliações dele ficaram na
     primeira, invisíveis na tela de Evolução dele.
     Agora pergunta antes, com o histórico de cada candidato à vista. Quem
     decide é ele; o app não adivinha — xará existe (há três Biancas). */
  const [candidatos,setCandidatos]=useState(null);   // {perfil, lista}
  const criarNova=async(p)=>{
    setImp(p.id);setCandidatos(null);
    try{
      await gravar(sb.rpc('ficha_criar_de_perfil',{p_uid:p.id}));
      setSemFicha(l=>l.filter(x=>x.id!==p.id));
      alert('Ficha de '+(p.name||'aluno')+' criada! Ela aparece na lista de alunos do Performance.');
    }catch(e){alert('Erro ao importar: '+porQueFalhou(e));}
    setImp(null);
  };
  const ligarNoExistente=async(p,c)=>{
    setImp(p.id);
    try{
      const {data}=await gravar(sb.rpc('ficha_ligar_perfil',{p_uid:p.id,p_student:c.student_id}));
      if(data&&data.ok===false)throw new Error(data.erro||'não deu');
      setCandidatos(null);
      setSemFicha(l=>l.filter(x=>x.id!==p.id));
      alert('Pronto: a conta de '+(p.name||'aluno')+' foi ligada ao cadastro "'+c.nome+'". '+
        'O histórico que já estava lá continua no lugar.');
    }catch(e){alert('Não consegui ligar: '+porQueFalhou(e));}
    setImp(null);
  };
  const importar=async(p)=>{
    setImp(p.id);
    try{
      const {data}=await gravar(sb.rpc('ficha_perfil_candidatos',{p_uid:p.id}));
      setImp(null);
      if(data&&data.length){setCandidatos({perfil:p,lista:data});return;}
    }catch(e){setImp(null);/* não achei candidato: segue e cria, como antes */}
    await criarNova(p);
  };

  if(!stu){
    const list=(students||[]).filter(s=>s.name.toLowerCase().includes(q.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
    return(<div>
      <div className="abar"><div><div className="breadcrumb" onClick={onBack}>← Painel</div>
        <div className="ph-title">Nutrição</div><div className="ph-sub">Escolha o aluno para montar o plano alimentar</div></div></div>
      {demo&&<div className="alert alert-warn">Modo demonstração: os planos não são salvos.</div>}
      {semFicha.length>0&&<div className="card" style={{marginBottom:16}}>
        <div style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:600,marginBottom:4}}>Alunos vindos do MF Nutrition</div>
        <p className="s-meta" style={{marginBottom:10}}>Estes alunos já são seus no Nutrition, mas ainda não têm ficha aqui no Performance. Importe para avaliar e montar treino.</p>
        {semFicha.map(p=>(<div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:14}}>{p.name||'Sem nome'}</div>
            <div style={{fontSize:11.5,color:'var(--text2)'}}>{p.email||''}</div></div>
          <button className="btn btn-secondary btn-sm" disabled={imp===p.id} onClick={()=>importar(p)}>{imp===p.id?'…':'Importar'}</button>
        </div>))}
      </div>}
      {candidatos&&<CandidatosModal dados={candidatos} imp={imp}
        onLigar={c=>ligarNoExistente(candidatos.perfil,c)}
        onNova={()=>criarNova(candidatos.perfil)}
        onFechar={()=>setCandidatos(null)}/>}
      {(students||[]).length>0&&<div className="search-wrap" style={{marginBottom:16}}><span className="search-icon"><IconBusca/></span>
        <input className="fi" placeholder="Buscar aluno..." value={q} onChange={e=>setQ(e.target.value)}/></div>}
      <div className="student-grid">{list.map(s=>(
        <div key={s.id} className="student-card" onClick={()=>setStu(s)}>
          <div style={{fontWeight:600,fontFamily:'var(--serif)',fontSize:16}}>{s.name}</div>
          <div style={{fontSize:12,color:'var(--text2)',marginTop:2}}>Montar plano alimentar</div>
        </div>))}</div>
      {(students||[]).length===0
        ? <SemAlunos oque="O plano alimentar é sempre de alguém." onNovo={onNovoAluno}/>
        : list.length===0&&<div className="empty"><div className="empty-title">Nenhum aluno com esse nome</div></div>}
    </div>);
  }

  return(<div>
    <div className="abar"><div><div className="breadcrumb" onClick={()=>setStu(null)}>← Nutrição</div>
      <div className="ph-title">{stu.name}</div><div className="ph-sub">Plano, suplementos e registros</div></div></div>
    {uid_&&<div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
      {[['plano','Plano alimentar'],['supp','Suplementos'],['reg','Registros']].map(([k,l])=>(
        <button key={k} className={`btn btn-sm ${aba===k?'btn-primary':'btn-ghost'}`} onClick={()=>setAba(k)}>{l}</button>))}
    </div>}
    {uid_===undefined?<div className="center-screen" style={{minHeight:180}}><div className="spinner"/></div>:
     uid_===null?(<div className="empty">       <div className="empty-title">Aluno ainda não ativou a conta</div>
       <p className="s-meta" style={{maxWidth:420,margin:'0 auto'}}>
         O plano alimentar é entregue no app do aluno, então {stu.name.split(' ')[0]} precisa primeiro criar a conta
         e digitar o código de acesso. Gere o código na ficha do aluno (aba Treino) e mande por WhatsApp.</p></div>):
     aba==='supp'?<NutriSuplementos coach={coach} studentUid={uid_} studentName={stu.name} demo={demo}/>:
     aba==='reg'?<NutriRegistros fichaId={stu.id} studentUid={uid_} demo={demo}/>:
     <NutriPlanEditor coach={coach} studentUid={uid_} studentName={stu.name} demo={demo}/>}
  </div>);
}


/* ════════════ PERIODIZAÇÃO (macro > meso > micro) ════════════ */
const PERIO_MODELOS=['Linear','Ondulatória semanal','Ondulatória diária','Em blocos','Conjugada','Reversa','Alternada'];

/* Ciclos prontos: o treinador aplica em um toque e depois ajusta o que quiser.
   volume/intensidade são percentuais relativos, do jeito que a tela já usa. */
const MODELOS_PERIO=[
  {id:'hipertrofia12', nome:'Hipertrofia — 12 semanas',
   resumo:'3 fases: adaptação, acúmulo e intensificação, com uma semana leve no fim de cada.',
   fases:[
     {nome:'Adaptação',      modelo:'Linear',      micros:[{nome:'Semanas 1–3',semanas:3,volume:85,intensidade:65},{nome:'Descarga',semanas:1,volume:55,intensidade:60,deload:true}]},
     {nome:'Acúmulo',        modelo:'Linear',      micros:[{nome:'Semanas 5–7',semanas:3,volume:110,intensidade:75},{nome:'Descarga',semanas:1,volume:60,intensidade:65,deload:true}]},
     {nome:'Intensificação', modelo:'Ondulatória semanal', micros:[{nome:'Semanas 9–11',semanas:3,volume:95,intensidade:88},{nome:'Descarga',semanas:1,volume:50,intensidade:60,deload:true}]},
   ]},
  {id:'forca12', nome:'Força — 12 semanas',
   resumo:'Volume cai e carga sobe a cada fase, fechando com pico e semana de recuperação.',
   fases:[
     {nome:'Base',   modelo:'Linear', micros:[{nome:'Semanas 1–4',semanas:4,volume:100,intensidade:70}]},
     {nome:'Força',  modelo:'Linear', micros:[{nome:'Semanas 5–8',semanas:4,volume:80,intensidade:85}]},
     {nome:'Pico',   modelo:'Linear', micros:[{nome:'Semanas 9–11',semanas:3,volume:60,intensidade:95},{nome:'Recuperação',semanas:1,volume:40,intensidade:55,deload:true}]},
   ]},
  {id:'emagrecimento8', nome:'Emagrecimento — 8 semanas',
   resumo:'Volume alto e descanso curto, com metabólico no fim de cada bloco.',
   fases:[
     {nome:'Bloco 1', modelo:'Em blocos', micros:[{nome:'Semanas 1–3',semanas:3,volume:115,intensidade:65},{nome:'Descarga',semanas:1,volume:60,intensidade:55,deload:true}]},
     {nome:'Bloco 2', modelo:'Em blocos', micros:[{nome:'Semanas 5–7',semanas:3,volume:125,intensidade:70},{nome:'Descarga',semanas:1,volume:60,intensidade:55,deload:true}]},
   ]},
  {id:'iniciante8', nome:'Iniciante — 8 semanas',
   resumo:'Aprender o movimento primeiro; a carga entra só na segunda fase.',
   fases:[
     {nome:'Aprendizado', modelo:'Linear', micros:[{nome:'Semanas 1–4',semanas:4,volume:70,intensidade:55}]},
     {nome:'Progressão',  modelo:'Linear', micros:[{nome:'Semanas 5–8',semanas:4,volume:90,intensidade:70}]},
   ]},
];

function PeriodizacaoScreen({coach,students,preStudent,onBack,onNovoAluno}){
  const demo=!!coach._demo;
  const [stu,setStu]=useState(preStudent||null);
  const [q,setQ]=useState('');
  const [macro,setMacro]=useState(undefined);
  const [mesos,setMesos]=useState([]);
  const [micros,setMicros]=useState({});
  const [divs,setDivs]=useState([]);
  const [msg,setMsg]=useState(null);
  const [busy,setBusy]=useState(false);
  const [meus,setMeus]=useState([]);

  // ciclos que o treinador salvou como modelo
  const carregarMeus=()=>{if(demo)return;
    sb.from('train_perio_modelo').select('*').order('created_at',{ascending:false})
      .then(({data})=>setMeus((data||[]).map(x=>({...x,_meu:true})))).catch(()=>{});};
  useEffect(()=>{carregarMeus();},[]);

  const load=async(sid)=>{
    if(demo){setMacro(null);return;}
    setMacro(undefined);
    const {data:ma}=await sb.from('train_macro').select('*').eq('student_id',sid).eq('ativo',true)
      .order('created_at',{ascending:false}).limit(1).maybeSingle();
    const {data:dv}=await sb.from('train_divisao').select('id,nome').eq('student_id',sid).order('ordem');
    setDivs(dv||[]);
    if(!ma){setMacro(null);setMesos([]);setMicros({});return;}
    const {data:me}=await sb.from('train_meso').select('*').eq('macro_id',ma.id).order('ordem');
    const ids=(me||[]).map(x=>x.id);
    let mi=[];
    if(ids.length){const r=await sb.from('train_micro').select('*').in('meso_id',ids).order('ordem');mi=r.data||[];}
    const map={};(me||[]).forEach(x=>map[x.id]=mi.filter(y=>y.meso_id===x.id));
    setMacro(ma);setMesos(me||[]);setMicros(map);
  };
  useEffect(()=>{if(stu)load(stu.id);},[stu&&stu.id]);

  const erro=e=>setMsg({t:'err',m:/train_macro|does not exist|PGRST205|42P01/.test(e.message||'')
    ?'Rode o SQL da periodização no Supabase para liberar esta tela.':'Erro: '+(e.message||e)});

  const criarMacro=async()=>{
    if(demo)return;
    setBusy(true);
    const {data,error}=await sb.from('train_macro').insert({coach_id:coach.id,student_id:stu.id,
      nome:'Macrociclo',data_inicio:todayStr()}).select().single();
    setBusy(false);
    if(error){erro(error);return;}
    setMacro(data);setMesos([]);setMicros({});
  };
  /* A periodização inteira gravava sem ler a resposta: nome do macrociclo,
     fases, microciclos, tudo. O treinador montava o ciclo com o aluno na
     frente, via cada campo mudar na tela, e o banco podia não ter recebido
     nada. Na volta, ciclo em branco. Aqui todas conferem e recarregam do
     servidor quando falham — a tela passa a mostrar o que existe. */
  const recarregar=async()=>{try{if(stu)await load(stu.id);}catch(e){}};
  const salvarMacro=async(campos)=>{setMacro(m=>({...m,...campos}));
    if(demo)return;
    const {error}=await comPrazo(sb.from('train_macro').update(campos).eq('id',macro.id));
    if(error){erro(error);await recarregar();}};

  // Cria o macrociclo já com as fases e os microciclos do modelo escolhido.
  const usarModelo=async(mod)=>{
    if(demo)return;
    setBusy(true);setMsg(null);
    try{
      const {data:ma,error:e1}=await sb.from('train_macro').insert({coach_id:coach.id,student_id:stu.id,
        nome:mod.nome,data_inicio:todayStr()}).select().single();
      if(e1)throw e1;
      for(const [i,fase] of mod.fases.entries()){
        const {data:me,error:e2}=await sb.from('train_meso').insert({macro_id:ma.id,
          nome:fase.nome,modelo:fase.modelo||'Linear',foco:fase.foco||null,ordem:i}).select().single();
        if(e2)throw e2;
        for(const [j,mi] of (fase.micros||[]).entries()){
          const {error:e3}=await sb.from('train_micro').insert({meso_id:me.id,nome:mi.nome,ordem:j,
            semanas:mi.semanas,volume:mi.volume,intensidade:mi.intensidade,deload:!!mi.deload});
          if(e3)throw e3;
        }
      }
      await load(stu.id);
      setMsg({t:'ok',m:'Ciclo “'+mod.nome+'” criado. Ajuste o que quiser abaixo.'});
    }catch(e){erro(e);}
    setBusy(false);
  };

  const addMeso=async()=>{
    const {data,error}=await sb.from('train_meso').insert({macro_id:macro.id,
      nome:'Fase '+(mesos.length+1),modelo:'Linear',ordem:mesos.length}).select().single();
    if(error){erro(error);return;}
    setMesos(l=>[...l,data]);setMicros(m=>({...m,[data.id]:[]}));
  };
  const updMeso=async(id,campos)=>{setMesos(l=>l.map(x=>x.id===id?{...x,...campos}:x));
    const {error}=await comPrazo(sb.from('train_meso').update(campos).eq('id',id));
    if(error){erro(error);await recarregar();}};
  const delMeso=async(id)=>{if(!confirm('Excluir esta fase e os microciclos dela?'))return;
    setMesos(l=>l.filter(x=>x.id!==id));
    const {error}=await comPrazo(sb.from('train_meso').delete().eq('id',id));
    if(error){erro(error);await recarregar();}};

  const addMicro=async(mesoId)=>{
    const atuais=micros[mesoId]||[];
    const {data,error}=await sb.from('train_micro').insert({meso_id:mesoId,
      nome:'Semana '+(atuais.length+1),ordem:atuais.length,semanas:1,volume:100,intensidade:100}).select().single();
    if(error){erro(error);return;}
    setMicros(m=>({...m,[mesoId]:[...atuais,data]}));
  };
  const updMicro=async(mesoId,id,campos)=>{
    setMicros(m=>({...m,[mesoId]:(m[mesoId]||[]).map(x=>x.id===id?{...x,...campos}:x)}));
    const {error}=await comPrazo(sb.from('train_micro').update(campos).eq('id',id));
    if(error){erro(error);await recarregar();}};
  const delMicro=async(mesoId,id)=>{
    setMicros(m=>({...m,[mesoId]:(m[mesoId]||[]).filter(x=>x.id!==id)}));
    const {error}=await comPrazo(sb.from('train_micro').delete().eq('id',id));
    if(error){erro(error);await recarregar();}};

  // Guarda o ciclo montado para reaproveitar em outros alunos.
  // A ficha ligada a cada microciclo não vai junto: ela é de um aluno só.
  const salvarCicloComoModelo=async()=>{
    if(!mesos.length){setMsg({t:'err',m:'Monte pelo menos uma fase antes de salvar o modelo.'});return;}
    const nome=prompt('Nome do modelo:',macro.nome||'Meu ciclo');
    if(!nome)return;
    setBusy(true);setMsg(null);
    try{
      const fases=mesos.map(me=>({nome:me.nome,modelo:me.modelo||'Linear',foco:me.foco||null,
        micros:(micros[me.id]||[]).map(x=>({nome:x.nome,semanas:x.semanas,
          volume:x.volume,intensidade:x.intensidade,deload:!!x.deload}))}));
      const semanas=fases.reduce((a,f)=>a+f.micros.reduce((b,x)=>b+(x.semanas||0),0),0);
      const {data,error}=await sb.from('train_perio_modelo').insert({coach_id:coach.id,nome,
        resumo:macro.objetivo||(fases.length+' fases · '+semanas+' semanas'),fases}).select().single();
      if(error)throw error;
      setMeus(l=>[{...data,_meu:true},...l]);
      setMsg({t:'ok',m:'Modelo “'+nome+'” salvo. Ele aparece na lista quando você montar o ciclo de outro aluno.'});
    }catch(e){erro(e);}
    setBusy(false);
  };
  const apagarModelo=async(ev,m)=>{ev.stopPropagation();
    if(!confirm('Apagar o modelo "'+m.nome+'"? Os ciclos já montados não mudam.'))return;
    setMeus(l=>l.filter(x=>x.id!==m.id));
    // falhou: o modelo volta para a lista, senão some da tela e fica no banco
    const {error}=await comPrazo(sb.from('train_perio_modelo').delete().eq('id',m.id));
    if(error){erro(error);setMeus(l=>[m,...l]);}};

  const totalSemanas=mesos.reduce((a,me)=>a+(micros[me.id]||[]).reduce((b,mi)=>b+(mi.semanas||0),0),0);
  const fim=(()=>{if(!macro||!macro.data_inicio||!totalSemanas)return null;
    const d=new Date(macro.data_inicio+'T00:00:00');d.setDate(d.getDate()+totalSemanas*7-1);return d.toLocaleDateString('pt-BR');})();

  if(!stu){
    const list=(students||[]).filter(x=>x.name.toLowerCase().includes(q.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
    return(<div>
      <div className="abar"><div><div className="breadcrumb" onClick={onBack}>← Painel</div>
        <div className="ph-title">Periodização</div>
        <div className="ph-sub">Escolha o aluno para planejar macro, meso e microciclos</div></div></div>
      {(students||[]).length>0&&<div className="search-wrap" style={{marginBottom:16}}><span className="search-icon"><IconBusca/></span>
        <input className="fi" placeholder="Buscar aluno..." value={q} onChange={e=>setQ(e.target.value)}/></div>}
      <div className="student-grid">{list.map(x=>(
        <div key={x.id} className="student-card" onClick={()=>setStu(x)}>
          <div style={{fontWeight:600,fontFamily:'var(--serif)',fontSize:16}}>{x.name}</div>
          <div style={{fontSize:12,color:'var(--text2)',marginTop:2}}>Planejar temporada</div>
        </div>))}</div>
      {(students||[]).length===0
        ? <SemAlunos oque="A temporada é planejada para um aluno." onNovo={onNovoAluno}/>
        : list.length===0&&<div className="empty"><div className="empty-title">Nenhum aluno com esse nome</div></div>}
    </div>);
  }

  return(<div>
    <div className="abar"><div><div className="breadcrumb" onClick={()=>setStu(null)}>← Periodização</div>
      <div className="ph-title">{stu.name}</div>
      <div className="ph-sub">{totalSemanas>0?`${totalSemanas} semanas planejadas${fim?' · termina em '+fim:''}`:'Sem plano ainda'}</div></div></div>
    {msg&&<div className={`alert ${msg.t==='err'?'alert-danger':'alert-success'}`}>{msg.m}</div>}
    {demo&&<div className="alert alert-warn">Modo demonstração: o plano não é salvo.</div>}

    {macro===undefined?<div className="center-screen" style={{minHeight:180}}><div className="spinner"/></div>:
     macro===null?(<div>
       <div style={{textAlign:'center',padding:'26px 20px 6px'}}>
         <div className="empty-title">Nenhum ciclo montado</div>
         <p className="s-meta" style={{maxWidth:480,margin:'6px auto 0'}}>
           Comece por um modelo pronto e ajuste as fases depois — ou monte do zero.</p>
       </div>
       <div className="student-grid" style={{marginTop:16}}>
         {[...meus,...MODELOS_PERIO].map(m=>{
           const fases=m.fases||[];
           const semanas=fases.reduce((a,f)=>a+(f.micros||[]).reduce((b,x)=>b+(x.semanas||0),0),0);
           return(
           <div key={m.id} className="student-card" style={{cursor:busy?'default':'pointer',textAlign:'left'}}
             onClick={()=>{if(!busy)usarModelo(m);}}>
             <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
               <div className="s-name">{m.nome}</div>
               {m._meu&&<button className="btn-icon btn-sm" title="Apagar modelo" onClick={ev=>apagarModelo(ev,m)}>×</button>}
             </div>
             <div className="s-meta" style={{marginTop:6,lineHeight:1.5}}>{m.resumo}</div>
             <div style={{marginTop:10,fontSize:11.5,color:'var(--text3)'}}>
               {fases.length} fases · {semanas} semanas{m._meu?' · modelo seu':''}</div>
             <button className="btn btn-primary btn-sm" style={{marginTop:12}} disabled={busy}
               onClick={ev=>{ev.stopPropagation();usarModelo(m);}}>{busy?'Criando…':'Usar este'}</button>
           </div>);})}
       </div>
       <div style={{textAlign:'center',marginTop:18}}>
         <button className="btn btn-secondary" disabled={busy} onClick={criarMacro}>Montar do zero</button></div>
     </div>):
    (<>
      <div className="card" style={{marginBottom:14}}>
        <div className="fgrid">
          <FI label="Nome do macrociclo" value={macro.nome||''} onChange={e=>salvarMacro({nome:e.target.value})}/>
          <FI label="Início" type="date" value={macro.data_inicio||''} onChange={e=>salvarMacro({data_inicio:e.target.value})}/>
        </div>
        <FI label="Objetivo" value={macro.objetivo||''} onChange={e=>salvarMacro({objetivo:e.target.value})}
          placeholder="Ex.: ganho de massa magra com manutenção de percentual de gordura"/>
        <div className="bgroup" style={{marginTop:12}}>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={salvarCicloComoModelo}>
            {busy?'Salvando…':'Salvar este ciclo como modelo'}</button>
        </div>
      </div>

      {mesos.map((me,mi_)=>{
        const lista=micros[me.id]||[];
        const sem=lista.reduce((a,x)=>a+(x.semanas||0),0);
        return(<div className="card" key={me.id} style={{marginBottom:12}}>
          <div className="fgrid" style={{gridTemplateColumns:'2fr 1.4fr auto'}}>
            <FI label={'Fase '+(mi_+1)} value={me.nome||''} onChange={e=>updMeso(me.id,{nome:e.target.value})}/>
            <div className="fg"><label className="flbl">Modelo</label>
              <select className="fi" value={me.modelo||'Linear'} onChange={e=>updMeso(me.id,{modelo:e.target.value})}>
                {PERIO_MODELOS.map(x=><option key={x}>{x}</option>)}</select></div>
            <div style={{display:'flex',alignItems:'flex-end'}}>
              <button className="btn-icon" title="Excluir fase" onClick={()=>delMeso(me.id)}>×</button></div>
          </div>
          <FI label="Foco" value={me.foco||''} onChange={e=>updMeso(me.id,{foco:e.target.value})}
            placeholder="Ex.: adaptação anatômica, força máxima, choque metabólico"/>
          <div className="s-meta" style={{margin:'8px 0 4px'}}>{sem} semana{sem!==1?'s':''} nesta fase</div>

          {lista.map(x=>(
            <div key={x.id} style={{background:'var(--bg3,#f7f4ef)',borderRadius:12,padding:12,marginTop:8}}>
              <div className="fgrid" style={{gridTemplateColumns:'2fr 1fr 1fr 1fr auto'}}>
                <FI label="Microciclo" value={x.nome||''} onChange={e=>updMicro(me.id,x.id,{nome:e.target.value})}/>
                <FI label="Semanas" type="number" value={x.semanas} onChange={e=>updMicro(me.id,x.id,{semanas:Math.max(1,parseInt(e.target.value)||1)})}/>
                <FI label="Volume %" type="number" value={x.volume==null?'':x.volume} onChange={e=>updMicro(me.id,x.id,{volume:e.target.value===''?null:parseInt(e.target.value)})}/>
                <FI label="Intens. %" type="number" value={x.intensidade==null?'':x.intensidade} onChange={e=>updMicro(me.id,x.id,{intensidade:e.target.value===''?null:parseInt(e.target.value)})}/>
                <div style={{display:'flex',alignItems:'flex-end'}}>
                  <button className="btn-icon" title="Excluir microciclo" onClick={()=>delMicro(me.id,x.id)}>×</button></div>
              </div>
              <div className="fgrid" style={{gridTemplateColumns:'2fr 1fr',marginTop:8}}>
                <div className="fg"><label className="flbl">Ficha de treino</label>
                  <select className="fi" value={x.divisao_id||''} onChange={e=>updMicro(me.id,x.id,{divisao_id:e.target.value||null})}>
                    <option value="">Mantém a ficha atual</option>
                    {divs.map(d=><option key={d.id} value={d.id}>{d.nome}</option>)}</select></div>
                <div className="fg"><label className="flbl">Semana de descarga</label>
                  <select className="fi" value={x.deload?'1':'0'} onChange={e=>updMicro(me.id,x.id,{deload:e.target.value==='1'})}>
                    <option value="0">Não</option><option value="1">Sim</option></select></div>
              </div>
            </div>))}
          <button className="btn btn-secondary btn-sm" style={{marginTop:10}} onClick={()=>addMicro(me.id)}>Adicionar microciclo</button>
        </div>);})}

      <button className="btn btn-primary" style={{width:'100%'}} onClick={addMeso}>Adicionar fase (mesociclo)</button>
    </>)}
  </div>);
}

/* Card do aluno: em que semana do plano ele está */
function PeriodizacaoAluno({demo}){
  const [p,setP]=useState(undefined);
  useEffect(()=>{
    if(demo){setP({ok:true,macro:true,macro_nome:'Temporada 2026',semana_atual:7,semanas_total:24,
      atual:{micro_nome:'Semana 3',meso_nome:'Hipertrofia',modelo:'Ondulatória semanal',
      foco:'Volume alto, pausas curtas',volume:110,intensidade:75,deload:false,divisao:'A — Membros inferiores'}});return;}
    if(!sb){setP(null);return;}
    sb.rpc('periodizacao_atual',{p_student:null}).then(({data,error})=>setP(error?null:data)).catch(()=>setP(null));
  },[demo]);

  if(!p||!p.ok||!p.macro||!p.atual)return null;
  const a=p.atual;
  const pct=p.semanas_total?Math.min(100,Math.round((p.semana_atual/p.semanas_total)*100)):0;
  return(<div className="lv-card">
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
      <div className="lv-kick">{p.macro_nome}</div>
      <span style={{fontSize:12,fontWeight:800,color:'var(--lvt2)'}}>semana {p.semana_atual} de {p.semanas_total}</span>
    </div>
    <div style={{fontSize:17,fontWeight:800}}>{a.meso_nome}{a.deload?' — descarga':''}</div>
    <div className="lv-sub">{a.micro_nome} · {a.modelo}</div>
    {a.foco&&<div className="lv-sub" style={{marginTop:6,lineHeight:1.5}}>{a.foco}</div>}
    <div className="lv-freq" style={{marginTop:10}}><i style={{width:pct+'%'}}/></div>
    {(a.volume!=null||a.intensidade!=null)&&<div style={{display:'flex',gap:10,marginTop:12}}>
      {a.volume!=null&&<div style={{flex:1,textAlign:'center',background:'var(--lvc2)',borderRadius:12,padding:'9px 4px'}}>
        <div style={{fontSize:18,fontWeight:800,color:'var(--lvrx)'}}>{a.volume}%</div>
        <div className="lv-sub" style={{fontSize:10.5}}>volume</div></div>}
      {a.intensidade!=null&&<div style={{flex:1,textAlign:'center',background:'var(--lvc2)',borderRadius:12,padding:'9px 4px'}}>
        <div style={{fontSize:18,fontWeight:800,color:'var(--lvrx)'}}>{a.intensidade}%</div>
        <div className="lv-sub" style={{fontSize:10.5}}>intensidade</div></div>}
    </div>}
  </div>);
}

function App({profile,setProfile}){
  const coachId=profile.id;
  const [students,setStudents]=useState(null);
  const [evals,setEvals]=useState([]);
  const [view,setView]=useState('dashboard');
  const [selStudent,setSelStudent]=useState(null);
  const [selEval,setSelEval]=useState(null);
  const [editStu,setEditStu]=useState(null);
  const [editEv,setEditEv]=useState(null);
  const [reassess,setReassess]=useState(false);
  const [menu,setMenu]=useState(false);
  const [saving,setSaving]=useState(false);
  const [online,setOnline]=useState(typeof navigator!=='undefined'?navigator.onLine:true);
  const [pending,setPending]=useState(0);
  const [loadedOffline,setLoadedOffline]=useState(false);
  const [redeRuim,setRedeRuim]=useState(false); // conectado, mas o servidor não responde
  const [falhas,setFalhas]=useState([]);       // o que a sincronia não conseguiu subir
  const [recado,setRecado]=useState(null);     // confirmação curta de "salvei aqui"
  const avisarGuardado=t=>{setRecado(t);setTimeout(()=>setRecado(r=>r===t?null:r),4000);};
  const queueRef=useRef([]);
  const flushingRef=useRef(false);
  const [theme,setTheme]=useState(()=>{try{return localStorage.getItem('mfp_theme')||'light';}catch{return 'light';}});
  const toggleTheme=()=>{const t=theme==='dark'?'light':'dark';setTheme(t);document.documentElement.setAttribute('data-theme',t);
    if(window.MFP_corDaBarra)window.MFP_corDaBarra(t);
    try{localStorage.setItem('mfp_theme',t);}catch{}};

  const enqueue=async item=>{
    let q=[...queueRef.current];
    if(item.op==='stu-insert'||item.op==='ev-insert'){q=q.filter(x=>x.id!==item.id);q.push(item);}
    else if(item.op==='stu-update'){const ins=q.find(x=>x.id===item.id&&x.op==='stu-insert');if(ins)ins.row=item.row;else{q=q.filter(x=>!(x.id===item.id&&x.op==='stu-update'));q.push(item);}}
    else if(item.op==='ev-update'){const ins=q.find(x=>x.id===item.id&&x.op==='ev-insert');if(ins)ins.row=item.row;else{q=q.filter(x=>!(x.id===item.id&&x.op==='ev-update'));q.push(item);}}
    else if(item.op==='stu-delete'){if(isLocalId(item.id))q=q.filter(x=>x.id!==item.id&&!(x.row&&x.row.student_id===item.id));else q.push(item);}
    else if(item.op==='ev-delete'){if(isLocalId(item.id))q=q.filter(x=>x.id!==item.id);else q.push(item);}
    queueRef.current=q;await offQueueSave(coachId,q);setPending(q.length);
  };
  const reloadFromServer=async()=>{
    const [sr,ar]=await Promise.all([
      sb.from('assess_students').select('*').eq('coach_id',coachId).order('name'),
      sb.from('assessments').select('*').eq('coach_id',coachId)
    ]);
    if(sr.error||ar.error)throw(sr.error||ar.error);
    const st=(sr.data||[]).map(rowToStu),ev=(ar.data||[]).map(rowToEval);
    setStudents(st);setEvals(ev);offSnapSave(coachId,st,ev);setLoadedOffline(false);
  };
  const flushQueue=async()=>{
    if(flushingRef.current||profile._demo||!navigator.onLine||!queueRef.current.length)return;
    flushingRef.current=true;
    try{
      let q=[...queueRef.current];const idMap={};const ruins=[];
      while(q.length){
        const it=q[0];
        try{
          if(it.op==='stu-insert'){const {data,error}=await comPrazo(sb.from('assess_students').insert(it.row).select().single());if(error)throw error;idMap[it.id]=data.id;}
          else if(it.op==='stu-update'){const rid=idMap[it.id]||it.id;const {error}=await comPrazo(sb.from('assess_students').update(it.row).eq('id',rid));if(error)throw error;}
          else if(it.op==='stu-delete'){const rid=idMap[it.id]||it.id;if(!isLocalId(rid)){const {error}=await comPrazo(sb.from('assess_students').delete().eq('id',rid));if(error)throw error;}}
          else if(it.op==='ev-insert'){const row={...it.row};if(isLocalId(row.student_id))row.student_id=idMap[row.student_id]||row.student_id;const {data,error}=await comPrazo(sb.from('assessments').insert(row).select().single());if(error)throw error;idMap[it.id]=data.id;}
          else if(it.op==='ev-update'){const rid=idMap[it.id]||it.id;const row={...it.row};if(isLocalId(row.student_id))row.student_id=idMap[row.student_id]||row.student_id;const {error}=await comPrazo(sb.from('assessments').update(row).eq('id',rid));if(error)throw error;}
          else if(it.op==='ev-delete'){const rid=idMap[it.id]||it.id;if(!isLocalId(rid)){const {error}=await comPrazo(sb.from('assessments').delete().eq('id',rid));if(error)throw error;}}
        }catch(e){
          // sem rede: para a fila e tenta de novo depois, sem perder nada
          if(isNetErr(e))break;
          // erro definitivo: sai da fila, mas NUNCA em silêncio — antes isso
          // apagava a avaliação do treinador sem ele ficar sabendo
          ruins.push({op:it.op,quando:new Date().toISOString(),
            nome:(it.row&&(it.row.name||it.row.date))||it.id,
            motivo:(e&&e.message)||'erro desconhecido', item:it});
        }
        q.shift();queueRef.current=q;await offQueueSave(coachId,q);setPending(q.length);
      }
      if(ruins.length){setFalhas(f=>[...f,...ruins]);await IDB.set('falhas-'+coachId,[...(await IDB.get('falhas-'+coachId)||[]),...ruins]);}
      if(!q.length){setRedeRuim(false);try{await comPrazo(reloadFromServer(),15000);}catch(e){}}
    }finally{flushingRef.current=false;}
  };
  useEffect(()=>{let alive=true;(async()=>{
    if(profile._demo){setStudents(DEMO_STUDENTS);setEvals(DEMO_EVALS);return;}
    queueRef.current=await offQueueLoad(coachId);setPending(queueRef.current.length);
    setFalhas((await IDB.get('falhas-'+coachId))||[]);
    if(navigator.onLine){
      // prazo maior na abertura: é uma consulta, não uma gravação
      try{await comPrazo(reloadFromServer(),15000);if(!alive)return;flushQueue();return;}catch(e){}
    }
    const snap=await offSnapLoad(coachId);if(!alive)return;
    if(snap){setStudents(snap.students||[]);setEvals(snap.evals||[]);}else setStudents([]);
    setLoadedOffline(true);
  })();return()=>{alive=false;};},[coachId]);
  // cache espelha o estado atual (inclui registros locais pendentes)
  useEffect(()=>{if(profile._demo||students===null)return;offSnapSave(coachId,students,evals);},[students,evals]);
  // reconexão → sincroniza
  useEffect(()=>{const on=()=>{setOnline(true);flushQueue();};const off=()=>setOnline(false);
    window.addEventListener('online',on);window.addEventListener('offline',off);
    return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);};},[coachId]);

  // deixa a biblioteca de exercícios guardada desde a abertura, para a ficha
  // e a biblioteca funcionarem mesmo se o sinal cair antes de ele abrir a tela
  useEffect(()=>{if(profile._demo||!sb)return;
    lerCopia('lib-completa',sb.from('train_exercicios').select('*').order('grupo_muscular').order('nome'))
      .catch(()=>{});},[coachId]);

  const [intakeCount,setIntakeCount]=useState(0);
  useEffect(()=>{if(profile._demo||!sb)return;let alive=true;(async()=>{
    const {count}=await sb.from('assess_intakes').select('id',{count:'exact',head:true}).eq('coach_id',coachId).eq('status','pending');
    if(alive&&count!=null)setIntakeCount(count);
  })();return()=>{alive=false;};},[coachId,view]);

  // Aluno com conta e sem ficha abre o app numa tela vazia. O número fica no
  // menu para isso não passar batido.
  // mensagens de aluno esperando resposta
  const [naoLidas,setNaoLidas]=useState([]);
  const contarNaoLidas=React.useCallback(async()=>{
    if(profile._demo||!sb)return;
    try{const {data}=await sb.rpc('conversa_nao_lidas');setNaoLidas(data||[]);}catch(e){}
  },[profile._demo]);
  useEffect(()=>{contarNaoLidas();},[coachId,view]);

  const [semTreino,setSemTreino]=useState(0);
  const contarSemTreino=React.useCallback(async()=>{
    if(profile._demo||!sb)return;
    try{const {data}=await sb.rpc('alunos_sem_treino');setSemTreino((data||[]).length);}catch(e){}
  },[profile._demo]);
  useEffect(()=>{contarSemTreino();},[coachId,view]);   // volta ao painel, reconta

  const stuEvals=selStudent?evals.filter(e=>e.studentId===selStudent.id):[];
  const sortedStuEvals=[...stuEvals].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const lastHeight=sortedStuEvals[0]?.height||'';
  const go=v=>{setView(v);setMenu(false);};
  // Trocar de tela tem de levar para o topo dela. No celular, tocar num aluno
  // com a lista rolada abria a ficha no meio: o nome dele e a primeira fileira
  // de botões ficavam acima da dobra, escondidos atrás da barra do topo. Aqui
  // e não dentro do `go` porque o navegador reancora a rolagem depois que o
  // conteúdo novo entra — rolar antes da renderização não segura.
  useEffect(()=>{try{window.scrollTo(0,0);}catch(e){}},[view,selStudent&&selStudent.id]);

  const setPtype=(id,pt)=>{try{if(pt)localStorage.setItem('mfp_ptype_'+id,pt);else localStorage.removeItem('mfp_ptype_'+id);}catch(e){}};
  // await no enqueue: a gravação no aparelho precisa terminar antes de a tela
  // seguir, senão fechar o iPad no meio perde a fila
  const applyStuOffline=async(s,exists)=>{
    if(exists){setPtype(s.id,s.profile_type);setStudents(p=>p.map(x=>x.id===s.id?s:x));await enqueue({op:'stu-update',id:s.id,row:stuToRow(s,coachId)});setSelStudent(s);}
    else{const id='local-'+uid();const stu={...s,id};setPtype(id,s.profile_type);setStudents(p=>[...p,stu]);await enqueue({op:'stu-insert',id,row:stuToRow(stu,coachId)});setSelStudent(stu);}
    if(navigator.onLine)setRedeRuim(true);
    avisarGuardado('Aluno salvo no aparelho.');
  };
  const saveStu=async s=>{
    const exists=(students||[]).some(x=>x.id===s.id);
    if(!navigator.onLine){await applyStuOffline(s,exists);go('detail');return;}
    setSaving(true);
    try{
      if(exists){const {error}=await comPrazo(sb.from('assess_students').update(stuToRow(s,coachId)).eq('id',s.id));if(error)throw error;setPtype(s.id,s.profile_type);setStudents(p=>p.map(x=>x.id===s.id?s:x));setSelStudent(s);}
      else{const {data,error}=await comPrazo(sb.from('assess_students').insert(stuToRow(s,coachId)).select().single());if(error)throw error;setPtype(data.id,s.profile_type);const ns=rowToStu(data);setStudents(p=>[...p,ns]);setSelStudent(ns);}
      setSaving(false);go('detail');
    }catch(e){setSaving(false);if(isNetErr(e)){await applyStuOffline(s,exists);go('detail');}else alert('Erro ao salvar: '+e.message);}
  };
  const delStu=async id=>{
    if(!navigator.onLine||isLocalId(id)){setStudents(p=>p.filter(s=>s.id!==id));setEvals(p=>p.filter(e=>e.studentId!==id));await enqueue({op:'stu-delete',id});setSelStudent(null);go('dashboard');return;}
    try{const {error}=await comPrazo(sb.from('assess_students').delete().eq('id',id));if(error)throw error;
      setStudents(p=>p.filter(s=>s.id!==id));setEvals(p=>p.filter(e=>e.studentId!==id));setSelStudent(null);go('dashboard');
    }catch(e){if(isNetErr(e)){setStudents(p=>p.filter(s=>s.id!==id));setEvals(p=>p.filter(x=>x.studentId!==id));await enqueue({op:'stu-delete',id});setSelStudent(null);go('dashboard');}else alert('Erro ao excluir: '+e.message);}
  };
  const applyEvOffline=async(ev,exists)=>{
    if(exists){setEvals(p=>p.map(x=>x.id===ev.id?ev:x));await enqueue({op:'ev-update',id:ev.id,row:evalToRow(ev,coachId)});}
    else{const id='local-'+uid();const nev={...ev,id};setEvals(p=>[...p,nev]);await enqueue({op:'ev-insert',id,row:evalToRow(nev,coachId)});}
    if(navigator.onLine)setRedeRuim(true);
    avisarGuardado('Avaliação salva no aparelho. Sobe sozinha quando a internet voltar.');
  };
  const saveEv=async e=>{
    const ev={...e,studentId:selStudent.id};
    const exists=evals.some(x=>x.id===ev.id);
    if(!navigator.onLine){await applyEvOffline(ev,exists);go('detail');return;}
    setSaving(true);
    try{
      if(exists){const {error}=await comPrazo(sb.from('assessments').update(evalToRow(ev,coachId)).eq('id',ev.id));if(error)throw error;setEvals(p=>p.map(x=>x.id===ev.id?ev:x));}
      else{const {data,error}=await comPrazo(sb.from('assessments').insert(evalToRow(ev,coachId)).select().single());if(error)throw error;setEvals(p=>[...p,rowToEval(data)]);}
      setSaving(false);go('detail');
    }catch(err){setSaving(false);if(isNetErr(err)){await applyEvOffline(ev,exists);go('detail');}else alert('Erro ao salvar: '+err.message);}
  };
  const delEv=async id=>{
    if(!navigator.onLine||isLocalId(id)){setEvals(p=>p.filter(e=>e.id!==id));await enqueue({op:'ev-delete',id});return;}
    try{const {error}=await comPrazo(sb.from('assessments').delete().eq('id',id));if(error)throw error;setEvals(p=>p.filter(e=>e.id!==id));}
    catch(e){if(isNetErr(e)){setEvals(p=>p.filter(x=>x.id!==id));await enqueue({op:'ev-delete',id});}else alert('Erro ao excluir: '+e.message);}
  };
  const importIntake=async(it)=>{
    const d=it.data||{},ps=d.student||{},ed=d.eval||{},ph=d.photos||{};
    let stu=students.find(s=>s.id===it.student_id);
    if(!stu){
      const ns={name:it.student_name||ps.name||'Aluno',gender:ps.gender||'M',dob:ps.dob||'',phone:'',email:'',profession:'',
        goal:ps.goal||'',activity:ps.activity||'',schedule:ps.schedule||'',train_time:'',
        health:ps.health||'',meds:ps.meds||'',family_hist:'',injuries:ps.injuries||'',smoker:'Não',alcohol:'Não',sleep:ps.sleep||'',
        obs:'Cadastro criado a partir de ficha remota.',photo:ph.front||''};
      const {data,error}=await sb.from('assess_students').insert(stuToRow(ns,coachId)).select().single();
      if(error){alert('Erro ao criar aluno: '+error.message);return null;}
      stu=rowToStu(data);setStudents(p=>[...p,stu]);
    }
    const ev={...BLANK_EVAL,studentId:stu.id,date:todayStr(),...ed,
      post_photo_front:ph.front||'',post_photo_side:ph.side||'',post_photo_back:ph.back||'',
      obs:'Avaliação a partir de ficha remota enviada em '+fmtDate((it.created_at||'').slice(0,10))+'.'};
    const {data:er,error:ee}=await sb.from('assessments').insert(evalToRow(ev,coachId)).select().single();
    if(ee){alert('Erro ao importar avaliação: '+ee.message);return null;}
    setEvals(p=>[...p,rowToEval(er)]);
    /* Marcar a ficha remota como importada. Se falhar, o aluno e a avaliação
       já entraram — o que fica errado é a ficha continuar na fila de pendentes
       e ele importar duas vezes. Por isso avisa, em vez de sumir com o erro. */
    await gravarAvisando(sb.from('assess_intakes').update({status:'imported'}).eq('id',it.id),
      'A ficha remota foi importada, mas não consegui tirá-la da fila');
    return stu;
  };
  const exportData=()=>{
    const data={app:'MF Performance',v:2,exportedAt:new Date().toISOString(),coach:profile.name,students,evals};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const u=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=u;a.download='mf-performance-backup-'+todayStr()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
  };

  const subUntil=profile.perf_until;
  const daysLeft=subUntil?Math.ceil((new Date(subUntil+'T00:00:00')-new Date(todayStr()+'T00:00:00'))/86400000):null;

  if(students===null)return(
    <div className="app"><div style={{flex:1}}><div className="center-screen"><div style={{textAlign:'center'}}><LogoLifter size={120}/><div className="spinner"/></div></div></div></div>);

  // "Visão do aluno": o app do aluno ocupa a tela inteira, exatamente como ele vê
  if(view==='aluno-view'&&selStudent)
    return <StudentApp profile={profile} verComoAluno={selStudent} onSairDaVisao={()=>go('detail')}/>;

  return(
    <div className="app">
      <div className={`overlay ${menu?'show':''}`} onClick={()=>setMenu(false)}/>
      <div className={`sidebar ${menu?'open':''}`}>
        <div className="logo-row"><LogoMark size={44}/>
          <div><div className="logo-name">MF Performance</div><div className="logo-sub">Saúde & Performance</div></div></div>
        <button className={`nav-btn ${view==='dashboard'?'active':''}`} onClick={()=>go('dashboard')}>Dashboard</button>
        <button className="nav-btn" onClick={()=>{setEditStu(null);go('stu-form');}}>Novo aluno</button>
        <button className={`nav-btn ${view==='duplicados'?'active':''}`} onClick={()=>{setSelStudent(null);go('duplicados');}}>Cadastros repetidos</button>
        <button className={`nav-btn ${view==='agenda'?'active':''}`} onClick={()=>{setSelStudent(null);go('agenda');}}>Agenda</button>
        <button className={`nav-btn ${view==='intakes'?'active':''}`} onClick={()=>{setSelStudent(null);go('intakes');}}>Fichas online{intakeCount>0&&<span style={{marginLeft:6,background:'var(--gold)',color:'#1c0f16',borderRadius:10,padding:'0 7px',fontSize:11,fontWeight:700}}>{intakeCount}</span>}</button>
        <button className={`nav-btn ${view==='train'?'active':''}`} onClick={()=>{setSelStudent(null);go('train');}}>Treino</button>
        <button className={`nav-btn ${view==='recados'?'active':''}`} onClick={()=>{setSelStudent(null);go('recados');}}>Recados{naoLidas.length>0&&<span style={{marginLeft:6,background:'var(--red)',color:'#fff',borderRadius:10,padding:'0 7px',fontSize:11,fontWeight:700}}>{naoLidas.reduce((a,x)=>a+(x.quantas||0),0)}</span>}</button>
        <button className={`nav-btn ${view==='mes'?'active':''}`} onClick={()=>{setSelStudent(null);go('mes');}}>O mês</button>
        <button className={`nav-btn ${view==='dinheiro'?'active':''}`} onClick={()=>{setSelStudent(null);go('dinheiro');}}>Mensalidades</button>
        <button className={`nav-btn ${view==='semtreino'?'active':''}`} onClick={()=>{setSelStudent(null);go('semtreino');}}>Alunos sem treino{semTreino>0&&<span style={{marginLeft:6,background:'var(--gold)',color:'#1c0f16',borderRadius:10,padding:'0 7px',fontSize:11,fontWeight:700}}>{semTreino}</span>}</button>
        <button className={`nav-btn ${view==='tech'?'active':''}`} onClick={()=>{setSelStudent(null);go('tech');}}>Avaliação técnica</button>
        <button className={`nav-btn ${view==='nutri'?'active':''}`} onClick={()=>{setSelStudent(null);go('nutri');}}>Nutrição</button>
        <button className={`nav-btn ${view==='perio'?'active':''}`} onClick={()=>{setSelStudent(null);go('perio');}}>Periodização</button>
        <button className={`nav-btn ${view==='protocols'?'active':''}`} onClick={()=>go('protocols')}>Protocolos</button>
        {selStudent&&<>
          <hr className="nav-divider"/>
          <div className="nav-section">Aluno ativo</div>
          <button className={`nav-btn ${view==='detail'?'active':''}`} onClick={()=>go('detail')}>{selStudent.name.split(' ')[0]}</button>
          <button className="nav-btn" onClick={()=>{setEditEv(null);setReassess(false);go('ev-form');}}>Nova avaliação</button>
          {sortedStuEvals.length>0&&<button className="nav-btn" onClick={()=>{setEditEv(null);setReassess(true);go('ev-form');}}>Reavaliação</button>}
        </>}
        <hr className="nav-divider"/>
        <button className={`nav-btn ${view==='brand'?'active':''}`} onClick={()=>go('brand')}>Meu perfil / marca</button>
        {profile.is_admin&&<button className={`nav-btn ${view==='admin'?'active':''}`} onClick={()=>go('admin')}>Administração</button>}
        <button className="nav-btn" onClick={exportData}>Exportar backup</button>
        <button className="nav-btn" onClick={toggleTheme}>{theme==='dark'?'Tema claro':'Tema escuro'}</button>
        <div className="sidebar-footer">
          <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:10}}>
            <div className="avatar" style={{width:34,height:34,fontSize:13}}>{initials(profile.name)}</div>
            <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:12.5,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{profile.name||'Treinador'}</div>
              {daysLeft!=null&&<div style={{fontSize:10.5,color:daysLeft<=5?'var(--red)':'var(--text3)'}}>
                {daysLeft>3650?'Assinatura: ilimitada':`Assinatura: ${daysLeft} dia${daysLeft!==1?'s':''}`}</div>}</div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{width:'100%'}} onClick={()=>sb.auth.signOut()}>Sair</button>
          <div style={{marginTop:8}}>{(students||[]).length} aluno{students.length!==1?'s':''} · {evals.length} avaliaç{evals.length!==1?'ões':'ão'} · nuvem</div>
          <div style={{marginTop:6,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontSize:10.5,color:'var(--text3)'}}>versão {APP_VERSION}</span>
            <button className="link" style={{fontSize:10.5,background:'none',border:'none',padding:0,cursor:'pointer'}}
              onClick={()=>window.MFP_forcarAtualizacao&&window.MFP_forcarAtualizacao()}>forçar atualização</button>
          </div>
          <SeloOffline/>
        </div>
      </div>

      <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
        <div className="topbar no-print">
          <button className="hamb" onClick={()=>setMenu(true)}>≡</button>
          <LogoMark size={32}/>
          <div style={{fontFamily:'var(--serif)',fontWeight:600,fontSize:16,flex:1}}>MF Performance</div>
          <button className="hamb" onClick={toggleTheme} title="Alternar tema" style={{fontSize:17,fontWeight:600}}>◐</button>
        </div>
        {(!online||pending>0||loadedOffline)&&<div className="no-print" style={{padding:'8px 14px',fontSize:12.5,fontWeight:600,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',background:(!online||redeRuim)?'rgba(220,38,38,.12)':'rgba(176,137,79,.14)',color:(!online||redeRuim)?'#dc2626':'var(--gold)',borderBottom:'1px solid var(--border)'}}>
          <span>{!online?'● Sem internet — pode avaliar, fica salvo no aparelho'
            :redeRuim?'● Wi-Fi conectado, mas sem resposta do servidor — salvando no aparelho'
            :loadedOffline?'● Dados em cache (sem conexão ao carregar)':'● Online'}</span>
          {pending>0&&<span style={{color:'var(--text2)'}}>{pending} alteraç{pending>1?'ões':'ão'} esperando para subir</span>}
          {online&&pending>0&&<button className="btn btn-secondary btn-sm" onClick={flushQueue}>Sincronizar agora</button>}
        </div>}
        {/* o que a sincronia recusou fica na tela até o treinador resolver:
            antes isso era descartado calado e a avaliação simplesmente sumia */}
        {falhas.length>0&&<div className="no-print" style={{padding:'10px 14px',fontSize:12.5,background:'rgba(220,38,38,.12)',color:'#dc2626',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontWeight:700,marginBottom:4}}>{falhas.length} {falhas.length>1?'registros não subiram':'registro não subiu'} para a nuvem</div>
          {falhas.slice(0,4).map((f,i)=>(<div key={i} style={{color:'var(--text2)',fontWeight:400}}>
            {f.op.startsWith('ev')?'Avaliação':'Aluno'} {f.nome} — {f.motivo}</div>))}
          <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
            <button className="btn btn-secondary btn-sm" onClick={async()=>{
              const q=[...queueRef.current,...falhas.map(f=>f.item)];
              queueRef.current=q;await offQueueSave(coachId,q);setPending(q.length);
              setFalhas([]);await IDB.set('falhas-'+coachId,[]);flushQueue();
            }}>Tentar de novo</button>
            <button className="btn btn-ghost btn-sm" onClick={async()=>{setFalhas([]);await IDB.set('falhas-'+coachId,[]);}}>Já resolvi, esconder</button>
          </div>
        </div>}
        <div className="main">
          {saving&&<div style={{position:'fixed',top:14,right:16,zIndex:80,background:'var(--accent)',color:'var(--cream)',padding:'7px 14px',borderRadius:10,fontSize:12,fontWeight:600,boxShadow:'var(--shadow-lg)'}}>Salvando…</div>}
          {recado&&<div style={{position:'fixed',top:14,right:16,zIndex:80,maxWidth:300,background:'var(--gold)',color:'#1a1208',padding:'9px 14px',borderRadius:10,fontSize:12.5,fontWeight:600,boxShadow:'var(--shadow-lg)',lineHeight:1.4}}>{recado}</div>}
          {view==='admin'&&profile.is_admin&&<AdminScreen onBack={()=>go('dashboard')}/>}
          {view==='protocols'&&<ProtocolsScreen onBack={()=>go('dashboard')}/>}
          {view==='duplicados'&&<DuplicadosScreen coach={profile} onBack={()=>go('dashboard')} onMudou={()=>reloadFromServer().catch(()=>{})}/>}
          {view==='brand'&&<BrandScreen profile={profile} setProfile={setProfile} onBack={()=>go('dashboard')}/>}
          {view==='dashboard'&&<Dashboard students={students} evals={evals}
            onSelect={s=>{setSelStudent(s);go('detail');}} onNew={()=>{setEditStu(null);go('stu-form');}} onDelete={delStu}
            onReassess={s=>{setSelStudent(s);setEditEv(null);setReassess(true);go('ev-form');}}
            onSchedule={s=>{setSelStudent(s);go('agenda');}} onTrain={s=>{setSelStudent(s);go('train');}}
            demo={!!profile._demo}/>}
          {view==='agenda'&&<AgendaScreen coach={profile} students={students} preStudent={selStudent} onBack={()=>go('dashboard')}/>}
          {view==='intakes'&&<IntakeInbox coach={profile} students={students} onImport={importIntake} onBack={()=>go('dashboard')}/>}
          {view==='tech'&&<TechScreen coach={profile} students={students} preStudent={selStudent} onBack={()=>go('dashboard')}/>}
          {view==='train'&&<TrainScreen coach={profile} students={students} preStudent={selStudent} onNovoAluno={()=>{setEditStu(null);go('stu-form');}} onBack={()=>go('dashboard')}/>}
          {view==='mes'&&<MesScreen students={students} demo={profile._demo} onNovoAluno={()=>{setEditStu(null);go('stu-form');}}
            onBack={()=>go('dashboard')} onSelect={s=>{setSelStudent(s);go('detail');}}/>}
          {view==='dinheiro'&&<MensalidadesScreen students={students} demo={profile._demo}
            onNovoAluno={()=>{setEditStu(null);go('stu-form');}}
            onBack={()=>go('dashboard')} onSelect={s=>{setSelStudent(s);go('detail');}}/>}
          {view==='semtreino'&&<SemTreinoScreen coach={profile} onBack={()=>go('dashboard')} onFeito={contarSemTreino}/>}
          {view==='recados'&&<RecadosScreen naoLidas={naoLidas} students={students}
            onAbrir={s=>{setSelStudent(s);go('detail');}} onBack={()=>go('dashboard')}/>}
          {view==='nutri'&&<NutriScreen coach={profile} students={students} preStudent={selStudent} onNovoAluno={()=>{setEditStu(null);go('stu-form');}} onBack={()=>go('dashboard')}/>}
          {view==='perio'&&<PeriodizacaoScreen coach={profile} students={students} preStudent={selStudent} onNovoAluno={()=>{setEditStu(null);go('stu-form');}} onBack={()=>go('dashboard')}/>}
          {view==='stu-form'&&<StudentForm student={editStu} onSave={saveStu} onCancel={()=>go(selStudent?'detail':'dashboard')}/>}
          {view==='detail'&&selStudent&&<StudentDetail student={selStudent} evals={stuEvals}
            onNewEval={()=>{setEditEv(null);setReassess(false);go('ev-form');}}
            onReassess={()=>{setEditEv(null);setReassess(true);go('ev-form');}}
            onEditEval={ev=>{setEditEv(ev);setReassess(false);go('ev-form');}}
            onDeleteEval={delEv} onReport={ev=>{setSelEval(ev);go('report');}}
            onBack={()=>go('dashboard')} onEdit={()=>{setEditStu(selStudent);go('stu-form');}} onTech={()=>go('tech')} onTrain={()=>go('train')} onNutri={()=>go('nutri')}
            onPreview={()=>go('aluno-view')}/>}
          {view==='ev-form'&&selStudent&&<EvalForm student={selStudent} evalData={editEv}
            carryHeight={reassess?lastHeight:''} isReassess={reassess&&!editEv}
            onSave={saveEv} onCancel={()=>go('detail')}/>}
          {view==='report'&&selStudent&&selEval&&<Report student={selStudent} evalData={selEval} coach={profile}
            allEvals={stuEvals} onBack={()=>go('detail')}/>}
        </div>
      </div>
    </div>);
}

/* ══════════════ App do ALUNO — execução do treino ══════════════ */
const _DEMO_ALUNO_DIVS=[{id:'d1',nome:'A — Membros inferiores'},{id:'d2',nome:'B — Membros superiores'}];
/* Histórico de mentira da TELA do aluno (o _DEMO_HIST lá de baixo é o do
   gráfico de evolução, com datas fixas). 45 dias para trás, três treinos por
   semana, com a carga subindo — assim a retrospectiva do mês tem o que contar
   em qualquer dia em que a demonstração for aberta. */
const _DEMO_HIST_ALUNO=(()=>{
  const linhas=[],hoje=new Date();
  for(let i=45;i>=0;i--){
    const d=new Date(hoje);d.setDate(hoje.getDate()-i);
    if([1,3,5].indexOf(d.getDay())<0)continue;
    const par=d.getDate()%2===0;
    const ex=par?{id:'e1',nome:'Agachamento livre'}:{id:'e2',nome:'Supino reto'};
    const carga=(par?40:30)+Math.round((45-i)/9)*2.5;
    for(let s=0;s<4;s++)linhas.push({exercicio_id:ex.id,exercicio_nome:ex.nome,
      carga,reps:10,data_treino:dayKey(d),tipo_serie:'Valida',
      is_pr:s===0&&i<12,divisao_id:par?'d1':'d2'});
  }
  return linhas;
})();
const _DEMO_AVISOS=[
  {id:'a1',tipo:'parabens',titulo:'Parabéns pelo novo recorde!',texto:'Você bateu 60kg no leg press. Segue firme que os resultados estão vindo.',lido:false,created_at:new Date(Date.now()-3600e3).toISOString()},
  {id:'a2',tipo:'lembrete',titulo:'Treino de hoje te espera',texto:'Bora fechar mais um treino? Lembra de registrar as cargas pra acompanharmos sua evolução.',lido:false,created_at:new Date(Date.now()-26*3600e3).toISOString()},
  {id:'a3',tipo:'aviso',titulo:'Sua avaliação está chegando',texto:'Semana que vem faremos sua reavaliação. Mantenha a hidratação e o sono em dia!',lido:true,created_at:new Date(Date.now()-3*86400e3).toISOString()}
];
const AVISO_ICON={lembrete:'',parabens:'',aviso:'',treino:''};
const MOTIV_FRASES=['Disciplina é fazer mesmo sem vontade.','Cada treino te aproxima da sua melhor versão.','O corpo alcança o que a mente acredita.','Constância vence intensidade.','Você é mais forte do que sua desculpa.'];
const _DEMO_ALUNO_SERIES={
  d1:[{id:'s1',exercicio_id:'x1',exercicio_nome:'Agachamento Livre',tipo_serie:'Valida',qtd_series:3,faixa_reps:'8-12',intervalo_seg_min:90},
      {id:'s2',exercicio_id:'x2',exercicio_nome:'Leg Press',tipo_serie:'Valida',qtd_series:3,faixa_reps:'10-15',intervalo_seg_min:60}],
  d2:[{id:'s3',exercicio_id:'x3',exercicio_nome:'Supino',tipo_serie:'Valida',qtd_series:4,faixa_reps:'8-10',intervalo_seg_min:90}]};


/* ── Feedback do treino: o aluno responde na hora que termina ──
   Antes existia so "fale com o treinador", que dependia da iniciativa
   dele e por isso quase nunca acontecia. */
const FB_ESCALA=[
  ['dificuldade','Como foi a dificuldade?',['Muito fácil','Fácil','Na medida','Difícil','Pesado demais']],
  ['dor','Sentiu dor ou desconforto?',['Nenhuma','Leve','Moderada','Forte','Muito forte']],
];
function FeedbackTreino({divisao,demo,onPronto}){
  const [v,setV]=useState({rpe:7,dificuldade:3,dor:1});
  const [nota,setNota]=useState('');
  const [busy,setBusy]=useState(false);
  const [erro,setErro]=useState(null);

  const enviar=async()=>{
    setBusy(true);setErro(null);
    if(!demo){
      const args={p_divisao:(divisao&&divisao.id)||null, p_divisao_nome:(divisao&&divisao.nome)||null,
        p_rpe:v.rpe, p_dificuldade:v.dificuldade, p_dor:v.dor, p_nota:nota||null};
      let subiu=false;
      if(navigator.onLine){
        try{
          const {data:fb,error}=await comPrazo(sb.rpc('treino_feedback',args));
          if(error)throw error;
          subiu=true;
          // dor alta não pode esperar o treinador abrir a ficha do aluno.
          // manda o id do feedback: dois envios no mesmo minuto não se confundem
          if(v.dor>=4)semEsperar(avisarDorAoTreinador(fb&&fb.id));
        }catch(e){
          const m=e.message||String(e);
          // banco desatualizado é erro definitivo: guardar na fila só adiaria
          if(/train_feedback|does not exist|PGRST202|PGRST205|42P01/.test(m)){
            setBusy(false);
            setErro('Seu treinador precisa rodar a última atualização do banco. Seu treino já foi salvo normalmente.');
            return;
          }
          if(!isNetErr(e)){setBusy(false);setErro('Não consegui enviar: '+m);return;}
        }
      }
      // sem sinal o feedback ia embora junto com o treino: agora espera na fila
      if(!subiu)await enfileirarAluno({rpc:'treino_feedback',args});
    }
    setBusy(false);onPronto();
  };

  const escala=(k,lbl,rotulos)=>(
    <div style={{marginBottom:16}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>{lbl}</div>
      <div className="lv-setchips" style={{margin:0}}>
        {rotulos.map((r,i)=>(
          <button key={i} className={'lv-setchip'+(v[k]===i+1?' on':'')}
            style={v[k]===i+1?{borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-dim)'}:null}
            onClick={()=>setV(x=>({...x,[k]:i+1}))}>{r}</button>))}
      </div>
    </div>);

  return(<div className="lv-wrap" style={{maxWidth:520}}>
    <div className="lv-title" style={{marginBottom:4}}>Como foi o treino?</div>
    <p className="lv-sub" style={{marginBottom:18}}>
      Leva 15 segundos e é o que permite seu treinador ajustar a carga da próxima sessão.</p>

    <div className="lv-card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
        <span style={{fontWeight:700,fontSize:14}}>Esforço percebido</span>
        <span style={{fontWeight:800,fontSize:20,color:'var(--lvrx)'}}>{v.rpe}<span style={{fontSize:12,color:'var(--lvt3)'}}>/10</span></span>
      </div>
      <input type="range" min="1" max="10" value={v.rpe} style={{width:'100%'}}
        onChange={e=>setV(x=>({...x,rpe:+e.target.value}))}/>
      <div style={{display:'flex',justifyContent:'space-between'}}>
        <span className="lv-sub" style={{fontSize:11.5}}>tranquilo</span>
        <span className="lv-sub" style={{fontSize:11.5}}>no limite</span>
      </div>
    </div>

    <div className="lv-card">
      {FB_ESCALA.map(([k,lbl,rot])=><div key={k}>{escala(k,lbl,rot)}</div>)}
      <div>
        <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>Quer contar mais alguma coisa?</div>
        <textarea className="lv-in" rows={3} value={nota} onChange={e=>setNota(e.target.value)}
          placeholder="Ex.: senti o ombro no supino, a última série do agachamento foi longe demais…"/>
      </div>
    </div>

    {erro&&<div className="lv-card" style={{borderColor:'rgba(245,158,11,.5)'}}>
      <div className="lv-sub" style={{lineHeight:1.5}}>{erro}</div></div>}

    <button className="lv-btn" disabled={busy} onClick={enviar}>{busy?'Enviando…':'Enviar e finalizar'}</button>
    <button className="lv-ghost" style={{width:'100%',marginTop:10,padding:'11px'}} onClick={onPronto}>Pular</button>
  </div>);
}

/* ── Card do antes e depois para os stories ──────────────────
   O aluno ja tem as duas fotos lado a lado na tela de Progresso, com os dias
   entre elas, e os numeros da avaliacao logo acima. Faltava poder mostrar. E o
   formato mais postado do fitness, e o unico que traz aluno novo para o
   treinador: a marca e o @ dele vao na imagem.
   As fotos moram num balde publico, entao com crossOrigin o canvas nao fica
   sujo e o toBlob funciona. Se alguma nao carregar, o card nao e montado — nao
   existe antes e depois com um lado so. */
function desenharAntesDepois(ctx,{nome,fotoA,fotoB,dataA,dataB,dias,linhas,marca,logo,arroba}){
  const W=1080,H=1920;
  const roxo='#8b5cf6', roxo2='#c084fc';

  const fundo=ctx.createLinearGradient(0,0,W*0.4,H);
  fundo.addColorStop(0,'#14121c'); fundo.addColorStop(0.55,'#0e0e13'); fundo.addColorStop(1,'#17131f');
  ctx.fillStyle=fundo; ctx.fillRect(0,0,W,H);
  const halo=ctx.createRadialGradient(W*0.5,H*0.3,0,W*0.5,H*0.3,W*0.95);
  halo.addColorStop(0,'rgba(139,92,246,.26)'); halo.addColorStop(1,'rgba(139,92,246,0)');
  ctx.fillStyle=halo; ctx.fillRect(0,0,W,H);

  const serif='"Playfair Display",Georgia,serif';
  const sans='Inter,-apple-system,"Segoe UI",Roboto,sans-serif';
  const espacado=(txt,x,y,esp)=>{
    const ls=[...txt], larg=ls.reduce((a,c)=>a+ctx.measureText(c).width+esp,0)-esp;
    let px=x-larg/2;
    ls.forEach(c=>{ctx.fillText(c,px+ctx.measureText(c).width/2,y);px+=ctx.measureText(c).width+esp;});
  };
  const centro=(txt,y,font,cor,esp)=>{
    ctx.font=font; ctx.fillStyle=cor; ctx.textAlign='center';
    if(esp)espacado(txt,W/2,y,esp); else ctx.fillText(txt,W/2,y);
  };
  const cantos=(x,y,w,h,r)=>{
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  };
  // desenha a foto preenchendo o retangulo sem distorcer (corta o excedente)
  const coberto=(img,x,y,w,h,r)=>{
    ctx.save(); cantos(x,y,w,h,r); ctx.clip();
    const ei=img.naturalWidth/img.naturalHeight, ed=w/h;
    let sw=img.naturalWidth, sh=img.naturalHeight, sx=0, sy=0;
    if(ei>ed){ sw=img.naturalHeight*ed; sx=(img.naturalWidth-sw)/2; }
    else { sh=img.naturalWidth/ed; sy=(img.naturalHeight-sh)/2; }
    ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);
    ctx.restore();
    ctx.strokeStyle='rgba(255,255,255,.14)'; ctx.lineWidth=2; cantos(x,y,w,h,r); ctx.stroke();
  };

  // ── topo: marca do treinador ──
  let y=112;
  if(logo){
    const alt=76, larg=Math.min(240,logo.naturalWidth/logo.naturalHeight*alt);
    ctx.drawImage(logo,(W-larg)/2,y-54,larg,alt); y+=52;
  }
  centro((marca||'').toUpperCase(),y,'600 27px '+sans,'rgba(255,255,255,.62)',7);

  // ── titulo ──
  centro('ANTES E DEPOIS',y+92,'600 30px '+sans,roxo2,10);
  const primeiro=(nome||'').trim().split(/\s+/)[0]||'';
  if(primeiro)centro(primeiro,y+178,'700 76px '+serif,'#ffffff');

  // ── as duas fotos ──
  const topo=y+238, larg=486, altura=648, vao=W-2*larg-larg*0; // 2 fotos + folga
  const x1=(W-(larg*2+36))/2, x2=x1+larg+36;
  coberto(fotoA,x1,topo,larg,altura,26);
  coberto(fotoB,x2,topo,larg,altura,26);
  // etiqueta sobre cada foto
  const etiqueta=(txt,cx,cy)=>{
    ctx.font='700 26px '+sans;
    const w=ctx.measureText(txt).width+44;
    ctx.fillStyle='rgba(10,10,14,.72)'; cantos(cx-w/2,cy-38,w,52,26); ctx.fill();
    ctx.fillStyle='#ffffff'; ctx.textAlign='center'; ctx.fillText(txt,cx,cy);
  };
  etiqueta('ANTES',x1+larg/2,topo+52);
  etiqueta('AGORA',x2+larg/2,topo+52);
  ctx.font='500 25px '+sans; ctx.fillStyle='rgba(255,255,255,.55)'; ctx.textAlign='center';
  ctx.fillText(dataA||'',x1+larg/2,topo+altura+46);
  ctx.fillText(dataB||'',x2+larg/2,topo+altura+46);

  // ── quantos dias separam as duas ──
  let yy=topo+altura+140;
  if(dias>0){
    centro(dias===1?'1 DIA DE DIFERENÇA':dias+' DIAS DE DIFERENÇA',yy,'600 27px '+sans,roxo2,6);
    yy+=74;
  }

  // ── numeros da avaliacao, quando existem duas ──
  if(linhas&&linhas.length){
    const alturaBloco=linhas.length*104+40;
    ctx.fillStyle='rgba(255,255,255,.045)'; cantos(72,yy-24,W-144,alturaBloco,30); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.09)'; ctx.lineWidth=2; cantos(72,yy-24,W-144,alturaBloco,30); ctx.stroke();
    let ly=yy+50;
    linhas.forEach(l=>{
      ctx.textAlign='left'; ctx.font='500 31px '+sans; ctx.fillStyle='rgba(255,255,255,.66)';
      ctx.fillText(l.rotulo,120,ly);
      ctx.textAlign='right'; ctx.font='700 39px '+sans; ctx.fillStyle=l.bom?'#4ade80':'#ffffff';
      ctx.fillText(l.valor,W-120,ly);
      ly+=104;
    });
    yy+=alturaBloco+26;
  }

  // ── rodape: o @ do treinador ──
  ctx.textAlign='center';
  if(arroba){
    const a=arroba.startsWith('@')?arroba:'@'+arroba;
    centro(a,H-118,'600 34px '+sans,roxo2);
    centro('acompanhamento profissional',H-70,'500 24px '+sans,'rgba(255,255,255,.42)');
  }else{
    centro((marca||'').toUpperCase(),H-96,'600 30px '+sans,'rgba(255,255,255,.5)',6);
  }
}

function CardAntesDepois({stu,primeira,ultima,marca,onFechar}){
  const [url,setUrl]=useState(null);
  const [arquivo,setArquivo]=useState(null);
  const [erro,setErro]=useState(null);
  const [salvo,setSalvo]=useState(false);

  useEffect(()=>{let vivo=true;(async()=>{
    try{
      try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;}catch(e){}
      const carregar=src=>new Promise(res=>{const i=new Image();i.crossOrigin='anonymous';
        i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src;});
      const [fa,fb,logo]=await Promise.all([
        carregar(primeira.url), carregar(ultima.url),
        (marca&&marca.logo_url)?carregar(marca.logo_url):Promise.resolve(null)]);
      if(!vivo)return;
      // sem as duas fotos nao existe antes e depois: melhor nao entregar nada
      if(!fa||!fb){setErro('Não deu para carregar as duas fotos. Tente de novo com internet.');return;}

      // os numeros so entram se houver duas avaliacoes de verdade
      let linhas=[];
      try{
        const {data}=await sb.from('assessments').select('*').eq('student_id',stu.id).order('date');
        if(data&&data.length>=2){
          const conv=r=>({...r.data,date:r.date});
          const pri=derive(stu,conv(data[0])), ult=derive(stu,conv(data[data.length-1]));
          const d=(a,b)=>(a!=null&&b!=null)?+(b-a).toFixed(1):null;
          const põe=(rotulo,de,para,un,melhorSeCai)=>{
            const delta=d(de,para); if(delta==null||delta===0)return;
            linhas.push({rotulo,valor:(delta>0?'+':'−')+fmt(Math.abs(delta))+un,
              bom:melhorSeCai?delta<0:delta>0});
          };
          põe('Peso',pri.weight,ult.weight,' kg',true);
          põe('Gordura corporal',pri.fatPct,ult.fatPct,'%',true);
          põe('Massa magra',pri.leanMass,ult.leanMass,' kg',false);
        }
      }catch(e){/* sem numeros o card ainda vale pelas fotos */}

      const c=document.createElement('canvas');c.width=1080;c.height=1920;
      const dia=iso=>new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
      desenharAntesDepois(c.getContext('2d'),{
        nome:(stu&&stu.name)||'', fotoA:fa, fotoB:fb,
        dataA:dia(primeira.created_at), dataB:dia(ultima.created_at),
        dias:Math.round((new Date(ultima.created_at)-new Date(primeira.created_at))/86400000),
        linhas,
        marca:(marca&&(marca.brand_name||marca.name))||'MF Performance',
        logo, arroba:marca&&marca.instagram});
      const blob=await new Promise(r=>c.toBlob(r,'image/png'));
      if(!vivo||!blob)return;
      setUrl(URL.createObjectURL(blob));
      setArquivo(new File([blob],'antes-e-depois.png',{type:'image/png'}));
    }catch(e){if(vivo)setErro('Não deu para montar a imagem neste aparelho.');}
  })();return()=>{vivo=false;};},[]);

  const baixar=()=>{
    if(!url)return;
    const a=document.createElement('a');a.href=url;a.download='antes-e-depois.png';
    document.body.appendChild(a);a.click();a.remove();
    setSalvo(true);
  };
  const compartilhar=async()=>{
    try{
      if(arquivo&&navigator.canShare&&navigator.canShare({files:[arquivo]})){
        await navigator.share({files:[arquivo],title:'Meu antes e depois'});
        return;
      }
    }catch(e){ if(e&&e.name==='AbortError')return; }
    baixar();
  };

  return(<div className="lv-cel" style={{padding:18,overflowY:'auto'}}>
    <div style={{width:'100%',maxWidth:300}}>
      {erro
        ? <div className="lv-card" style={{lineHeight:1.5}}>{erro}</div>
        : url
          ? <img src={url} alt="Meu antes e depois" style={{width:'100%',borderRadius:16,display:'block',
              border:'1px solid var(--lvbd)',boxShadow:'0 10px 40px rgba(139,92,246,.25)'}}/>
          : <div className="lv-card" style={{textAlign:'center',padding:'44px 0'}}><div className="spinner"/></div>}
      {!erro&&<button className="lv-btn neon" style={{marginTop:12}} disabled={!url} onClick={compartilhar}>
        Compartilhar nos stories</button>}
      {salvo&&<div className="lv-sub" style={{marginTop:8,textAlign:'center',lineHeight:1.45}}>
        Imagem salva. Abra o Instagram, crie um story e escolha ela da galeria.</div>}
      <button className="lv-ghost" style={{width:'100%',marginTop:10,padding:'11px'}} onClick={onFechar}>Fechar</button>
    </div>
  </div>);
}

/* ── Retrospectiva do mês ────────────────────────────────────
   O aluno abre o app para treinar. Uma vez por mês ele ganha motivo de abrir
   só para olhar o que fez — e para mostrar. Sai do mesmo histórico que a tela
   já carregou, então não custa nenhuma ida a mais ao servidor. */
const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
  'Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MIN_RETRO=3;   // abaixo de 3 treinos não existe mês para contar

function resumoDoMes(hist,divs,hoje){
  const linhas=(hist||[]).filter(h=>h&&h.data_treino);
  if(!linhas.length)return null;
  const agora=hoje||new Date();
  const mesDe=d=>d.slice(0,7);
  const atual=dayKey(agora).slice(0,7);
  const anterior=dayKey(new Date(agora.getFullYear(),agora.getMonth()-1,1)).slice(0,7);
  const diasDe=ch=>new Set(linhas.filter(h=>mesDe(h.data_treino)===ch).map(h=>h.data_treino));
  // Nos primeiros dias do mês o que interessa é o mês que fechou: ninguém quer
  // a retrospectiva de setembro no dia 2 de setembro.
  const chave=(agora.getDate()<=7&&diasDe(anterior).size>=MIN_RETRO)?anterior:atual;
  const dias=[...diasDe(chave)].sort();
  if(dias.length<MIN_RETRO)return null;

  const doMes=linhas.filter(h=>mesDe(h.data_treino)===chave);
  const ton=doMes.reduce((a,h)=>
    h.tipo_serie==='Externo'?a:a+(num(h.carga)||0)*(num(h.reps)||0),0);
  const prs=doMes.filter(h=>h.is_pr).length;
  const series=doMes.filter(h=>h.tipo_serie!=='Externo').length;

  // treinos por semana do mês, para o gráfico do card. Semana aqui é bloco de
  // sete dias do mês (1–7, 8–14…), que é como quem olha o calendário conta.
  const semanas=[0,0,0,0,0];
  dias.forEach(d=>{semanas[Math.min(4,Math.ceil(+d.slice(8)/7)-1)]++;});
  while(semanas.length>1&&semanas[semanas.length-1]===0)semanas.pop();

  // maior sequência de dias seguidos dentro do mês
  let corrente=1,seq=1;
  for(let i=1;i<dias.length;i++){
    const d=(dias[i-1]+'T12:00'),e=(dias[i]+'T12:00');
    if(Math.round((new Date(e)-new Date(d))/86400000)===1){corrente++;if(corrente>seq)seq=corrente;}
    else corrente=1;
  }

  // divisão mais treinada, contada em DIAS e não em séries
  const porDiv={};
  doMes.forEach(h=>{if(!h.divisao_id)return;
    (porDiv[h.divisao_id]=porDiv[h.divisao_id]||new Set()).add(h.data_treino);});
  let divId=null,divDias=0;
  Object.keys(porDiv).forEach(id=>{if(porDiv[id].size>divDias){divDias=porDiv[id].size;divId=id;}});
  const d=divId&&(divs||[]).find(x=>x.id===divId);

  // maior salto de carga: o melhor do mês contra o melhor de antes do mês
  const antes={},dentro={};
  linhas.forEach(h=>{
    if(h.tipo_serie!=='Valida')return;
    const nm=h.exercicio_nome,c=num(h.carga);
    if(!nm||!c)return;
    const ch=mesDe(h.data_treino);
    if(ch<chave)antes[nm]=Math.max(antes[nm]||0,c);
    else if(ch===chave)dentro[nm]=Math.max(dentro[nm]||0,c);
  });
  let salto=null,pico=null;
  Object.keys(dentro).forEach(nm=>{
    const de=antes[nm];
    if(de==null)return;
    const g=dentro[nm]-de;
    if(g>0&&(!salto||g>salto.ganho))salto={nome:nm,de,para:dentro[nm],ganho:g};
  });
  // quem começou agora não tem com o que comparar; aí a carga mais pesada do
  // mês já é uma coisa dele
  if(!salto)Object.keys(dentro).forEach(nm=>{
    if(!pico||dentro[nm]>pico.carga)pico={nome:nm,carga:dentro[nm]};});

  const [ano,mm]=chave.split('-');
  return{chave,mes:MESES[+mm-1],ano:+ano,treinos:dias.length,ton,prs,seq,series,semanas,
    divisao:d&&d.nome,divisaoDias:divDias,salto,pico,emCurso:chave===atual};
}

function desenharRetro(ctx,{nome,resumo,marca,logo,arroba}){
  const W=1080,H=1920;
  const roxo2='#c084fc', verde='#4ade80';
  const fundo=ctx.createLinearGradient(0,0,W*0.4,H);
  fundo.addColorStop(0,'#14121c'); fundo.addColorStop(0.55,'#0e0e13'); fundo.addColorStop(1,'#17131f');
  ctx.fillStyle=fundo; ctx.fillRect(0,0,W,H);
  const halo=ctx.createRadialGradient(W*0.5,H*0.28,0,W*0.5,H*0.28,W*0.95);
  halo.addColorStop(0,'rgba(139,92,246,.26)'); halo.addColorStop(1,'rgba(139,92,246,0)');
  ctx.fillStyle=halo; ctx.fillRect(0,0,W,H);

  const serif='"Playfair Display",Georgia,serif';
  const sans='Inter,-apple-system,"Segoe UI",Roboto,sans-serif';
  const espacado=(t,x,y,esp)=>{
    const ls=[...t], larg=ls.reduce((a,c)=>a+ctx.measureText(c).width+esp,0)-esp;
    let px=x-larg/2;
    ls.forEach(c=>{ctx.fillText(c,px+ctx.measureText(c).width/2,y);px+=ctx.measureText(c).width+esp;});
  };
  const centro=(t,y,font,cor,esp)=>{
    ctx.font=font; ctx.fillStyle=cor; ctx.textAlign='center';
    if(esp)espacado(t,W/2,y,esp); else ctx.fillText(t,W/2,y);
  };
  const cantos=(x,y,w,h,r)=>{
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  };
  // nome de exercício comprido não pode vazar do card
  const caber=(t,font,max)=>{
    ctx.font=font;
    if(ctx.measureText(t).width<=max)return t;
    let s=t;
    while(s.length>1&&ctx.measureText(s+'…').width>max)s=s.slice(0,-1);
    return s+'…';
  };

  // ── topo: marca do treinador ──
  let y=112;
  if(logo){
    const alt=76, larg=Math.min(240,logo.naturalWidth/logo.naturalHeight*alt);
    ctx.drawImage(logo,(W-larg)/2,y-54,larg,alt); y+=52;
  }
  centro(caber((marca||'').toUpperCase(),'600 27px '+sans,W-200),y,'600 27px '+sans,'rgba(255,255,255,.62)',7);

  // ── título: o mês, grande ──
  centro('RETROSPECTIVA',y+96,'600 30px '+sans,roxo2,10);
  centro(resumo.mes,y+196,'700 104px '+serif,'#ffffff');
  const primeiro=(nome||'').trim().split(/\s+/)[0]||'';
  const sub=[primeiro,String(resumo.ano)].filter(Boolean).join(' · ');
  centro(sub,y+256,'500 32px '+sans,'rgba(255,255,255,.55)');
  if(resumo.emCurso)centro('até aqui',y+306,'500 26px '+sans,'rgba(255,255,255,.36)');

  // ── os quatro números ──
  // "1 dia seguido" não é sequência nenhuma: nesse caso a quarta casa mostra as
  // séries do mês, que é número que ele fez de verdade.
  const quarta=resumo.seq>1
    ?[String(resumo.seq),'DIAS SEGUIDOS']
    :[String(resumo.series),rotuloN(resumo.series,'série').toUpperCase()];
  const celulas=[
    [String(resumo.treinos),rotuloN(resumo.treinos,'treino').toUpperCase()],
    [fmtTon(resumo.ton),'MOVIDOS'],
    [String(resumo.prs),rotuloN(resumo.prs,'recorde').toUpperCase()],
    quarta,
  ];
  const gx=72, gw=W-144, cw=(gw-28)/2, chh=210;
  let gy=y+(resumo.emCurso?366:336);
  celulas.forEach((c,i)=>{
    const x=gx+(i%2)*(cw+28), yy=gy+Math.floor(i/2)*(chh+28);
    ctx.fillStyle='rgba(255,255,255,.045)'; cantos(x,yy,cw,chh,30); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.09)'; ctx.lineWidth=2; cantos(x,yy,cw,chh,30); ctx.stroke();
    ctx.textAlign='center';
    ctx.font='700 84px '+sans; ctx.fillStyle='#ffffff';
    ctx.fillText(caber(c[0],'700 84px '+sans,cw-56),x+cw/2,yy+118);
    ctx.font='600 24px '+sans; ctx.fillStyle='rgba(255,255,255,.5)';
    espacado(c[1],x+cw/2,yy+164,5);
  });
  gy+=2*(chh+28)+18;

  // ── as linhas que contam a história do mês ──
  const linhas=[];
  if(resumo.divisao)linhas.push({rotulo:'Treino mais feito',
    valor:resumo.divisao+' · '+plural(resumo.divisaoDias,'vez','vezes')});
  if(resumo.salto)linhas.push({rotulo:'Maior salto de carga',
    valor:fmtCarga(resumo.salto.de)+' → '+fmtCarga(resumo.salto.para)+' kg',bom:true,
    detalhe:resumo.salto.nome});
  else if(resumo.pico)linhas.push({rotulo:'Carga mais pesada',
    valor:fmtCarga(resumo.pico.carga)+' kg',detalhe:resumo.pico.nome});
  const eq=equivalePeso(resumo.ton);
  if(eq)linhas.push({rotulo:'O peso disso',valor:eq});

  if(linhas.length){
    const alt=linhas.reduce((a,l)=>a+(l.detalhe?128:104),0)+40;
    ctx.fillStyle='rgba(255,255,255,.045)'; cantos(72,gy,W-144,alt,30); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.09)'; ctx.lineWidth=2; cantos(72,gy,W-144,alt,30); ctx.stroke();
    let ly=gy+74;
    linhas.forEach(l=>{
      ctx.textAlign='left'; ctx.font='500 31px '+sans; ctx.fillStyle='rgba(255,255,255,.66)';
      ctx.fillText(l.rotulo,120,ly);
      ctx.textAlign='right'; ctx.font='700 38px '+sans; ctx.fillStyle=l.bom?verde:'#ffffff';
      ctx.fillText(caber(l.valor,'700 38px '+sans,W-240-ctx.measureText(l.rotulo).width),W-120,ly);
      if(l.detalhe){
        ctx.textAlign='left'; ctx.font='500 26px '+sans; ctx.fillStyle='rgba(255,255,255,.42)';
        ctx.fillText(caber(l.detalhe,'500 26px '+sans,W-260),120,ly+40);
        ly+=128;
      }else ly+=104;
    });
    gy+=alt+30;
  }

  // ── treinos por semana ──
  // Ocupa o pé do card com uma coisa que ele reconhece: a semana em que
  // apertou e a que afrouxou. É o que faz o story parecer feito para ele.
  const sem=resumo.semanas||[];
  if(sem.length>1){
    const pico=Math.max.apply(null,sem)||1;
    const espaco=Math.max(0,H-230-gy);
    if(espaco>=250){
      const altBloco=Math.min(300,espaco);
      centro('TREINOS POR SEMANA',gy+30,'600 24px '+sans,'rgba(255,255,255,.42)',5);
      // o topo da barra mais alta ainda tem de caber o número acima dela, sem
      // encostar no título
      const base=gy+altBloco-52, altMax=altBloco-158;
      const passo=(W-200)/sem.length, lg=Math.min(120,passo-40);
      sem.forEach((n,i)=>{
        const cx=100+passo*i+passo/2, h=Math.max(8,Math.round(altMax*n/pico));
        ctx.fillStyle=n?'rgba(192,132,252,.85)':'rgba(255,255,255,.10)';
        cantos(cx-lg/2,base-h,lg,h,12); ctx.fill();
        ctx.textAlign='center';
        ctx.font='700 30px '+sans; ctx.fillStyle=n?'#ffffff':'rgba(255,255,255,.3)';
        ctx.fillText(String(n),cx,base-h-16);
        ctx.font='500 24px '+sans; ctx.fillStyle='rgba(255,255,255,.4)';
        ctx.fillText((i+1)+'ª',cx,base+34);
      });
    }
  }

  // ── rodapé: o @ do treinador ──
  ctx.textAlign='center';
  if(arroba){
    const a=arroba.startsWith('@')?arroba:'@'+arroba;
    centro(a,H-118,'600 34px '+sans,roxo2);
    centro('acompanhamento profissional',H-70,'500 24px '+sans,'rgba(255,255,255,.42)');
  }else{
    centro(caber((marca||'').toUpperCase(),'600 30px '+sans,W-200),H-96,'600 30px '+sans,'rgba(255,255,255,.5)',6);
  }
}

function CardRetro({stu,resumo,onFechar}){
  const [url,setUrl]=useState(null);
  const [arquivo,setArquivo]=useState(null);
  const [erro,setErro]=useState(null);
  const [salvo,setSalvo]=useState(false);

  useEffect(()=>{let vivo=true;(async()=>{
    try{
      try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;}catch(e){}
      let marca=null;
      try{
        const {data}=await lerCopia('marca-'+stu.coach_id,
          sb.from('profiles').select('brand_name,name,instagram,logo_url').eq('id',stu.coach_id).maybeSingle());
        marca=data||null;
      }catch(e){/* sem a marca o card ainda vale */}
      let logo=null;
      if(marca&&marca.logo_url)logo=await new Promise(res=>{const i=new Image();
        i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=()=>res(null);i.src=marca.logo_url;});
      if(!vivo)return;
      const c=document.createElement('canvas');c.width=1080;c.height=1920;
      desenharRetro(c.getContext('2d'),{
        nome:(stu&&stu.name)||'', resumo,
        marca:(marca&&(marca.brand_name||marca.name))||'MF Performance',
        logo, arroba:marca&&marca.instagram});
      const blob=await new Promise(r=>c.toBlob(r,'image/png'));
      if(!vivo||!blob)return;
      setUrl(URL.createObjectURL(blob));
      setArquivo(new File([blob],'retrospectiva.png',{type:'image/png'}));
    }catch(e){if(vivo)setErro('Não deu para montar a imagem neste aparelho.');}
  })();return()=>{vivo=false;};},[]);

  const baixar=()=>{
    if(!url)return;
    const a=document.createElement('a');a.href=url;a.download='retrospectiva.png';
    document.body.appendChild(a);a.click();a.remove();
    setSalvo(true);
  };
  const compartilhar=async()=>{
    try{
      if(arquivo&&navigator.canShare&&navigator.canShare({files:[arquivo]})){
        await navigator.share({files:[arquivo],title:'Minha retrospectiva'});
        return;
      }
    }catch(e){ if(e&&e.name==='AbortError')return; }
    baixar();
  };

  return(<div className="lv-cel" style={{padding:18,overflowY:'auto'}}>
    <div style={{width:'100%',maxWidth:300}}>
      {erro
        ? <div className="lv-card" style={{lineHeight:1.5}}>{erro}</div>
        : url
          ? <img src={url} alt="Minha retrospectiva" style={{width:'100%',borderRadius:16,display:'block',
              border:'1px solid var(--lvbd)',boxShadow:'0 10px 40px rgba(139,92,246,.25)'}}/>
          : <div className="lv-card" style={{textAlign:'center',padding:'44px 0'}}><div className="spinner"/></div>}
      {!erro&&<button className="lv-btn neon" style={{marginTop:12}} disabled={!url} onClick={compartilhar}>
        Compartilhar nos stories</button>}
      {salvo&&<div className="lv-sub" style={{marginTop:8,textAlign:'center',lineHeight:1.45}}>
        Imagem salva. Abra o Instagram, crie um story e escolha ela da galeria.</div>}
      <button className="lv-ghost" style={{width:'100%',marginTop:10,padding:'11px'}} onClick={onFechar}>Fechar</button>
    </div>
  </div>);
}

/* ── Card do treino para os stories ──────────────────────────
   Desenha 1080x1920 num canvas e entrega pronto para o compartilhamento do
   celular. A imagem sai com a marca e o @ do treinador, então quando o aluno
   posta, ele é marcado junto — é a divulgação acontecendo sozinha. */
function desenharCard(ctx,{nome,divisao,sets,ton,tempo,prs,marca,logo,arroba,data,exercicios}){
  const W=1080,H=1920;
  const roxo='#8b5cf6', roxo2='#c084fc', ouro='#f59e0b';

  const fundo=ctx.createLinearGradient(0,0,W*0.4,H);
  fundo.addColorStop(0,'#14121c'); fundo.addColorStop(0.55,'#0e0e13'); fundo.addColorStop(1,'#17131f');
  ctx.fillStyle=fundo; ctx.fillRect(0,0,W,H);
  const halo=ctx.createRadialGradient(W*0.5,H*0.32,0,W*0.5,H*0.32,W*0.9);
  halo.addColorStop(0,'rgba(139,92,246,.28)'); halo.addColorStop(1,'rgba(139,92,246,0)');
  ctx.fillStyle=halo; ctx.fillRect(0,0,W,H);

  const serif='"Playfair Display",Georgia,serif';
  const sans='Inter,-apple-system,"Segoe UI",Roboto,sans-serif';
  // o canvas não faz espaçamento entre letras: faço letra a letra
  const espacado=(t,x,y,esp)=>{
    const ls=[...t], larg=ls.reduce((a,c)=>a+ctx.measureText(c).width+esp,0)-esp;
    let px=x-larg/2;
    ls.forEach(c=>{ctx.fillText(c,px+ctx.measureText(c).width/2,y);px+=ctx.measureText(c).width+esp;});
  };
  const centro=(t,y,font,cor,esp)=>{
    ctx.font=font; ctx.fillStyle=cor; ctx.textAlign='center';
    if(esp)espacado(t,W/2,y,esp); else ctx.fillText(t,W/2,y);
  };
  const caber=(t,font,max)=>{ctx.font=font;let r=t;
    while(ctx.measureText(r).width>max&&r.length>4)r=r.slice(0,-2);
    return r===t?t:r.trim()+'…';};
  // para o titulo: encolhe a fonte ate caber, so corta em ultimo caso
  const fonteQueCabe=(t,tam,min,fam,max)=>{
    while(tam>min){ctx.font='700 '+tam+'px '+fam;if(ctx.measureText(t).width<=max)break;tam-=4;}
    return '700 '+tam+'px '+fam;};

  // O conteúdo varia de tamanho conforme a quantidade de exercícios, então
  // meço tudo antes e centralizo o bloco — assim não sobra buraco no treino
  // curto nem estoura no treino longo.
  const lista=(exercicios||[]).slice(0,6);
  const sobra=(exercicios||[]).length-lista.length;
  const altura=(logo?144:0)+48+105+105+66+190+230
    +(prs>0?140:0)
    +(lista.length?((prs>0?120:150)+lista.length*62+(sobra>0?36:0)):0);
  const topo=175, base=H-360;
  let y=topo+Math.max(0,(base-topo-altura)/2);

  // ── topo: a marca do treinador ──
  if(logo){
    const alt=104, larg=Math.min(340,logo.width*(alt/logo.height));
    ctx.drawImage(logo,W/2-larg/2,y-alt,larg,alt); y+=40;
  }
  centro(caber((marca||'MF PERFORMANCE').toUpperCase(),'600 40px '+sans,W-160),y,'600 40px '+sans,'#f4f4f7',7);
  y+=48; ctx.strokeStyle=roxo; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(W/2-70,y); ctx.lineTo(W/2+70,y); ctx.stroke();

  // ── o feito ──
  y+=105; centro('TREINO CONCLUÍDO',y,'600 33px '+sans,roxo2,9);
  y+=105;
  const tituloTxt=(divisao||'Treino').toUpperCase();
  const tituloFonte=fonteQueCabe(tituloTxt,88,52,serif,W-130);
  centro(caber(tituloTxt,tituloFonte,W-130),y,tituloFonte,'#ffffff');
  y+=66;  centro(caber(nome||'','400 38px '+sans,W-200),y,'400 38px '+sans,'#a2a2b0');

  // ── os números ──
  const cx=[W*0.28,W*0.72];
  const bloco=(x,yy,valor,rot,cor)=>{
    ctx.textAlign='center';
    ctx.font='800 122px '+sans; ctx.fillStyle=cor||'#ffffff'; ctx.fillText(valor,x,yy);
    ctx.font='600 28px '+sans; ctx.fillStyle='#6c6c7c'; espacado(rot,x,yy+46,6);
  };
  y+=190; bloco(cx[0],y,String(sets),'SÉRIES');
          bloco(cx[1],y,(ton/1000).toFixed(1).replace('.',',')+'t','VOLUME',roxo2);
  y+=230; bloco(cx[0],y,tempo,'TEMPO');
          bloco(cx[1],y,String(prs),'RECORDES',prs>0?ouro:'#ffffff');

  // ── selo de recorde ──
  if(prs>0){
    y+=140;
    const txt=prs>1?prs+' NOVOS RECORDES':'NOVO RECORDE';
    ctx.font='700 33px '+sans;
    const w=ctx.measureText(txt).width+90;
    ctx.fillStyle='rgba(245,158,11,.15)';
    ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(W/2-w/2,y-50,w,72,36);else ctx.rect(W/2-w/2,y-50,w,72);
    ctx.fill();
    centro(txt,y,'700 33px '+sans,ouro,3);
  }

  // ── os exercícios, que é o que dá vontade de mostrar ──
  if(lista.length){
    y+=(prs>0?120:150);
    ctx.strokeStyle='rgba(255,255,255,.10)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(90,y-52); ctx.lineTo(W-90,y-52); ctx.stroke();
    lista.forEach(e=>{
      ctx.textAlign='left';  ctx.font='500 36px '+sans; ctx.fillStyle='#d8d8e0';
      ctx.fillText(caber(e.nome,'500 36px '+sans,W-430),100,y);
      ctx.textAlign='right'; ctx.font='700 36px '+sans; ctx.fillStyle='#ffffff';
      const carga=e.carga!=null?(String(e.carga).replace('.',',')+' kg'):'—';
      ctx.fillText(e.reps?carga+' × '+e.reps:carga,W-100,y);
      y+=62;
    });
    if(sobra>0)centro('+'+sobra+' exercício'+(sobra>1?'s':''),y+6,'400 30px '+sans,'#6c6c7c',2);
  }

  // ── rodapé: o @ para marcar, e a data ──
  if(arroba)centro(arroba.startsWith('@')?arroba:'@'+arroba,H-285,'600 40px '+sans,roxo2,3);
  centro(data,H-222,'400 29px '+sans,'#6c6c7c',2);
}

function CardTreino({stu,divisao,finished,marca,fmtT}){
  const [arquivo,setArquivo]=useState(null);
  const [url,setUrl]=useState(null);
  const [erro,setErro]=useState(null);
  const [salvo,setSalvo]=useState(false);

  useEffect(()=>{let vivo=true;(async()=>{
    try{
      try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;}catch(e){}
      let logo=null;
      if(marca&&marca.logo_url){
        logo=await new Promise(res=>{const i=new Image();i.crossOrigin='anonymous';
          i.onload=()=>res(i);i.onerror=()=>res(null);i.src=marca.logo_url;});
      }
      const c=document.createElement('canvas');c.width=1080;c.height=1920;
      desenharCard(c.getContext('2d'),{
        nome:(stu&&stu.name)||'', divisao:divisao&&divisao.nome,
        sets:finished.sets, ton:finished.ton, tempo:fmtT(finished.tempo), prs:finished.prs,
        exercicios:finished.exercicios,
        marca:(marca&&(marca.brand_name||marca.name))||'MF Performance',
        logo, arroba:marca&&marca.instagram,
        data:new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}),
      });
      const blob=await new Promise(r=>c.toBlob(r,'image/png'));
      if(!vivo||!blob)return;
      setUrl(URL.createObjectURL(blob));
      setArquivo(new File([blob],'meu-treino.png',{type:'image/png'}));
    }catch(e){if(vivo)setErro('Não deu para montar a imagem neste aparelho.');}
  })();return()=>{vivo=false;};},[]);

  const baixar=()=>{
    if(!url)return;
    const a=document.createElement('a');a.href=url;a.download='meu-treino.png';
    document.body.appendChild(a);a.click();a.remove();
    setSalvo(true);
  };
  const compartilhar=async()=>{
    // precisa sair no mesmo toque do botão, por isso a imagem já vem pronta
    try{
      if(arquivo&&navigator.canShare&&navigator.canShare({files:[arquivo]})){
        await navigator.share({files:[arquivo],title:'Meu treino'});
        return;
      }
    }catch(e){ if(e&&e.name==='AbortError')return; }
    baixar();
  };

  if(erro)return <div className="lv-sub" style={{marginTop:14}}>{erro}</div>;
  return(<div style={{marginTop:18,width:'100%',maxWidth:300}}>
    {url
      ? <img src={url} alt="Resumo do treino" style={{width:'100%',borderRadius:16,display:'block',
          border:'1px solid var(--lvbd)',boxShadow:'0 10px 40px rgba(139,92,246,.25)'}}/>
      : <div className="lv-card" style={{textAlign:'center',padding:'34px 0'}}><div className="spinner"/></div>}
    <button className="lv-btn neon" style={{marginTop:12}} disabled={!url} onClick={compartilhar}>
      Compartilhar nos stories</button>
    {salvo&&<div className="lv-sub" style={{marginTop:8,textAlign:'center',lineHeight:1.45}}>
      Imagem salva. Abra o Instagram, crie um story e escolha ela da galeria.</div>}
  </div>);
}

// Trocar exercício na hora: o aparelho está ocupado, dói o ombro naquele
// ângulo, a academia não tem a máquina. Em vez de pular, ele escolhe outro do
// mesmo grupo — e é o trocado que vai para o histórico do treinador.
function TrocarExercicio({ex,biblio,vid,onEscolher,onDesfazer,onFechar}){
  const [busca,setBusca]=useState('');
  const [tudo,setTudo]=useState(false);
  const grupo=((vid||{})[ex.exercicio_id]||{}).grupo||null;
  const lista=React.useMemo(()=>{
    const q=(busca||'').trim().toLowerCase();
    const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    return (biblio||[])
      .filter(b=>b.nome&&b.nome!==ex.nome&&b.nome!==ex.original)
      .filter(b=>tudo||!grupo||b.grupo_muscular===grupo)
      .filter(b=>!q||norm(b.nome).includes(norm(q))||norm(b.grupo_muscular).includes(norm(q)))
      .slice(0,60);
  },[biblio,busca,tudo,grupo,ex]);
  return(<div className="lv-cel" style={{padding:'18px 14px',overflowY:'auto',alignItems:'stretch',justifyContent:'flex-start',background:'var(--lvbg)'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:4}}>
      <button className="lv-ghost" onClick={onFechar}>‹ Voltar</button>
      {ex.trocado&&<button className="lv-ghost" onClick={onDesfazer}>Voltar ao original</button>}
    </div>
    <div className="lv-kick" style={{marginTop:10}}>No lugar de</div>
    <div style={{fontSize:19,fontWeight:800,marginBottom:2}}>{ex.original}</div>
    <div className="lv-sub" style={{lineHeight:1.45,marginBottom:14}}>
      Escolha outro exercício {grupo&&!tudo?'de '+grupo.toLowerCase():'da biblioteca'}. As séries, repetições e
      o descanso da ficha continuam os mesmos — muda só o movimento.</div>
    <input className="lv-in" placeholder="Buscar exercício" value={busca} onChange={e=>setBusca(e.target.value)}/>
    {grupo&&<div style={{marginTop:10}}>
      <button className="lv-ghost" onClick={()=>setTudo(t=>!t)}>{tudo?'Só '+grupo.toLowerCase():'Ver todos os grupos'}</button>
    </div>}
    <div style={{marginTop:14}}>
      {biblio&&biblio.length===0?<div className="lv-sub" style={{textAlign:'center',padding:'20px 0'}}>
        A biblioteca ainda não foi guardada neste aparelho. Abra o app uma vez com internet.</div>:
       lista.length===0?<div className="lv-sub" style={{textAlign:'center',padding:'20px 0'}}>
        Nenhum exercício com esse nome.</div>:
       lista.map(b=><div key={b.id} className="lv-card" style={{padding:'12px 14px',marginBottom:8,
         display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
         <div style={{minWidth:0}}>
           <div style={{fontWeight:700,fontSize:14.5}}>{b.nome}</div>
           <div className="lv-sub" style={{fontSize:11.5}}>{b.grupo_muscular||'Sem grupo'}{(b.video_url||b.video_path)?' · com demonstração':''}</div>
         </div>
         <button className="lv-ghost" style={{flexShrink:0}} onClick={()=>onEscolher(b)}>Usar este</button>
       </div>)}
    </div>
    <div style={{height:24}}/>
  </div>);
}

function TrainExec({student,divisao,demo,somenteLeitura,best,onBack,onSaved,onFinish}){
  const [series,setSeries]=useState(demo?(_DEMO_ALUNO_SERIES[divisao.id]||[]):null);
  const [vals,setVals]=useState({});const [done,setDone]=useState({});const [active,setActive]=useState({});
  const [openEx,setOpenEx]=useState(0);const [rest,setRest]=useState(0);const [restName,setRestName]=useState('');
  const [paused,setPaused]=useState(false);const [tot,setTot]=useState(0);
  const [restTotal,setRestTotal]=useState(60);
  const audioRef=useRef(null);const [cel,setCel]=useState(null);const [vid,setVid]=useState({});const [demoOn,setDemoOn]=useState({});const [finished,setFinished]=useState(null);const [fbAberto,setFbAberto]=useState(false);
  const [ultima,setUltima]=useState({});        // o que ele fez da última vez, por exercício
  const [biblio,setBiblio]=useState([]);        // biblioteca, para trocar exercício
  const [trocas,setTrocas]=useState({});        // exercício trocado na hora
  const [trocando,setTrocando]=useState(null);  // qual exercício está escolhendo a troca
  const [marca,setMarca]=useState(null);        // marca do treinador, para o card
  // aviso do descanso com o celular no bolso
  const [avisoDesc,setAvisoDesc]=useState(()=>{try{return('Notification'in window)?Notification.permission:'unsupported';}catch(e){return'unsupported';}});
  useEffect(()=>()=>{cancelarAvisoDescanso();},[]);
  useEffect(()=>{if(demo||!student.coach_id)return;
    lerCopia('marca-'+student.coach_id,
      sb.from('profiles').select('brand_name,name,instagram,logo_url').eq('id',student.coach_id).maybeSingle())
      .then(({data})=>setMarca(data||null)).catch(()=>{});},[]);
  const [pendentes,setPendentes]=useState(0);   // séries guardadas no aparelho
  useEffect(()=>{filaAluno().then(q=>setPendentes(q.length));
    const f=e=>setPendentes(e.detail||0);
    window.addEventListener('mfp-fila',f);
    return()=>window.removeEventListener('mfp-fila',f);},[]);
  useEffect(()=>{if(demo)return;(async()=>{
    const {data}=await lerCopia('series-'+divisao.id,
      sb.from('train_serie_prescrita').select('*').eq('divisao_id',divisao.id).order('ordem'));
    setSeries(data||[]);
    const ids=[...new Set((data||[]).map(s=>s.exercicio_id).filter(Boolean))];
    if(ids.length){const {data:ex}=await lerCopia('exs-'+divisao.id,
      sb.from('train_exercicios').select('id,video_url,video_path,dicas,grupo_muscular').in('id',ids));
      // guarda também as dicas: as técnicas avançadas não têm desenho, o que
      // vale ali é a instrução escrita
      const m={};(ex||[]).forEach(e=>{if(e.video_url||e.video_path||e.dicas)m[e.id]={url:e.video_url,path:e.video_path,dicas:e.dicas,grupo:e.grupo_muscular};});setVid(m);}
    // ── o que ele fez da última vez: é isso que diz se hoje é para subir a carga ──
    const {data:hi}=await lerCopia('ultimas-'+divisao.id,
      sb.from('train_historico')
        .select('exercicio_id,exercicio_nome,data_treino,carga,reps,indice_serie,tipo_serie,divisao_id,is_pr')
        .eq('student_id',student.id).order('data_treino',{ascending:false}).limit(400));
    const hoje=todayStr(), porEx={};
    (hi||[]).forEach(h=>{
      if(h.data_treino>=hoje)return;                    // hoje não é "última vez"
      const k=h.exercicio_id||h.exercicio_nome;if(!k)return;
      if(!porEx[k])porEx[k]={data:h.data_treino,series:[]};
      if(porEx[k].data!==h.data_treino)return;          // só a sessão mais recente
      porEx[k].series.push({carga:h.carga,reps:h.reps,i:h.indice_serie});
    });
    Object.values(porEx).forEach(v=>v.series.sort((a,b)=>(a.i||0)-(b.i||0)));
    setUltima(porEx);

    // ── o campo já vem com o que ele fez da última vez ──────────
    // O quadro "Da última vez" existia, mas os campos nasciam vazios: o aluno
    // lia o número e digitava o mesmo de novo, série após série. Agora vem
    // preenchido, e registrar custa um toque. O que estiver no campo é o que
    // vai gravado — quem mudou a carga corrige o número antes de concluir.
    const semente={};
    (data||[]).forEach(s=>{
      const u=porEx[s.exercicio_id]||porEx[s.exercicio_nome];
      if(!u||!u.series.length)return;
      for(let i=0;i<(s.qtd_series||0);i++){
        // sem registro daquela série exata, vale a mais próxima que existir:
        // quem fez 4 séries hoje e 1 na vez passada repete a mesma carga
        const x=u.series.find(y=>(y.i||0)===i+1)
          ||u.series[Math.min(i,u.series.length-1)];
        if(!x)continue;
        const v={};
        if(x.carga!=null)v.carga=String(x.carga);
        if(x.reps!=null)v.reps=String(x.reps);
        if(Object.keys(v).length)semente[s.id+'_'+i]=v;
      }
    });
    // o que ele já digitou nesta sessão manda: a semente só preenche o vazio
    if(Object.keys(semente).length)setVals(p=>({...semente,...p}));

    // ── retomar o treino de hoje ──────────────────────────────
    // Fechar o app no meio do treino zerava a tela: as séries estavam
    // gravadas, mas ele voltava vendo 0/24 e refazia tudo. O que já foi feito
    // hoje vem do servidor E da fila do aparelho — quem treinou sem sinal tem
    // as séries só na fila, e elas contam igual.
    const daFila=(await filaAluno())
      .filter(it=>it.tabela==='train_historico'&&it.linha
        &&it.linha.divisao_id===divisao.id&&it.linha.data_treino===hoje)
      .map(it=>it.linha);
    const deHoje=[...(hi||[]).filter(h=>h.data_treino===hoje&&h.divisao_id===divisao.id),...daFila];
    if(deHoje.length){
      const feito={};
      deHoje.forEach(h=>{
        const s=(data||[]).find(x=>x.tipo_serie===h.tipo_serie&&
          ((h.exercicio_id&&x.exercicio_id===h.exercicio_id)||x.exercicio_nome===h.exercicio_nome));
        if(!s)return;                                   // exercício trocado na hora: não dá para casar
        const i=(h.indice_serie||1)-1;
        if(i<0||i>=s.qtd_series)return;
        feito[s.id+'_'+i]={carga:num(h.carga),reps:num(h.reps),isPr:!!h.is_pr};
      });
      if(Object.keys(feito).length)setDone(p=>({...feito,...p}));
    }
  })();},[]);

  // biblioteca para a troca de exercício (guardada, funciona sem internet)
  useEffect(()=>{if(demo)return;
    lerCopia('lib-completa',sb.from('train_exercicios').select('*').order('grupo_muscular').order('nome'))
      .then(({data})=>setBiblio(data||[])).catch(()=>{});},[]);
  useEffect(()=>{const t=setInterval(()=>setTot(x=>x+1),1000);return()=>clearInterval(t);},[]);

  // A tela fica acesa durante o treino — ninguém quer destravar o celular
  // a cada série. Se o aparelho não suportar, segue normal.
  useEffect(()=>{
    let lock=null;
    const pegar=async()=>{try{if(navigator.wakeLock&&document.visibilityState==='visible')lock=await navigator.wakeLock.request('screen');}catch(e){}};
    pegar();
    const onVis=()=>{if(document.visibilityState==='visible')pegar();};
    document.addEventListener('visibilitychange',onVis);
    return()=>{document.removeEventListener('visibilitychange',onVis);try{lock&&lock.release();}catch(e){}};
  },[]);

  // Apito do fim do descanso. O contexto de áudio nasce no toque do aluno
  // (concluir série), senão o iPhone bloqueia o som.
  const bipar=()=>{
    try{
      const ctx=audioRef.current;if(!ctx)return;
      if(ctx.state==='suspended')ctx.resume();
      const toque=(t,f)=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.connect(g);g.connect(ctx.destination);o.type='sine';o.frequency.value=f;
        g.gain.setValueAtTime(.0001,t);
        g.gain.exponentialRampToValueAtTime(.22,t+.02);
        g.gain.exponentialRampToValueAtTime(.0001,t+.28);
        o.start(t);o.stop(t+.3);
      };
      const t0=ctx.currentTime;
      toque(t0,880);toque(t0+.34,1175);
    }catch(e){}
  };

  // O descanso conta pelo relógio, não pelo intervalo: quando o aluno guarda o
  // celular no bolso o navegador congela a aba e um contador de 1 em 1 segundo
  // atrasa. Com a hora do fim guardada, ele volta e o número está certo.
  const fimRef=useRef(0);const tocouRef=useRef(false);
  useEffect(()=>{
    if(rest<=0||paused)return;
    const conta=()=>{
      const falta=Math.max(0,Math.ceil((fimRef.current-Date.now())/1000));
      setRest(falta);
      if(falta<=0&&!tocouRef.current){tocouRef.current=true;bipar();vibrar([120,60,120,60,200]);}
    };
    const t=setInterval(conta,300);
    document.addEventListener('visibilitychange',conta);
    return()=>{clearInterval(t);document.removeEventListener('visibilitychange',conta);};
  },[rest>0,paused]);
  // mexeu no descanso (−15s, +30s, pausa, pular): a hora do fim e o aviso
  // agendado no worker têm que acompanhar, senão a notificação sai na hora errada
  const ajustarFim=(novoRest,nome)=>{
    if(novoRest<=0){fimRef.current=0;cancelarAvisoDescanso();return;}
    fimRef.current=Date.now()+novoRest*1000;tocouRef.current=false;
    agendarAvisoDescanso(fimRef.current,nome||restName);
  };
  const exs=React.useMemo(()=>{const m=new Map();(series||[]).forEach(s=>{const k=s.exercicio_id||s.exercicio_nome;
    const tr=trocas[k];
    if(!m.has(k))m.set(k,{key:k,nome:tr?tr.nome:s.exercicio_nome,original:s.exercicio_nome,trocado:!!tr,
      exercicio_id:tr?tr.id:s.exercicio_id,tiers:[]});m.get(k).tiers.push(s);});const ord={Aquecimento:0,Preparatoria:1,Valida:2};const a=[...m.values()];a.forEach(e=>e.tiers.sort((x,y)=>(ord[x.tipo_serie]??9)-(ord[y.tipo_serie]??9)));return a;},[series,trocas]);
  const setV=(k,f,v)=>setVals(p=>({...p,[k]:{...(p[k]||{}),[f]:v}}));
  const firstUndone=s=>{for(let i=0;i<s.qtd_series;i++)if(!done[s.id+'_'+i])return i;return s.qtd_series;};
  const activeIdx=s=>active[s.id]!=null?active[s.id]:firstUndone(s);
  const tierDoneCount=s=>{let c=0;for(let i=0;i<s.qtd_series;i++)if(done[s.id+'_'+i])c++;return c;};
  const fmtT=x=>String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0');
  const celebrate=carga=>{setCel({carga});try{navigator.vibrate&&navigator.vibrate([35,45,90]);}catch(e){}setTimeout(()=>setCel(null),2200);};
  const concluir=async(s,i)=>{
    // Exercício sem peso existe: elástico, peso do corpo, prancha, alongamento.
    // Exigir carga fazia o botão não responder a nada — sem aviso, sem erro. Uma
    // aluna abandonou o app por isso: a primeira coisa da ficha dela era uma
    // abdução com elástico. Peso em branco agora vale "sem carga".
    const k=s.id+'_'+i;const v=vals[k]||{};const carga=num(v.carga),reps=num(v.reps);
    const isPr=s.tipo_serie==='Valida'&&carga!=null&&carga>(best[s.exercicio_id]||0);
    setDone(p=>({...p,[k]:{carga,reps,isPr}}));
    let nx=i+1;while(nx<s.qtd_series&&done[s.id+'_'+nx])nx++;setActive(p=>({...p,[s.id]:nx}));
    try{
      const A=window.AudioContext||window.webkitAudioContext;
      if(A&&!audioRef.current)audioRef.current=new A();
      if(audioRef.current&&audioRef.current.state==='suspended')audioRef.current.resume();
    }catch(e){}
    const desc=s.intervalo_seg_min||60;
    const nomeEx=(trocas[s.exercicio_id||s.exercicio_nome]||{}).nome||s.exercicio_nome;
    setRestTotal(desc);setRest(desc);setRestName(nomeEx);setPaused(false);
    ajustarFim(desc,nomeEx);
    if(onSaved&&carga!=null)onSaved(s.exercicio_id,carga);
    if(isPr)celebrate(carga);
    if(!demo&&!somenteLeitura){
      // se o aluno trocou o exercício, é o trocado que vai para o histórico —
      // assim o treinador vê o que foi feito de verdade
      const tr=trocas[s.exercicio_id||s.exercicio_nome];
      // O id sai daqui, não do banco. Numa internet de academia o insert
      // responde depois do prazo, o app acha que falhou, joga na fila e a fila
      // grava de novo — a mesma série virava duas linhas. Com id próprio, a
      // segunda gravação bate no id que já existe e é ignorada.
      const linha={id:genId(),coach_id:student.coach_id,student_id:student.id,divisao_id:divisao.id,
        exercicio_id:tr?tr.id:s.exercicio_id,exercicio_nome:tr?tr.nome:s.exercicio_nome,
        data_treino:todayStr(),
        indice_serie:i+1,tipo_serie:s.tipo_serie,carga,reps,is_pr:isPr};
      let subiu=false;
      if(navigator.onLine){
        try{const {error}=await comPrazo(sb.from('train_historico')
          .upsert(linha,{onConflict:'id',ignoreDuplicates:true}));if(!error)subiu=true;}catch(e){}
      }
      if(!subiu){await enfileirarAluno({tabela:'train_historico',linha});setPendentes(n=>n+1);}
    }
  };
  const totalSets=exs.reduce((a,e)=>a+e.tiers.reduce((b,t)=>b+t.qtd_series,0),0);
  const doneSets=Object.keys(done).length;
  const tlabel=t=>t==='Aquecimento'?'Aquec':t==='Preparatoria'?'Prep':'Válidas';

  return(<div className="lv-wrap">
    {cel&&<><div className="lv-cel"><div className="lv-selo">PR</div><h2>Novo recorde</h2>
      <div style={{fontSize:24,fontWeight:900,color:'var(--lvclaro)'}}><Conta valor={cel.carga} dec={String(cel.carga).includes('.')?1:0}/> kg</div>
      <div className="lv-sub" style={{marginTop:6}}>Você superou sua melhor carga neste exercício.</div></div><Confete n={22}/></>}

    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
      <button className="lv-ghost" onClick={onBack}>‹ Voltar</button>
      <div style={{textAlign:'center'}}><div className="lv-kick">Tempo total</div><div className="lv-tot">{fmtT(tot)}</div></div>
      <span style={{width:64}}/>
    </div>
    <div className="lv-title" style={{textAlign:'center'}}>{divisao.nome||'Treino'}</div>
    <div className="lv-sub" style={{textAlign:'center',marginBottom:14}}>{doneSets}/{totalSets} séries concluídas</div>
    {!demo&&!somenteLeitura&&avisoDesc==='default'&&
      <div style={{textAlign:'center',marginBottom:12}}>
        <button className="lv-ghost" onClick={async()=>{
          const ok=await pedirAvisoDescanso();
          setAvisoDesc(ok?'granted':'denied');
          if(ok&&rest>0&&!paused)agendarAvisoDescanso(fimRef.current,restName);
        }}>Avisar quando o descanso acabar</button>
        <div className="lv-sub" style={{fontSize:11.5,marginTop:5}}>Toca mesmo com o celular no bolso.</div>
      </div>}
    {pendentes>0&&<div className="lv-card" style={{borderColor:'var(--lvsel)',padding:'10px 14px',marginBottom:12}}>
      <div style={{fontWeight:700,fontSize:13.5}}>Treinando sem internet</div>
      <div className="lv-sub" style={{marginTop:3,lineHeight:1.45}}>
        {pendentes} série{pendentes>1?'s':''} guardada{pendentes>1?'s':''} no aparelho. Sobe sozinho quando o sinal voltar — pode treinar tranquilo.</div>
    </div>}

    {series===null?<div className="center-screen"><div className="spinner"/></div>:
     exs.length===0?<div className="lv-card" style={{textAlign:'center',color:'var(--lvt2)'}}>Sem exercícios nesta divisão.</div>:
     exs.map((e,ei)=>{const open=openEx===ei;const allDone=e.tiers.every(t=>tierDoneCount(t)>=t.qtd_series);
      return(<div key={e.key} className="lv-card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,cursor:'pointer'}} onClick={()=>setOpenEx(open?-1:ei)}>
          <div><div style={{fontSize:16.5,fontWeight:800}}>{e.nome} {allDone&&<span style={{color:'var(--lvneon)'}}>✓</span>}</div>
            {e.trocado&&<div className="lv-sub" style={{fontSize:11.5}}>no lugar de {e.original}</div>}
            <div style={{display:'flex',gap:12,marginTop:6,flexWrap:'wrap'}}>{e.tiers.map(t=><span key={t.id} style={{fontSize:11.5,color:'var(--lvt2)',display:'inline-flex',alignItems:'center',gap:5}}><i className="lv-dot" style={{background:tierColor(t.tipo_serie)}}/>{tlabel(t.tipo_serie)} {tierDoneCount(t)}/{t.qtd_series}</span>)}</div>
          </div>
          <span style={{color:'var(--lvt3)'}}>{open?'▾':'▸'}</span>
        </div>
        {open&&<div style={{marginTop:14}}>
          {(()=>{
            // o que ele fez da última vez neste exercício: é o número que diz
            // se hoje é para manter ou subir a carga
            const u=ultima[e.exercicio_id]||ultima[e.nome];
            if(!u||!u.series.length)return null;
            const dias=Math.max(0,Math.round((new Date(todayStr()+'T00:00:00')-new Date(u.data+'T00:00:00'))/86400000));
            return(<div className="lv-card" style={{padding:'10px 13px',marginBottom:12,background:'var(--lvc2)'}}>
              <div className="lv-kick" style={{fontSize:10.5}}>Da última vez · {dias===0?'hoje':dias===1?'ontem':'há '+dias+' dias'}</div>
              <div style={{fontWeight:700,fontSize:14.5,marginTop:3}}>
                {u.series.slice(0,6).map((x,i)=>(x.carga!=null?String(x.carga).replace('.',','):'—')+(x.reps?'×'+x.reps:'')).join('  ·  ')}
                <span className="lv-sub" style={{fontWeight:400}}> kg</span></div>
            </div>);
          })()}
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:demoOn[e.key]?8:12}}>
            <button className="lv-ghost" onClick={()=>setDemoOn(p=>({...p,[e.key]:!p[e.key]}))}>▶ {demoOn[e.key]?'Ocultar':'Ver'} demonstração</button>
            {!somenteLeitura&&<button className="lv-ghost" onClick={()=>setTrocando(e)}>⇄ Trocar exercício</button>}
          </div>
          {demoOn[e.key]&&<div style={{marginBottom:14}}><ExDemo url={(vid[e.exercicio_id]||{}).url} path={(vid[e.exercicio_id]||{}).path} name={e.nome} dicas={(vid[e.exercicio_id]||{}).dicas}/></div>}
          {e.tiers.map(t=>{const ai=activeIdx(t);const complete=tierDoneCount(t)>=t.qtd_series;const iv=t.intervalo_seg_min||60;
            return(<div key={t.id} style={{marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <span style={{display:'inline-flex',alignItems:'center',gap:8,fontWeight:700}}><i className="lv-dot" style={{background:tierColor(t.tipo_serie)}}/>{tierNome(t.tipo_serie)}</span>
                {/* o que ele precisa saber para fazer a série vinha menor que
                    o rótulo dos campos; agora tem o peso de informação */}
                <span className="lv-sub">{complete?'concluído ✓':<>
                  <b style={{color:'var(--lvt)',fontSize:14}}>{t.qtd_series}×{t.faixa_reps}</b>
                  {' · desc. '+Math.floor(iv/60)+':'+String(iv%60).padStart(2,'0')}</>}</span>
              </div>
              <div className="lv-setchips">{Array.from({length:t.qtd_series}).map((_,i)=>{const dn=done[t.id+'_'+i];const isA=!dn&&i===ai;
                return(<div key={i} className={'lv-setchip '+(dn?'done':isA?'active':'')} onClick={()=>!dn&&setActive(p=>({...p,[t.id]:i}))}>{dn?'✓ ':''}{i+1}ª{dn&&<div style={{fontSize:10,fontWeight:600,marginTop:2}}>{dn.carga!=null?dn.carga+'kg':(dn.reps!=null?dn.reps+' reps':'feita')}</div>}</div>);})}</div>
              {!complete&&ai<t.qtd_series&&<div>
                <div style={{display:'flex',gap:10,marginBottom:10}}>
                  <div style={{flex:1}}><span className="lv-inlbl">Peso (kg)</span><input className="lv-in" type="number" inputMode="decimal" placeholder="sem peso" value={(vals[t.id+'_'+ai]||{}).carga||''} onChange={ev=>setV(t.id+'_'+ai,'carga',ev.target.value)}/></div>
                  <div style={{flex:1}}><span className="lv-inlbl">Reps feitas</span><input className="lv-in" type="number" inputMode="numeric" placeholder="reps" value={(vals[t.id+'_'+ai]||{}).reps||''} onChange={ev=>setV(t.id+'_'+ai,'reps',ev.target.value)}/></div>
                </div>
                <button className="lv-btn" onClick={()=>concluir(t,ai)}>✓ Concluir série</button>
              </div>}
            </div>);})}
        </div>}
      </div>);})}
    {/* Enquanto sobra série, "Finalizar" é o botão que ele NÃO quer tocar — e
        era o mais chamativo da tela, verde neon, no meio do caminho. Só ganha
        destaque quando o treino realmente acabou; antes disso fica discreto e
        diz quantas faltam, para o toque sem querer não encerrar o treino. */}
    {series!==null&&exs.length>0&&<button
      className={'lv-btn'+(doneSets>=totalSets?' neon':'')}
      style={doneSets>=totalSets?{marginTop:8}
        :{marginTop:8,background:'var(--lvc2)',color:'var(--lvt2)'}}
      onClick={()=>{
      const ton=Object.values(done).reduce((a,d)=>a+(num(d.carga)||0)*(num(d.reps)||0),0);
      const prs=Object.values(done).filter(d=>d.isPr).length;
      // resumo por exercício: a melhor série de cada um, que é o que dá orgulho
      const porEx=exs.map(e=>{
        let melhor=null,qtd=0;
        e.tiers.forEach(t=>{for(let i=0;i<t.qtd_series;i++){const d=done[t.id+'_'+i];
          if(!d)continue;qtd++;
          if(!melhor||(num(d.carga)||0)>(num(melhor.carga)||0))melhor=d;}});
        return qtd?{nome:e.nome,carga:num(melhor.carga),reps:num(melhor.reps),series:qtd}:null;
      }).filter(Boolean);
      setFinished({sets:Object.keys(done).length,ton:Math.round(ton),prs,tempo:tot,exercicios:porEx});
      try{navigator.vibrate&&navigator.vibrate([50,50,50,50,120]);}catch(e){}
      // o treinador recebe na tela do celular que este aluno acabou de treinar
      if(!demo&&!somenteLeitura)avisarTreinoConcluido(divisao&&divisao.nome);
    }}>{doneSets>=totalSets?'✓ Finalizar treino'
        :'Finalizar treino · faltam '+plural(totalSets-doneSets,'série')}</button>}
    <div style={{height:rest>0?96:16}}/>

    {finished&&fbAberto&&<div className="lv-cel" style={{padding:'20px 8px',overflowY:'auto',alignItems:'stretch',justifyContent:'flex-start'}}>
      <FeedbackTreino divisao={divisao} demo={demo}
        onPronto={()=>{setFbAberto(false);if(onFinish)onFinish();onBack();}}/>
    </div>}
    {finished&&!fbAberto&&<><Confete n={20}/><div className="lv-cel" style={{padding:'24px 20px'}}>
      <div className="rule"/><h2>Treino concluído</h2>
      <div style={{display:'flex',gap:22,marginTop:16}}>
        <div style={{textAlign:'center'}}><div style={{fontSize:26,fontWeight:800}}><Conta valor={finished.sets}/></div><div className="lv-sub">séries</div></div>
        <div style={{textAlign:'center'}}><div style={{fontSize:26,fontWeight:800}}><Conta valor={finished.ton/1000} dec={1}/>t</div><div className="lv-sub">volume</div></div>
        <div style={{textAlign:'center'}}><div style={{fontSize:26,fontWeight:800}}>{fmtT(finished.tempo)}</div><div className="lv-sub">tempo</div></div>
      </div>
      {finished.prs>0&&<div className="lv-pill" style={{background:'var(--lvbrilho)',color:'var(--lvsel2)',marginTop:16,fontSize:14}}>{finished.prs} novo{finished.prs>1?'s':''} recorde{finished.prs>1?'s':''}!</div>}
      <CardTreino stu={student} divisao={divisao} finished={finished} marca={marca} fmtT={fmtT}/>
      <button className="lv-btn" style={{marginTop:16,maxWidth:280}} onClick={()=>setFbAberto(true)}>Contar como foi</button>
      <button className="lv-ghost" style={{marginTop:10,padding:'10px 22px'}} onClick={()=>{if(onFinish)onFinish();onBack();}}>Voltar ao início</button>
    </div></>}

    {trocando&&<TrocarExercicio ex={trocando} biblio={biblio} vid={vid}
      onEscolher={novo=>{
        setTrocas(p=>({...p,[trocando.key]:{id:novo.id,nome:novo.nome}}));
        // leva junto a demonstração do exercício novo, senão o "Ver demonstração"
        // fica vazio depois da troca
        setVid(p=>({...p,[novo.id]:{url:novo.video_url,path:novo.video_path,dicas:novo.dicas,grupo:novo.grupo_muscular}}));
        setTrocando(null);}}
      onDesfazer={()=>{setTrocas(p=>{const c={...p};delete c[trocando.key];return c;});setTrocando(null);}}
      onFechar={()=>setTrocando(null)}/>}

    {/* Os quatro controles não cabiam na mesma linha do cronômetro: em 390px o
        "Pular" ficava fora da tela e em 360px o pause também. Quem terminou o
        descanso antes não tinha como seguir. Agora o tempo fica em cima e os
        botões dividem a linha de baixo — cabe a partir de 320px. */}
    {rest>0&&!finished&&<div className="lv-rest">
      <div className="lv-restbar"><i style={{width:Math.max(0,Math.min(100,(rest/(restTotal||1))*100))+'%'}}/></div>
      <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:10}}>
        <div className="lv-restnum">{fmtT(rest)}</div>
        <div className="lv-kick" style={{flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
          {paused?'pausado':'descanso'}{restName?' · '+restName:''}</div>
      </div>
      <div style={{display:'flex',gap:7,alignItems:'center'}}>
        <button className="lv-ghost" style={{flex:1,padding:'9px 4px'}}
          onClick={()=>{vibrar(8);const n=Math.max(1,rest-15);setRest(n);if(!paused)ajustarFim(n);}}>−15s</button>
        <button className="lv-ghost" style={{flex:1,padding:'9px 4px'}}
          onClick={()=>{vibrar(8);const n=rest+30;setRest(n);setRestTotal(t=>t+30);if(!paused)ajustarFim(n);}}>+30s</button>
        <button className="lv-ghost" style={{flex:1,padding:'9px 4px'}}
          onClick={()=>{const p=!paused;setPaused(p);if(p)cancelarAvisoDescanso();else ajustarFim(rest);}}>{paused?'▶ Voltar':'❚❚ Pausar'}</button>
        <button className="lv-ghost" style={{flex:1,padding:'9px 4px',background:'var(--lvrx)',color:'#fff'}}
          onClick={()=>{vibrar(8);setRest(0);ajustarFim(0);}}>Pular</button>
      </div>
    </div>}
  </div>);
}

const _DEMO_HIST=(()=>{const out=[];const ds=['2026-06-06','2026-06-13','2026-06-20','2026-06-27','2026-07-04','2026-07-18','2026-08-03'];
  const c1=[60,62,62,64,66,70,80],c2=[40,40,42,44,45,48,52];
  ds.forEach((d,i)=>{out.push({exercicio_id:'x1',exercicio_nome:'Agachamento Livre',data_treino:d,tipo_serie:'Valida',carga:c1[i],reps:10,is_pr:i===6});
    out.push({exercicio_id:'x1',exercicio_nome:'Agachamento Livre',data_treino:d,tipo_serie:'Valida',carga:c1[i]-5,reps:11,is_pr:false});
    out.push({exercicio_id:'x3',exercicio_nome:'Supino',data_treino:d,tipo_serie:'Valida',carga:c2[i],reps:8,is_pr:i===6});});
  return out;})();

function EvolChart({sessions}){
  const W=320,H=150,pad=10,base=26;
  const cs=sessions.map(s=>s.carga),vs=sessions.map(s=>s.vol);
  const cmax=Math.max(...cs),cmin=Math.min(...cs),cr=cmax-cmin||1,vmax=Math.max(...vs)||1;
  const n=sessions.length;
  const x=i=>pad+(n<=1?(W-2*pad)/2:(i/(n-1))*(W-2*pad));
  const y=c=>H-base-((c-cmin)/cr)*(H-pad-base);
  const line=sessions.map((s,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(s.carga).toFixed(1)).join(' ');
  return(<svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',display:'block'}}>
    {sessions.map((s,i)=>{const bh=(s.vol/vmax)*(H-pad-base)*.6;return <rect key={'b'+i} x={x(i)-9} y={H-base-bh} width="18" height={bh} rx="3" fill="var(--accent-dim)"/>;})}
    <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    {sessions.map((s,i)=>s.pr?<g key={'p'+i}><circle cx={x(i)} cy={y(s.carga)} r="6" fill="var(--gold)"/><text x={x(i)} y={y(s.carga)+3.5} textAnchor="middle" fontSize="8">★</text></g>:<circle key={'d'+i} cx={x(i)} cy={y(s.carga)} r="3.5" fill="var(--accent)"/>)}
    {sessions.map((s,i)=>i%Math.ceil(n/4||1)===0||i===n-1?<text key={'x'+i} x={x(i)} y={H-8} textAnchor="middle" fontSize="8.5" fill="var(--text3)">{s.date.slice(8,10)+'/'+s.date.slice(5,7)}</text>:null)}
  </svg>);
}

function EvolScreen({student,demo,onBack}){
  const [hist,setHist]=useState(demo?_DEMO_HIST:null);
  const [sel,setSel]=useState(null);
  useEffect(()=>{if(demo)return;(async()=>{const {data}=await lerCopia('evol-'+student.id,
    sb.from('train_historico').select('exercicio_id,exercicio_nome,data_treino,tipo_serie,carga,reps,is_pr').eq('student_id',student.id).eq('tipo_serie','Valida').order('data_treino'));setHist(data||[]);})();},[]);
  const exs=React.useMemo(()=>{const m=new Map();(hist||[]).forEach(h=>{const k=h.exercicio_id||h.exercicio_nome;if(!m.has(k))m.set(k,{key:k,nome:h.exercicio_nome,rows:[]});m.get(k).rows.push(h);});
    return [...m.values()].map(e=>{const byd=new Map();e.rows.forEach(r=>{const d=r.data_treino;if(!byd.has(d))byd.set(d,{date:d,carga:0,vol:0,pr:false});const o=byd.get(d);o.carga=Math.max(o.carga,num(r.carga)||0);o.vol+=(num(r.carga)||0)*(num(r.reps)||0);if(r.is_pr)o.pr=true;});
      return {...e,sessions:[...byd.values()].sort((a,b)=>a.date<b.date?-1:1)};});},[hist]);
  const cur=exs.find(e=>e.key===sel)||exs[0];

  return(<div className="lv-wrap">
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
      <button className="lv-ghost" onClick={onBack}>‹ Voltar</button>
      <div className="lv-title" style={{flex:1}}>Minha evolução</div>
    </div>
    {hist===null?<div className="center-screen"><div className="spinner"/></div>:
     exs.length===0?<div className="lv-card" style={{textAlign:'center',color:'var(--lvt2)'}}>Ainda sem treinos registrados. Bata seu primeiro treino que o gráfico aparece aqui!</div>:<>
      <div className="lv-setchips" style={{marginBottom:14}}>{exs.map(e=><div key={e.key} className={'lv-setchip '+(cur&&cur.key===e.key?'active':'')} style={{flex:'unset',minWidth:'auto',padding:'8px 12px'}} onClick={()=>setSel(e.key)}>{e.nome}</div>)}</div>
      {cur&&(()=>{const ss=cur.sessions;const first=ss[0].carga,last=ss[ss.length-1].carga;const pct=first?Math.round((last-first)/first*100):0;const prs=ss.filter(s=>s.pr).length;
        const rising=ss.length>=2&&last>ss[ss.length-2].carga;const flat=ss.length>=2&&last===ss[ss.length-2].carga;
        const suggest=rising?last+2.5:last;const conf=rising?{l:'Alta',p:85,c:'var(--green)'}:flat?{l:'Média',p:62,c:'var(--gold)'}:{l:'Cautela',p:45,c:'var(--red)'};
        return(<>
          <div className="lv-card">
            <div className="lv-kick" style={{marginBottom:6}}>Carga máxima & volume</div>
            <EvolChart sessions={ss}/>
            <div style={{marginTop:10,display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}}>
              <div style={{fontFamily:'Playfair Display,serif',fontSize:34,fontWeight:700}}>{fmt(last)} kg</div>
              <span className="lv-pill" style={{background:pct>=0?'rgba(74,222,128,.16)':'rgba(225,29,72,.16)',color:pct>=0?'var(--green)':'var(--red)'}}>{pct>=0?'▲ +':'▼ '}{pct}% desde o início</span>
            </div>
            <div className="lv-sub" style={{marginTop:2}}>Última carga máxima · {fmtDate(ss[ss.length-1].date)}{prs>0&&` · ${prs} recorde${prs>1?'s':''}`}</div>
          </div>
          <div className="lv-card">
            <div className="lv-kick" style={{marginBottom:8}}>Estimativa da próxima sessão</div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div><div style={{fontWeight:800,fontSize:18}}>{fmt(suggest)} kg</div><div className="lv-sub">meta sugerida para as válidas</div></div>
              <span className="lv-pill" style={{background:'var(--accent-dim)',color:conf.c,border:'1px solid '+conf.c}}>{conf.l} · {conf.p}%</span>
            </div>
          </div>
        </>);})()}
    </>}
  </div>);
}

/* Conversa treinador <-> aluno.
   Os avisos eram mão-única: o treinador escrevia, o aluno lia e ia responder no
   WhatsApp. Aqui os dois falam, e os avisos antigos entram na mesma linha do
   tempo — o aluno não precisa saber que são duas coisas diferentes. */
function Conversa({studentId,souAluno,avisos,demo,somenteLeitura,onLido,compacto}){
  const [msgs,setMsgs]=useState(demo?[]:null);
  const [texto,setTexto]=useState('');
  const [enviando,setEnviando]=useState(false);
  const [erro,setErro]=useState(null);
  const fimRef=useRef(null);
  const carregar=async()=>{
    if(demo)return;
    const q=sb.from('train_conversa').select('*').order('created_at');
    const {data}=souAluno
      ? await lerCopia('conversa-'+studentId,q.eq('student_id',studentId))
      : await q.eq('student_id',studentId);
    setMsgs(data||[]);
  };
  useEffect(()=>{carregar();},[studentId]);
  // marca como lida o que veio do outro lado
  useEffect(()=>{if(demo||somenteLeitura||!msgs||!msgs.length)return;
    const temNova=msgs.some(m=>m.de_aluno!==souAluno&&!m.lido_em);
    if(!temNova)return;
    semEsperar(sb.rpc('conversa_marcar_lida',souAluno?{}:{p_student:studentId}));
    if(onLido)onLido();
  },[msgs]);
  // Descer até a última mensagem só faz sentido quando a conversa É a tela,
  // como na aba Recados do aluno. Na ficha do treinador ela é um cartão no meio
  // de uma página longa, e esse scroll arrastava a página inteira para o meio:
  // abrir um aluno no celular caía direto na conversa, com o nome dele e os
  // botões de ação já acima da dobra.
  useEffect(()=>{if(!souAluno&&!compacto)return;
    try{fimRef.current&&fimRef.current.scrollIntoView({block:'nearest'});}catch(e){}},[msgs]);

  // avisos antigos + mensagens numa linha do tempo só
  const linha=React.useMemo(()=>{
    const a=(avisos||[]).map(x=>({id:'a'+x.id,quando:x.created_at,deles:true,
      texto:(x.titulo?x.titulo+'\n':'')+x.texto}));
    const m=(msgs||[]).map(x=>({id:'m'+x.id,quando:x.created_at,deles:x.de_aluno!==souAluno,texto:x.texto}));
    return [...a,...m].sort((x,y)=>new Date(x.quando)-new Date(y.quando));
  },[avisos,msgs,souAluno]);

  const enviar=async()=>{
    const t=texto.trim();
    if(!t||enviando||somenteLeitura)return;
    setEnviando(true);setErro(null);
    const args=souAluno?{p_texto:t}:{p_texto:t,p_student:studentId};
    // aparece na hora; se falhar de vez, sai da tela junto com o aviso de erro
    const provisoria={id:'tmp'+Date.now(),created_at:new Date().toISOString(),
      de_aluno:souAluno,texto:t,_provisoria:true};
    setMsgs(p=>[...(p||[]),provisoria]);
    setTexto('');
    try{
      if(demo)throw new Error('Modo demonstração: a mensagem não é enviada.');
      const {data,error}=await comPrazo(sb.rpc('conversa_enviar',args));
      if(error)throw error;
      if(!data||!data.ok)throw new Error(data&&data.erro==='SEM_TREINADOR'
        ?'Sua conta ainda não está ligada a um treinador.':'Não consegui enviar.');
      setMsgs(p=>(p||[]).map(m=>m.id===provisoria.id?{...m,id:data.id,_provisoria:false}:m));
      semEsperar(avisarMensagem(data.id));
    }catch(e){
      if(isNetErr(e)&&!demo){
        // sem sinal: entra na fila e sobe quando voltar
        await enfileirarAluno({rpc:'conversa_enviar',args});
        setMsgs(p=>(p||[]).map(m=>m.id===provisoria.id?{...m,_naFila:true,_provisoria:false}:m));
      }else{
        setMsgs(p=>(p||[]).filter(m=>m.id!==provisoria.id));
        setTexto(t);
        setErro(e.message||String(e));
      }
    }
    setEnviando(false);
  };

  const caixa=(<div style={{display:'flex',gap:8,marginTop:10}}>
    <textarea className={souAluno?'lv-in':'fi'} rows={1} placeholder="Escreva uma mensagem"
      value={texto} onChange={e=>setTexto(e.target.value)}
      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();enviar();}}}
      style={{flex:1,resize:'none',minHeight:42,paddingTop:11}}/>
    <button className={souAluno?'lv-btn':'btn btn-primary'} style={{flexShrink:0,width:'auto',padding:'0 18px'}}
      disabled={!texto.trim()||enviando} onClick={enviar}>{enviando?'…':'Enviar'}</button>
  </div>);

  const corpo=(<>
    {msgs===null?<div className="center-screen" style={{minHeight:100}}><div className="spinner"/></div>:
     linha.length===0?<div className={souAluno?'lv-sub':'s-meta'} style={{textAlign:'center',padding:'18px 0',lineHeight:1.5}}>
       {souAluno?'Nenhuma mensagem ainda. Pode escrever — seu treinador recebe no celular.'
                :'Nenhuma mensagem ainda. Escreva a primeira; ele recebe no celular dele.'}</div>:
     <div style={{display:'flex',flexDirection:'column',maxHeight:compacto?320:'none',overflowY:compacto?'auto':'visible'}}>
       {linha.map(m=><div key={m.id} className={'lv-msg '+(m.deles?'deles':'minha')}>
         {m.texto}
         <span className="hora">{tempoRel(m.quando)}{m._naFila?' · guardada no aparelho':''}</span>
       </div>)}
       <div ref={fimRef}/>
     </div>}
    {erro&&<div className={souAluno?'lv-sub':'s-meta'} style={{color:'var(--lvrx)',marginTop:8}}>{erro}</div>}
    {!somenteLeitura&&caixa}
    {somenteLeitura&&<div className="lv-sub" style={{marginTop:10,textAlign:'center'}}>Só leitura nesta visão.</div>}
  </>);

  return souAluno?corpo:<div className="card" style={{marginBottom:14}}>
    <div className="sec-title">Conversa</div>{corpo}</div>;
}

/* Meus treinos: o diário do que ele fez, sessão por sessão.
   O gráfico de evolução responde "estou subindo neste exercício?"; esta tela
   responde "o que eu fiz na terça?" — que é a pergunta que ele faz mais. */
/* Espiar o treino antes de começar. Quem chega na academia quer saber o que
   vem pela frente para escolher o aparelho — e hoje a única forma era apertar
   "Iniciar treino", que já liga o cronômetro. */
function EspiarDivisao({divisao,demo,onFechar,onIniciar}){
  const [series,setSeries]=useState(demo?[]:null);
  useEffect(()=>{if(demo)return;
    lerCopia('series-'+divisao.id,
      sb.from('train_serie_prescrita').select('*').eq('divisao_id',divisao.id).order('ordem'))
      .then(({data})=>setSeries(data||[])).catch(()=>setSeries([]));},[divisao.id]);
  // uma linha por exercício, juntando os tiers como na tela de execução
  const exs=React.useMemo(()=>{
    const m=new Map();
    (series||[]).forEach(s=>{const k=s.exercicio_id||s.exercicio_nome;
      if(!m.has(k))m.set(k,{nome:s.exercicio_nome,tiers:[]});
      m.get(k).tiers.push(s);});
    return [...m.values()];
  },[series]);
  const totalSeries=(series||[]).reduce((a,s)=>a+(s.qtd_series||0),0);
  return(<div className="lv-cel" style={{padding:'18px 14px',overflowY:'auto',alignItems:'stretch',justifyContent:'flex-start',background:'var(--lvbg)'}}>
    <button className="lv-ghost" style={{alignSelf:'flex-start'}} onClick={onFechar}>‹ Voltar</button>
    <div className="lv-kick" style={{marginTop:12}}>O que vem hoje</div>
    <div style={{fontSize:20,fontWeight:900,marginBottom:2}}>{divisao.nome||'Treino'}</div>
    {series!==null&&<div className="lv-sub" style={{marginBottom:14}}>
      {exs.length} exercício{exs.length===1?'':'s'} · {totalSeries} série{totalSeries===1?'':'s'}</div>}
    {series===null?<div className="center-screen" style={{minHeight:140}}><div className="spinner"/></div>:
     exs.length===0?<div className="lv-card" style={{textAlign:'center',color:'var(--lvt2)'}}>
       Esta divisão ainda não tem exercício.</div>:
     exs.map((e,i)=><div key={i} className="lv-card" style={{padding:'12px 14px',marginBottom:8}}>
       <div style={{fontWeight:700,fontSize:14.5}}>{e.nome}</div>
       <div className="lv-sub" style={{fontSize:12.5,marginTop:4,lineHeight:1.5}}>
         {e.tiers.map((t,j)=>{const iv=t.intervalo_seg_min||60;
           return(<span key={j}>{j>0&&' · '}{t.qtd_series}×{t.faixa_reps}
             <span style={{color:'var(--lvt3)'}}> ({Math.floor(iv/60)}:{String(iv%60).padStart(2,'0')} desc.)</span></span>);})}
       </div>
     </div>)}
    {exs.length>0&&<button className="lv-btn" style={{marginTop:6}} onClick={onIniciar}>▶ Começar este treino</button>}
    <div style={{height:20}}/>
  </div>);
}

function TreinosScreen({student,demo,onBack}){
  const [hist,setHist]=useState(demo?_DEMO_HIST:null);
  const [nomes,setNomes]=useState({});
  const [aberta,setAberta]=useState(null);
  const [offline,setOffline]=useState(false);
  useEffect(()=>{if(demo)return;(async()=>{
    const r=await lerCopia('sessoes-'+student.id,
      sb.from('train_historico')
        .select('divisao_id,exercicio_id,exercicio_nome,data_treino,tipo_serie,carga,reps,indice_serie,is_pr,observacao,registrado_em')
        .eq('student_id',student.id).order('data_treino',{ascending:false}).order('registrado_em').limit(1200));
    setHist(r.data||[]);setOffline(semRede(r));
    const {data:dv}=await lerCopia('divs-'+student.id,
      sb.from('train_divisao').select('*').eq('student_id',student.id).order('ordem'));
    const m={};(dv||[]).forEach(d=>m[d.id]=d.nome);setNomes(m);
  })();},[]);
  const sessoes=React.useMemo(()=>agruparSessoes(hist),[hist]);
  const rotulo=s=>{
    const ns=s.divisoes.map(id=>nomes[id]).filter(Boolean);
    if(ns.length)return ns.join(' + ');
    if(s.soExterno)return s.externos.map(e=>e.nome).join(', ');
    return 'Treino';
  };
  const totalSem=React.useMemo(()=>{
    const md=new Date();md.setDate(md.getDate()-((md.getDay()+6)%7));const mk=dayKey(md);
    return sessoes.filter(s=>s.data>=mk).length;},[sessoes]);
  return(<div className="lv-wrap">
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
      <button className="lv-ghost" onClick={onBack}>‹ Voltar</button>
      <div className="lv-title" style={{flex:1}}>Meus treinos</div>
    </div>
    {hist===null?<div className="center-screen"><div className="spinner"/></div>:
     sessoes.length===0?<CardVazio offline={offline}
       titulo="Nenhum treino registrado ainda"
       texto="O primeiro aparece aqui assim que você fechar um treino."/>:<>
      <div className="lv-stats" style={{marginBottom:14}}>
        <div className="lv-stat"><b><Conta valor={sessoes.length}/></b><span>{rotuloN(sessoes.length,'Treino')}</span></div>
        <div className="lv-stat"><b><Conta valor={totalSem}/></b><span>Esta semana</span></div>
        <div className="lv-stat"><b><Conta valor={sessoes.reduce((a,s)=>a+s.prs,0)}/></b><span>{rotuloN(sessoes.reduce((a,s)=>a+s.prs,0),'Recorde')}</span></div>
      </div>
      {sessoes.map(s=>{const open=aberta===s.data;
        return(<div key={s.data} className="lv-card" style={{marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,cursor:'pointer'}}
            onClick={()=>setAberta(open?null:s.data)}>
            <div style={{minWidth:0}}>
              <div className="lv-kick" style={{fontSize:10.5}}>{diaPorExtenso(s.data)}</div>
              <div style={{fontWeight:800,fontSize:15.5,marginTop:2}}>{rotulo(s)}</div>
              <div className="lv-sub" style={{fontSize:12,marginTop:3}}>
                {s.soExterno?'Treino fora do app'+(s.externos[0]&&s.externos[0].obs?' · '+s.externos[0].obs:'')
                  :`${s.exercicios.length} exercício${s.exercicios.length>1?'s':''} · ${s.series} série${s.series>1?'s':''} · ${fmtTon(s.tonelagem)}`}
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
              {s.prs>0&&<span className="lv-pill" style={{background:'var(--lvbrilho)',color:'var(--lvsel2)',fontSize:11}}>{s.prs} PR</span>}
              {!s.soExterno&&<span style={{color:'var(--lvt3)'}}>{open?'▾':'▸'}</span>}
            </div>
          </div>
          {open&&!s.soExterno&&<div style={{marginTop:12,borderTop:'1px solid var(--lvbd)',paddingTop:12}}>
            {s.exercicios.map((e,i)=><div key={i} style={{marginBottom:i===s.exercicios.length-1?0:11}}>
              <div style={{fontWeight:700,fontSize:14}}>{e.nome}</div>
              <div className="lv-sub" style={{fontSize:12.5,marginTop:3,lineHeight:1.5}}>
                {e.sets.map((x,j)=><span key={j}>{j>0&&<span style={{color:'var(--lvt3)'}}>{'  ·  '}</span>}
                  <span style={{color:x.pr?'var(--lvneon)':'inherit',fontWeight:x.pr?700:400}}>
                    {fmtCarga(x.carga)}{x.reps?'×'+x.reps:''}</span></span>)}
                <span style={{color:'var(--lvt3)'}}> kg</span>
              </div>
            </div>)}
            {s.externos.length>0&&<div className="lv-sub" style={{marginTop:10,fontSize:12.5}}>
              Também: {s.externos.map(e=>e.nome+(e.obs?' ('+e.obs+')':'')).join(', ')}</div>}
          </div>}
        </div>);})}
    </>}
  </div>);
}

function HydraScreen({student,profile,demo,onBack}){
  const BTL='M31 8 h28 v9 q17 6 17 25 v82 q0 12 -12 12 h-38 q-12 0 -12 -12 v-82 q0 -19 17 -25 z';
  const [meta,setMeta]=useState(2500);
  const [today,setToday]=useState(demo?1750:0);
  const [week,setWeek]=useState(demo?[['Seg',2400],['Ter',1800],['Qua',2600],['Qui',2200],['Sex',2500],['Sáb',1200],['Dom',1750]]:null);
  const [cel,setCel]=useState(false);const hitRef=useRef(false);
  const [splash,setSplash]=useState(0);
  const [pend,setPend]=useState(0);   // ml tomados sem sinal, ainda na fila
  const cap=500;
  useEffect(()=>{if(demo)return;(async()=>{
    /* A meta é a que o TREINADOR escreveu no plano alimentar. Só quando não há
       plano — ou ele não pôs meta — é que ela sai do peso da última avaliação.
       Antes era sempre pelo peso: a garrafa dizia 2,1 L enquanto a tela da
       dieta e o anel do dia diziam os 2,5 L do plano. Três telas, dois números,
       e a comemoração de "meta batida" saindo na hora errada. */
    let m=null;
    try{const p=profile&&await getActivePlan(profile.id);if(p&&p.water_goal_ml)m=n0(p.water_goal_ml)||null;}catch(e){}
    if(!m){let w=null;
      try{const r=await lerCopia('aval-peso',sb.from('assessments').select('data,date').order('date',{ascending:false}).limit(1));
        const av=r.data;if(av&&av[0])w=av[0].data&&av[0].data.weight;}catch(e){}
      m=w?Math.round(num(w)*35/50)*50:2500;}
    setMeta(m);
    const monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));const mk=dayKey(monday);
    const r=await lerCopia('hidra-semana',sb.from('train_hidratacao').select('data,total_ml').gte('data',mk).order('data'));
    const hs=r.data||[];
    const map={};hs.forEach(h=>map[h.data]=h.total_ml);
    // o que bebeu sem sinal está na fila e ainda não é do servidor — mas já é
    // dele: sem somar aqui, quem bebeu offline reabre o app e vê a garrafa vazia
    const naFila=(await filaAluno()).filter(i=>i.rpc==='hidratar')
      .reduce((a,i)=>a+n0(i.args&&i.args.p_ml),0);
    setPend(naFila);
    const labels=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];const wk=[];
    for(let i=0;i<7;i++){const d=new Date(monday);d.setDate(d.getDate()+i);const ds=dayKey(d);
      wk.push([labels[i],(map[ds]||0)+(ds===todayStr()?naFila:0)]);}
    setWeek(wk);setToday((map[todayStr()]||0)+naFila);
  })();},[]);
  const add=async(ml)=>{const nt=today+ml;setToday(nt);
    setSplash(x=>x+1);setTimeout(()=>setSplash(x=>Math.max(0,x-1)),700);
    try{navigator.vibrate&&navigator.vibrate(15);}catch(e){}
    if(nt>=meta&&!hitRef.current){hitRef.current=true;setCel(true);try{navigator.vibrate&&navigator.vibrate([40,40,120]);}catch(e){}setTimeout(()=>setCel(false),2600);}
    if(demo)return;
    /* Sem prazo e sem fila, a água tomada sem sinal sumia calada: a garrafa
       enchia na tela e o servidor nunca sabia. Agora entra na fila como a série
       de treino. O hidratar SOMA ml, então uma resposta que se perde depois de
       gravar pode contar 250 ml duas vezes — é um exagero num contador que
       zera todo dia, e muito menos grave do que perder a água toda. */
    try{
      const {data,error}=await comPrazo(sb.rpc('hidratar',{p_ml:ml}));
      if(error)throw error;
      if(data!=null)setToday(n0(data)+pend);
    }catch(e){
      if(isNetErr(e)){await enfileirarAluno({rpc:'hidratar',args:{p_ml:ml}});setPend(p=>p+ml);}
    }};
  const pct=Math.min(1,meta?today/meta:0);const full=today>=meta&&today>0;
  const fillY=118-pct*(118-8);
  const weekMax=Math.max(meta,...((week||[]).map(w=>w[1])),1);
  return(<div className="lv-wrap">
    {cel&&<><div className="lv-cel"><div className="rule"/><h2>Meta de água batida</h2>
      <div className="lv-sub" style={{marginTop:6}}>Hidratação do dia completa.</div></div><Confete n={14}/></>}
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
      <button className="lv-ghost" onClick={onBack}>‹ Voltar</button>
      <div className="lv-title" style={{flex:1}}>Hidratação</div>
    </div>
    <div className="lv-card" style={{display:'flex',gap:16,alignItems:'center',position:'relative'}}>
      <svg viewBox="0 0 90 132" width="96" className={full?'lv-glow':''}>
        <defs><clipPath id="btlc"><path d={BTL}/></clipPath></defs>
        <g clipPath="url(#btlc)"><rect x="0" y="0" width="90" height="132" fill="#12121a"/>
          <g style={{transform:`translateY(${fillY}px)`,transition:'transform .8s cubic-bezier(.22,.9,.3,1)'}}>
            <rect x="0" y="6" width="90" height="132" fill={full?'var(--green)':'var(--blue)'} opacity="0.9"/>
            <path className="lv-wave" d="M0 8 q 11 -6 22 0 t 22 0 t 22 0 t 22 0 t 22 0 t 22 0 v 12 H0 z"
              fill={full?'var(--green)':'var(--blue)'} opacity="0.9"/>
            <path className="lv-wave" style={{animationDuration:'3.7s',animationDirection:'reverse'}}
              d="M0 10 q 11 -5 22 0 t 22 0 t 22 0 t 22 0 t 22 0 t 22 0 v 12 H0 z"
              fill="#fff" opacity="0.14"/>
          </g></g>
        <path d={BTL} fill="none" stroke={full?'var(--green)':'var(--text3)'} strokeWidth="2.5"/>
      </svg>
      {splash>0&&<span className="lv-splash" style={{left:34,top:52,width:26,height:26}}/>}
      <div style={{flex:1}}>
        <div style={{fontSize:26,fontWeight:800}}>{(today/1000).toFixed(2).replace('.',',')}<span style={{color:'var(--lvt2)',fontSize:15,fontWeight:600}}> / {(meta/1000).toFixed(2).replace('.',',')} L</span></div>
        <div className="lv-sub">{full?'meta do dia batida!':`faltam ${((meta-today)/1000).toFixed(2).replace('.',',')} L`}</div>
        {pend>0&&<div className="lv-sub" style={{fontSize:11.5,marginTop:3}}>
          {pend} ml guardados no aparelho — sobem quando o sinal voltar.</div>}
        <div className="lv-freq" style={{marginTop:10}}><i style={{width:(pct*100)+'%',background:full?'linear-gradient(90deg,var(--blue),var(--green))':'linear-gradient(90deg,var(--blue),#818cf8)'}}/></div>
      </div>
    </div>
    <div style={{display:'flex',gap:10,marginBottom:16}}>
      <button className="lv-waterbtn" onClick={()=>add(250)}>+250 ml</button>
      <button className="lv-waterbtn" onClick={()=>add(500)}>+500 ml</button>
      <button className="lv-waterbtn" onClick={()=>add(cap)}>✓ Garrafa</button>
    </div>
    <div className="lv-card"><div className="lv-kick" style={{marginBottom:10}}>Semana</div>
      {week===null?<div className="center-screen" style={{minHeight:80}}><div className="spinner"/></div>:
      <svg viewBox="0 0 300 120" style={{width:'100%',display:'block'}}>
        <line x1="0" y1={100-(meta/weekMax)*90} x2="300" y2={100-(meta/weekMax)*90} stroke="var(--green)" strokeWidth="1" strokeDasharray="4 3" opacity=".6"/>
        {week.map(([l,ml],i)=>{const h=(ml/weekMax)*90;const x=14+i*42;const hit=ml>=meta;return(<g key={i}>
          <rect x={x} y={100-h} width="24" height={h} rx="4" fill={hit?'var(--green)':'var(--blue)'} opacity=".9"/>
          <text x={x+12} y={114} textAnchor="middle" fontSize="9" fill="var(--text3)">{l}</text></g>);})}
      </svg>}
    </div>
  </div>);
}

/* ── Check-in diário (semáforo) ── */
const CHK_ITENS=[['sono','Sono','Dormi muito bem','Dormi mal'],['fadiga','Fadiga','Descansada','Exausta'],['estresse','Estresse','Tranquila','Muito estressada'],['dor','Dor muscular','Sem dor','Muita dor'],['humor','Humor','Ótimo','Ruim']];
function CheckinScreen({student,demo,onBack}){
  const [v,setV]=useState({sono:2,fadiga:2,estresse:2,dor:2,humor:2});
  const [res,setRes]=useState(null);const [busy,setBusy]=useState(false);
  const total=Object.values(v).reduce((a,b)=>a+b,0);
  const sinal=total<=9?{l:'Verde',c:'var(--green)',t:'Prontidão ótima — pode ir com tudo hoje.'}:total<=14?{l:'Amarelo',c:'var(--gold)',t:'Prontidão média — mantenha, sem forçar demais.'}:{l:'Vermelho',c:'var(--red)',t:'Prontidão baixa — pegue leve e priorize recuperação.'};
  const [erroChk,setErroChk]=useState(null);
  /* O semáforo aparecia mesmo quando a gravação falhava: o aluno via "Verde",
     ia treinar tranquilo, e o treinador não recebia sinal nenhum. O banco tem
     4 check-ins no total — parte disso é gravação que morreu calada. */
  const salvar=async()=>{
    setBusy(true);setErroChk(null);
    if(!demo){
      try{await gravar(sb.rpc('checkin_salvar',
        {p_sono:v.sono,p_fadiga:v.fadiga,p_estresse:v.estresse,p_dor:v.dor,p_humor:v.humor}));}
      catch(e){setBusy(false);setErroChk(porQueFalhou(e));return;}
    }
    setBusy(false);setRes({total,sinal});
  };
  if(res)return(<div className="lv-wrap"><div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><button className="lv-ghost" onClick={onBack}>‹ Voltar</button><div className="lv-title" style={{flex:1}}>Check-in de hoje</div></div>
    <div className="lv-card" style={{textAlign:'center'}}>
      <div style={{width:96,height:96,borderRadius:'50%',margin:'6px auto 12px',background:res.sinal.c,boxShadow:`0 0 40px ${res.sinal.c}80`}}/>
      <div style={{fontSize:22,fontWeight:800,color:res.sinal.c}}>{res.sinal.l}</div>
      <p className="lv-sub" style={{marginTop:6}}>{res.sinal.t}</p>
      <div className="lv-sub" style={{marginTop:10}}>Pontuação: {res.total}/25</div>
    </div>
    <button className="lv-btn" onClick={onBack}>Concluir</button>
  </div>);
  return(<div className="lv-wrap"><div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}><button className="lv-ghost" onClick={onBack}>‹ Voltar</button><div className="lv-title" style={{flex:1}}>Check-in diário</div></div>
    <p className="lv-sub" style={{marginBottom:14}}>Como você está hoje? Isso ajuda seu treinador a calibrar o treino.</p>
    {CHK_ITENS.map(([k,lbl,lo,hi])=>(<div key={k} className="lv-card">
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><span style={{fontWeight:700}}>{lbl}</span><span style={{fontWeight:800,color:'var(--lvrx)'}}>{v[k]}</span></div>
      <input type="range" min="1" max="5" value={v[k]} onChange={e=>setV(p=>({...p,[k]:+e.target.value}))} style={{width:'100%'}}/>
      <div style={{display:'flex',justifyContent:'space-between'}}><span className="lv-sub">{lo}</span><span className="lv-sub">{hi}</span></div>
    </div>))}
    <div className="lv-card" style={{display:'flex',alignItems:'center',gap:12}}>
      <div style={{width:16,height:16,borderRadius:'50%',background:sinal.c,boxShadow:`0 0 12px ${sinal.c}`}}/>
      <div style={{flex:1}}><div style={{fontWeight:700}}>Prévia: {sinal.l}</div><div className="lv-sub">{total}/25</div></div>
    </div>
    {erroChk&&<div className="lv-card" style={{borderColor:'rgba(248,113,113,.5)',marginTop:10}}>
      <div style={{fontWeight:700,fontSize:13.5,color:'#fca5a5'}}>Não enviei seu check-in</div>
      <div className="lv-sub" style={{marginTop:3,lineHeight:1.45}}>{erroChk}</div></div>}
    <button className="lv-btn" disabled={busy} onClick={salvar}>{busy?'Salvando…':'Enviar check-in'}</button>
  </div>);
}

/* ── Módulo do ciclo (educativo) ── */
const CICLO_COR={Menstrual:'var(--red)',Folicular:'var(--accent3)',Ovulatória:'var(--accent3)',Lútea:'var(--accent)'};
const CICLO_INFO={
  Menstrual:[['','Descanso ativo','Energia costuma estar mais baixa. Movimento leve e sono ajudam mais que forçar.'],['','Hidratação','Reforce a água — ajuda com cólica e retenção.'],['','Escute o corpo','Se a disposição vier, treine; se não, tudo bem pegar leve.']],
  Folicular:[['⚡','Fase de força','Estrogênio subindo — costuma render mais em carga e volume. Aproveite.'],['⚖','Balança','A balança tende a estabilizar/cair por menos retenção — normal, não é "progresso extra".'],['','Recuperação','Boa fase pra recuperação entre estímulos — mantenha o sono.']],
  Ovulatória:[['','Pico de disposição','Muitas relatam mais leveza e força. Ótima janela pra PRs.'],['','Aproveite','Momento de puxar um pouco mais, com técnica.'],['','Atenção às articulações','Um pouco mais de frouxidão ligamentar pode ocorrer — aquecça bem.']],
  Lútea:[['','Constância','Energia pode oscilar. Foque em manter a constância, não recordes.'],['','Fome/compulsão','Vontade de doce é comum — planeje lanches pra não sabotar.'],['','Sono e humor','Priorize sono; TPM pode afetar humor e percepção de esforço.']]};
function cicloFase(dataUM,dur,sang){
  const today=new Date(todayStr()+'T00:00:00'),um=new Date(dataUM+'T00:00:00');
  const diff=Math.floor((today-um)/86400000);const dia=(((diff%dur)+dur)%dur)+1;
  const ovul=Math.max(dur-14,sang+1);let fase;
  if(dia<=sang)fase='Menstrual';else if(dia>=ovul-2&&dia<=ovul+1)fase='Ovulatória';else if(dia<ovul)fase='Folicular';else fase='Lútea';
  return {dia,fase,ovul,restam:dur-dia+1};
}
function CicloScreen({student,demo,onBack}){
  const [cyc,setCyc]=useState(demo?{data_ultima:(()=>{const d=new Date();d.setDate(d.getDate()-8);return dayKey(d);})(),duracao_ciclo:28,duracao_sangramento:5}:undefined);
  const [edit,setEdit]=useState(false);const [f,setF]=useState({data:'',dur:28,sang:5});const [busy,setBusy]=useState(false);
  useEffect(()=>{if(demo)return;(async()=>{const {data}=await sb.from('train_ciclo').select('*').eq('student_id',student.id).limit(1);setCyc(data&&data[0]?data[0]:null);})();},[]);
  const [erroCiclo,setErroCiclo]=useState(null);
  const salvar=async()=>{
    if(!f.data)return;
    setBusy(true);setErroCiclo(null);
    if(!demo){
      try{await gravar(sb.rpc('ciclo_salvar',{p_data:f.data,p_dur:+f.dur,p_sang:+f.sang}));}
      catch(e){setBusy(false);setErroCiclo(porQueFalhou(e));return;}
    }
    setBusy(false);setCyc({data_ultima:f.data,duracao_ciclo:+f.dur,duracao_sangramento:+f.sang});setEdit(false);
  };
  const openEdit=()=>{setF({data:cyc?.data_ultima||todayStr(),dur:cyc?.duracao_ciclo||28,sang:cyc?.duracao_sangramento||5});setEdit(true);};
  if(cyc===undefined)return(<div className="lv-wrap"><div className="center-screen"><div className="spinner"/></div></div>);
  const setup=!cyc||!cyc.data_ultima||edit;
  if(setup)return(<div className="lv-wrap"><div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><button className="lv-ghost" onClick={onBack}>‹ Voltar</button><div className="lv-title" style={{flex:1}}>Meu ciclo</div></div>
    <div className="lv-card">
      <p className="lv-sub" style={{marginBottom:12}}>Informe o <b>primeiro dia da sua última menstruação</b> para acompanhar as fases.</p>
      <span className="lv-inlbl">Última menstruação</span><input className="lv-in" type="date" value={f.data} max={todayStr()} onChange={e=>setF(p=>({...p,data:e.target.value}))}/>
      <div style={{display:'flex',gap:10,marginTop:12}}>
        <div style={{flex:1}}><span className="lv-inlbl">Duração do ciclo</span><input className="lv-in" type="number" value={f.dur} onChange={e=>setF(p=>({...p,dur:e.target.value}))}/></div>
        <div style={{flex:1}}><span className="lv-inlbl">Dias de sangramento</span><input className="lv-in" type="number" value={f.sang} onChange={e=>setF(p=>({...p,sang:e.target.value}))}/></div>
      </div>
      {erroCiclo&&<div className="lv-sub" style={{marginTop:10,color:'#fca5a5'}}>{erroCiclo}</div>}
      <button className="lv-btn" style={{marginTop:14}} disabled={busy||!f.data} onClick={salvar}>{busy?'Salvando…':'Salvar'}</button>
    </div>
  </div>);
  const {dia,fase,restam}=cicloFase(cyc.data_ultima,cyc.duracao_ciclo,cyc.duracao_sangramento);
  const dur=cyc.duracao_ciclo,sang=cyc.duracao_sangramento,ovul=Math.max(dur-14,sang+1);
  const R=54,C=2*Math.PI*R;
  const segs=[['Menstrual',0,sang],['Folicular',sang,ovul-2],['Ovulatória',ovul-2,ovul+1],['Lútea',ovul+1,dur]];
  const mk=((dia-1)/dur)*360-90;const mx=70+R*Math.cos(mk*Math.PI/180),my=70+R*Math.sin(mk*Math.PI/180);
  return(<div className="lv-wrap"><div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><button className="lv-ghost" onClick={onBack}>‹ Voltar</button><div className="lv-title" style={{flex:1}}>Meu ciclo</div><button className="lv-x" onClick={openEdit}>Editar</button></div>
    <div className="lv-card" style={{textAlign:'center'}}>
      <svg viewBox="0 0 140 140" width="200" style={{maxWidth:'70%'}}>
        {segs.map(([nm,a,b])=><circle key={nm} cx="70" cy="70" r={R} fill="none" stroke={CICLO_COR[nm]} strokeWidth="12" strokeDasharray={`${((b-a)/dur)*C} ${C}`} strokeDashoffset={`${-(a/dur)*C}`} transform="rotate(-90 70 70)" strokeLinecap="butt"/>)}
        <circle cx={mx} cy={my} r="7" fill="#fff" stroke={CICLO_COR[fase]} strokeWidth="3"/>
        <text x="70" y="62" textAnchor="middle" fontSize="10" fill="var(--text2)">DIA DO CICLO</text>
        <text x="70" y="86" textAnchor="middle" fontSize="30" fontWeight="800" fill="#fff">{dia}</text>
      </svg>
      <div className="lv-pill" style={{background:CICLO_COR[fase]+'30',color:'#fff',border:'1px solid '+CICLO_COR[fase],marginTop:4}}><i style={{width:8,height:8,borderRadius:'50%',background:CICLO_COR[fase]}}/>{fase}</div>
      <div style={{display:'flex',gap:12,justifyContent:'center',marginTop:12,flexWrap:'wrap'}}>{Object.entries(CICLO_COR).map(([nm,c])=><span key={nm} style={{fontSize:11,color:'var(--lvt2)',display:'inline-flex',alignItems:'center',gap:5}}><i style={{width:8,height:8,borderRadius:'50%',background:c,display:'inline-block'}}/>{nm}</span>)}</div>
      <div className="lv-sub" style={{marginTop:10}}>Próxima menstruação em ~{restam} dias</div>
    </div>
    <div className="lv-kick" style={{margin:'4px 2px 8px'}}>Consciência da fase {fase}</div>
    {(CICLO_INFO[fase]||[]).map(([ic,t,d],i)=><div key={i} className="lv-card" style={{display:'flex',gap:12,alignItems:'flex-start'}}>
      <div style={{fontSize:22}}>{ic}</div><div><div style={{fontWeight:700}}>{t}</div><div className="lv-sub" style={{marginTop:2}}>{d}</div></div>
    </div>)}
    <div className="alert alert-info" style={{background:'var(--accent-dim)',border:'1px solid var(--accent)',color:'var(--accent)'}}>Este acompanhamento é <b>educativo</b> e não altera seu treino automaticamente.</div>
  </div>);
}

/* ── Tela vazia: é vazio mesmo, ou faltou internet? ──────────
   A mesma frase aparecia na ficha, na dieta, na avaliação, nos treinos e nas
   fotos, sempre afirmando ausência a partir de uma leitura que podia ter
   falhado. Uma peça só, para não virar cinco remendos diferentes. */
function CardVazio({offline,titulo,texto,onTentar}){
  return(<div className="lv-card" style={{textAlign:'center',padding:'30px 18px'}}>
    <div style={{fontSize:17,fontWeight:800,marginBottom:6}}>
      {offline?'Não consegui carregar agora':titulo}</div>
    <div className="lv-sub" style={{lineHeight:1.6}}>
      {offline?'Parece que a internet falhou. O que já existe continua guardado.':texto}</div>
    {offline&&onTentar&&<button className="lv-btn" style={{marginTop:14}} onClick={onTentar}>Tentar de novo</button>}
  </div>);
}

/* ── Minha avaliação física (aluno) ── */
function AvalScreen({student,demo,onBack}){
  const [evals,setEvals]=useState(demo?[
    {id:'e1',date:'2026-03-09',weight:'84',height:'175',bio_fat:'22',bio_lean:'58',bp_sys:'128',bp_dia:'84'},
    {id:'e2',date:'2026-07-09',weight:'78',height:'175',bio_fat:'16',bio_lean:'63',bp_sys:'120',bp_dia:'78'}]:null);
  const [showRep,setShowRep]=useState(false);
  const [offline,setOffline]=useState(false);
  const carregar=React.useCallback(async()=>{
    if(demo)return;
    const r=await lerCopia('aval-'+student.id,
      sb.from('assessments').select('*').eq('student_id',student.id).order('date'));
    setOffline(semRede(r));
    setEvals((r.data||[]).map(rowToEval));
  },[student.id,demo]);
  useEffect(()=>{carregar();},[carregar]);
  if(evals===null)return(<div className="lv-wrap"><div className="center-screen"><div className="spinner"/></div></div>);
  if(evals.length===0)return(<div className="lv-wrap"><div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><button className="lv-ghost" onClick={onBack}>‹ Voltar</button><div className="lv-title" style={{flex:1}}>Minha avaliação</div></div>
    <CardVazio offline={offline} onTentar={carregar}
      titulo="Avaliação a caminho"
      texto="Você ainda não tem uma avaliação física registrada. Fale com seu treinador."/></div>);
  const asc=[...evals].sort((a,b)=>a.date<b.date?-1:1);const latest=asc[asc.length-1];const prev=asc[asc.length-2]||null;
  const d=derive(student,latest);let ex={};try{ex=buildExecutive(student,latest,d,prev)||{};}catch(e){ex={};}
  if(showRep)return <Report student={student} evalData={latest} coach={{brand_name:'MF Performance'}} allEvals={evals} onBack={()=>setShowRep(false)}/>;
  const sc=ex.overall,scC=sc==null?'var(--text3)':sc>=75?'var(--green)':sc>=55?'var(--gold)':'var(--red)';
  const R=44,C=2*Math.PI*R;
  const dw=prev?num(latest.weight)-num(prev.weight):null;
  const df=(d.fatPct!=null&&prev)?d.fatPct-derive(student,prev).fatPct:null;
  const stat=(l,v,u,delta,down)=>v==null?null:<div className="lv-card" style={{flex:1,minWidth:120,margin:0,textAlign:'center'}}>
    <div className="lv-kick">{l}</div><div style={{fontSize:22,fontWeight:800,marginTop:3}}>{fmt(v)}<span style={{fontSize:12,color:'var(--lvt2)'}}> {u}</span></div>
    {delta!=null&&delta!==0&&<div style={{fontSize:11.5,fontWeight:700,color:(down?delta<0:delta>0)?'var(--green)':'var(--red)'}}>{delta>0?'▲ +':'▼ '}{fmt(Math.abs(delta))} {u}</div>}</div>;
  return(<div className="lv-wrap">
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><button className="lv-ghost" onClick={onBack}>‹ Voltar</button><div className="lv-title" style={{flex:1}}>Minha avaliação</div></div>
    <div className="lv-card" style={{display:'flex',gap:16,alignItems:'center'}}>
      <svg viewBox="0 0 110 110" width="104">
        <circle cx="55" cy="55" r={R} fill="none" stroke="var(--bg4)" strokeWidth="9"/>
        {sc!=null&&<circle cx="55" cy="55" r={R} fill="none" stroke={scC} strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C*(1-sc/100)} transform="rotate(-90 55 55)"/>}
        <text x="55" y="52" textAnchor="middle" fontSize="30" fontWeight="800" fill="#fff">{sc??'—'}</text>
        <text x="55" y="70" textAnchor="middle" fontSize="9" fill="var(--text2)">SCORE / 100</text>
      </svg>
      <div style={{flex:1}}>
        <div className="lv-kick">Última avaliação</div>
        <div style={{fontWeight:800,fontSize:16}}>{fmtDate(latest.date)}</div>
        {ex.synthesis&&<div className="lv-sub" style={{marginTop:6,lineHeight:1.5}}>{ex.synthesis}</div>}
      </div>
    </div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
      {stat('Peso',latest.weight,'kg',dw,true)}
      {stat('% Gordura',d.fatPct!=null?fmt(d.fatPct):null,'%',df,true)}
      {stat('IMC',d.bmi?fmt(d.bmi):null,'',null)}
      {stat('Massa magra',d.leanMass!=null?d.leanMass:null,'kg',null)}
    </div>
    <button className="lv-btn" onClick={()=>setShowRep(true)}>Ver relatório completo</button>
  </div>);
}

/* ═══ Pecinhas de movimento do app do aluno ═══
   Servem a um propósito: mostrar progresso acontecendo. Todas respeitam
   quem pediu menos animação no sistema. */
const SEM_MOTION=(()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){return false;}})();
const vibrar=p=>{try{navigator.vibrate&&navigator.vibrate(p);}catch(e){}};

/* Número que sobe contando até o valor — o progresso "acontece" na frente do aluno */
function Conta({valor,dur=900,dec=0}){
  const alvo=Number(valor)||0;
  const [v,setV]=useState(SEM_MOTION?alvo:0);
  useEffect(()=>{
    if(SEM_MOTION||alvo===0){setV(alvo);return;}
    let raf,ini=null;
    const passo=t=>{
      if(ini==null)ini=t;
      const p=Math.min(1,(t-ini)/dur);
      setV(alvo*(1-Math.pow(1-p,3)));
      if(p<1)raf=requestAnimationFrame(passo);
    };
    raf=requestAnimationFrame(passo);
    return()=>{if(raf)cancelAnimationFrame(raf);};
  },[alvo,dur]);
  return <span className="lv-num">{dec?v.toFixed(dec).replace('.',','):Math.round(v)}</span>;
}

/* Chama da sequência de dias (desenhada, não emoji) */
function Chama({size=13}){
  return(<svg className="lv-chama" width={size} height={size*1.25} viewBox="0 0 16 20" aria-hidden="true">
    <path d="M8 0c.6 3.2-1.3 4.3-2.6 5.8C3.7 7.7 2 9.6 2 12.4 2 16.6 5 20 8 20s6-3.4 6-7.6c0-2.4-1.2-4-2.3-5.4-.5.9-1.2 1.5-2 1.8.6-3.1-.4-6.2-1.7-8.8Z" fill="currentColor" opacity=".85"/>
    <path d="M8 20c-1.8 0-3.2-1.7-3.2-3.8 0-2.2 1.9-3.2 2.5-5 .9 1.1 3.9 2.4 3.9 5 0 2.1-1.4 3.8-3.2 3.8Z" fill="var(--lvsel2)"/>
  </svg>);
}

/* Confete nas cores da casa. Some sozinho; não atrapalha o toque. */
function Confete({n=18}){
  const pecas=React.useMemo(()=>Array.from({length:n},()=>({
    l:Math.random()*100,
    c:['var(--lvrx)','var(--lvsel)','var(--lvsel2)','var(--lvneon)','var(--lvclaro)'][Math.floor(Math.random()*5)],
    d:Math.random()*.45, t:1.3+Math.random()*1,
  })),[n]);
  if(SEM_MOTION)return null;
  return pecas.map((p,i)=><div key={i} className="lv-confetti"
    style={{left:p.l+'vw',background:p.c,animationDuration:p.t+'s',animationDelay:p.d+'s'}}/>);
}

function LvToggle({on,busy,onClick,rotulo}){return(
  <button onClick={onClick} disabled={busy} aria-label={rotulo} aria-pressed={!!on} title={rotulo} style={{flexShrink:0,width:46,height:27,borderRadius:16,border:'none',cursor:busy?'wait':'pointer',background:on?'var(--lvneon)':'var(--lvc2)',position:'relative',transition:'background .15s',opacity:busy?.6:1}}>
    <span style={{position:'absolute',top:3,left:on?22:3,width:21,height:21,borderRadius:'50%',background:'#fff',transition:'left .15s',boxShadow:'0 1px 3px rgba(0,0,0,.4)'}}/></button>);}

/* ── Diário de saúde (aluno) ── */
const GLIC_MOMENTOS=[['jejum','Jejum'],['pre_refeicao','Pré-refeição'],['pos_refeicao','Pós-refeição'],['antes_treino','Antes do treino'],['pos_treino','Após treino'],['dormir','Ao dormir']];
const glicFaixa=v=>v<70?{l:'Baixa',c:'var(--red)'}:v<=180?{l:'Na faixa',c:'var(--green)'}:{l:'Alta',c:'var(--gold)'};
function DiarioScreen({student,demo,onBack}){
  const [diab,setDiab]=useState(demo?true:false);
  const [d,setD]=useState({peso:'',sono:'',passos:'',fome:3,obs:''});
  const [chk,setChk]=useState(demo?{sinal:'Verde',total:8}:undefined);   // prontidao de hoje (vem do check-in)
  const [glic,setGlic]=useState(demo?[{id:'g1',valor:104,momento:'jejum',insulina_unid:6,registrado_em:new Date(Date.now()-3600e3).toISOString()},{id:'g2',valor:158,momento:'pos_refeicao',insulina_unid:4,registrado_em:new Date(Date.now()-6*3600e3).toISOString()}]:[]);
  const [gf,setGf]=useState({valor:'',momento:'jejum',insulina:''});
  const [erroGlic,setErroGlic]=useState(null);
  const [busy,setBusy]=useState(false);const [okMsg,setOkMsg]=useState(null);
  useEffect(()=>{if(demo)return;(async()=>{
    try{const {data:sd}=await sb.from('train_saude').select('diabetico').eq('student_id',student.id).maybeSingle();if(sd)setDiab(!!sd.diabetico);}catch(e){}
    try{const key=student.id+'_'+todayStr();const {data:dd}=await sb.from('train_diario').select('*').eq('id',key).maybeSingle();if(dd)setD({peso:dd.peso??'',sono:dd.sono??'',passos:dd.passos??'',fome:dd.fome??3,obs:dd.obs??''});}catch(e){}
    try{const key=student.id+'_'+todayStr();const {data:cc}=await sb.from('train_checkin').select('sinal,total').eq('id',key).maybeSingle();setChk(cc||null);}catch(e){setChk(null);}
    try{const {data:gg}=await sb.from('train_glicemia').select('*').eq('student_id',student.id).order('registrado_em',{ascending:false}).limit(8);setGlic(gg||[]);}catch(e){}
  })();},[]);
  /* Este interruptor muda o que a tela pede depois (glicemia, insulina). Se a
     gravação some, o aluno vê "ligado", registra medições, e o treinador não
     sabe nem que ele é diabético. */
  const toggleDiab=async(v)=>{
    setDiab(v);setErroGlic(null);
    if(demo)return;
    try{await gravar(sb.rpc('saude_cfg',{p_diabetico:v,p_condicoes:null}));}
    catch(e){setDiab(!v);setErroGlic(porQueFalhou(e));}};
  const salvar=async()=>{setBusy(true);let erro=null;
    if(!demo){try{const {error}=await sb.rpc('diario_salvar',{p_peso:num(d.peso),p_sono:num(d.sono),p_passos:d.passos?parseInt(d.passos):null,p_fome:d.fome,p_obs:d.obs||null});if(error)erro=error.message;}catch(e){erro=e.message||String(e);}}
    setBusy(false);
    if(erro){setOkMsg(null);alert('Não consegui salvar seu diário: '+erro);return;}
    setOkMsg('Diário de hoje salvo!');setTimeout(()=>setOkMsg(null),1800);};
  const regGlic=async()=>{if(!gf.valor)return;const novo={id:'t'+Date.now(),valor:parseInt(gf.valor),momento:gf.momento,insulina_unid:gf.insulina?num(gf.insulina):null,registrado_em:new Date().toISOString()};
    /* A leitura entrava na lista ANTES de gravar, e o erro morria calado: o
       aluno via a glicemia registrada e o treinador nunca recebia. É dado de
       saúde — a lista só recebe o valor depois que o servidor confirmou. */
    if(demo){setGlic(g=>[novo,...g]);setGf({valor:'',momento:gf.momento,insulina:''});return;}
    setErroGlic(null);
    try{
      await gravar(sb.rpc('glicemia_registrar',
        {p_valor:novo.valor,p_momento:gf.momento,p_insulina:novo.insulina_unid,p_obs:null}));
    }catch(e){setErroGlic(porQueFalhou(e));return;}
    setGlic(g=>[novo,...g]);
    setGf({valor:'',momento:gf.momento,insulina:''});
  };
  const slider=(k,lbl,lo,hi)=>(<div className="lv-card">
    <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><span style={{fontWeight:700}}>{lbl}</span><span style={{fontWeight:800,color:'var(--lvrx)'}}>{d[k]}</span></div>
    <input type="range" min="1" max="5" value={d[k]} onChange={e=>setD(p=>({...p,[k]:+e.target.value}))} style={{width:'100%'}}/>
    <div style={{display:'flex',justifyContent:'space-between'}}><span className="lv-sub">{lo}</span><span className="lv-sub">{hi}</span></div></div>);
  return(<div className="lv-wrap">
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}><button className="lv-ghost" onClick={onBack}>‹ Voltar</button><div className="lv-title" style={{flex:1}}>Diário de saúde</div></div>
    <p className="lv-sub" style={{marginBottom:14}}>Registrar todo dia ajuda você e seu treinador a acompanhar sua saúde de perto.</p>
    <div style={{display:'flex',gap:10,marginBottom:14}}>
      <div className="lv-card" style={{flex:1,margin:0}}><span className="lv-inlbl">Peso (kg)</span><input className="lv-in" type="number" inputMode="decimal" value={d.peso} onChange={e=>setD(p=>({...p,peso:e.target.value}))} placeholder="—"/></div>
      <div className="lv-card" style={{flex:1,margin:0}}><span className="lv-inlbl">Sono (horas)</span><input className="lv-in" type="number" inputMode="decimal" value={d.sono} onChange={e=>setD(p=>({...p,sono:e.target.value}))} placeholder="—"/></div>
      <div className="lv-card" style={{flex:1,margin:0}}><span className="lv-inlbl">Passos</span><input className="lv-in" type="number" inputMode="numeric" value={d.passos} onChange={e=>setD(p=>({...p,passos:e.target.value}))} placeholder="—"/></div>
    </div>
    {slider('fome','Fome ao longo do dia','Sem fome','Muita fome')}
    {chk!==undefined&&(chk?
      <div className="lv-card" style={{display:'flex',alignItems:'center',gap:12}}>
        <span className="lv-dot" style={{width:14,height:14,background:chk.sinal==='Verde'?'var(--green)':chk.sinal==='Amarelo'?'var(--gold)':'var(--red)'}}/>
        <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Prontidão de hoje: {chk.sinal}</div>
          <div className="lv-sub">Sono, fadiga, estresse, dor e humor você já respondeu no Check-in.</div></div>
      </div>:
      <div className="lv-card" style={{display:'flex',alignItems:'center',gap:12,borderColor:'rgba(245,158,11,.45)'}}>
        <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Falta o check-in de hoje</div>
          <div className="lv-sub">É lá que entram sono, fadiga, estresse, dor e humor.</div></div>
      </div>)}
    <div className="lv-card"><span className="lv-inlbl">Observações</span><textarea className="lv-in" rows={2} value={d.obs} onChange={e=>setD(p=>({...p,obs:e.target.value}))} placeholder="Como foi seu dia? Algo importante?"/></div>
    {okMsg&&<div className="lv-pill" style={{background:'rgba(74,222,128,.15)',color:'var(--green)',marginBottom:10}}>✓ {okMsg}</div>}
    <button className="lv-btn" disabled={busy} onClick={salvar}>{busy?'Salvando…':'Salvar diário de hoje'}</button>

    <div className="lv-card" style={{marginTop:18,display:'flex',alignItems:'center',gap:12}}>
      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Sou diabético(a)</div><div className="lv-sub">Ativa o controle de glicemia e insulina</div></div>
      <LvToggle rotulo="Acompanhar glicemia" on={diab} onClick={()=>toggleDiab(!diab)}/>
    </div>
    {diab&&<>
      <div className="lv-kick" style={{margin:'16px 2px 10px'}}>Glicemia & insulina</div>
      <div className="lv-card">
        <div style={{display:'flex',gap:10}}>
          <div style={{flex:1}}><span className="lv-inlbl">Glicemia (mg/dL)</span><input className="lv-in" type="number" inputMode="numeric" value={gf.valor} onChange={e=>setGf(p=>({...p,valor:e.target.value}))} placeholder="Ex.: 110"/></div>
          <div style={{flex:1}}><span className="lv-inlbl">Insulina (unid.)</span><input className="lv-in" type="number" inputMode="decimal" value={gf.insulina} onChange={e=>setGf(p=>({...p,insulina:e.target.value}))} placeholder="opcional"/></div>
        </div>
        <span className="lv-inlbl" style={{marginTop:12}}>Momento</span>
        <select className="lv-in" value={gf.momento} onChange={e=>setGf(p=>({...p,momento:e.target.value}))}>{GLIC_MOMENTOS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
        {erroGlic&&<div className="lv-sub" style={{marginTop:10,color:'#fca5a5'}}>{erroGlic}</div>}
        <button className="lv-btn" style={{marginTop:12}} disabled={!gf.valor} onClick={regGlic}>Registrar medição</button>
      </div>
      {glic.length>0&&<div className="lv-card">
        <div className="lv-kick" style={{marginBottom:8}}>Últimas medições</div>
        {glic.map(g=>{const f=glicFaixa(g.valor);const mom=(GLIC_MOMENTOS.find(m=>m[0]===g.momento)||[,g.momento])[1];return(
          <div key={g.id} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 0',borderTop:'1px solid var(--lvbd)'}}>
            <span style={{fontWeight:800,fontSize:18,color:f.c,minWidth:52}}>{g.valor}</span>
            <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:13}}>{mom}{g.insulina_unid?` · ${g.insulina_unid}u`:''}</div><div className="lv-sub" style={{fontSize:11}}>{tempoRel(g.registrado_em)}</div></div>
            <span className="lv-pill" style={{background:f.c+'22',color:f.c,fontSize:11}}>{f.l}</span>
          </div>);})}
      </div>}
      <div className="lv-sub" style={{fontSize:11.5,lineHeight:1.5,marginTop:2}}>Referência geral: abaixo de 70 é baixa, 70–180 na faixa, acima de 180 alta. Sempre siga a orientação do seu médico.</div>
    </>}
  </div>);
}

/* ── Metas e desafios (aluno) — vindas da avaliação ── */
function MetasScreen({student,demo,onBack,freq}){
  const [metas,setMetas]=useState(demo?[
    {id:'m1',tipo:'peso',titulo:'Chegar a 72 kg',unidade:'kg',valor_inicial:84,valor_alvo:72,valor_atual:78},
    {id:'m2',tipo:'gordura',titulo:'Reduzir % de gordura',unidade:'%',valor_inicial:22,valor_alvo:15,valor_atual:16},
    {id:'m3',tipo:'custom',titulo:'Correr 5 km sem parar',unidade:'km',valor_inicial:2,valor_alvo:5,valor_atual:3.5}]:null);
  useEffect(()=>{if(demo)return;(async()=>{
    let atual={};
    try{const {data:av}=await sb.from('assessments').select('*').eq('student_id',student.id).order('date');const evs=(av||[]).map(rowToEval);const last=evs[evs.length-1];
      if(last){const dv=derive(student,last);atual={peso:num(last.weight),gordura:dv.fatPct};}}catch(e){}
    try{const {data:mm}=await sb.from('train_meta').select('*').eq('student_id',student.id).order('created_at');
      setMetas((mm||[]).map(m=>({...m,valor_atual:m.valor_atual??(m.tipo==='peso'?atual.peso:m.tipo==='gordura'?atual.gordura:m.valor_atual)})));}catch(e){setMetas([]);}
  })();},[]);
  const prog=m=>{if(m.valor_inicial==null||m.valor_alvo==null||m.valor_atual==null)return null;
    const tot=m.valor_alvo-m.valor_inicial;if(tot===0)return 100;const feito=m.valor_atual-m.valor_inicial;return Math.max(0,Math.min(100,Math.round(feito/tot*100)));};
  if(metas===null)return(<div className="lv-wrap"><div className="center-screen"><div className="spinner"/></div></div>);
  return(<div className="lv-wrap">
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><button className="lv-ghost" onClick={onBack}>‹ Voltar</button><div className="lv-title" style={{flex:1}}>Minhas metas</div></div>
    {freq&&freq.meta>0&&<div className="lv-card lv-hero">
      <div className="lv-kick" style={{color:'#e9d5ff'}}>Desafio da semana</div>
      <div style={{fontSize:17,fontWeight:800,margin:'4px 0 10px'}}>Complete {freq.meta} {rotuloN(freq.meta,'treino')}</div>
      <div className="lv-freq" style={{background:'rgba(255,255,255,.25)'}}><i style={{width:Math.min(100,Math.round(freq.done/(freq.meta||1)*100))+'%',background:'#fff'}}/></div>
      <div style={{marginTop:8,fontWeight:700}}>{freq.done} / {freq.meta} {freq.done>=freq.meta?'concluído!':''}</div>
    </div>}
    {metas.length===0?<div className="lv-card" style={{textAlign:'center',color:'var(--lvt2)'}}>Seu treinador ainda não definiu metas. Elas aparecem aqui pra você acompanhar.</div>
    :metas.map(m=>{const p=prog(m);const done=p!=null&&p>=100;return(
      <div key={m.id} className={'lv-card'+(done?' ':'')}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontWeight:800}}>{done?'':''}{m.titulo}</div>
          {p!=null&&<span style={{fontWeight:800,color:done?'var(--green)':'var(--lvrx)'}}>{p}%</span>}
        </div>
        <div className="lv-freq" style={{marginTop:10}}><i style={{width:(p||0)+'%',background:done?'linear-gradient(90deg,var(--green),var(--green))':undefined}}/></div>
        {m.valor_atual!=null&&<div className="lv-sub" style={{marginTop:8}}>Atual: <b>{m.valor_atual}{m.unidade}</b> · Meta: <b>{m.valor_alvo}{m.unidade}</b>{m.valor_inicial!=null?` · Início: ${m.valor_inicial}${m.unidade}`:''}</div>}
      </div>);})}
  </div>);
}
/* ── Dieta (módulo MF Nutrition dentro do app do aluno) ──
   Lê as mesmas tabelas do MF Nutrition (mesmo Supabase, mesmo auth.user).
   A água NÃO é duplicada aqui: continua na tela de Hidratação. */
const _DEMO_DIETA={title:'Plano de definição',water_goal_ml:3000,meals:[
  {id:'dm1',name:'Café da manhã',time:'07:00',items:[
    {id:'di1',food:'Ovos mexidos',qty:'3 unidades',kcal:210,protein:18,carb:1,fat:15,prep:'Frigideira antiaderente, sem óleo.',subs:[{id:'ds1',food:'Claras + 1 gema',qty:'5 claras'}]},
    {id:'di2',food:'Pão integral',qty:'2 fatias',kcal:140,protein:6,carb:24,fat:2,prep:'',subs:[{id:'ds2',food:'Tapioca',qty:'40 g'}]}]},
  {id:'dm2',name:'Almoço',time:'12:30',items:[
    {id:'di3',food:'Peito de frango grelhado',qty:'150 g',kcal:248,protein:46,carb:0,fat:5,prep:'Temperar com alho e limão.',subs:[{id:'ds3',food:'Patinho moído',qty:'150 g'}]},
    {id:'di4',food:'Arroz integral',qty:'120 g',kcal:150,protein:3,carb:32,fat:1,prep:'',subs:[]},
    {id:'di5',food:'Salada verde',qty:'à vontade',kcal:40,protein:2,carb:6,fat:0,prep:'Azeite 1 fio.',subs:[]}]},
  {id:'dm3',name:'Pré-treino',time:'16:00',items:[
    {id:'di6',food:'Batata doce',qty:'160 g',kcal:138,protein:2,carb:32,fat:0,prep:'Cozida.',subs:[]},
    {id:'di7',food:'Whey protein',qty:'30 g',kcal:120,protein:24,carb:3,fat:1,prep:'',subs:[]}]},
  {id:'dm4',name:'Jantar',time:'20:00',items:[
    {id:'di8',food:'Tilápia assada',qty:'180 g',kcal:200,protein:40,carb:0,fat:4,prep:'Forno 200°C por 20 min.',subs:[{id:'ds4',food:'Salmão',qty:'140 g'}]},
    {id:'di9',food:'Legumes no vapor',qty:'200 g',kcal:80,protein:4,carb:14,fat:1,prep:'',subs:[]}]},
]};
const _DEMO_SUPPS=[
  {id:'dp1',name:'Creatina monohidratada',dose:'5 g',timing:'Qualquer horário',notes:'Uso contínuo.'},
  {id:'dp2',name:'Whey protein',dose:'30 g',timing:'Pós-treino',notes:''},
  {id:'dp3',name:'Vitamina D3',dose:'2000 UI',timing:'Café da manhã',notes:'Junto com gordura.'},
];

function MacroBar({lbl,val,goal,color}){
  const pct=goal>0?Math.min(100,Math.round((val/goal)*100)):0;
  return(<div style={{flex:1}}>
    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
      <span style={{color:'var(--lvt3)',fontWeight:700,textTransform:'uppercase',letterSpacing:.5}}>{lbl}</span>
      <span style={{color:'var(--lvt2)',fontWeight:700}}>{Math.round(val)}<span style={{color:'var(--lvt3)'}}>/{Math.round(goal)}g</span></span>
    </div>
    <div style={{height:6,background:'var(--bg4)',borderRadius:4,overflow:'hidden'}}>
      <i style={{display:'block',height:'100%',width:pct+'%',background:color,borderRadius:4,transition:'width .3s'}}/>
    </div>
  </div>);
}

function DietaScreen({profile,demo,onBack,onHidra}){
  const [plan,setPlan]=useState(undefined);
  const [offline,setOffline]=useState(false);   // vazio de verdade x rede caída
  const [meals,setMeals]=useState([]);
  const [checks,setChecks]=useState({});
  const [open,setOpen]=useState({});
  const [supps,setSupps]=useState([]);
  const [sck,setSck]=useState({});
  const [uploading,setUploading]=useState(false);
  const [cel,setCel]=useState(false);
  const [naFila,setNaFila]=useState(false);   // marcou sem sinal, ainda não subiu
  const [erro,setErro]=useState(null);        // erro de verdade, não falta de rede
  const celRef=useRef(null);   // timeout da animacao de comemoracao
  const fileRef=useRef();
  const today=todayStr();
  // a fila esvaziou sozinha: o aviso sai da tela sem o aluno fazer nada
  useEffect(()=>{if(demo)return;
    filaAluno().then(q=>setNaFila(q.some(i=>i.tabela==='checkins'||i.tabela==='supplement_checkins')));
    const f=e=>{if(!e.detail)setNaFila(false);};
    window.addEventListener('mfp-fila',f);
    return()=>window.removeEventListener('mfp-fila',f);},[demo]);

  const load=useCallback(async()=>{
    if(demo){
      setPlan(_DEMO_DIETA);setMeals(_DEMO_DIETA.meals);
      setChecks({dm1:true,dm2:true});setSupps(_DEMO_SUPPS);setSck({dp1:true});return;
    }
    // A cópia primeiro. O aluno que já abriu a dieta uma vez tem o cardápio
    // inteiro no aparelho: mostrar isso na hora é o que faz a tela abrir com um
    // toque, e é o que faz ela abrir sem sinal em vez de girar.
    const copia=await IDB.get('ler-plano-'+profile.id);
    if(copia&&copia.dado){
      const arv=await planTreeDaCopia(copia.dado.id);
      if(arv&&arv.length){
        setPlan(copia.dado);setMeals(arv);
        const ckc=await IDB.get('ler-refok-'+profile.id);
        if(ckc)setChecks(Object.fromEntries((ckc.dado||[])
          .filter(c=>c.day===today).map(c=>[c.meal_id,true])));
        const spc0=await IDB.get('ler-supl-'+profile.id);
        if(spc0)setSupps(spc0.dado||[]);
      }
    }
    const {plano:p,offline:semNet}=await getActivePlanR(profile.id);
    setOffline(semNet);
    if(!p){setPlan(null);return;}
    const tree=await loadPlanTree(p.id);
    /* Estas três leituras iam direto para o servidor, sem prazo e sem cópia.
       Sem sinal a biblioteca ainda tentava três vezes cada uma e a tela ficava
       35 segundos girando — com o plano já guardado no aparelho o tempo todo.
       Agora passam pelo lerCopia: prazo de 12 s e cópia local, igual ao resto. */
    const [ck,sp,spc]=await Promise.all([
      lerCopia('refok-'+profile.id,
        sb.from('checkins').select('meal_id,day').eq('student_id',profile.id).eq('day',today)),
      lerCopia('supl-'+profile.id,
        sb.from('supplements').select('*').eq('student_id',profile.id).order('order_index')),
      lerCopia('suplok-'+profile.id,
        sb.from('supplement_checkins').select('supplement_id,day').eq('student_id',profile.id).eq('day',today)),
    ]);
    // A cópia pode ser de ontem. Cada linha traz o dia em que foi lida, e o que
    // não é de hoje não vale como marcado — senão o aluno abre o app de manhã
    // sem sinal e vê o almoço de ontem já comido.
    const doHoje=(rows,campo)=>Object.fromEntries(
      (rows||[]).filter(c=>!c.day||c.day===today).map(c=>[c[campo],true]));
    // O que ainda está na fila do aparelho já vale: marcar e desmarcar entram
    // na ordem em que ele tocou, por cima do que o servidor devolveu.
    const marcadas=doHoje(ck.data,'meal_id');
    (await filaAluno()).forEach(i=>{
      if(i.tabela!=='checkins')return;
      if(i.apagar)delete marcadas[i.apagar.meal_id];
      else if(i.linha&&i.linha.day===today)marcadas[i.linha.meal_id]=true;
    });
    setPlan(p);setMeals(tree);
    setChecks(marcadas);
    setSupps(sp.data||[]);
    setSck(doHoje(spc.data,'supplement_id'));
  },[profile.id,today,demo]);
  useEffect(()=>{load();},[load]);

  useEffect(()=>()=>{if(celRef.current)clearTimeout(celRef.current);},[]);

  const toggle=async(mealId)=>{
    const done=!checks[mealId];
    const depois={...checks,[mealId]:done};
    setChecks(depois);
    if(done){try{navigator.vibrate&&navigator.vibrate(18);}catch(e){}}
    // comemora so quando ESTA acao fecha o dia (nao ao reabrir a aba com tudo marcado)
    if(done&&meals.length>0&&meals.every(m=>depois[m.id])){
      try{navigator.vibrate&&navigator.vibrate([40,40,120]);}catch(e){}
      setCel(true);
      if(celRef.current)clearTimeout(celRef.current);
      celRef.current=setTimeout(()=>setCel(false),2600);
    }
    if(demo)return;
    await gravarCheck('checkins',{student_id:profile.id,meal_id:mealId,day:today},done,
      {done:true},()=>setChecks(c=>({...c,[mealId]:!done})));
  };
  const toggleSupp=async(id)=>{
    const done=!sck[id];
    setSck(c=>({...c,[id]:done}));
    if(demo)return;
    await gravarCheck('supplement_checkins',{student_id:profile.id,supplement_id:id,day:today},done,
      {},()=>setSck(c=>({...c,[id]:!done})));
  };
  /* O aluno marca a refeição na mesa do restaurante, com uma barra de sinal.
     Antes isto ia direto para o servidor, sem prazo e sem fila: o visto
     aparecia na tela, a gravação morria calada e no dia seguinte o treinador
     via "não marcou nenhuma refeição". Agora é o mesmo contrato da série de
     treino — sem rede vai para a fila e sobe depois; erro de verdade desfaz o
     visto e diz o que houve, em vez de mentir. */
  const gravarCheck=async(tabela,chave,done,extra,desfazer)=>{
    const conflito=tabela==='checkins'?'meal_id,day':'supplement_id,day';
    try{
      const {error}=done
        ? await comPrazo(sb.from(tabela).upsert({...chave,...extra},{onConflict:conflito}))
        : await comPrazo(sb.from(tabela).delete().match(chave));
      if(error)throw error;
      setErro(null);
    }catch(e){
      if(isNetErr(e)){
        await enfileirarAluno(done?{tabela,linha:{...chave,...extra},conflito}:{tabela,apagar:chave});
        setNaFila(true);
      }else{desfazer();setErro(e.message||String(e));}
    }
  };
  const sendPhoto=async(file)=>{
    if(!file)return;
    if(demo){alert('Modo demonstração — a foto não é enviada.');return;}
    setUploading(true);
    try{
      const blob=await resizeImage(file);
      const url=await uploadFotoAluno(profile.id,blob);
      // sem conferir o erro, o insert falhava calado: a imagem subia para o
      // armazenamento, a linha nunca era criada, e o aluno lia "Foto enviada!"
      await gravar(sb.from('photos').insert({student_id:profile.id,coach_id:profile.coach_id,url,kind:'meal',caption:'Refeição'}));
      alert('Foto enviada ao seu treinador!');
    }catch(e){alert('Erro ao enviar: '+(e.message||e));}
    setUploading(false);
  };

  const head=(<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
    <button className="lv-ghost" onClick={onBack}>‹ Voltar</button>
    <div className="lv-title" style={{flex:1}}>Minha dieta</div>
  </div>);

  if(plan===undefined)return<div className="lv-wrap">{head}<div className="center-screen" style={{minHeight:200}}><div className="spinner"/></div></div>;
  if(plan===null)return(<div className="lv-wrap">{head}
    <CardVazio offline={offline} onTentar={load}
      titulo="Plano a caminho"
      texto="Seu treinador ainda não montou seu plano alimentar. Assim que ele publicar, aparece aqui."/>
    </div>);

  const total=sumMeals(meals);
  const doneMeals=meals.filter(m=>checks[m.id]);
  const consumed=sumMeals(doneMeals);
  const allDone=meals.length>0&&doneMeals.length===meals.length;
  const R=38,C=2*Math.PI*R;
  const pct=total.kcal>0?Math.min(consumed.kcal/total.kcal,1):0;

  return(<div className="lv-wrap">
    {cel&&<><div className="lv-cel">
      <div className="rule"/><h2>Dieta em dia</h2>
      <div className="lv-sub" style={{marginTop:6}}>Todas as refeições do dia concluídas. É assim que resultado se constrói.</div></div><Confete n={16}/></>}
    {head}

    <div className="lv-card">
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        <svg viewBox="0 0 100 100" width="98" style={{flexShrink:0}} className={allDone?'lv-glow':''}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--bg4)" strokeWidth="9"/>
          <circle cx="50" cy="50" r={R} fill="none" stroke={allDone?'var(--green)':'var(--lvrx)'} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C*(1-pct)} transform="rotate(-90 50 50)" style={{transition:'stroke-dashoffset .4s'}}/>
          <text x="50" y="46" textAnchor="middle" fontSize="19" fontWeight="800" fill="var(--text)">{Math.round(consumed.kcal)}</text>
          <text x="50" y="62" textAnchor="middle" fontSize="9.5" fill="var(--text3)">de {Math.round(total.kcal)} kcal</text>
        </svg>
        <div style={{flex:1,minWidth:0}}>
          <div className="lv-kick">{plan.title||'Plano alimentar'}</div>
          <div style={{fontSize:15,fontWeight:800,margin:'4px 0 10px'}}>{doneMeals.length} de {meals.length} refeições</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <MacroBar lbl="Proteína" val={consumed.protein} goal={total.protein} color="var(--accent)"/>
            <MacroBar lbl="Carbo" val={consumed.carb} goal={total.carb} color="linear-gradient(90deg,var(--blue),var(--blue))"/>
            <MacroBar lbl="Gordura" val={consumed.fat} goal={total.fat} color="linear-gradient(90deg,var(--gold),var(--gold))"/>
          </div>
        </div>
      </div>
      {plan.notes&&<div className="lv-sub" style={{marginTop:12,lineHeight:1.55,borderTop:'1px solid var(--lvbd)',paddingTop:10}}>{plan.notes}</div>}
    </div>

    {naFila&&<div className="lv-card" style={{borderColor:'var(--lvsel)',padding:'10px 14px',marginBottom:14}}>
      <div style={{fontWeight:700,fontSize:13.5}}>Marcado sem internet</div>
      <div className="lv-sub" style={{marginTop:3,lineHeight:1.45}}>
        Está guardado no aparelho e sobe sozinho quando o sinal voltar.</div>
    </div>}
    {erro&&<div className="lv-card" style={{borderColor:'rgba(248,113,113,.5)',padding:'10px 14px',marginBottom:14}}>
      <div style={{fontWeight:700,fontSize:13.5,color:'#fca5a5'}}>Não consegui marcar</div>
      <div className="lv-sub" style={{marginTop:3,lineHeight:1.45}}>{erro}</div>
    </div>}

    {onHidra&&<div className="lv-treino" style={{marginBottom:14}} onClick={onHidra}>
      <span style={{width:3,height:30,borderRadius:2,background:'var(--lvrx)',flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Hidratação</div>
        <div className="lv-sub">Meta {plan.water_goal_ml?((plan.water_goal_ml/1000).toFixed(1).replace('.',',')+' L'):'do dia'}</div></div>
      <span style={{color:'var(--lvt3)'}}>›</span>
    </div>}

    <div className="lv-kick" style={{margin:'18px 0 10px'}}>Refeições de hoje</div>
    {meals.map(m=>{
      const s=sumItems(m.items);const done=!!checks[m.id];const isOpen=!!open[m.id];
      return(<div key={m.id} className="lv-card" style={{padding:0,overflow:'hidden',borderColor:done?'rgba(74,222,128,.45)':'var(--lvbd)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:14,cursor:'pointer'}} onClick={()=>setOpen(o=>({...o,[m.id]:!isOpen}))}>
          <button onClick={e=>{e.stopPropagation();toggle(m.id);}}
            aria-label={(done?'Desmarcar ':'Marcar ')+(m.name||'refeição')+(done?'':' como feita')}
            aria-pressed={done} title={done?'Feita':'Marcar como feita'}
            style={{width:34,height:34,borderRadius:'50%',flexShrink:0,cursor:'pointer',fontSize:15,fontWeight:800,
              border:done?'none':'2px solid var(--lvbd)',background:done?'linear-gradient(135deg,var(--green),var(--green))':'transparent',
              color:done?'#08130c':'var(--lvt3)'}}>{done?'✓':''}</button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'baseline',gap:8}}>
              <span style={{fontWeight:800,fontSize:15,textDecoration:done?'line-through':'none',opacity:done?.65:1}}>{m.name||'Refeição'}</span>
              {m.time&&<span className="lv-sub" style={{fontSize:12}}>{String(m.time).slice(0,5)}</span>}
            </div>
            <div className="lv-sub" style={{fontSize:12}}>{Math.round(s.kcal)} kcal · P {Math.round(s.protein)}g · C {Math.round(s.carb)}g · G {Math.round(s.fat)}g</div>
          </div>
          <span style={{color:'var(--lvt3)',fontSize:13,transform:isOpen?'rotate(90deg)':'none',transition:'transform .18s'}}>›</span>
        </div>
        {isOpen&&<div style={{borderTop:'1px solid var(--lvbd)',padding:'12px 14px',background:'var(--lvc2)'}}>
          {(m.items||[]).length===0&&<div className="lv-sub">Sem itens cadastrados.</div>}
          {(m.items||[]).map(it=>(<div key={it.id} style={{marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:10}}>
              <div style={{fontWeight:700,fontSize:14}}>{it.food}</div>
              <div className="lv-sub" style={{fontSize:12,whiteSpace:'nowrap'}}>{it.qty}</div>
            </div>
            <div className="lv-sub" style={{fontSize:11.5,marginTop:2}}>{Math.round(n0(it.kcal))} kcal · P {Math.round(n0(it.protein))} · C {Math.round(n0(it.carb))} · G {Math.round(n0(it.fat))}</div>
            {it.prep&&<div className="lv-sub" style={{fontSize:12,marginTop:5,fontStyle:'italic'}}>{it.prep}</div>}
            {(it.subs||[]).length>0&&<div style={{marginTop:7,paddingLeft:10,borderLeft:'2px solid var(--lvrx)'}}>
              <div className="lv-kick" style={{fontSize:9.5,marginBottom:3}}>Pode trocar por</div>
              {it.subs.map(s2=><div key={s2.id} className="lv-sub" style={{fontSize:12.5}}>{s2.food} — {s2.qty}</div>)}
            </div>}
          </div>))}
        </div>}
      </div>);
    })}

    <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>{sendPhoto(e.target.files[0]);e.target.value='';}}/>
    <button className="lv-btn" style={{marginTop:4,background:'var(--lvc2)',border:'1px solid var(--lvbd)',color:'var(--lvtx)'}}
      disabled={uploading} onClick={()=>fileRef.current&&fileRef.current.click()}>
      {uploading?'Enviando…':'Mandar foto da refeição pro treinador'}</button>

    {supps.length>0&&<>
      <div className="lv-kick" style={{margin:'22px 0 10px'}}>Suplementos de hoje</div>
      {supps.map(sp=>{const done=!!sck[sp.id];return(
        <div key={sp.id} className="lv-treino" style={{marginBottom:10,borderColor:done?'rgba(74,222,128,.45)':'var(--lvbd)'}} onClick={()=>toggleSupp(sp.id)}>
          <button onClick={e=>{e.stopPropagation();toggleSupp(sp.id);}}
            style={{width:32,height:32,borderRadius:'50%',flexShrink:0,cursor:'pointer',fontSize:14,fontWeight:800,
              border:done?'none':'2px solid var(--lvbd)',background:done?'linear-gradient(135deg,var(--green),var(--green))':'transparent',
              color:done?'#08130c':'var(--lvt3)'}}>{done?'✓':''}</button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,opacity:done?.65:1}}>{sp.name}</div>
            <div className="lv-sub" style={{fontSize:12}}>{[sp.dose,sp.timing].filter(Boolean).join(' · ')||'—'}</div>
            {sp.notes&&<div className="lv-sub" style={{fontSize:11.5,fontStyle:'italic',marginTop:2}}>{sp.notes}</div>}
          </div>
        </div>);})}
    </>}
    <div style={{height:10}}/>
  </div>);
}

/* ── Sem ficha, a única coisa na mão do aluno é cobrar o treinador ──
   A tela dizia "seu treinador ainda não montou sua ficha" e parava ali. Quem
   abre o app no primeiro dia e lê isso não tem o que fazer: fecha o app. Aqui
   ele avisa com um toque, e o recado cai na conversa e no celular do treinador
   como qualquer outra mensagem. Sem sinal, entra na fila e sobe depois. */
function AvisarFicha({demo,somenteLeitura}){
  const [estado,setEstado]=useState('parado');   // parado | indo | avisado | fila | erro
  const [erro,setErro]=useState(null);
  const avisar=async()=>{
    if(estado==='indo'||somenteLeitura)return;
    setEstado('indo');setErro(null);
    const texto='Oi! Ainda não recebi minha ficha de treino no app. Quando der, dá uma olhada?';
    try{
      if(demo)throw new Error('Modo demonstração: a mensagem não é enviada.');
      const {data,error}=await comPrazo(sb.rpc('conversa_enviar',{p_texto:texto}));
      if(error)throw error;
      if(!data||!data.ok)throw new Error(data&&data.erro==='SEM_TREINADOR'
        ?'Sua conta ainda não está ligada a um treinador.':'Não consegui enviar.');
      semEsperar(avisarMensagem(data.id));
      setEstado('avisado');
    }catch(e){
      if(isNetErr(e)&&!demo){
        await enfileirarAluno({rpc:'conversa_enviar',args:{p_texto:texto}});
        setEstado('fila');
      }else{setErro(e.message||String(e));setEstado('erro');}
    }
  };
  if(estado==='avisado')return(<div className="lv-sub" style={{marginTop:12,color:'var(--green)'}}>
    Avisado. Seu treinador recebeu o recado.</div>);
  if(estado==='fila')return(<div className="lv-sub" style={{marginTop:12}}>
    Sem sinal agora — o recado sobe assim que a internet voltar.</div>);
  return(<>
    <button className="lv-btn" style={{marginTop:14}} disabled={estado==='indo'||somenteLeitura}
      onClick={avisar}>{estado==='indo'?'Enviando…':'Avisar meu treinador'}</button>
    {erro&&<div className="lv-sub" style={{marginTop:8,color:'#fca5a5'}}>{erro}</div>}</>);
}

/* ── Anéis do dia: as 4 coisas que o aluno tem que fechar hoje ── */
function Anel({pct,cor,ic,lbl,val,onClick}){
  const R=26,C=2*Math.PI*R,p=Math.max(0,Math.min(1,pct));
  const done=p>=1;
  return(<div onClick={onClick} style={{flex:1,textAlign:'center',cursor:onClick?'pointer':'default'}}>
    <svg viewBox="0 0 64 64" width="100%" className="lv-anel" style={{maxWidth:66,display:'block',margin:'0 auto'}}>
      <circle cx="32" cy="32" r={R} fill="none" stroke="var(--bg4)" strokeWidth="6"/>
      <circle className="val" cx="32" cy="32" r={R} fill="none" stroke={cor} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C*(1-p)} transform="rotate(-90 32 32)"
        style={{'--c':C,transition:'stroke-dashoffset .7s cubic-bezier(.22,.9,.3,1)'}}/>
      <text x="32" y="33" textAnchor="middle" dominantBaseline="central" fontSize={done?18:12.5}
        fontWeight="800" fill={done?cor:'var(--text2)'}>{done?'✓':ic}</text>
    </svg>
    <div style={{fontSize:11,fontWeight:800,marginTop:5,color:done?cor:'var(--lvtx)'}}>{lbl}</div>
    <div style={{fontSize:10,color:'var(--lvt3)'}}>{val}</div>
  </div>);
}

function AneisDoDia({stu,profile,demo,semFicha,onTreino,onDieta,onAgua,onCheckin}){
  const [h,setH]=useState(demo?{treinou:false,ref:2,refTot:4,agua:1750,aguaMeta:2500,checkin:'Verde'}:undefined);
  useEffect(()=>{if(demo||!stu)return;(async()=>{
    const hoje=todayStr();
    const r={treinou:false,ref:0,refTot:0,agua:0,aguaMeta:3000,checkin:null};
    try{const {data}=await sb.from('train_historico').select('id').eq('student_id',stu.id).eq('data_treino',hoje).limit(1);r.treinou=!!(data&&data.length);}catch(e){}
    try{const {data}=await sb.from('train_hidratacao').select('total_ml').eq('id',stu.id+'_'+hoje).maybeSingle();if(data)r.agua=data.total_ml||0;}catch(e){}
    // água tomada sem sinal ainda está na fila do aparelho; sem somar aqui o
    // anel diz 0 L para quem bebeu 1 L de manhã no metrô
    try{r.agua+=(await filaAluno()).filter(i=>i.rpc==='hidratar')
      .reduce((a,i)=>a+n0(i.args&&i.args.p_ml),0);}catch(e){}
    try{const {data}=await sb.from('train_checkin').select('sinal').eq('id',stu.id+'_'+hoje).maybeSingle();if(data)r.checkin=data.sinal;}catch(e){}
    try{
      const p=await getActivePlan(profile.id);
      if(p){
        if(p.water_goal_ml)r.aguaMeta=p.water_goal_ml;
        // mesmas leituras da tela da dieta, pelo mesmo caminho: com prazo e com
        // cópia. Cruas, sem sinal elas seguravam o cartão "Seu dia" inteiro e
        // depois faziam o anel da dieta sumir da tela.
        const [ms,ck]=await Promise.all([
          // chave própria: 'refeicoes-<plano>' guarda a refeição inteira para a
          // tela da dieta, e gravar aqui só o id apagaria nome e horário de lá
          lerCopia('refcont-'+p.id,sb.from('meals').select('id').eq('plan_id',p.id)),
          lerCopia('refok-'+profile.id,
            sb.from('checkins').select('meal_id,day').eq('student_id',profile.id).eq('day',hoje)),
        ]);
        const marcadas={};
        (ck.data||[]).forEach(c=>{if(!c.day||c.day===hoje)marcadas[c.meal_id]=true;});
        (await filaAluno()).forEach(i=>{
          if(i.tabela!=='checkins')return;
          if(i.apagar)delete marcadas[i.apagar.meal_id];
          else if(i.linha&&i.linha.day===hoje)marcadas[i.linha.meal_id]=true;
        });
        r.refTot=(ms.data||[]).length;r.ref=Object.keys(marcadas).length;
      }
    }catch(e){}
    setH(r);
  })();},[stu&&stu.id,demo]);

  if(h===undefined)return null;
  // Sem ficha, treinar não está na mão do aluno: contar o anel de Treino
  // deixava o dia fechado em "0 de 3" desde a primeira abertura, com uma
  // pendência que só o treinador resolve. Quem registra treino de fora do app
  // fecha o anel do mesmo jeito, e aí ele volta a contar.
  const contaTreino=!semFicha||h.treinou;
  const feitos=[h.treinou,h.refTot>0&&h.ref>=h.refTot,h.agua>=h.aguaMeta,!!h.checkin].filter(Boolean).length;
  const total=(h.refTot>0?3:2)+(contaTreino?1:0);
  return(<div className="lv-card">
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
      <div className="lv-kick">Seu dia</div>
      <span style={{fontSize:12,fontWeight:800,color:feitos>=total?'var(--green)':'var(--lvt2)'}}>
        {feitos===total?'tudo fechado':`${feitos} de ${total}`}</span>
    </div>
    <div style={{display:'flex',gap:6}}>
      <Anel pct={h.treinou?1:0} cor="var(--accent)" ic="" lbl="Treino"
        val={h.treinou?'feito':semFicha?'sem ficha':'pendente'} onClick={onTreino}/>
      {h.refTot>0&&<Anel pct={h.refTot?h.ref/h.refTot:0} cor="var(--green)" ic={h.ref+'/'+h.refTot} lbl="Dieta" val={h.ref+' de '+h.refTot} onClick={onDieta}/>}
      <Anel pct={h.aguaMeta?h.agua/h.aguaMeta:0} cor="var(--blue)" ic={Math.round((h.agua/(h.aguaMeta||1))*100)+'%'} lbl="Água"
        val={(h.agua/1000).toFixed(1).replace('.',',')+' L'} onClick={onAgua}/>
      <Anel pct={h.checkin?1:0} cor={h.checkin==='Vermelho'?'var(--red)':h.checkin==='Amarelo'?'var(--gold)':'var(--green)'}
        ic="" lbl="Check-in" val={h.checkin||'pendente'} onClick={onCheckin}/>
    </div>
  </div>);
}


/* ── Evolução do aluno: quanto ele andou desde a primeira avaliação ── */
function EvolucaoAluno({stu,demo,onVer}){
  const [e,setE]=useState(demo?{n:2,meses:4,dPeso:-6,dGord:-6,dMagra:1.4,
    pri:{weight:84,fatPct:22,leanMass:65.5},ult:{weight:78,fatPct:16,leanMass:66.9}}:undefined);
  useEffect(()=>{if(demo||!stu)return;(async()=>{
    try{
      const {data}=await sb.from('assessments').select('*').eq('student_id',stu.id).order('date');
      if(!data||data.length<2){setE(null);return;}
      const conv=r=>({...r.data,date:r.date});
      const pri=derive(stu,conv(data[0])), ult=derive(stu,conv(data[data.length-1]));
      const d=(a,b)=>(a!=null&&b!=null)?+(b-a).toFixed(1):null;
      const meses=Math.max(1,Math.round((new Date(data[data.length-1].date)-new Date(data[0].date))/2592000000));
      setE({n:data.length,meses,pri,ult,
        dPeso:d(pri.weight,ult.weight),dGord:d(pri.fatPct,ult.fatPct),dMagra:d(pri.leanMass,ult.leanMass)});
    }catch(err){setE(null);}
  })();},[stu&&stu.id,demo]);

  if(e===undefined||e===null)return null;

  const linha=(lbl,de,para,delta,un,melhorSeCai)=>{
    if(de==null||para==null)return null;
    const bom=melhorSeCai?delta<0:delta>0;
    const cor=delta===0?'var(--lvt2)':bom?'var(--green)':'#fb7185';
    return(<div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderTop:'1px solid var(--lvbd)'}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:700,fontSize:13.5}}>{lbl}</div>
        <div className="lv-sub" style={{fontSize:11.5}}>{fmt(de)}{un} no início</div>
      </div>
      <div style={{textAlign:'right'}}>
        <div style={{fontWeight:800,fontSize:16}}>{fmt(para)}<span style={{fontSize:11,color:'var(--lvt3)'}}>{un}</span></div>
        <div style={{fontSize:11.5,fontWeight:800,color:cor}}>{delta>0?'+':''}{fmt(delta)}{un}</div>
      </div>
    </div>);
  };

  return(<div className="lv-card" onClick={onVer} style={{cursor:onVer?'pointer':'default'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
      <div className="lv-kick">Sua evolução</div>
      <span className="lv-sub" style={{fontSize:11.5}}>{e.meses} {e.meses===1?'mês':'meses'} · {e.n} avaliações</span>
    </div>
    {linha('Peso',e.pri.weight,e.ult.weight,e.dPeso,' kg',null)}
    {linha('Gordura corporal',e.pri.fatPct,e.ult.fatPct,e.dGord,'%',true)}
    {linha('Massa magra',e.pri.leanMass,e.ult.leanMass,e.dMagra,' kg',false)}
    {onVer&&<div className="lv-sub" style={{marginTop:10,textAlign:'center',fontSize:12}}>Ver evolução completa ›</div>}
  </div>);
}


/* ── Peso: o aluno está no ritmo da meta? ──
   Peso de hoje sozinho nao diz nada. O que importa e comparar o quanto
   ja andou com o quanto deveria ter andado a esta altura do prazo. */
const PESO_COR={'Meta batida':'var(--green)','Em dia':'var(--green)','Na meta':'var(--green)',
  'Em andamento':'var(--blue)','Um pouco atrás':'var(--gold)','Atrasado':'#fb7185','Indo ao contrário':'var(--red)'};

function PesoStatus({demo,compacto,studentId}){
  const [p,setP]=useState(demo?{ok:true,meta:true,inicial:84,alvo:75,atual:78,
    prazo:'2026-11-30',progresso:0.667,esperado:0.6,situacao:'Em dia',falta:-3}:undefined);
  useEffect(()=>{if(demo)return;
    if(!sb){setP(null);return;}
    sb.rpc('peso_situacao',{p_student:studentId||null})
      .then(({data,error})=>setP(error?null:data)).catch(()=>setP(null));},[demo,studentId]);

  if(!p||!p.ok||!p.meta)return null;
  if(p.sem_pesagem)return(<div className="lv-card">
    <div className="lv-kick" style={{marginBottom:6}}>Meta de peso</div>
    <div style={{fontWeight:700}}>Alvo: {fmt(p.alvo)} kg</div>
    <div className="lv-sub" style={{marginTop:4}}>Registre seu peso no Diário para acompanhar o ritmo.</div>
  </div>);

  const cor=PESO_COR[p.situacao]||'var(--text2)';
  const pr=Math.max(0,Math.min(1,p.progresso||0));
  const esp=p.esperado==null?null:Math.max(0,Math.min(1,p.esperado));
  const falta=Math.abs(p.falta);

  if(compacto)return(<span style={{fontSize:11,fontWeight:700,color:cor,whiteSpace:'nowrap'}}>{p.situacao}</span>);

  return(<div className="lv-card">
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
      <div className="lv-kick">Meta de peso</div>
      <span className="lv-pill" style={{background:cor+'22',color:cor}}>{p.situacao}</span>
    </div>
    <div style={{display:'flex',alignItems:'baseline',gap:8}}>
      <span style={{fontSize:28,fontWeight:800}}>{fmt(p.atual)}</span>
      <span className="lv-sub">kg hoje</span>
      <span style={{flex:1}}/>
      <span className="lv-sub">alvo {fmt(p.alvo)} kg</span>
    </div>

    {/* barra: o preenchido e o quanto ele andou; o tracinho e onde deveria estar hoje */}
    <div style={{position:'relative',marginTop:12}}>
      <div className="lv-freq" style={{marginTop:0}}>
        <i style={{width:(pr*100)+'%',background:`linear-gradient(90deg,${cor},${cor}cc)`}}/>
      </div>
      {esp!=null&&<div title="onde você deveria estar hoje"
        style={{position:'absolute',top:-3,left:`calc(${esp*100}% - 1px)`,width:2,height:15,
          background:'var(--lvtx)',opacity:.55,borderRadius:1}}/>}
    </div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:6}}>
      <span className="lv-sub" style={{fontSize:11.5}}>{fmt(p.inicial)} kg no início</span>
      <span className="lv-sub" style={{fontSize:11.5}}>
        {p.situacao==='Meta batida'?'objetivo alcançado':
         (falta<0.1?'praticamente lá':`faltam ${fmt(falta)} kg`)}</span>
    </div>
    {esp!=null&&<div className="lv-sub" style={{fontSize:11.5,marginTop:8,lineHeight:1.5}}>
      O tracinho marca onde você deveria estar hoje para bater a meta no prazo.</div>}
  </div>);
}

/* Treinador define a meta de peso do aluno */
function PesoMetaCoach({student,demo}){
  const [f,setF]=useState({alvo:'',prazo:'',inicial:''});
  const [msg,setMsg]=useState(null);const [busy,setBusy]=useState(false);
  useEffect(()=>{if(demo)return;
    sb.from('train_peso_meta').select('*').eq('student_id',student.id).maybeSingle()
      .then(({data})=>{if(data)setF({alvo:data.peso_alvo??'',prazo:data.prazo??'',inicial:data.peso_inicial??''});})
      .catch(()=>{});},[student.id,demo]);
  const salvar=async()=>{
    if(!num(f.alvo)){setMsg({t:'err',m:'Informe o peso alvo.'});return;}
    if(demo){setMsg({t:'ok',m:'Modo demonstração: não foi salvo.'});return;}
    setBusy(true);
    const {error}=await sb.rpc('peso_meta_salvar',{p_student:student.id,p_alvo:num(f.alvo),
      p_prazo:f.prazo||null,p_inicial:num(f.inicial)});
    setBusy(false);
    setMsg(error?{t:'err',m:/peso_meta|does not exist|PGRST202/.test(error.message)
      ?'Rode o arquivo "feedback-e-peso.sql" no Supabase para liberar isso.':'Erro: '+error.message}
      :{t:'ok',m:'Meta salva.'});
  };
  return(<div className="card" style={{marginBottom:14}}>
    <div style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:600,marginBottom:2}}>Meta de peso</div>
    <p className="s-meta" style={{marginBottom:10}}>
      Com alvo e prazo definidos, o app mostra para você e para o aluno se ele está no ritmo — em vez de só mostrar o peso de hoje.</p>
    {msg&&<div className={`alert ${msg.t==='err'?'alert-danger':'alert-success'}`}>{msg.m}</div>}
    <div className="fgrid" style={{gridTemplateColumns:'1fr 1fr 1fr'}}>
      <FI label="Peso alvo" unit="kg" type="number" value={f.alvo} onChange={e=>setF({...f,alvo:e.target.value})}/>
      <FI label="Peso inicial" unit="kg" type="number" value={f.inicial} onChange={e=>setF({...f,inicial:e.target.value})} placeholder="último do diário"/>
      <FI label="Prazo" type="date" value={f.prazo} onChange={e=>setF({...f,prazo:e.target.value})}/>
    </div>
    <button className="btn btn-primary btn-sm" style={{marginTop:8}} disabled={busy} onClick={salvar}>
      {busy?'Salvando…':'Salvar meta'}</button>
  </div>);
}

/* Quando o treinador abre "Visão do aluno", este mesmo app roda com o cadastro
   do aluno escolhido e em modo só leitura: nada é gravado no lugar dele. */
/* Foto de progresso do aluno. A balança mente numa recomposição; a foto não.
   Guarda no mesmo bucket das fotos de refeição, com kind='progress', e mostra
   a primeira ao lado da última — que é o que faz ele continuar. */
function FotosProgresso({stu,conta,demo,somenteLeitura}){
  const [fotos,setFotos]=useState(demo?[]:null);
  const [offline,setOffline]=useState(false);
  const [enviando,setEnviando]=useState(false);
  const [erro,setErro]=useState(null);
  const [aberta,setAberta]=useState(null);
  const [card,setCard]=useState(false);
  const [marca,setMarca]=useState(null);   // marca do treinador, para o card
  const arqRef=useRef(null);
  useEffect(()=>{if(demo||!stu||!stu.coach_id)return;
    lerCopia('marca-'+stu.coach_id,
      sb.from('profiles').select('brand_name,name,instagram,logo_url').eq('id',stu.coach_id).maybeSingle())
      .then(({data})=>setMarca(data||null)).catch(()=>{});},[stu&&stu.coach_id,demo]);
  const carregar=async()=>{
    if(demo)return;
    if(!conta){setFotos([]);return;}
    const r=await lerCopia('fotos-prog-'+conta,
      sb.from('photos').select('id,url,created_at,kind').eq('student_id',conta).eq('kind','progress').order('created_at',{ascending:false}).limit(60));
    setOffline(semRede(r));
    setFotos(r.data||[]);
  };
  useEffect(()=>{carregar();},[conta]);
  const enviar=async(file)=>{
    if(!file)return;
    if(demo||somenteLeitura||!conta)return;
    setErro(null);
    if(!navigator.onLine){setErro('Sem internet agora. A foto precisa de sinal para subir — tente de novo quando voltar.');return;}
    setEnviando(true);
    try{
      const blob=await resizeImage(file,1400,.86);
      const url=await uploadFotoAluno(conta,blob);
      const {error}=await comPrazo(sb.from('photos').insert({student_id:conta,coach_id:stu.coach_id,url,kind:'progress',caption:'Progresso'}),20000);
      if(error)throw error;
      await carregar();
    }catch(e){setErro('Não consegui enviar: '+(e.message||e));}
    setEnviando(false);
  };
  const lista=fotos||[];
  const primeira=lista.length>1?lista[lista.length-1]:null;
  const ultima=lista.length>1?lista[0]:null;
  const dias=(a,b)=>Math.max(0,Math.round((new Date(b)-new Date(a))/86400000));
  return(<div>
    <div className="lv-kick" style={{margin:'18px 0 10px'}}>Fotos de progresso</div>
    {primeira&&ultima&&<div className="lv-card" style={{marginBottom:12}}>
      <div className="lv-kick" style={{fontSize:10.5}}>Da primeira até hoje · {dias(primeira.created_at,ultima.created_at)} dias</div>
      <div style={{display:'flex',gap:8,marginTop:10}}>
        {[[primeira,'Antes'],[ultima,'Agora']].map(([f,lb])=>(
          <div key={lb} style={{flex:1,minWidth:0}}>
            <ImgFoto url={f.url} alt={lb+' — foto de progresso'} onClick={()=>setAberta(f)}
              estilo={{width:'100%',aspectRatio:'3/4',objectFit:'cover',borderRadius:12,display:'block',cursor:'pointer'}}/>
            <div className="lv-sub" style={{fontSize:11.5,marginTop:5,textAlign:'center'}}>{lb} · {fmtTime(f.created_at)}</div>
          </div>))}
      </div>
      {/* Quem decide postar e o aluno: o botao so aparece no app dele, nunca
          quando o treinador esta olhando a tela pela visao do aluno. */}
      {!somenteLeitura&&!demo&&
        <button className="lv-btn neon" style={{marginTop:12}} onClick={()=>setCard(true)}>
          Montar meu antes e depois</button>}
    </div>}
    {card&&<CardAntesDepois stu={stu} primeira={primeira} ultima={ultima} marca={marca}
      onFechar={()=>setCard(false)}/>}
    <div className="lv-card" style={{marginBottom:12}}>
      <div className="lv-sub" style={{lineHeight:1.5}}>
        Tire de frente, de lado e de costas, sempre no mesmo lugar, com a mesma luz e a mesma
        roupa. É essa constância que faz a comparação valer. Só você e seu treinador enxergam.</div>
      <input ref={arqRef} type="file" accept="image/*" style={{display:'none'}}
        onChange={e=>{const f=e.target.files&&e.target.files[0];e.target.value='';enviar(f);}}/>
      <button className="lv-btn" style={{marginTop:12}} disabled={enviando||somenteLeitura||demo}
        onClick={()=>arqRef.current&&arqRef.current.click()}>
        {enviando?'Enviando…':'Enviar foto de hoje'}</button>
      {erro&&<div className="lv-sub" style={{marginTop:8,color:'var(--lvrx)',lineHeight:1.45}}>{erro}</div>}
    </div>
    {fotos===null?<div className="center-screen" style={{minHeight:110}}><div className="spinner"/></div>:
     lista.length===0?<CardVazio offline={offline} onTentar={carregar}
       titulo="Nenhuma foto ainda"
       texto={'A de hoje vira a sua foto “antes”.'}/>:
     <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
       {lista.map(f=><div key={f.id}>
         <ImgFoto url={f.url} alt="Foto de progresso" onClick={()=>setAberta(f)}
           estilo={{width:'100%',aspectRatio:'3/4',objectFit:'cover',borderRadius:10,display:'block',cursor:'pointer'}}/>
         <div className="lv-sub" style={{fontSize:10.5,marginTop:4,textAlign:'center'}}>{fmtTime(f.created_at)}</div>
       </div>)}
     </div>}
    {aberta&&<div className="lv-cel" style={{padding:16}} onClick={()=>setAberta(null)}>
      <img src={aberta.url} alt="Progresso" style={{maxWidth:'100%',maxHeight:'78vh',borderRadius:14,objectFit:'contain'}}/>
      <div className="lv-sub" style={{marginTop:10}}>{fmtTime(aberta.created_at)}</div>
      <button className="lv-ghost" style={{marginTop:12}} onClick={()=>setAberta(null)}>Fechar</button>
    </div>}
  </div>);
}

// Nem todo treino acontece dentro do app: corrida no domingo, futebol, a aula
// de luta, a musculação num dia que ele esqueceu o celular. Sem isso o dia fica
// em branco, a sequência quebra e o treinador vê um aluno que "não treinou".
const FORA_TIPOS=['Corrida','Caminhada','Bike','Natação','Funcional','Luta','Futebol','Musculação em outro lugar','Outro'];
function TreineiFora({stu,demo,somenteLeitura,onPronto}){
  const [aberto,setAberto]=useState(false);
  const [tipo,setTipo]=useState(FORA_TIPOS[0]);
  const [min,setMin]=useState('');
  const [dia,setDia]=useState(todayStr());
  const [salvando,setSalvando]=useState(false);
  const [feito,setFeito]=useState(false);
  const ontem=(()=>{const d=new Date();d.setDate(d.getDate()-1);return dayKey(d);})();
  const salvar=async()=>{
    setSalvando(true);
    // mesmo motivo da série: id do lado do app para a fila não gravar duas vezes
    const linha={id:genId(),coach_id:stu.coach_id,student_id:stu.id,divisao_id:null,exercicio_id:null,
      exercicio_nome:tipo,data_treino:dia,indice_serie:1,tipo_serie:'Externo',
      carga:null,reps:null,observacao:num(min)?num(min)+' min':null,is_pr:false};
    if(!demo&&!somenteLeitura){
      let subiu=false;
      if(navigator.onLine){try{const {error}=await comPrazo(sb.from('train_historico')
          .upsert(linha,{onConflict:'id',ignoreDuplicates:true}));if(!error)subiu=true;}catch(e){}}
      if(!subiu)await enfileirarAluno({tabela:'train_historico',linha});
    }
    setSalvando(false);setFeito(true);setAberto(false);
    try{navigator.vibrate&&navigator.vibrate([40,50,90]);}catch(e){}
    if(onPronto)onPronto();
  };
  if(feito&&!aberto)return(<div className="lv-card" style={{marginBottom:14,borderColor:'var(--lvsel)'}}>
    <div style={{fontWeight:700}}>{tipo} registrado</div>
    <div className="lv-sub" style={{marginTop:3,lineHeight:1.45}}>
      O dia entrou na sua frequência e seu treinador vê o registro.</div>
    <button className="lv-ghost" style={{marginTop:10}} onClick={()=>{setFeito(false);setAberto(true);setMin('');}}>Registrar outro</button>
  </div>);
  if(!aberto)return(<div className="lv-treino" style={{marginBottom:14}} onClick={()=>setAberto(true)}>
    <span style={{width:3,height:30,borderRadius:2,background:'var(--lvrx)',flexShrink:0}}/>
    <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Treinei fora do app</div>
      <div className="lv-sub">Corrida, futebol, outra academia…</div></div>
    <span style={{color:'var(--lvt3)'}}>›</span>
  </div>);
  return(<div className="lv-card" style={{marginBottom:14}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div className="lv-kick">Treinei fora do app</div>
      <button className="lv-ghost" onClick={()=>setAberto(false)}>Fechar</button>
    </div>
    <div className="lv-sub" style={{margin:'6px 0 12px',lineHeight:1.45}}>
      Sem carga nem série — só para o dia contar na sua frequência.</div>
    <span className="lv-inlbl">O que você fez</span>
    <div style={{display:'flex',flexWrap:'wrap',gap:7,margin:'6px 0 12px'}}>
      {FORA_TIPOS.map(t=><button key={t} className={'lv-pill'+(tipo===t?' on':'')}
        style={{cursor:'pointer',border:'1px solid '+(tipo===t?'var(--lvsel)':'var(--lvbd)'),
          background:tipo===t?'var(--lvbrilho)':'transparent',color:tipo===t?'var(--lvsel2)':'var(--lvt2)'}}
        onClick={()=>setTipo(t)}>{t}</button>)}
    </div>
    <div style={{display:'flex',gap:10}}>
      <div style={{flex:1}}><span className="lv-inlbl">Duração (min)</span>
        <input className="lv-in" type="number" inputMode="numeric" placeholder="opcional" value={min} onChange={e=>setMin(e.target.value)}/></div>
      <div style={{flex:1}}><span className="lv-inlbl">Quando</span>
        <select className="lv-in" value={dia} onChange={e=>setDia(e.target.value)}>
          <option value={todayStr()}>Hoje</option>
          <option value={ontem}>Ontem</option>
        </select></div>
    </div>
    <button className="lv-btn" style={{marginTop:12}} disabled={salvando||somenteLeitura} onClick={salvar}>
      {salvando?'Registrando…':'Registrar treino'}</button>
  </div>);
}

function StudentApp({profile,verComoAluno,onSairDaVisao}){
  const demo=!!profile._demo;
  const espiando=!!verComoAluno;
  const contaAluno=espiando?(verComoAluno.user_id||null):profile.id;
  const [stu,setStu]=useState(espiando?verComoAluno:demo?{id:'ds1',name:'Laryssa Araujo',gender:'F',coach_id:'demo'}:undefined);
  const [divs,setDivs]=useState(demo?_DEMO_ALUNO_DIVS:null);
  const [best,setBest]=useState({});const [exec,setExec]=useState(null);const [evol,setEvol]=useState(false);const [hydra,setHydra]=useState(false);const [chk,setChk]=useState(false);const [ciclo,setCiclo]=useState(false);const [aval,setAval]=useState(false);const [freq,setFreq]=useState({done:0,meta:4});
  const [diario,setDiario]=useState(false);const [metas,setMetas]=useState(false);
  const [treinos,setTreinos]=useState(false);   // diário de sessões
  const [espiar,setEspiar]=useState(null);      // divisão que ele quer só olhar
  const [tab,setTab]=useState('home');
  const [temDieta,setTemDieta]=useState(false);
  const [pushOn,setPushOn]=useState(false);const [pushBusy,setPushBusy]=useState(false);const [pushMsg,setPushMsg]=useState(null);const [agua,setAgua]=useState(false);
  const [lembTreino,setLembTreino]=useState(false);const [periodo,setPeriodo]=useState('noite');
  // pushChecado evita o convite piscar na tela de quem ja ligou: so mostra
  // depois que a resposta do servidor chegou. E quem dispensa nao ve de novo.
  const [pushChecado,setPushChecado]=useState(false);
  const [convAvisoOff,setConvAvisoOff]=useState(()=>{try{return localStorage.getItem('mfp-conv-aviso')==='off';}catch(e){return false;}});
  const [stats,setStats]=useState({total:0,prs:0,streak:0,mes:0,ton:0});
  // o histórico cru fica guardado porque a retrospectiva do mês sai dele, sem
  // custar outra ida ao servidor
  const [hist,setHist]=useState(demo?_DEMO_HIST_ALUNO:[]);
  const [retro,setRetro]=useState(false);
  const [ultimaDiv,setUltimaDiv]=useState(null);   // qual divisão ele fez por último
  const [divsCheias,setDivsCheias]=useState(null); // divisões que têm exercício (null = ainda não sei)
  const [seriesPorDiv,setSeriesPorDiv]=useState({});// quantas séries cada divisão tem prescritas
  // Séries que ainda não subiram: quem treinou sem sinal tem o treino SÓ aqui.
  // Sem isso a tela diria que ele não treinou nada hoje.
  const [filaHoje,setFilaHoje]=useState([]);
  useEffect(()=>{if(demo)return;
    const ler=()=>filaAluno().then(q=>setFilaHoje((q||[])
      .filter(it=>it.tabela==='train_historico'&&it.linha&&it.linha.data_treino===todayStr())
      .map(it=>it.linha))).catch(()=>{});
    ler();
    const f=()=>ler();
    window.addEventListener('mfp-fila',f);
    return()=>window.removeEventListener('mfp-fila',f);},[demo]);
  // "ainda não chegou" e "chegou e está vazio" são coisas diferentes na tela:
  // dizer que o treinador não montou a ficha quando ela só não carregou é o
  // tipo de mentira que faz o aluno fechar o app.
  const [divsFrescas,setDivsFrescas]=useState(!!demo);
  const [falhouDivs,setFalhouDivs]=useState(false);
  const [avisos,setAvisos]=useState(demo?_DEMO_AVISOS:[]);
  // O mês do aluno sai do histórico que já está na mão — nenhuma ida a mais ao
  // servidor. Volta null quando o mês não tem treino que valha uma imagem.
  // Fica aqui em cima, junto dos outros hooks: mais abaixo já existem returns
  // condicionais, e hook depois de return quebra a tela na volta.
  const resumoMes=React.useMemo(()=>resumoDoMes(hist,divs),[hist,divs]);
  // A meta da semana era 4 para todo mundo — um número que ninguém escolheu e
  // que aparecia até para quem ainda não tem ficha ("faltam 4 treinos"),
  // cobrando o aluno por uma coisa que depende do treinador. Agora, quando o
  // treinador marcou os dias das divisões, a meta é o que ele marcou. Sem dias
  // marcados fica nos 4 de antes — contar as divisões seria pior, porque quem
  // tem A e B costuma treinar ABAB. E sem ficha nenhuma não existe meta.
  const metaSemana=React.useMemo(()=>{
    if(demo)return 4;
    const lista=divs||[];
    if(!lista.length)return 0;
    const dias=new Set();
    lista.forEach(d=>(d.dias_semana||[]).forEach(x=>dias.add(String(x))));
    return dias.size||4;
  },[divs,demo]);
  useEffect(()=>{setFreq(f=>f.meta===metaSemana?f:{...f,meta:metaSemana});},[metaSemana]);
  const semMeta=!freq.meta;
  const naoLidos=avisos.filter(a=>!a.lido).length;
  const computeStats=(hi)=>{
    const dias=[...new Set((hi||[]).map(h=>h.data_treino))].sort();
    const prs=(hi||[]).filter(h=>h.is_pr).length;
    const now=new Date();const mesKey=now.toISOString().slice(0,7);
    const mes=dias.filter(d=>d.slice(0,7)===mesKey).length;
    // sequência: dias de treino consecutivos terminando hoje ou ontem
    let streak=0;const setD=new Set(dias);const cur=new Date();
    const iso=d=>dayKey(d);
    if(!setD.has(iso(cur)))cur.setDate(cur.getDate()-1);
    while(setD.has(iso(cur))){streak++;cur.setDate(cur.getDate()-1);}
    // Tonelagem da vida toda: carga x reps de tudo que ele registrou. É o
    // número que só cresce, então dá motivo de abrir o app num dia sem treino.
    // Série externa não entra: ali não há carga registrada.
    const ton=(hi||[]).reduce((a,h)=>
      h.tipo_serie==='Externo'?a:a+(num(h.carga)||0)*(num(h.reps)||0),0);
    return{total:dias.length,prs,streak,mes,ton};
  };
  const loadAvisos=async(sid)=>{const {data}=await lerCopia('avisos-'+sid,
    sb.from('train_avisos').select('*').eq('student_id',sid).order('created_at',{ascending:false}).limit(50));setAvisos(data||[]);};
  const [code,setCode]=useState('');const [linkErr,setLinkErr]=useState(null);const [linking,setLinking]=useState(false);
  const doLink=async()=>{const c=code.trim().toUpperCase();if(!c)return;setLinking(true);setLinkErr(null);
    const {data,error}=await sb.rpc('aluno_link',{p_code:c});setLinking(false);
    if(error){setLinkErr(error.message);return;}
    if(data&&data.linked){try{localStorage.removeItem('mfp_aluno_code');}catch(e){}location.reload();}
    else setLinkErr('Código inválido ou já usado. Confira com seu treinador.');};
  const refresh=async()=>{if(demo||!stu)return;
    const {data:hi}=await lerCopia('hist-'+stu.id,
      sb.from('train_historico').select(COLUNAS_HIST).eq('student_id',stu.id));
    const b={};(hi||[]).forEach(h=>{if(h.tipo_serie==='Valida'&&h.exercicio_id&&(b[h.exercicio_id]==null||h.carga>b[h.exercicio_id]))b[h.exercicio_id]=h.carga;});setBest(b);
    const md=new Date();md.setDate(md.getDate()-((md.getDay()+6)%7));const mk=dayKey(md);
    const days=new Set((hi||[]).filter(h=>h.data_treino>=mk).map(h=>h.data_treino));setFreq(f=>({...f,done:days.size}));
    setStats(computeStats(hi));setHist(hi||[]);setUltimaDiv(divisaoMaisRecente(hi));loadAvisos(stu.id);};
  // Tudo que a tela do aluno precisa depois de saber QUEM ele e. Roda uma vez
  // com a copia local (instantaneo) e de novo com o dado fresco.
  const carregarDoAluno=React.useCallback(async(s)=>{
    if(!s)return;
    // A cópia local entra na hora, mas ela pode ser de ANTES de o treinador
    // montar a ficha. Enquanto a resposta fresca não chega, a tela não pode
    // afirmar "seu treinador ainda não montou": é o que fazia o aluno abrir o
    // app depois da ficha pronta e continuar vendo que não tinha treino.
    setFalhouDivs(false);
    lerJa('divs-'+s.id,
      sb.from('train_divisao').select('*').eq('student_id',s.id).order('ordem'),
      (dv,daCopia)=>{
        setDivs(dv||[]);
        if(!daCopia)setDivsFrescas(true);
        // divisão sem exercício não pode ser sugerida: o aluno tocaria em
        // "Iniciar treino" e cairia numa tela vazia
        if((dv||[]).length){
          lerJa('pres-divs-'+s.id,
            sb.from('train_serie_prescrita').select('divisao_id,qtd_series').in('divisao_id',dv.map(d=>d.id)),
            pres=>{if(pres){
              setDivsCheias(new Set(pres.map(x=>x.divisao_id)));
              // total de SÉRIES de cada divisão: é com isso que dá para saber
              // se o treino de hoje ficou pela metade
              const c={};pres.forEach(x=>{c[x.divisao_id]=(c[x.divisao_id]||0)+(x.qtd_series||1);});
              setSeriesPorDiv(c);
            }}).catch(()=>{});
        }else setDivsCheias(new Set());
      })
      .then(dado=>{
        // lerJa devolve null quando a rede falhou e ele se virou com a cópia
        if(dado===null)setFalhouDivs(true); else setDivsFrescas(true);
      })
      .catch(()=>{setDivs(d=>d||[]);setFalhouDivs(true);});
    // histórico: alimenta recordes, frequência, sequência e o rodízio. Entra
    // pela cópia primeiro — nenhuma dessas coisas precisa travar a abertura.
    lerJa('hist-'+s.id,
      sb.from('train_historico').select(COLUNAS_HIST).eq('student_id',s.id),
      hi=>{
        const b={};(hi||[]).forEach(h=>{if(h.tipo_serie==='Valida'&&h.exercicio_id&&(b[h.exercicio_id]==null||h.carga>b[h.exercicio_id]))b[h.exercicio_id]=h.carga;});
        setBest(b);
        const md=new Date();md.setDate(md.getDate()-((md.getDay()+6)%7));const mk=dayKey(md);
        const days=new Set((hi||[]).filter(h=>h.data_treino>=mk).map(h=>h.data_treino));
        setFreq(f=>({...f,done:days.size}));
        setStats(computeStats(hi));setHist(hi||[]);setUltimaDiv(divisaoMaisRecente(hi));
      }).catch(()=>{});
    loadAvisos(s.id);
  },[]);

  useEffect(()=>{if(demo){setFreq({done:3,meta:4});setStats({total:24,prs:7,streak:3,mes:9,ton:186400});return;}(async()=>{
    let s=verComoAluno||null;
    if(!espiando){
      // aluno_link so faz sentido quando ha codigo esperando. Chamar sempre
      // custava uma ida e volta ao servidor na abertura, para nada.
      try{const c=localStorage.getItem('mfp_aluno_code');
        if(c){const {data:lk}=await sb.rpc('aluno_link',{p_code:c});
          if(lk&&lk.linked){try{localStorage.removeItem('mfp_aluno_code');}catch(e){}}}
      }catch(e){}
      // a copia local aparece na hora; a rede confirma depois
      let jaTem=false;
      await lerJa('aluno-'+profile.id,
        sb.from('assess_students').select('*').eq('user_id',profile.id).limit(1),
        (sr,daCopia)=>{const q=(sr&&sr[0])?rowToStu(sr[0]):null;
          if(daCopia){jaTem=!!q;setStu(q);carregarDoAluno(q);}else s=q;});
      if(jaTem&&s===null)return;   // ja montou pela copia; a rede so confirmou
    }
    setStu(s);
    if(s)await carregarDoAluno(s);
  })();},[]);
  useEffect(()=>{if(demo){setTemDieta(true);return;}
    if(!contaAluno){setTemDieta(false);return;}
    (async()=>{try{const p=await getActivePlan(contaAluno);setTemDieta(!!p);}catch(e){}})();},[contaAluno]);
  useEffect(()=>{if(tab==='avisos'&&naoLidos>0&&!espiando){setAvisos(a=>a.map(x=>({...x,lido:true})));if(!demo)semEsperar(sb.rpc('avisos_marcar_lidos'));}},[tab]);
  useEffect(()=>{if(demo||espiando||!stu)return;(async()=>{
    // Quem manda aqui e o servidor, nao o navegador. Ter inscricao no aparelho
    // nao significa que ela chegou ao banco — e se nao chegou, nada e enviado.
    // Mostrar "ligado" nesse caso e prometer um aviso que nunca vem.
    try{if(pushSuportado()&&Notification.permission==='granted'){
      const reg=await navigator.serviceWorker.ready;const s=await reg.pushManager.getSubscription();
      if(!s){setPushOn(false);}
      else{const {data}=await sb.from('train_push').select('endpoint')
        .eq('endpoint',s.toJSON().endpoint).eq('papel','aluno').maybeSingle();
        setPushOn(!!data);}
    }}catch(e){}
    setPushChecado(true);
    try{const {data}=await sb.from('train_lembrete').select('agua_ativo,treino_ativo,treino_periodo').eq('student_id',stu.id).maybeSingle();
      if(data){setAgua(!!data.agua_ativo);setLembTreino(!!data.treino_ativo);setPeriodo(data.treino_periodo||'noite');}}catch(e){}
  })();},[stu]);
  const togglePush=async()=>{if(espiando)return;if(demo){setPushOn(p=>!p);return;}setPushBusy(true);setPushMsg(null);
    if(pushOn){const r=await desativarPush();setPushOn(false);setPushMsg(r.ok?null:r.msg);}
    else{const r=await ativarPush();if(r.ok)setPushOn(true);else setPushMsg(r.msg);}setPushBusy(false);};
  // Um lembrete so existe se houver para onde mandar. Antes dava para ligar o
  // lembrete de treino com os avisos desligados: a preferencia era guardada, o
  // servidor mandava o push e ele nao chegava em aparelho nenhum. Ligar o
  // lembrete e pedir para ser avisado, entao a inscricao vai junto.
  const garantirPush=async()=>{
    if(pushOn||demo)return true;
    setPushBusy(true);setPushMsg(null);
    const r=await ativarPush();
    setPushBusy(false);
    if(r.ok){setPushOn(true);return true;}
    setPushMsg(r.msg);return false;
  };
  /* Os dois interruptores de lembrete gravavam sem esperar resposta: a chave
     virava "ligado" na tela e o servidor podia nunca ter sabido — o aluno acha
     que vai ser lembrado e não é lembrado. É a mesma família do defeito que já
     tinha aparecido aqui (a chave vindo do navegador em vez do servidor), e
     ela casa com o número do banco: 5 aparelhos com aviso, de 22 contas.
     Agora espera, confere, e devolve a chave se não gravou. */
  const toggleAgua=async(v)=>{if(espiando)return;
    if(v&&!(await garantirPush()))return;
    setAgua(v);setPushMsg(null);
    if(demo)return;
    try{await gravar(sb.rpc('lembrete_agua',{p_ativo:v}));}
    catch(e){setAgua(!v);setPushMsg(porQueFalhou(e));}};
  const salvarLembreteTreino=async(ativo,per)=>{if(espiando)return;
    if(ativo&&!(await garantirPush()))return;
    const antes={a:lembTreino,p:periodo};
    setLembTreino(ativo);setPeriodo(per);setPushMsg(null);
    if(demo)return;
    try{await gravar(sb.rpc('lembrete_treino',{p_ativo:ativo,p_periodo:per}));}
    catch(e){setLembTreino(antes.a);setPeriodo(antes.p);setPushMsg(porQueFalhou(e));}};
  const hr=new Date().getHours();const saud=hr<12?'Bom dia':hr<18?'Boa tarde':'Boa noite';

  const goTab=t=>{if(t!==tab)vibrar(8);setExec(null);setEvol(false);setHydra(false);setChk(false);setCiclo(false);setAval(false);setDiario(false);setMetas(false);setTreinos(false);setEspiar(null);setTab(t);window.scrollTo(0,0);};
  const navItem=(t,ic,lb,badge)=>(<button className={'lv-navb'+(tab===t?' on':'')} onClick={()=>goTab(t)}>
    <span className="lv-navmark"/>{lb}{badge>0&&<span className="lv-navbadge">{badge>9?'9+':badge}</span>}</button>);
  const shell=(inner,nav)=>(<div className="lv">
    <div className="lv-top">
      {espiando?<><button className="lv-ghost" onClick={onSairDaVisao}>‹ Sair da visão</button>
        <span style={{fontWeight:600,fontSize:14,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Visão do aluno · {(stu&&stu.name||'').split(' ')[0]}</span>
        <span className="sp"/><span className="lv-somenteleitura">Só leitura</span></>
      :<><LogoMark size={28}/><span style={{fontWeight:600,fontSize:15}}>MF Performance</span><span className="sp"/>
        {!demo&&<button className="lv-x" onClick={()=>sb.auth.signOut()}>Sair</button>}</>}</div>
    <div style={nav?{paddingBottom:78}:null}>{inner}</div>
    {nav&&<div className="lv-nav">
      {navItem('home','','Início',0)}
      {navItem('dieta','','Dieta',0)}
      {navItem('prog','','Progresso',0)}
      {navItem('avisos','','Recados',naoLidos)}
      {navItem('conta','','Conta',0)}
    </div>}
  </div>);

  if(stu===undefined)return shell(<div className="center-screen" style={{minHeight:'70vh'}}><div className="spinner"/></div>);
  if(stu===null)return shell(<div className="lv-wrap"><div className="lv-card" style={{marginTop:26}}>
    <div style={{fontSize:19,fontWeight:800,textAlign:'center',marginBottom:6}}>Ativar minha conta</div>
    <p className="lv-sub" style={{textAlign:'center'}}>Digite o código de acesso que seu treinador te passou.</p>
    {linkErr&&<div className="alert alert-danger" style={{marginTop:10}}>{linkErr}</div>}
    <input className="lv-in" style={{textAlign:'center',letterSpacing:4,textTransform:'uppercase',marginTop:14,fontSize:22,fontWeight:800}} placeholder="CÓDIGO" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={8}/>
    <button className="lv-btn" style={{marginTop:12}} disabled={linking||!code.trim()} onClick={doLink}>{linking?'Ativando…':'Ativar treinos'}</button>
  </div></div>);
  if(exec)return shell(<TrainExec student={stu} divisao={exec} demo={demo} somenteLeitura={espiando} best={best} onBack={()=>setExec(null)} onSaved={(exId,carga)=>setBest(b=>({...b,[exId]:Math.max(b[exId]||0,carga)}))} onFinish={refresh}/>);
  if(evol)return shell(<EvolScreen student={stu} demo={demo} onBack={()=>setEvol(false)}/>);
  if(hydra)return shell(<HydraScreen student={stu} profile={espiando?{...profile,id:contaAluno}:profile} demo={demo} onBack={()=>setHydra(false)}/>);
  if(chk)return shell(<CheckinScreen student={stu} demo={demo} onBack={()=>setChk(false)}/>);
  if(ciclo)return shell(<CicloScreen student={stu} demo={demo} onBack={()=>setCiclo(false)}/>);
  if(aval)return shell(<AvalScreen student={stu} demo={demo} onBack={()=>setAval(false)}/>);
  if(diario)return shell(<DiarioScreen student={stu} demo={demo} onBack={()=>setDiario(false)}/>);
  if(metas)return shell(<MetasScreen student={stu} demo={demo} freq={freq} onBack={()=>setMetas(false)}/>);
  if(treinos)return shell(<TreinosScreen student={stu} demo={demo} onBack={()=>setTreinos(false)}/>);
  if(espiar)return shell(<EspiarDivisao divisao={espiar} demo={demo}
    onFechar={()=>setEspiar(null)} onIniciar={()=>{const d=espiar;setEspiar(null);setExec(d);}}/>);

  const list=divs||[];const pct=Math.min(100,Math.round((freq.done/(freq.meta||1))*100));
  // Rodízio: quem fechou o A ontem abre o app vendo o B — no cartão e no anel.
  // Divisão ainda sem exercício fica de fora da sugestão: tocar em "Iniciar
  // treino" e cair numa tela vazia é pior do que repetir a divisão anterior.
  // Cálculo direto, sem useMemo: este trecho fica DEPOIS dos returns condicionais
  // do componente, e hook aqui muda a contagem entre renders (React #310).
  const proxDiv=(()=>{
    if(!list.length)return null;
    const vale=d=>!divsCheias||divsCheias.has(d.id);
    // Dia marcado na ficha manda no rodízio: se o treinador prescreveu
    // "quarta é B", quarta-feira abre o B, não o que vem depois do último.
    const hoje=diaHojeISO();
    const doDia=list.filter(d=>(d.dias_semana||[]).includes(hoje)&&vale(d));
    if(doDia.length)return doDia[0];
    const cheias=list.filter(vale);
    const base=cheias.length?cheias:list;
    const i=ultimaDiv?base.findIndex(d=>d.id===ultimaDiv):-1;
    if(i>=0)return base[(i+1)%base.length];
    // ele treinou uma divisão que hoje está vazia (ou nunca treinou):
    // segue a ordem da ficha a partir da posição dela
    const iTodas=ultimaDiv?list.findIndex(d=>d.id===ultimaDiv):-1;
    if(iTodas>=0){
      for(let k=1;k<=list.length;k++){const c=list[(iTodas+k)%list.length];if(vale(c))return c;}
    }
    return base[0];
  })();
  const divFeita=ultimaDiv?list.find(d=>d.id===ultimaDiv)||null:null;
  const proxEhDoDia=!!(proxDiv&&(proxDiv.dias_semana||[]).includes(diaHojeISO()));
  const nm=stu.name.split(' ')[0];
  const frase=MOTIV_FRASES[new Date().getDate()%MOTIV_FRASES.length];
  const badges=[
    {em:'1',lb:'1º treino',got:stats.total>=1},
    {em:'7',lb:'7 dias seguidos',got:stats.streak>=7},
    {em:'10',lb:'10 treinos',got:stats.total>=10},
    {em:'PR',lb:'1º recorde',got:stats.prs>=1},
    {em:'25',lb:'25 treinos',got:stats.total>=25},
    {em:'50',lb:'50 treinos',got:stats.total>=50},
  ];
  const header=(<div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
    <div className="lv-avatar">{initials(stu.name)}</div>
    <div style={{flex:1,minWidth:0}}><div className="lv-kick">{saud}</div><div className="lv-title">{nm}</div></div>
    {stats.streak>0&&<span className="lv-streak"><Chama/> {stats.streak} {stats.streak===1?'dia':'dias'}</span>}
  </div>);

  /* O treino é o motivo de o aluno abrir o app. Ficava em quarto lugar, embaixo
     dos anéis do dia e do bloco de avaliação física: para começar a treinar ele
     rolava a tela passando pelo próprio percentual de gordura. Agora vem primeiro. */
  // ── treino de hoje que ficou pela metade ────────────────────
  // Fechar o app, o celular matar o app, acabar a bateria: as séries já feitas
  // estão gravadas, mas a tela oferecia "Iniciar treino" como se nada tivesse
  // acontecido. Aqui ela reconhece o que ficou aberto.
  const emAndamento=(()=>{
    if(!list.length)return null;
    const hoje=todayStr();
    const porDiv={};
    [...(hist||[]),...filaHoje].forEach(h=>{
      if(h.data_treino!==hoje||!h.divisao_id)return;
      porDiv[h.divisao_id]=(porDiv[h.divisao_id]||0)+1;
    });
    let achado=null;
    Object.keys(porDiv).forEach(id=>{
      const total=seriesPorDiv[id];
      // sem saber o total, não dá para afirmar que ficou pela metade
      if(!total||porDiv[id]>=total)return;
      const dv=list.find(d=>d.id===id);
      if(dv&&(!achado||porDiv[id]>achado.feitas))achado={div:dv,feitas:porDiv[id],total};
    });
    return achado;
  })();

  /* Qual convite mostrar — um de cada vez.
     O convite de avisos ficava atrás do de instalar para TODO MUNDO. No iPhone
     isso está certo: o Safari só entrega push com o app na tela de início. No
     Android o push funciona na aba normal, e a fila deixava gente ativa sem
     nunca ver a oferta — Karen, Joyce, Vanessa e Jefferson treinam toda semana
     e não têm aviso ligado; os quatro que têm criaram conta nos últimos dias.
     Fora do iPhone, avisos vêm primeiro: é o convite com retorno de verdade. */
  const querAvisos=!espiando&&!demo&&stu&&pushChecado&&!pushOn&&!convAvisoOff;
  const mostrarConvAvisos=querAvisos&&(EH_IOS?!conviteInstalarVisivel('aluno'):true);
  const mostrarConvInstalar=!espiando&&!mostrarConvAvisos;

  const blocoTreino=list.length===0?(
    falhouDivs
      ? <div className="lv-card" style={{textAlign:'center'}}>
          <div style={{fontWeight:700,marginBottom:6}}>Não consegui carregar seu treino</div>
          <div className="lv-sub" style={{lineHeight:1.5}}>
            Parece que a internet falhou. Sua ficha continua lá.</div>
          <button className="lv-btn" style={{marginTop:12}}
            onClick={()=>{setFalhouDivs(false);carregarDoAluno(stu);}}>Tentar de novo</button>
        </div>
      : !divsFrescas
        // ainda esperando a resposta do servidor: não dá para afirmar que não
        // existe ficha só porque a cópia guardada no celular está vazia
        ? <div className="lv-card" style={{textAlign:'center',padding:'34px 0'}}><div className="spinner"/></div>
        // É a informação mais importante da tela para quem acabou de entrar, e
        // vinha em cinza, menor que o convite de instalar o app.
        : <div className="lv-card" style={{textAlign:'center'}}>
            <div style={{fontWeight:800,fontSize:17,marginBottom:6}}>Sua ficha ainda não chegou</div>
            <div className="lv-sub" style={{lineHeight:1.5}}>
              Quem monta o treino é seu treinador. Assim que ele publicar, aparece aqui
              e o app avisa você.</div>
            <AvisarFicha demo={demo} somenteLeitura={espiando}/>
          </div>
  ):(()=>{
    // Sugere a PRÓXIMA do rodízio, não sempre a primeira: quem fechou o A
    // ontem tem que abrir o app vendo o B.
    const prox=proxDiv,feita=divFeita;
    const resto=list.filter(d=>d.id!==prox.id);
    return(<>
    {emAndamento&&<div className="lv-card lv-hero" style={{marginBottom:12}}>
      <div className="lv-kick" style={{color:'#e9d5ff'}}>Treino em andamento</div>
      <div style={{fontSize:20,fontWeight:900,margin:'4px 0 4px'}}>{(emAndamento.div.nome||'Treino').toUpperCase()}</div>
      <div style={{fontSize:12,color:'#e9d5ff',marginBottom:10,opacity:.85}}>
        {emAndamento.feitas} de {plural(emAndamento.total,'série')} · continua de onde você parou</div>
      <button className="lv-btn light" onClick={()=>setExec(emAndamento.div)}>▶ Continuar treino</button>
    </div>}
    <div className="lv-card lv-hero">
      <div className="lv-kick" style={{color:'#e9d5ff'}}>{proxEhDoDia?'Seu treino de hoje':'Próximo treino'}</div>
      <div style={{fontSize:20,fontWeight:900,margin:'4px 0 4px'}}>{(prox.nome||'Treino').toUpperCase()}</div>
      {proxEhDoDia
        ? <div style={{fontSize:12,color:'#e9d5ff',marginBottom:10,opacity:.85}}>marcado para hoje na sua ficha</div>
        : feita&&list.length>1
          ? <div style={{fontSize:12,color:'#e9d5ff',marginBottom:10,opacity:.85}}>o último foi {feita.nome||'o anterior'}</div>
          : <div style={{height:8}}/>}
      <button className="lv-btn light" onClick={()=>setExec(prox)}>▶ Iniciar treino</button>
      <button className="lv-ghost" style={{marginTop:9,width:'100%',background:'rgba(255,255,255,.12)',color:'#fff',border:'none'}}
        onClick={()=>setEspiar(prox)}>Ver os exercícios antes</button>
    </div>
    {resto.length>0&&<div className="lv-kick" style={{margin:'8px 0 8px'}}>Outros treinos</div>}
    {resto.map(dv=><div key={dv.id} className="lv-treino" style={{marginBottom:10}} onClick={()=>setEspiar(dv)}>
      <span style={{width:3,height:30,borderRadius:2,background:'var(--lvrx)',flexShrink:0}}/>
      <div style={{flex:1}}><div style={{fontWeight:700}}>{dv.nome||'Divisão'}</div>
        <div className="lv-sub">{(dv.dias_semana||[]).length?listaDias(dv.dias_semana)
          :feita&&dv.id===feita.id?'foi o último que você fez':'Toque para ver'}</div></div>
      <span style={{color:'var(--lvt3)'}}>›</span>
    </div>)}
  </>);})();

  const homeTab=(<div className="lv-wrap">
    {header}
    {mostrarConvInstalar&&<ConviteInstalar lv fechavel chave="aluno"/>}
    {/* O interruptor existia so na aba Conta, onde ninguem entra: o banco tinha
        zero inscricoes. Aqui o aluno ve o convite onde ele de fato olha. */}
    {mostrarConvAvisos&&(
      <div className="lv-card" style={{marginBottom:14,borderColor:'var(--lvsel)'}}>
        <div style={{fontWeight:700,marginBottom:4}}>Ligar os avisos no celular</div>
        <div className="lv-sub" style={{lineHeight:1.55}}>
          Assim você fica sabendo na hora quando seu treinador mandar um recado ou trocar sua
          ficha — e pode receber o lembrete do treino no dia em que ainda não treinou.</div>
        <div style={{display:'flex',gap:9,marginTop:13,flexWrap:'wrap'}}>
          <button className="lv-btn" style={{flex:1,minWidth:150}} disabled={pushBusy} onClick={togglePush}>
            {pushBusy?'Ligando…':'Ligar avisos'}</button>
          <button className="lv-btn" style={{background:'var(--lvc2)',color:'var(--lvt2)',minWidth:110}}
            onClick={()=>{setConvAvisoOff(true);try{localStorage.setItem('mfp-conv-aviso','off');}catch(e){}}}>Agora não</button>
        </div>
        {pushMsg&&<div className="lv-sub" style={{color:'#fca5a5',marginTop:11}}>{pushMsg}</div>}
      </div>)}
    {blocoTreino}
    <AneisDoDia stu={stu} profile={profile} demo={demo} semFicha={!list.length&&divsFrescas}
      onTreino={proxDiv?()=>setExec(proxDiv):null} onDieta={()=>goTab('dieta')}
      onAgua={()=>setHydra(true)} onCheckin={()=>setChk(true)}/>
    <PeriodizacaoAluno demo={demo}/>
    <EvolucaoAluno stu={stu} demo={demo} onVer={()=>setEvol(true)}/>
    <PesoStatus demo={demo}/>
    <div className="lv-motiv"><div style={{fontSize:13.5,fontWeight:600,fontStyle:'italic',color:'var(--lvt)'}}>{frase}</div></div>
    <div className="lv-stats">
      <div className="lv-stat"><b><Conta valor={stats.total}/></b><span>{rotuloN(stats.total,'Treino')}</span></div>
      <div className="lv-stat"><b><Conta valor={stats.prs}/></b><span>{rotuloN(stats.prs,'Recorde')}</span></div>
      <div className="lv-stat"><b><Conta valor={stats.mes}/></b><span>Este mês</span></div>
    </div>
    <TreineiFora stu={stu} demo={demo} somenteLeitura={espiando} onPronto={refresh}/>
    <div className="lv-card" onClick={()=>setMetas(true)} style={{cursor:'pointer',background:'var(--bg3)',border:'1px solid var(--lvbd)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div className="lv-kick">Minhas metas & desafios</div><span style={{color:'var(--lvt3)'}}>›</span></div>
      {semMeta?<div className="lv-sub" style={{marginTop:6,lineHeight:1.5}}>O desafio da semana começa quando sua ficha chegar.</div>
      :<><div style={{fontWeight:700,fontSize:15,marginTop:6}}>Desafio da semana: {freq.done}/{freq.meta} {rotuloN(freq.meta,'treino')}</div>
      <div className={'lv-freq'+(pct>=100?' cheia':'')} style={{marginTop:8}}><i style={{width:pct+'%'}}/></div></>}
    </div>
    <div className="lv-card">
      <div className="lv-kick" style={{marginBottom:10}}>Resumo da semana</div>
      <div style={{display:'flex',gap:10,textAlign:'center'}}>
        <div style={{flex:1}}><div style={{fontSize:22,fontWeight:900,color:'var(--lvrx)'}}><Conta valor={freq.done}/></div><div className="lv-sub" style={{fontSize:11}}>{rotuloN(freq.done,'treino')}</div></div>
        <div style={{flex:1}}><div style={{fontSize:22,fontWeight:900,color:'var(--lvrx)'}}><Conta valor={stats.prs}/></div><div className="lv-sub" style={{fontSize:11}}>{rotuloN(stats.prs,'recorde')}</div></div>
        <div style={{flex:1}}><div style={{fontSize:22,fontWeight:900,color:'var(--lvrx)'}}><Conta valor={stats.streak}/></div><div className="lv-sub" style={{fontSize:11}}>{rotuloN(stats.streak,'dia seguido','dias seguidos')}</div></div>
      </div>
      {/* cobrar meta de quem ainda não tem ficha é cobrar o aluno por uma
          coisa que não está na mão dele */}
      <div className="lv-sub" style={{marginTop:10,lineHeight:1.5}}>{semMeta?'Assim que seu treinador montar a ficha, sua meta da semana aparece aqui.':freq.done>=freq.meta?'Semana fechada com chave de ouro! Orgulho do seu compromisso.':(freq.meta-freq.done===1?'Falta 1 treino pra bater sua meta da semana. Bora!':`Faltam ${Math.max(0,freq.meta-freq.done)} treinos pra bater sua meta da semana. Bora!`)}</div>
    </div>
    <div className="lv-kick" style={{margin:'18px 0 10px'}}>Meu dia</div>
    <div style={{display:'flex',gap:10,marginBottom:14}}>
      <div className="lv-treino" style={{flex:1,margin:0}} onClick={()=>setHydra(true)}>
        <span style={{width:3,height:30,borderRadius:2,background:'var(--lvrx)',flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Hidratação</div><div className="lv-sub">Meta do dia</div></div>
      </div>
      <div className="lv-treino" style={{flex:1,margin:0}} onClick={()=>setChk(true)}>
        <span style={{width:3,height:30,borderRadius:2,background:'var(--lvrx)',flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Check-in</div><div className="lv-sub">Como está hoje</div></div>
      </div>
    </div>
    {temDieta&&<div className="lv-treino" style={{marginBottom:14}} onClick={()=>goTab('dieta')}>
      <span style={{width:3,height:30,borderRadius:2,background:'var(--lvrx)',flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Minha dieta</div><div className="lv-sub">Refeições, macros e suplementos</div></div>
      <span style={{color:'var(--lvt3)'}}>›</span>
    </div>}
    <div className="lv-treino" style={{marginBottom:14}} onClick={()=>setDiario(true)}>
      <span style={{width:3,height:30,borderRadius:2,background:'var(--lvrx)',flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Diário de saúde</div><div className="lv-sub">Peso, sono, passos, glicemia…</div></div>
      <span style={{color:'var(--lvt3)'}}>›</span>
    </div>
    {stu.gender==='F'&&<div className="lv-treino" style={{marginBottom:14}} onClick={()=>setCiclo(true)}>
      <span style={{width:3,height:30,borderRadius:2,background:'var(--lvrx)',flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Meu ciclo</div><div className="lv-sub">Fases e consciência</div></div>
      <span style={{color:'var(--lvt3)'}}>›</span>
    </div>}
    <div className="lv-kick" style={{margin:'8px 0 10px'}}>Conquistas</div>
    <div className="lv-badges">
      {badges.map((b,i)=><div key={i} className={'lv-badge'+(b.got?' got':'')}><span className="em">{b.em}</span><small>{b.lb}</small></div>)}
    </div>
  </div>);

  const progTab=(<div className="lv-wrap">
    <div className="lv-title" style={{marginBottom:14}}>Meu progresso</div>
    <div className="lv-card"><div className="lv-kick">Frequência semanal</div>
      {semMeta?<div className="lv-sub" style={{marginTop:6,lineHeight:1.5}}>Sua meta semanal sai da ficha. Assim que seu treinador montar, ela aparece aqui.</div>
      :<><div style={{fontSize:24,fontWeight:800,marginTop:4}}>{freq.done} <span style={{color:'var(--lvt2)',fontSize:14,fontWeight:600}}>de {freq.meta} {rotuloN(freq.meta,'treino')}</span></div>
      <div className="lv-freq"><i style={{width:pct+'%'}}/></div></>}
    </div>
    <div className="lv-stats">
      <div className="lv-stat"><b>{stats.total}</b><span>{rotuloN(stats.total,'Treino')}</span></div>
      <div className="lv-stat"><b>{stats.prs}</b><span>{rotuloN(stats.prs,'Recorde')}</span></div>
      <div className="lv-stat"><b>{stats.streak}</b><span>Sequência</span></div>
    </div>
    {/* O peso que ele já moveu na vida. Só cresce, então é o número que traz
        de volta em dia sem treino — e é o que dá vontade de contar pra alguém. */}
    {stats.ton>0&&<div className="lv-card" style={{marginBottom:12}}>
      <div className="lv-kick">Você já levantou</div>
      <div style={{fontSize:34,fontWeight:900,color:'var(--lvsel2)',lineHeight:1.15,marginTop:4}}>{fmtTon(stats.ton)}</div>
      {equivalePeso(stats.ton)&&<div className="lv-sub" style={{marginTop:5,lineHeight:1.5}}>
        mais ou menos o peso de {equivalePeso(stats.ton)}</div>}
      <div className="lv-sub" style={{marginTop:8,fontSize:11.5,lineHeight:1.5,color:'var(--lvt3)'}}>
        Somando carga vezes repetições de tudo que você registrou.</div>
    </div>}
    {/* O mês fechado numa imagem. Vira story, e o story leva o @ do treinador
        junto — é o aluno divulgando porque quer, não porque pediram. */}
    {resumoMes&&<div className="lv-card" style={{marginBottom:12}}>
      <div className="lv-kick">Retrospectiva</div>
      <div style={{fontSize:26,fontWeight:900,lineHeight:1.2,marginTop:4}}>
        {resumoMes.mes}{resumoMes.emCurso?', até aqui':''}</div>
      <div className="lv-sub" style={{marginTop:6,lineHeight:1.5}}>
        {plural(resumoMes.treinos,'treino')} · {fmtTon(resumoMes.ton)}
        {resumoMes.prs>0?' · '+plural(resumoMes.prs,'recorde'):''}</div>
      {!espiando&&<button className="lv-btn neon" style={{marginTop:12}} onClick={()=>setRetro(true)}>
        Ver minha retrospectiva</button>}
    </div>}
    {retro&&resumoMes&&<CardRetro stu={stu} resumo={resumoMes} onFechar={()=>setRetro(false)}/>}
    <div className="lv-treino" style={{marginBottom:12}} onClick={()=>setTreinos(true)}>
      <span style={{width:3,height:30,borderRadius:2,background:'var(--lvrx)',flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Meus treinos</div><div className="lv-sub">Tudo que você fez, treino por treino</div></div>
      <span style={{color:'var(--lvt3)'}}>›</span>
    </div>
    <div className="lv-treino" style={{marginBottom:12}} onClick={()=>setEvol(true)}>
      <span style={{width:3,height:30,borderRadius:2,background:'var(--lvrx)',flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Evolução de cargas</div><div className="lv-sub">Gráfico e recordes por exercício</div></div>
      <span style={{color:'var(--lvt3)'}}>›</span>
    </div>
    <div className="lv-treino" style={{marginBottom:12}} onClick={()=>setAval(true)}>
      <span style={{width:3,height:30,borderRadius:2,background:'var(--lvrx)',flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Minha avaliação física</div><div className="lv-sub">Última avaliação, relatório e evolução</div></div>
      <span style={{color:'var(--lvt3)'}}>›</span>
    </div>
    <FotosProgresso stu={stu} conta={contaAluno} demo={demo} somenteLeitura={espiando}/>
    <div className="lv-kick" style={{margin:'18px 0 10px'}}>Conquistas</div>
    <div className="lv-badges">
      {badges.map((b,i)=><div key={i} className={'lv-badge'+(b.got?' got':'')}><span className="em">{b.em}</span><small>{b.lb}</small></div>)}
    </div>
  </div>);

  const avisosTab=(<div className="lv-wrap">
    <div className="lv-title" style={{marginBottom:4}}>Recados</div>
    <p className="lv-sub" style={{marginBottom:14}}>Fale direto com seu treinador — ele recebe no celular.</p>
    <Conversa studentId={stu.id} souAluno avisos={avisos} demo={demo} somenteLeitura={espiando}/>
  </div>);

  const contaTab=(<div className="lv-wrap">
    <div className="lv-title" style={{marginBottom:14}}>Minha conta</div>
    <div className="lv-card" style={{display:'flex',alignItems:'center',gap:14}}>
      <div className="lv-avatar" style={{width:56,height:56,fontSize:20}}>{initials(stu.name)}</div>
      <div><div style={{fontWeight:800,fontSize:17}}>{stu.name}</div><div className="lv-sub">{stu.gender==='F'?'Aluna':'Aluno'} · MF Performance</div></div>
    </div>
    <div className="lv-stats">
      <div className="lv-stat"><b>{stats.total}</b><span>{rotuloN(stats.total,'Treino')}</span></div>
      <div className="lv-stat"><b>{stats.prs}</b><span>{rotuloN(stats.prs,'Recorde')}</span></div>
      <div className="lv-stat"><b>{stats.streak}</b><span>Sequência</span></div>
    </div>
    <div className="lv-treino" style={{marginBottom:12}} onClick={()=>setAval(true)}>
      <span style={{width:3,height:30,borderRadius:2,background:'var(--lvrx)',flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Minha avaliação física</div><div className="lv-sub">Relatório e evolução</div></div>
      <span style={{color:'var(--lvt3)'}}>›</span>
    </div>
    <div className="lv-kick" style={{margin:'6px 0 10px'}}>O app no seu celular</div>
    <ConviteInstalar lv/>
    <div className="lv-kick" style={{margin:'6px 0 10px'}}>Notificações</div>
    <div className="lv-card">
      <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Avisos no celular</div><div className="lv-sub">Recebe os avisos do treinador na barra do sistema</div></div>
        <LvToggle rotulo="Avisos no celular" on={pushOn} busy={pushBusy} onClick={togglePush}/>
      </div>
      <div style={{height:1,background:'var(--lvbd)',margin:'14px 0'}}/>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Lembrete de treino</div>
            <div className="lv-sub">Um toque no dia que você ainda não treinou — e ele já diz qual é o treino</div></div>
        <LvToggle rotulo="Lembrete de treino" on={lembTreino} onClick={()=>salvarLembreteTreino(!lembTreino,periodo)}/>
      </div>
      {lembTreino&&<div style={{display:'flex',gap:7,marginTop:11,flexWrap:'wrap'}}>
        {[['manha','Manhã · 7h'],['tarde','Tarde · 12h'],['noite','Noite · 19h']].map(([v,lb])=>(
          <button key={v} className="lv-pill" style={{cursor:'pointer',
            border:'1px solid '+(periodo===v?'var(--lvsel)':'var(--lvbd)'),
            background:periodo===v?'var(--lvbrilho)':'transparent',
            color:periodo===v?'var(--lvsel2)':'var(--lvt2)'}}
            onClick={()=>salvarLembreteTreino(true,v)}>{lb}</button>))}
      </div>}
      {lembTreino&&<div className="lv-sub" style={{marginTop:9,fontSize:11.5,lineHeight:1.5}}>
        Nada chega se você já treinou no dia ou já fechou a meta da semana.</div>}
      <div style={{height:1,background:'var(--lvbd)',margin:'14px 0'}}/>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>Lembrete de beber água</div><div className="lv-sub">Toques ao longo do dia pra manter a hidratação</div></div>
        <LvToggle rotulo="Lembrete de beber água" on={agua} onClick={()=>toggleAgua(!agua)}/>
      </div>
      {/* caso que sobra: ligou os lembretes e depois desligou os avisos */}
      {!pushOn&&(lembTreino||agua)&&<div className="lv-sub" style={{color:'var(--gold)',marginTop:12,fontSize:11.5,lineHeight:1.5}}>
        Os avisos no celular estão desligados — enquanto estiverem, estes lembretes não chegam neste aparelho.</div>}
      {pushMsg&&<div className="lv-sub" style={{color:'#fca5a5',marginTop:12}}>{pushMsg}</div>}
      {!pushOn&&<div className="lv-sub" style={{marginTop:12,fontSize:11.5,lineHeight:1.5}}>No iPhone: abra pelo Safari, toque em Compartilhar → “Adicionar à Tela de Início” e abra o app por lá para ativar as notificações.</div>}
    </div>
    {!demo&&<button className="lv-btn" style={{background:'var(--lvc2)',color:'var(--lvt)',marginTop:6}} onClick={()=>sb.auth.signOut()}>Sair da conta</button>}
  </div>);

  const dietaTab=<DietaScreen profile={espiando?{...profile,id:contaAluno}:profile} demo={demo} onBack={()=>goTab('home')} onHidra={()=>setHydra(true)}/>;
  const content=tab==='dieta'?dietaTab:tab==='prog'?progTab:tab==='avisos'?avisosTab:tab==='conta'?contaTab:homeTab;
  return shell(<div className="lv-tabfx" key={tab}>{content}</div>,true);
}

/* ── Root: sessão + perfil + portão de assinatura ── */
function Root(){
  const [session,setSession]=useState(undefined);
  const [profile,setProfile]=useState(undefined);
  const qs=typeof location!=='undefined'?new URLSearchParams(location.search):new URLSearchParams();
  const agendar=qs.get('agendar');
  if(agendar)return <BookingPage coachId={agendar} studentId={qs.get('aluno')||null}/>;
  const ficha=qs.get('ficha');
  if(ficha)return <RemoteIntakePage coachId={ficha} studentId={qs.get('aluno')||null}/>;
  const tecnica=qs.get('tecnica');
  if(tecnica)return <TechIntakePage token={tecnica}/>;
  if(qs.get('aluno')==='1')return <StudentApp profile={{id:'aluno-demo',name:'Aluna Demo',role:'student',_demo:true}}/>;
  const demo=qs.get('demo')==='1';
  if(demo)return <App profile={{id:'demo',name:'Ana Trainer',role:'coach',perf_until:'2999-12-31',brand_name:'Studio Performance',cref:'012345-G/SP',phone:'(11) 99999-0000',instagram:'@studio.performance',logo_url:'',is_admin:false,_demo:true}} setProfile={()=>{}}/>;
  useEffect(()=>{
    if(!sb)return;
    let vivo=true;
    // sem rede o getSession pode pendurar tentando renovar o token:
    // depois do prazo seguimos com a sessão que já está no aparelho
    comPrazo(sb.auth.getSession(),8000)
      .then(({data})=>{if(vivo)setSession(data.session||sessaoGuardada()||null);})
      .catch(()=>{if(vivo)setSession(sessaoGuardada());});
    const {data:sub}=sb.auth.onAuthStateChange((_e,s)=>{if(!vivo)return;setSession(s||sessaoGuardada()||null);if(!s&&!sessaoGuardada())setProfile(undefined);});
    return()=>{vivo=false;sub.subscription.unsubscribe();};
  },[]);
  useEffect(()=>{
    if(!session)return;let alive=true;
    (async()=>{
      const copia=perfilGuardadoLer(session.user.id);
      try{
        let {data}=await comPrazo(sb.from('profiles').select('*').eq('id',session.user.id).maybeSingle(),10000);
        if(!data){await new Promise(r=>setTimeout(r,900));const r2=await comPrazo(sb.from('profiles').select('*').eq('id',session.user.id).maybeSingle(),10000);data=r2.data;}
        if(data){try{const b=JSON.parse(localStorage.getItem('mfp_brand_'+data.id)||'{}');data={...b,...data};for(const k of ['brand_name','cref','instagram','logo_url'])if(data[k]==null&&b[k]!=null)data[k]=b[k];}catch(e){}
          perfilGuardadoGravar(data);}
        if(alive)setProfile(data||copia||null);
      }catch(e){
        // sem internet: segue com a cópia local em vez de travar na abertura
        if(alive)setProfile(copia||null);
      }
    })();return()=>{alive=false;};
  },[session]);

  if(!CONFIGURED||!sb)return(<div className="center-screen"><div className="auth-wrap"><div className="auth-card"><div className="alert alert-warn"> Falta configurar o Supabase em <code>config.js</code>.</div></div></div></div>);
  if(session===undefined)return <div className="center-screen"><div className="spinner"/></div>;
  if(!session)return <AuthScreen/>;
  if(profile===undefined)return <div className="center-screen"><div className="spinner"/></div>;
  if(profile===null)return <BlockScreen title="Não foi possível carregar seu perfil">
    {navigator.onLine
      ?'Saia e entre novamente.'
      :'Você está sem internet e este aparelho ainda não tem uma cópia do seu perfil. Conecte uma vez para liberar o uso offline — não saia da conta, senão perde o acesso até voltar o sinal.'}
  </BlockScreen>;
  if(profile.role==='student')return <StudentApp profile={profile}/>;
  if(profile.role!=='coach')return <BlockScreen title="Perfil não reconhecido">Saia e entre novamente, ou fale com o suporte.</BlockScreen>;
  const sub=profile.perf_until;
  const expired=!sub||new Date(sub+'T00:00:00')<new Date(todayStr()+'T00:00:00');
  if(expired)return <BlockScreen title={sub?'Assinatura expirada':'Assinatura pendente'}>
    {sub?`Seu acesso ao MF Performance venceu em ${fmtDate(sub)}.`:'Sua conta ainda não tem acesso ao MF Performance.'} Para liberar, fale com o administrador.
  </BlockScreen>;
  return <App profile={profile} setProfile={setProfile}/>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<Root/>);
