# MF Performance — Avaliação Física

App web para registrar avaliações físicas e gerar relatórios comparativos para alunos.

## Recursos
- Cadastro de alunos com anamnese completa (saúde, medicamentos, lesões, nível de atividade)
- Avaliações: peso/altura/IMC, pressão arterial, dinamometria de preensão manual, bioimpedância, dobras cutâneas (cálculo automático de % de gordura — Jackson-Pollock 7) e circunferências
- Reavaliação com **relatório comparativo** (evolução entre avaliações)
- Relatório imprimível / PDF com logo
- Funciona **offline** (PWA — dá para adicionar à tela de início do iPad/celular)
- **Tranca por senha** definida no aparelho
- Todos os dados ficam salvos **localmente no dispositivo** (localStorage) — nada é enviado para a internet

## Como usar
Abra `index.html` em um navegador moderno (Safari, Chrome). Na primeira vez, defina uma senha.

### No iPad
Acesse a URL no Safari → botão Compartilhar → **Adicionar à Tela de Início**. O app abre em tela cheia e funciona offline.

## Observação de segurança
A senha é uma tranca local (guardada como hash apenas neste aparelho). Os dados sensíveis dos alunos nunca saem do dispositivo.
