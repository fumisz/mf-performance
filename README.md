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
