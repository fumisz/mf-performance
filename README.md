# MF Performance

App web do treinador e do aluno: anamnese, avaliação física, avaliação técnica,
ficha de treino, nutrição, periodização, agenda e financeiro — **um app só**,
no `index.html` da raiz.

## Como abrir
Abra `index.html` num navegador moderno (Safari, Chrome) ou publique a pasta.
Os dados ficam no Supabase (ver `config.js`).

## Sem internet
O app abre e funciona no modo avião. Para isso **nada é carregado de fora**: o
React, o Babel e o `supabase-js` moram em `lib/` e são pré-guardados pelo
service worker. Fontes e desenhos de exercício ficam em cache depois da
primeira vez que carregam.

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

A biblioteca tem **214 exercícios**, todos com demonstração: 202 com o desenho
animado do free-exercise-db e as 12 técnicas avançadas com a instrução escrita.

Os modelos que vêm no app ficam com `coach_id` nulo (todo mundo enxerga, ninguém
edita); os que o treinador salva ficam com o `coach_id` dele.

## Banco de dados
Os arquivos `.sql` da raiz são as migrações, na ordem em que foram aplicadas no
Supabase. `correcoes.sql` traz as últimas correções e `modelos-treino.sql` cria
as tabelas de modelos de ficha e de periodização.
