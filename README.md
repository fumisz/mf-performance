# MF Performance

App web do treinador e do aluno: anamnese, avaliação física, avaliação técnica,
ficha de treino, nutrição, periodização, agenda e financeiro — **um app só**,
no `index.html` da raiz.

## Como abrir
Abra `index.html` num navegador moderno (Safari, Chrome) ou publique a pasta.
Os dados ficam no Supabase (ver `config.js`).

## Onde mexer no código
O código do app é o **`src/app.jsx`**. O que vai para o celular é o `app.js`,
gerado dele:

    node build.js

Rode isso sempre que mexer no `src/app.jsx` — o `app.js` não se atualiza
sozinho. O teste `sincronia.js` acusa se ele ficar velho.

O `build.js` também carimba o `APP_VERSION` em três lugares: no `?v=` do
`<script>` do `index.html`, no nome do cache do `sw.js` e no endereço do
`app.js` dentro da lista do worker. Isso existe porque o `index.html` vem
sempre da rede mas o `app.js` é servido do cache: sem o carimbo, uma versão
nova só aparecia na **segunda** abertura, e na primeira o HTML novo rodava
com o JS velho. Os três têm que bater — o `sincronia.js` confere. Para
publicar uma versão, mude o `APP_VERSION` e rode o build; não mexa no nome
do cache na mão.

Por que existe essa etapa: antes o JSX morava dentro do `index.html` e o
navegador compilava tudo na hora, com o Babel de 3 MB junto. Medido, o app
levava **9s num computador, 46s num celular mediano e 72s num simples** — a
cada abertura, porque compilar é CPU e o cache não ajuda. Compilando aqui,
caiu para **0,4s / 1,1s / 1,4s**, o pacote foi de 4,1 MB para 1,3 MB, e o
`unsafe-eval` saiu do CSP (ele só existia por causa do Babel).

## Sem internet
O app abre e funciona no modo avião. **Nada é carregado de fora**: React,
`supabase-js` e as **fontes** moram em `lib/` e são pré-guardados pelo service
worker. Só os desenhos de exercício vêm de fora, e ficam em cache depois da
primeira vez.

As fontes eram carregadas do Google por um `<link>` bloqueante de renderização.
Medido, numa rede que não responde isso segurava o app inteiro por **12,5s** —
React, Supabase, `app.js` e todas as consultas ao banco esperavam na fila. É o
cenário do wifi de academia com portal de login. Trazendo as fontes para dentro
(258 KB, só latin), essa etapa caiu para 27ms e a segunda abertura foi de
**13,3s para 1,1s**.

O `formulario_pre_inscricao.html` tinha o mesmo `<link>` bloqueante e é a
primeira página que um aluno novo abre. As fontes dele estão em
`lib/fontes-form.css`. A suíte `fontes.js` confere as duas páginas: todo
woff2 em 200, as famílias aplicadas e nenhum pedido ao Google.

## Notificações
O banco ficou dias com **zero** inscrições de push. Não era defeito de
entrega: os cron jobs disparam, a função responde 200 e o motivo vem escrito
na resposta — `{"sent":0,"motivo":"ninguem com push ligado"}`. Faltava
inscrição.

Dois defeitos reais apareceram no caminho, os dois da mesma família — a tela
dizendo "ligado" com base no aparelho em vez do servidor:

- o interruptor do aluno vinha de `pushManager.getSubscription()`. Ter
  inscrição no navegador não quer dizer que ela chegou ao banco; se o
  `push_salvar` falhasse, o aluno via "ligado" e nunca recebia nada. Agora a
  resposta vem do servidor, como já era no lado do treinador.
- dava para ligar o "lembrete de treino" com os avisos desligados: a
  preferência era guardada, o servidor mandava o push e ele não chegava a
  aparelho nenhum. Ligar um lembrete agora inscreve junto.

E a causa do zero: o interruptor existia só na aba Conta, onde ninguém entra.
O treinador tinha um cartão no painel; o aluno não tinha nada. Agora tem o
mesmo convite na tela inicial, dispensável.

A suíte `push.js` simula a API de push do navegador (o navegador de teste não
tem serviço de push de verdade) e cobre os dois papéis, incluindo o caso do
navegador inscrito com o banco vazio.

## Fichas prontas
São **46 modelos públicos**. Os 14 novos fecham o que faltava: emagrecimento
(era só um) e as frequências de 2x a 6x em corpo inteiro, upper/lower, push
pull legs e Arnold split.

Eles saem do `gera-fichas.js`, que **confere cada nome de exercício contra a
biblioteca antes de escrever o SQL** — se um nome não existir em
`train_exercicios`, o gerador para. É o que garante que todo exercício de todo
modelo abre com demonstração no app. Para acrescentar fichas, edite o gerador
e rode `node gera-fichas.js`; ele reescreve o `fichas-frequencia.sql`, que é
idempotente (não duplica o que já está lá).

O SQL guarda cada ficha numa linha compacta em vez de JSON:

    divisões separadas por  ~   ->  Nome da divisão ^ exercícios
    exercícios separados por |  ->  nome ; séries ; reps ; descanso ; tipo

O próprio SQL expande isso no jsonb da tabela. Em JSON o arquivo tinha 52 KB,
quase tudo chave repetida.

Uma observação de conteúdo: **o treino de emagrecimento não é um circuito para
suar.** Quem perde gordura é o déficit calórico; a musculação existe ali para
segurar a massa magra enquanto o peso cai, então é treino com carga e descanso
de verdade, com o cardio no fim. As versões "feminina" e "masculina" têm a
mesma estrutura — muda só a ênfase (glúteo e posterior de um lado, peito,
costas e ombro do outro), que é o que cada público costuma pedir.

Na tela de escolha há filtro por objetivo, por **dias na semana** e busca que
alcança o nome do exercício de dentro da ficha. O filtro de frequência lê o
nome, não o campo `dias`: o Arnold Split tem três divisões e é feito 6x por
semana, então filtrar por divisões enganaria.

## Tonelagem acumulada
Na tela de Progresso o aluno vê o peso que já moveu na vida: carga vezes
repetições de tudo que ele registrou, com o cardio e o "treinei fora" de fora,
porque ali não há carga.

É o único número do app que **só cresce** — por isso é o que traz de volta num
dia sem treino. E vem com uma equivalência, porque "47 toneladas" não diz nada
e "o peso de 4 ônibus" sim. Os pesos de referência são aproximados de
propósito (carro popular 1,2 t, ônibus 12 t) e o texto diz "mais ou menos".

A conta sai de `carga × reps` linha a linha do histórico. Isso significa que a
consulta do histórico **precisa pedir a coluna `reps`** — ela já foi esquecida
uma vez, e o número foi para produção zerado e invisível, sem barulho nenhum.
Por isso as colunas moram numa constante só, a `COLUNAS_HIST`, e o servidor de
mentira dos testes hoje obedece ao `select` (devolve só as colunas pedidas,
como o PostgREST de verdade), senão a próxima coluna esquecida passa verde.

## Retrospectiva do mês
Uma vez por mês o aluno tem motivo de abrir o app sem ser para treinar. Na tela
de Progresso aparece o mês fechado — treinos, tonelagem, recordes — e um botão
que monta a imagem 1080x1920 para os stories, com a marca e o @ do treinador
dentro.

Detalhes que decidem se ela presta:

- **Qual mês.** Nos sete primeiros dias a retrospectiva ainda é a do mês que
  fechou; depois disso é a do mês corrente, e aí o card diz "até aqui" para não
  mentir que o mês acabou.
- **Só quando tem o que contar.** Abaixo de três treinos no mês o cartão nem
  aparece: retrospectiva de dois treinos constrange em vez de motivar.
- **O salto de carga** compara o melhor do mês com o melhor de *antes* do mês.
  Quem começou agora não tem com o que comparar, e nesse caso entra a carga
  mais pesada do mês.
- **A quarta casa** mostra a maior sequência de dias seguidos; quando a
  sequência é 1 — que não é sequência nenhuma — mostra as séries do mês.
- Tudo sai do histórico que a tela já carregou: nenhuma ida a mais ao servidor.

## "O treino não está aparecendo"
Alunos com a ficha já montada abriam o app e liam **"Seu treinador ainda não
montou sua ficha de treino"**.

Não era o banco nem a RLS — simulando o aluno logado, ele enxerga as divisões e
os exercícios dele. Era a tela confundindo duas coisas diferentes: *ainda não
chegou* e *chegou e está vazio*.

O app guarda uma cópia local de cada consulta para abrir rápido e funcionar sem
internet (`lerJa`: mostra a cópia na hora, a rede confirma depois). Quem abriu o
app **antes** de o treinador montar a ficha ficou com uma cópia vazia guardada —
e a tela tratava essa cópia como resposta definitiva. Enquanto a rede não
respondesse (ou se ela falhasse), a mensagem afirmava algo falso, e a culpa caía
no treinador.

Agora são três estados separados: carregando, falhou (com **Tentar de novo**), e
vazio de verdade. A regra que ficou: **cópia local nunca fundamenta uma
afirmação negativa** — só a resposta fresca do servidor pode dizer que algo não
existe. A suíte `treinosumiu.js` reproduz o caso (semeia a cópia vazia no
IndexedDB e atrasa/derruba a consulta das divisões) e falha em 5 pontos na build
anterior.

O mesmo defeito estava em **mais quatro telas** — dieta, avaliação, meus treinos
e fotos de progresso. A raiz é o `lerCopia`: quando a rede falha e não há cópia,
ele devolve `{data:null}`, um erro disfarçado de "não tem nada". Ele já sinalizava
isso em `semCopia`, mas nenhum dos 32 pontos de chamada lia o campo.

Agora existe `semRede(r)` e um `CardVazio` único, usado pelas quatro telas: com a
rede caída ele diz que não conseguiu carregar e oferece tentar de novo; com a rede
de pé, diz o vazio de verdade. A suíte `semrede.js` derruba a tabela de cada tela,
uma por vez, e confere qual das duas frases apareceu — na build anterior as quatro
respondiam "culpou o treinador".

## Exercício sem peso
Uma aluna avisou pelo WhatsApp que achou o app confuso e foi treinar pela ficha
da academia. Não era vago: a ficha dela começava com **abdução de quadril com
elástico**, e o `concluir` tinha

    if(carga==null)return;

Sem digitar um peso, o botão "Concluir série" não fazia nada — sem aviso, sem
erro. Ela tocou, nada aconteceu, e desistiu. O mesmo valia para prancha, peso do
corpo, barra fixa com elástico, alongamento: toda ficha com exercício sem carga
tinha esse buraco. A coluna `carga` sempre aceitou nulo no banco; a trava era só
do app.

Agora peso em branco vale "sem carga": a série é concluída e gravada com
`carga: null`, só não vira recorde (não há com o que comparar), e o campo diz
`sem peso` em vez de `kg`. A suíte `sempeso.js` conclui uma série sem digitar
nada e confere que ela conta, é gravada e aparece marcada — na build anterior
ela falha, com o contador indo de 0 para 0.

A lição que fica: **botão que não responde é pior que botão que recusa.** Se uma
ação não pode acontecer, a tela precisa dizer por quê.

## Registrar tem de custar um toque
O registro é o produto: sem carga e repetição gravadas não existe progressão,
recorde, tonelagem nem painel. Então a resposta para "dá trabalho registrar"
nunca é registrar menos — é registrar mais rápido.

Duas coisas atrapalhavam:

**Exigir peso.** O `Concluir série` tinha `if(carga==null)return` e saía calado.
Exercício de elástico, peso do corpo, prancha ou alongamento não tem carga: o
botão simplesmente não respondia, sem aviso nenhum. Uma aluna abandonou o app
por isso — a abertura da ficha dela era uma abdução de quadril com elástico, e
o banco mostra zero séries registradas na conta dela. Campo em branco agora
vale "sem carga": a série é gravada, só não vira recorde.

**Campo vazio a cada série.** O quadro "Da última vez" já mostrava o que ele
tinha feito, mas os campos nasciam vazios — o aluno lia o número e digitava o
mesmo de novo, série após série. Agora o campo já vem preenchido com o que ele
fez **naquela mesma série** na sessão anterior. Quem repetiu a carga toca em
Concluir; quem subiu, corrige o número. O que está no campo é o que vai gravado,
então nada fica escondido. As suítes `sempeso.js` e `umtoque.js` cobrem os dois,
incluindo corrigir o número e limpar o campo.

## Botão que não faz nada
O defeito que fez uma aluna abandonar o app não foi uma tela feia: foi um botão
que não respondia. `if(carga==null)return` saía calado, e para ela o app estava
quebrado. Depois disso a mesma família apareceu em mais cinco lugares — handler
que sai calado porque falta um campo:

| Tela | Botão | Faltava |
|---|---|---|
| Diário de saúde | Registrar medição | glicemia |
| Meu ciclo | Salvar | data |
| Ficha do aluno | Adicionar (divisão) | nome |
| Ficha do aluno | Adicionar (exercício) | nome |
| Biblioteca | Adicionar | nome |

Todos passaram a nascer **desabilitados**, e ligam quando o campo é preenchido.
Desabilitado comunica sem precisar de mensagem e, principalmente, nunca deixa
alguém batendo num controle morto sem entender por quê. "Adicionar meta" ficou
como estava porque ele já responde com um alerta dizendo o que falta — botão que
responde não é botão morto.

A regra: **um controle visível ou faz o que promete, ou está desabilitado.** A
suíte `botaomorto.js` cobre os quatro que dá para alcançar pela navegação (o do
ciclo está corrigido no código, mas coberto por inspeção, não pela suíte).

## Treino interrompido
Fechar o app no meio do treino, o celular matar o app, acabar a bateria, treinar
no subsolo sem sinal — nada disso pode custar o treino do aluno. Três coisas
estavam erradas:

**A fila só escoava na virada de offline para online.** O `escoarFilaAluno`
estava preso ao evento `online`, que dispara apenas na *transição*. Quem treinou
sem sinal, fechou o app e abriu de novo já com internet nunca passava por essa
transição: as séries ficavam guardadas no aparelho para sempre e o treino nunca
chegava ao treinador. Agora escoa também ao abrir o app e ao voltar para ele
(`visibilitychange`).

**Reabrir o treino zerava a tela.** As séries estavam gravadas, mas a tela
voltava mostrando 0/24 e o aluno refazia tudo. Ao abrir uma divisão, o que já foi
feito hoje é remontado a partir do servidor **e da fila do aparelho** — quem
treinou sem sinal tem as séries só na fila, e elas contam igual. O que não dá
para casar é exercício trocado na hora: aí o histórico tem outro nome.

**A tela inicial oferecia "Iniciar treino" como se nada tivesse acontecido.**
Agora, quando existem séries de hoje e elas são menos que o total prescrito da
divisão, aparece um cartão "Treino em andamento — 8 de 24 séries" com
**Continuar treino**.

A suíte `retomar.js` cobre os três: conclui uma série, recarrega o app, confere
que ela continua marcada; recusa a gravação para simular a falta de sinal e
confere que a série entra na fila e ainda assim conta como treino feito; e
confere que abrir o app já online esvazia a fila. Na build anterior ela falha em
7 pontos.

## O que cada tela põe em primeiro lugar
Duas telas foram reordenadas pelo que a pessoa vai fazer nelas, não pelo que é
bonito mostrar.

**Início do aluno.** O treino ficava em quarto lugar, embaixo do banner de
instalação, dos anéis do dia e do bloco de avaliação física: para começar a
treinar ele rolava a tela passando pelo próprio percentual de gordura. Agora o
cartão do treino vem primeiro e o botão de começar cabe na primeira tela do
celular, sem rolagem — e existe teste que mede isso em pixel.

**Ficha do aluno, no celular do treinador.** Três coisas mudaram:

- o número de exercícios de cada divisão aparece **sem precisar abrir** (vem
  numa consulta só, junto com as divisões), e divisão vazia é dita com todas as
  letras — é a que o aluno abre e não acha nada;
- o formulário de nova divisão saiu do topo e virou botão: criar divisão é
  eventual, ver as que existem é o tempo todo;
- o `×` de apagar saiu de perto do nome, onde era maior que o "abrir" e o dedo
  errava. Agora mora dentro da divisão aberta, e o aviso diz o nome da divisão,
  o aluno, quantos exercícios vão junto e que não tem desfazer. Uma ficha já se
  perdeu com um "tem certeza?" genérico.

**Execução do treino.** É a tela onde o aluno passa os quarenta minutos, e três
coisas trabalhavam contra ele:

- o **"Finalizar treino" era o botão mais chamativo da tela** — verde neon, no
  meio do caminho — desde a primeira série. Agora ele só fica neon quando a
  última série cai; antes disso é cinza e diz quantas faltam ("faltam 2
  séries"). O botão que encerra o treino não pode ser o mais fácil de tocar sem
  querer;
- a **prescrição vinha menor que o rótulo dos campos**: o que ele precisa saber
  para fazer a série ("3×8-12") estava em cinza pequeno, abaixo de "PESO (KG)"
  na hierarquia. Agora vem em negrito e maior que o resto da linha;
- o **peso sugerido só chegava na 1ª série**. O quadro dizia "da última vez
  30×10" e o campo da 2ª série nascia vazio, porque a semente procurava o
  registro daquele índice exato. Quem fez 4 séries hoje e registrou 1 na vez
  passada repete a carga mais próxima que existir.

## O painel no celular
Todas as varreduras do lado do treinador rodavam em 1280px — e ele usa o app no
telefone, na academia. Foi assim que o "Pular" do descanso ficou meses fora da
tela. A suíte `coachcelular` abre as oito telas do menu em **390px** e mede o
que a régua pega: página que rola para o lado, botão fora da tela, elemento
vazando pela borda. Nenhuma das oito tinha vazamento — o layout estava bom.

O que a régua não pediu, o olho pegou: **tocar num aluno com a lista rolada
abria a ficha no meio**. Medido: rolagem 900 → 243, com o nome do aluno em
**-120px**, ou seja, acima da dobra e atrás da barra do topo.

Duas causas, as duas corrigidas:

- o app do aluno voltava ao topo ao trocar de aba (`goTab`), o do treinador
  não. Agora volta — num efeito depois da renderização, não dentro do `go`,
  porque o navegador reancora a rolagem quando o conteúdo novo entra;
- e a **conversa puxava a página**. O `scrollIntoView` da última mensagem só faz
  sentido quando a conversa É a tela, como na aba Recados do aluno. Na ficha do
  treinador ela é um cartão no meio de uma página longa, e esse scroll levava a
  página inteira até ela. Agora só desce quando a conversa é a tela.

## O repositório passa a reproduzir o banco
Doze funções tinham sido aplicadas direto no Supabase, em sessões diferentes, e
nunca entraram aqui: `painel_hoje`, `peso_situacao`, `alunos_duplicados`,
`aluno_fundir`, `periodizacao_atual`, `ficha_criar_de_perfil` e mais seis. Duas
consequências: **o repositório não reproduzia o banco do zero**, e a suíte
`contrato` não conseguia conferir nenhuma delas. Foi um buraco desse tamanho
que deixou o "Salvar diário de hoje" quebrado para todo aluno.

`funcoes-do-banco.sql` traz as doze, extraídas com `pg_get_functiondef` e
conferidas **byte a byte por md5** contra o que está rodando — não foram
transcritas à mão. Com elas no lugar, a suíte `contrato` sai de 41 para 55
confirmações e a lista de "sem .sql no repositório" fica vazia: toda RPC que o
app chama tem assinatura declarada e conferida.

## Séries gravadas duas vezes
Nove linhas do histórico eram a mesma série gravada duas vezes — o insert que
responde depois do prazo, o app achando que falhou e a fila regravando. Elas
inflavam tonelagem e contagem de recordes. Foram removidas mantendo a mais
antiga de cada par, com o conteúdo inteiro guardado antes em
`train_historico_backup_dup` (uma coluna `jsonb` com a linha como estava).

Outras treze colisões na mesma chave **não foram tocadas**: são séries com
`reps` diferentes no mesmo índice — provavelmente uma segunda passada no
exercício, não uma duplicata. Apagar qualquer uma das duas perderia registro
real. A gravação idempotente da 2026.10.06 impede que novas apareçam.

## O cronômetro de descanso
É o que os alunos mais elogiam — e era onde o **"Pular" ficava fora da tela**.
Os quatro controles dividiam a linha com o cronômetro e não cabiam: em 390px o
"Pular" saía pela direita, em 360px o pause também. Quem terminava o descanso
antes do tempo não tinha como seguir: esperava o relógio ou saía do treino.

O tempo subiu para a linha de cima e os quatro controles dividem a de baixo,
cada um com `flex:1`. Cabe a partir de **320px**, e a suíte **descanso** mede
os quatro em 320/360/390/430 — dentro da tela e com área de toque decente — e
confere que cada um faz o que promete: +30s soma, −15s tira, pausar para o
relógio de verdade, "Pular" encerra na hora. O pause ganhou rótulo
("❚❚ Pausar" / "▶ Voltar") em vez do símbolo sozinho.

O resto do cronômetro já estava certo e não mexi: ele conta **pelo relógio**,
não de segundo em segundo, então sobrevive ao celular no bolso; agenda a
notificação no service worker; e apita e vibra no fim.

## Treino em andamento, e o contrato com o banco
Três coisas que saíram de um print: o treinador abriu a ficha de um aluno às
18:14 e leu **"1 exercícios · 1 séries"**. Parecia que o app tinha registrado
uma série só. O banco diz outra coisa: a primeira série entrou 18:11 e o aluno
seguiu treinando até 18:50. **A tela estava certa e parecia quebrada.**

- a sessão de hoje com série registrada há menos de 1h30 agora aparece como
  **"treinando agora"**, com uma linha dizendo que os números ainda vão subir —
  e a tela **se atualiza sozinha** a cada minuto enquanto isso dura;
- **"1 exercícios · 1 séries"** virou "1 exercício · 1 série". A concordância
  entra pelo `plural()`, como no resto do app;
- **a mesma série virava duas linhas.** Numa internet de academia o insert
  responde depois do prazo, o app conclui que falhou, joga na fila e a fila
  grava de novo. Agora o `id` sai do app, não do banco, e a segunda gravação
  bate no id que já existe e é ignorada (`resolution=ignore-duplicates`, que
  não precisa de permissão de update). Vale para a série e para o "treinei fora
  do app".

**O contrato com o banco.** O "Salvar diário de hoje" estava quebrado para todo
aluno: o app chamava `diario_salvar(p_peso, p_sono, p_passos, p_fome, p_obs)` e
a função publicada era a de sete argumentos, de quando sono/fadiga/dor moravam
no Diário. O PostgREST resolve RPC pelo **nome** dos parâmetros — nome que não
bate é função que não existe. Nenhuma suíte pegava isso porque o mock responde
a qualquer `/rpc/<nome>` sem olhar os parâmetros.

`diario-fome.sql` adiciona a coluna `fome` e a assinatura nova (sem remover a
antiga: as duas convivem). E a suíte **contrato** confere, estaticamente, cada
`sb.rpc('x',{...})` do app contra as assinaturas dos `.sql` do repositório,
respeitando parâmetro com `DEFAULT`. Ela reprova esse defeito e passa com a
correção.

## O primeiro dia do treinador
A conta recém-criada — nenhum aluno, nenhuma avaliação, nenhum modelo — é como
todo treinador abre o app pela primeira vez, e era o outro estado que nenhuma
suíte visitava. Quatro telas que pedem um aluno tratavam a conta vazia como uma
busca que falhou, ou não diziam nada:

- **Treino** e **Periodização** mostravam um campo de busca e, abaixo dele,
  nada. Sem texto, sem saída;
- **Nutrição** dizia "Nenhum aluno encontrado" — a frase de uma busca que não
  achou, quando não houve busca nenhuma;
- **O mês** somava "0 de 0 alunos treinaram", que é conta feita em cima do
  vazio.

As quatro passam a dizer a mesma coisa: **"Nenhum aluno cadastrado ainda"**, uma
linha explicando por que aquela tela precisa de um aluno, e o botão **+ Novo
aluno**. O campo de busca some enquanto não existe ninguém para buscar — buscar
numa conta vazia não devolve nada nunca, e campo que não pode achar é da mesma
família do botão que não faz nada.

## O mês do treinador
O painel do dia diz o que está pegando fogo hoje. Faltava a pergunta do fim do
mês, e sem ela **o aluno que para de aparecer só é notado quando cancela**.

"O mês" (no menu) põe todos os alunos numa tela só, agrupados por urgência de
contato, não por número: **sem ficha** (abrem o app e não veem treino),
**não treinaram no mês**, **treinaram menos que no mês passado**, e
**mantiveram ou subiram**. Cada linha traz treinos, tonelagem, recordes e a
variação contra o mês anterior; tocar no aluno abre a ficha dele. No topo, o
mês inteiro somado — quantos dos alunos treinaram, treinos, peso movido e
recordes.

É uma consulta só (o histórico do mês e do anterior — a RLS já limita ao
coach), e dá para andar para trás mês a mês. Como ela enxerga só dois meses, a
tela **não diz "estreou"**: diz "nada no mês passado", que é o que o dado
sustenta — quem voltou depois de uma pausa longa não é estreante.

## O primeiro dia do aluno
Todo aluno começa sem ficha, sem histórico, sem foto, sem avaliação e sem
dieta. É o estado em que ninguém testa, porque as fixtures vêm cheias — e era
onde o app estava pior:

- ele **cobrava meta de treino de quem não tinha ficha**. "Faltam 4 treinos pra
  bater sua meta da semana", "Desafio da semana: 0/4", "0 de 4 treinos" na
  Frequência. O 4 era fixo no código, para todo mundo, e a cobrança caía em
  cima do aluno por uma coisa que depende do treinador. Agora a meta sai da
  ficha: quando o treinador marcou os dias das divisões, a meta é o que ele
  marcou; sem dias marcados fica nos 4 de antes (contar as divisões seria pior,
  porque quem tem A e B costuma treinar ABAB); **sem ficha não existe meta**, e
  as três telas dizem isso em vez de cobrar;
- o **anel do dia** contava o treino como pendência: "0 de 3" desde a primeira
  abertura, um anel que só o treinador fecha. Sem ficha ele sai da conta e o
  rótulo vira "sem ficha". Quem registra treino de fora do app fecha o anel do
  mesmo jeito, e aí ele volta a contar;
- "Seu treinador ainda não montou sua ficha de treino" era **a informação mais
  importante da tela em cinza pequeno**, menor que o convite de instalar o app,
  e sem saída. Virou um cartão com título e um botão: **Avisar meu treinador**,
  que cai na conversa e no celular dele como qualquer mensagem. Sem sinal,
  entra na fila e sobe depois.

## Copiar a ficha de um aluno para outro
Dar ao aluno novo a mesma ficha de outro custava três passos: salvar como
modelo, abrir fichas prontas, aplicar. Agora é um botão na tela de treino, ao
lado de "Usar ficha pronta".

Quem monta é o servidor (`ficha_copiar_de_aluno`, em `copiar-ficha.sql`), numa
transação só — pelo mesmo motivo do `ficha_aplicar_modelo`: fazer isso do
navegador era uma requisição por divisão e um lote por exercício, e cair no
meio numa internet de academia deixava o aluno com meia ficha. A RPC devolve
quantos alunos foram servidos, e **zero é tratado como erro** — dizer
"copiada" sem ter copiado seria mentira.

As divisões entram depois das que o aluno já tem, então nada é sobrescrito. O
vídeo colado em cada exercício vai junto; as cargas não, porque elas são o
histórico de quem treinou. A tela avisa isso antes de copiar.

## Antes e depois, e o parabéns de um toque
O aluno já tinha as duas fotos lado a lado na tela de Progresso. Agora ele monta
um card 1080x1920 com as datas, os dias entre elas e a variação de peso,
gordura e massa magra — com a marca e o @ do treinador na imagem, então o post
dele traz aluno novo. O card só existe no app do aluno: quem decide postar a
própria foto é ele, e o botão não aparece quando o treinador está olhando pela
visão do aluno.

Os números só entram quando existem duas avaliações de verdade, e o card não é
montado se alguma das fotos não carregar — não existe antes e depois com um
lado só. As fotos moram num balde público, então com `crossOrigin` o canvas não
fica "sujo" e o `toBlob` funciona.

No painel, quem treinou hoje aparece num bloco próprio com um botão que já
manda a mensagem pronta. Parabenizar tinha cinco passos (abrir o aluno, abrir o
compositor, escolher o tipo, escrever, enviar) e por isso quase não acontecia. O
texto muda com o dia, para não chegar sempre igual em quem treina toda semana, e
o envio fica marcado no aparelho para recarregar a página não oferecer de novo o
que já foi mandado.

A suíte `dopamina.js` cobre os dois. Ela roda com `serviceWorkers:'block'`: o
worker intercepta as imagens de fora e o `fetch` dele não passa pelas rotas do
Playwright, então ia para a rede de verdade, morria, e o worker devolvia
`undefined` — que o navegador mostra como `ERR_FAILED`. É por isso que as fotos
de exercício sempre apareceram quebradas nas capturas de tela.

## Português na tela
O `virgula.js` varre as telas dos dois papéis atrás de texto que não devia
chegar ao usuário: número decimal com ponto, valor cru do banco (a coluna
`tipo_serie` guarda `Valida` e `Preparatoria` sem acento — na tela vai pelo
`tierNome()`), plural de formulário (`3 treino(s)`), concordância errada
(`1 treinos`) e valor de JavaScript vazando (`undefined`, `null`, `NaN`).

A navegação dele **falha alto** de propósito. Ela já passava direto pela tela
do treino em execução sem avisar, e era justamente lá que o `Valida` cru
aparecia: um varredor que engole erro de navegação dá verde de mentira.

## Abertura rápida
Quem já abriu o app antes vê a tela **na hora**: o `lerJa()` entrega a cópia
local primeiro e atualiza sozinho quando o dado fresco chega. O `lerCopia()`
antigo continua para o que precisa esperar a rede.

A suíte `rede.js` mede a abertura com latência de celular e lista tudo que o
app pede antes de ficar utilizável, em quantas ondas sequenciais — foi ela que
achou o `aluno_link` sendo chamado em toda abertura sem ter código pendente.

As leituras que precisam aparecer offline passam por `lerCopia()`: tenta a rede
com prazo, guarda o resultado no IndexedDB e, sem rede, devolve a última cópia.
As gravações não se perdem: a avaliação do treinador entra numa fila e a série
do aluno em outra (`fila-aluno`), e ambas sobem sozinhas quando o sinal volta.

O rodapé da barra lateral mostra **Pronto para usar sem internet** quando o
aparelho já guardou tudo. Depois de uma atualização é preciso abrir o app uma
vez com internet para ele guardar os arquivos novos.

### No celular / iPad
Acesse a URL no navegador → Compartilhar → **Adicionar à Tela de Início**.
O próprio app convida a instalar: na tela de login, no painel do treinador e no
início do aluno aparece um cartão com o passo a passo do aparelho — e no
Android/Chrome ele instala com um toque só, usando o `beforeinstallprompt`
capturado ainda no `<head>`.

## Na hora do treino
- **Da última vez** — ao abrir um exercício, o app mostra a carga e as reps da
  sessão anterior daquele movimento e há quantos dias foi. É o número que diz se
  hoje é para manter ou subir.
- **Trocar exercício** — aparelho ocupado ou dor no ângulo: o aluno escolhe
  outro do mesmo grupo muscular (ou de qualquer grupo, se pedir). Séries, reps e
  descanso da ficha continuam iguais, e é o exercício trocado que vai para o
  histórico do treinador.
- **Aviso do descanso** — o cronômetro conta pelo relógio, então volta certo
  mesmo com a tela apagada, e o service worker solta uma notificação quando o
  descanso acaba, com o celular no bolso.
- **Treinei fora do app** — corrida, futebol, outra academia. Registra o dia sem
  carga nem série, para não quebrar a sequência nem sumir do painel do treinador.
- **Fotos de progresso** — na aba Progresso o aluno envia a foto do dia e vê a
  primeira ao lado da última. O treinador enxerga as fotos na ficha dele.
- **Lembrete de treino** — em Conta, o aluno liga e escolhe manhã, tarde ou
  noite. O aviso chega só no dia em que ele ainda não treinou, só se ele não
  bateu a meta da semana, e já diz qual é o treino de hoje pelo rodízio —
  "Hoje é B — Superiores". Quem decide o alvo é o banco
  (`lembrete_treino_alvos`); quem envia é a Edge Function `push`, chamada por
  três cron jobs.
- **Semana planejada** — o treinador marca em que dias cada divisão cai
  (segunda A, quarta B…). No dia marcado o app do aluno abre direto naquele
  treino, dizendo "marcado para hoje na sua ficha". Sem dia marcado, vale o
  rodízio livre de sempre.
- **Ver os exercícios antes** — o aluno espia o que vem no treino (exercícios,
  séries, reps e descanso) sem ligar o cronômetro, e começa dali se quiser.
- **Dor avisa na hora** — no feedback de fim de treino, dor 4 ou 5 dispara uma
  notificação para o treinador com a divisão e o que o aluno escreveu. O texto
  é montado pelo servidor a partir do que está gravado, nunca pelo aparelho do
  aluno. O feedback também entra na fila quando não há sinal — antes ele se
  perdia.
- **Meus treinos** — o diário de tudo que ele fez, sessão por sessão: dia,
  divisão, exercícios, séries, volume e recordes; toca para abrir e ver a carga
  de cada série. O treinador vê a mesma coisa na ficha do aluno, com a média de
  séries por treino — é isso que diz se ele está cumprindo a ficha ou cortando.

## Recados
A aba **Recados** do aluno é uma conversa de verdade: ele escreve, o treinador
responde, e cada um recebe no celular. Os avisos antigos aparecem na mesma
linha do tempo, então o aluno não precisa saber que são duas coisas.

No treinador, **Recados** no menu mostra quem está esperando resposta (com o
número ao lado), e a conversa fica na ficha do aluno. Mensagem sem sinal entra
na fila e sobe quando o sinal volta.

O texto do aviso no celular é montado pelo servidor a partir do que ficou
gravado — o aparelho só passa o id da mensagem, então ninguém usa o push do app
para mandar mensagem arbitrária para outra pessoa.

## No papel
Em **Treino → Imprimir ficha** sai a ficha inteira do aluno em uma folha, com
colunas em branco para ele anotar a carga de cada semana. Serve para quem não
tem celular bom ou prefere a prancheta.

Na ficha do aluno, **Comparar números** põe duas avaliações lado a lado com a
diferença de cada medida — verde é o lado bom daquela medida (cintura que desce
e massa magra que sobe contam como ganho). O antigo **Comparar fotos** continua.

## Convite do aluno
Em **Acesso do aluno**, o app gera o código e monta o convite pronto para
WhatsApp com o link `?codigo=XXXXXX`. O aluno toca no link e cai no cadastro já
marcado como Aluno, com o código preenchido — só escolhe e-mail e senha. O
código também fica guardado no navegador dele, então o vínculo acontece mesmo se
ele já tiver conta e escolher Entrar.

## Perfis
- **Treinador** — painel, alunos, avaliações, ficha de treino, nutrição,
  periodização, protocolos e a **Visão do aluno** (o app do aluno em só leitura,
  para conferir o que ele está vendo).
- **Aluno** — entra com o código de acesso que o treinador gera no perfil dele
  e vê treinos, dieta, evolução, avisos e check-ins.

## Fichas e ciclos prontos
O app vem com **32 fichas montadas** e quatro modelos de periodização. As fichas
cobrem programas da literatura (Starting Strength, StrongLifts 5x5, Golden Six,
Heavy Duty, GVT 10x10, 5/3/1, PHUL, PHAT, PPL, HST, FST-7), reabilitação de
joelho, coluna, quadril e ombro, treino de idoso com elástico, treino em casa,
mobilidade e uma linha de glúteo. Filtra por objetivo e busca por nome de
exercício.

Na tela de Treino, **Usar ficha pronta** cria as divisões com séries, repetições
e descanso já preenchidos, e **Salvar como modelo** guarda a ficha do aluno para
reaproveitar em outro. Na Periodização, **Salvar este ciclo como modelo** faz o
mesmo com o macrociclo.

**Alunos sem treino** (no menu, com o número ao lado) junta todo mundo que ainda
não tem ficha — aluno com conta e sem treino abre o app numa tela vazia. Marque
quantos quiser e aplique uma ficha pronta em todos de uma vez. Quem monta é a
RPC `ficha_aplicar_modelo`, numa transação só: ou a ficha entra inteira, ou não
entra nada. Ela também casa o nome do exercício com a biblioteca no servidor,
então a demonstração já aparece para o aluno.

A biblioteca tem **214 exercícios**, todos com demonstração: 202 com o desenho
animado do free-exercise-db e as 12 técnicas avançadas com a instrução escrita.

Os modelos que vêm no app ficam com `coach_id` nulo (todo mundo enxerga, ninguém
edita); os que o treinador salva ficam com o `coach_id` dele.

## A dieta sem sinal, e a meta de água que ninguém via
A dieta é um módulo inteiro do lado do aluno e era o único que nunca tinha tido
uma varredura própria. Três coisas apareceram, todas medidas antes de mexer:

**A tela levava 35 segundos para abrir sem sinal.** O cardápio vem em três
níveis — refeição, item, troca — e cada um espera o anterior. São três idas ao
servidor em fila, mais três leituras de check que iam cruas, sem prazo nenhum.
Num sinal ruim a biblioteca ainda tenta três vezes cada uma. O aluno ficava
olhando a roda girar com o plano inteiro já guardado no aparelho. Agora a tela
monta o cardápio da cópia local antes de falar com a rede e atualiza por trás:
**35 s viraram 1 s**, medido pela mesma sonda nos dois builds.

**Marcar refeição sem sinal se perdia calada.** Ia direto para o servidor, sem
prazo e sem fila: o visto aparecia na tela, a gravação morria, e no dia seguinte
o painel do treinador dizia "não marcou nenhuma refeição". Agora é o mesmo
contrato da série de treino — sem rede vai para a fila e sobe sozinho, e a tela
diz que está guardado no aparelho. A fila passou a saber desfazer também, porque
desmarcar é um `delete`, não uma gravação. Erro de verdade (que não é falta de
rede) tira o visto de volta e diz o que houve, em vez de mentir. Mesma coisa
para os suplementos e para a água.

**A meta de água era outra na tela da garrafa.** A tela da dieta e o anel do dia
liam a meta que o treinador escreveu no plano; a garrafa calculava a dela pelo
peso da última avaliação. Os 12 alunos com plano ativo têm meta escrita — 3, 3,5,
4 e até 4,5 L — e **nenhum deles estava vendo a sua**: onze caíam no padrão de
2,5 L e um via 2,6 em vez de 3,5. Quem tinha 4,5 L prescritos lia 2,5 e ganhava
"meta batida" com quase dois litros faltando. Agora a meta é uma só, a do plano;
o cálculo pelo peso ficou como reserva para quem ainda não tem plano.

A suíte `dieta.js` (24 conferências) fixa as três: ela reprovava no build
publicado antes de passar neste.

## Salvar o plano dizia que salvou quando não tinha salvado
Do outro lado da nutrição está o editor onde o treinador monta o cardápio.
Salvar um plano são seis idas ao servidor em sequência, sem transação. A ordem
era: gravar o plano, gravar as refeições, **apagar as que saíram**, gravar os
itens, apagar os que saíram, e assim por diante.

Uma sonda derrubou a rede no meio da sequência — a conexão que morre com o
salvar pela metade. O resultado, medido: a refeição foi apagada do servidor, os
itens não foram gravados, **nenhum aviso apareceu na tela e o botão escreveu
"✓ Plano salvo"**. As gravações não conferiam o `error` que o cliente devolve,
então uma falha passava calada.

E o dano não para no cardápio: no banco, `meals` tem cascata para `meal_items`
**e para `checkins`**. Uma exclusão que vaza de um salvar que falhou leva junto
o histórico de refeições que o aluno marcou.

Agora grava tudo primeiro e só depois apaga, cada passo com prazo, e o erro é
lido. Quebrando no meio, o pior que acontece é sobrar no plano algo que devia
ter saído — visível, e o próximo salvar resolve. Nada que o treinador escreveu
se perde, e nada do aluno é apagado. O aviso passou a dizer o que fazer:
"parte pode ter sido gravada, confira o cardápio e salve de novo".

A suíte `nutricoach.js` (34 conferências) cobre o editor inteiro — aluno sem
conta ativa, montar o cardápio pela base de alimentos, salvar e reler, apagar
refeição, lista de compras, criar plano do zero — e as quatro do salvar que
falha reprovam no build anterior.

Para isso o mock do servidor aprendeu a **guardar de verdade** o que foi
gravado (`R.persistir(true)` em `run-rota.js`): sem devolver a linha criada,
`.insert().select().single()` volta nulo e "criar plano" nunca sai da tela
vazia. Fica desligado por padrão, porque as suítes antigas foram escritas com o
mock engolindo as gravações.

E a `treinosumiu` deixou de ser instável. A causa não era tempo: no passo da
rede lenta o app guarda as divisões na cópia local, uma gravação que ninguém
espera, e ela caía por cima da cópia vazia que o teste tinha acabado de
escrever. O aparelho ficava com o treino guardado e a tela mostrava "Iniciar
treino" — certíssimo, e o teste reprovava o app por isso. Agora ele confere que
a cópia ficou vazia antes de seguir: seis rodadas seguidas verdes, contra
metade antes.

## O relatório no papel
O relatório de avaliação é o único documento que sai do app assinado pelo
treinador e vai para a mão do aluno. Ele estava entregando que foi montado por
máquina, de cinco jeitos:

**A capa flutuava numa moldura branca.** A folha tinha margem de 11 mm e a capa
é escura, então ela imprimia como um retângulo preto no meio de uma borda
branca — cara de slide colado na página. Agora a capa usa uma página nomeada
(`@page capa{margin:0}`) e sangra até a borda; o miolo mantém a margem dele,
inclusive nas quebras. A altura sai da própria folha, com 6 mm de folga medida:
com a folha cheia a capa passava alguns milímetros, vazava uma faixa preta para
a página seguinte e nascia uma folha a mais.

**Ponto decimal no meio do português.** E misturado: "IMC 22,1" e "Peso 60.1 kg"
na mesma coluna, porque alguns valores passavam pelo `fmt()` e outros iam crus.
Todas as diferenças saíam com ponto, sem exceção, porque eram número do
JavaScript concatenado direto. Agora todo número da tabela passa pelo `numBR`.

**Uma diferença absurda.** "Taxa metabólica basal 1.353 kcal ▼-1342.6". A conta
recebia o valor **já formatado**: `parseFloat("1.353")` lê 1,353, e 1,353 menos
1.344 dá −1.342,6. O número passou a ir cru para a `Row`, que formata depois —
a linha virou "1.353 kcal ▲+9".

**Um título de seção sem nada embaixo.** "Perfil & anamnese" aparecia sempre que
o aluno tinha objetivo preenchido, mas objetivo não é uma das linhas da tabela.
Aluno só com objetivo abria a seção e a tabela vinha vazia. A condição passou a
ser exatamente a das linhas.

**Frases emendadas com vírgula.** "A conduta deve priorizar força, performance."
Virou "força e performance". Sem mudança, a coluna de diferença escrevia um "0"
solto, que se lê como se o valor fosse zero; agora é "—".

A suíte `relatorio.js` (10 conferências) cobre isso: varre o documento inteiro
atrás de ponto decimal (respeitando o ponto de milhar, que é legítimo), cobra
que nenhuma seção tenha título sem conteúdo, que nenhuma diferença seja maior
que o próprio valor, e mede a capa contra a folha na mídia de impressão.

## O financeiro dizia que o aluno pagou
O cartão Financeiro da ficha do aluno é a única tela do app que fala de
dinheiro: mensalidade, dia do vencimento e o "marcar como pago" do mês. As duas
gravações engoliam qualquer erro — `try{ await sb.rpc(...) }catch(e){}` e segue
o baile. Medido com a rede derrubada:

- **"Marcar como pago" virava "✓ Pago"** com nada tendo saído do aparelho. O
  treinador confia na tela e não cobra.
- **Salvar a mensalidade fechava o formulário** mostrando "R$ 300,00", como se
  tivesse gravado.

Agora as duas conferem o erro e têm prazo. O "pago" volta ao que era quando a
gravação falha — a tela não pode afirmar o que não gravou — e o formulário
continua aberto com o aviso do que houve. A Agenda, ao lado, já fazia isso
certo desde sempre: confere o `error` de cada gravação e só mexe na tela quando
deu certo. Era só o financeiro fora do padrão.

De quebra, o mês saía **"Setembro De 2026"**: o `text-transform:capitalize` do
CSS põe maiúscula em toda palavra, e em português o "de" fica minúsculo. Trocado
por uma função que levanta só a primeira letra, aqui e nos dias da agenda.

A suíte `dinheiro.js` (11 conferências) cobre definir, salvar, marcar pago, e as
duas com a rede caída.

## O papel de anotar a carga
A ficha impressa sai com as colunas **Sem 1 a Sem 4** para o aluno anotar a carga
de cada semana à mão — era a razão de existir dela. Só que as colunas não tinham
linha nenhuma: quatro títulos flutuando sobre espaço vazio. Dava para ler, não
para escrever. Agora são células com risco à esquerda, linha embaixo e altura
que cabe um número de caneta.

## Números
Tudo que aparece na tela usa vírgula decimal (24,3 e não 24.3), como se escreve
em português. Só exibição: nenhum campo de entrada nem exportação passa pelo
`fmt()`. A suíte `virgula.js` varre as telas do treinador e do aluno procurando
decimal com ponto no texto visível — se alguém puser um número cru numa tela
nova, ela acusa.

## Banco de dados
Os arquivos `.sql` da raiz são as migrações, na ordem em que foram aplicadas no
Supabase. `correcoes.sql` traz as últimas correções e `modelos-treino.sql` cria
as tabelas de modelos de ficha e de periodização.
