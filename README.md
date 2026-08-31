# MF Performance

App web do treinador e do aluno: anamnese, avaliação física, avaliação técnica,
ficha de treino, nutrição, periodização, agenda e financeiro — **um app só**,
no `index.html` da raiz.

## Como abrir
Abra `index.html` num navegador moderno (Safari, Chrome) ou publique a pasta.
Os dados ficam no Supabase (ver `config.js`); o app funciona offline como PWA.

### No celular / iPad
Acesse a URL no navegador → Compartilhar → **Adicionar à Tela de Início**.

## Perfis
- **Treinador** — painel, alunos, avaliações, ficha de treino, nutrição,
  periodização, protocolos e a **Visão do aluno** (o app do aluno em só leitura,
  para conferir o que ele está vendo).
- **Aluno** — entra com o código de acesso que o treinador gera no perfil dele
  e vê treinos, dieta, evolução, avisos e check-ins.

## Fichas e ciclos prontos
O app já vem com seis fichas montadas (iniciante AB, ABC de hipertrofia, ABCD
avançado, upper/lower de força, ABC de emagrecimento em circuito e um de glúteo
e pernas) e quatro modelos de periodização. Na tela de Treino, **Usar ficha
pronta** cria as divisões com séries, repetições e descanso já preenchidos, e
**Salvar como modelo** guarda a ficha do aluno para reaproveitar em outro. Na
Periodização, **Salvar este ciclo como modelo** faz o mesmo com o macrociclo.

Os modelos que vêm no app ficam com `coach_id` nulo (todo mundo enxerga, ninguém
edita); os que o treinador salva ficam com o `coach_id` dele.

## Banco de dados
Os arquivos `.sql` da raiz são as migrações, na ordem em que foram aplicadas no
Supabase. `correcoes.sql` traz as últimas correções e `modelos-treino.sql` cria
as tabelas de modelos de ficha e de periodização.
