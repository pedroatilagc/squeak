# Revisão de identidade visual e navegação

Este documento registra a auditoria da interface anterior, a direção nova e as decisões de navegação. Tudo aqui está
implementado em `apps/desktop/src` (ver "Onde está no código").

## 1. Auditoria: o que fazia o app parecer um clone do Discord

Levantado no código anterior (`Shell.tsx` e `styles.css` antes da mudança):

| # | Elemento | Por que denuncia a cópia |
|---|---|---|
| 1 | Pilha vertical de ícones redondos de servidor (72 px), com raio que muda de 24 para 14 px no hover e pílula branca à esquerda no ativo | É a assinatura visual do Discord. |
| 2 | Grade fixa de quatro colunas (72 / 264 / conteúdo / 248) igual em toda tela | Toda tela tinha a mesma composição, sem hierarquia própria. |
| 3 | Lista de membros sempre aberta à direita, agrupada em "Administradores / Online / Offline" com bolinha de status | Estrutura idêntica; ocupava espaço mesmo quando irrelevante. |
| 4 | Canais com `#` e 🔊, categorias em caixa-alta, barra verde "Voz conectada" e barra do usuário com microfone/engrenagem embaixo à esquerda | Mesmo vocabulário e mesma disposição. |
| 5 | Acento azul-arroxeado (`#6c7cff`/`#5463e8`), fundos cinza-azulados em quatro níveis, botão "+" verde para criar servidor, selos vermelhos | Mesma paleta de reconhecimento imediato. |
| 6 | Mensagem com avatar à esquerda, nome e hora, hora no gutter ao passar o mouse, barra de ações flutuante e "pílulas" de reação | Mesmo padrão de leitura. |
| 7 | Bordas em quase todas as regiões e painéis com fundos quase iguais | Visual "de caixas"; a hierarquia dependia de linhas, não de superfície. |
| 8 | Emojis como ícones de interface (🔊 🎙 👑 🖥) | Inconsistente e genérico. |

Também havia dois defeitos reais:

- **Seletor de tela quebrado.** O modal era renderizado dentro de `.voice-controls`, e a regra `.voice-controls button`
  (48×44, `border-radius: 22px`) vazava para os botões "Telas", "Janelas", "Atualizar lista" e para as miniaturas,
  produzindo círculos com texto sobreposto. Corrigido: o modal agora é um *portal* para `document.body` e a regra dos
  controles passou a `.voice-controls > button`.
- O próprio usuário aparecia "0 online" até o servidor enviar presença; agora conta como online com o WebSocket aberto.

## 2. Direção

**Developer Collaboration Workspace**: comunicação, andamento do código e produtividade lado a lado. A conversa continua
essencial, mas deixou de dominar todas as telas.

Referências, e o problema que cada uma resolveu aqui:

| Referência | Decisão tomada |
|---|---|
| Linear | Barra lateral sem peso, seletor de workspace no topo, "folha" de conteúdo elevada em vez de bordas, densidade 13 px. |
| Raycast | Paleta de comandos `Ctrl+K` com busca sem acento, atalhos exibidos, movimento curto (110–180 ms). |
| Slack | Canais agrupados por categoria, conversa e chamadas no mesmo contexto, chamada que continua ao navegar. |
| GitHub | Página de perfil, calendário de contribuições com as cores/níveis reais da API, timeline de atividade, cartões de PR. |
| Jira | Estados e responsáveis como dados de primeira classe; contratos preparados para projetos/issues (`docs/INTEGRATIONS.md`). |

## 3. Navegação

```
┌ barra lateral (chão) ──┬ topbar: localização › área › canal      [ Buscar ou executar  Ctrl K ] ┐
│ [Workspace ▾]   [🔍]   ├────────────────────────────────────────────────────────────┬────────────┤
│ Início                 │  folha de conteúdo (elevada, sem bordas internas)          │ painel     │
│ Mensagens              │  • Início: conversas, chamadas, equipe, feed, PRs, GitHub  │ opcional   │
│ Chamadas               │  • Mensagens: chat (Markdown, código)                      │ (membros,  │
│ Atividade              │  • Chamadas: sala/lobby; a ligação sobrevive à navegação   │ Ctrl+\)    │
│ Pull requests          │  • Atividade / Pull requests do workspace                  │            │
│ ───────────            │  • GitHub: perfil, contribuições, atividade, meus PRs      │            │
│ conteúdo contextual    │  • Integrações                                             │            │
│ ───────────            │                                                            │            │
│ GitHub · Integrações   │                                                            │            │
│ [usuário]  ⚙  ⎋        │                                                            │            │
└────────────────────────┴────────────────────────────────────────────────────────────┴────────────┘
```

- **Workspaces** (antes "servidores") ficam num seletor com busca e favoritos (estrela, guardada no navegador).
  Não há mais pilha de ícones. O menu do workspace reúne convidar, novo canal/categoria, repositórios do GitHub e sair/excluir.
- **Barra lateral contextual.** Nas áreas do workspace mostra a árvore de canais (texto e voz, com quem está na sala).
  Em GitHub mostra Perfil / Atividade / Meus PRs; em Integrações, uma nota. O bloco "pessoal" (GitHub, Integrações) é sempre visível.
- **Composições diferentes por área**: o chat usa coluna única com painel opcional; Início usa grade de painéis;
  Atividade usa linha do tempo larga com barra de filtros; GitHub usa duas colunas (calendário + timeline / linguagens + repositórios); Chamadas usa o palco próprio.
- **Painel lateral opcional**: só no chat, alternado por botão ou `Ctrl+\`; a preferência fica salva.
- **Largura total**: gutter `clamp(1rem, 2.6vw, 3rem)`, sem coluna central estreita.

## 4. Sistema visual

Arquivos em `apps/desktop/src/design/`.

- **Tokens** (`tokens.css`): superfícies `--s0…--s4` por luminosidade, hairlines translúcidas, texto `--fg/--fg-2/--fg-3`,
  acento único **brasa** `#ff8a3d`, semânticas separadas por matiz (ok verde, warn amarelo, bad rosa-vermelho, info azul),
  escala de espaço de 4 px, raios 4/6/10, sombra só em popovers/modais, movimento 110/180 ms com `ease` próprio e
  `prefers-reduced-motion`.
- **Tipografia**: Segoe UI Variable (texto e display) e Cascadia Code (código); escala 11,5 / 12,5 / 13,5 / 15 / 20 / 28 px.
- **Hierarquia sem bordas**: chão (`--s0`) → folha (`--s1`) → painel (`--s2`) → hover (`--s3`) → pressionado (`--s4`).
  Linhas só separam regiões, não objetos.
- **Estados**: hover, `:focus-visible` com contorno do acento, desabilitado, selecionado (`aria-current`, `aria-selected`, `aria-pressed`).
- **Iconografia**: conjunto próprio de ~45 ícones de traço (`design/Icon.tsx`), sem emoji nos controles novos e sem dependência.
- **Componentes**: `StateCard`, `LoadingBlock`, `IssueView`, `Async` (`design/states.tsx`) implementam os estados
  loading, vazio, erro, sucesso, não autorizado e desconectado de forma única para todas as telas de integração.

Evitado de propósito: gradientes decorativos, cartões sem função, bordas em tudo, dashboards genéricos.

## 5. Arquitetura do front

```
src/
  domain/      regras puras e contratos tipados (github.ts, contributions.ts, commands.ts) + testes
  infra/       githubApi.ts: única porta para as rotas de integração
  app/         contexto de navegação e useResource (carregamento + estados de erro)
  features/    github/, integrations/, workspace/ (componentes de apresentação)
  design/      tokens, CSS, ícones, estados
  components/  chat, voz, configurações (preservados)
```

Chat, Markdown, Shiki, salas de voz, câmera, compartilhamento de tela e o módulo de mídia nativo **não foram alterados** em lógica;
só ganharam a casca nova e o CSS portado.

## 6. Limites desta etapa

- "Projeto" como filtro do feed equivale a repositório. Projetos de verdade chegam com a integração do Jira.
- Entradas em chamadas não são persistidas, então não entram na timeline do workspace (só aparecem ao vivo na barra lateral).
- O visual foi conferido no navegador (Vite). O app Tauri em si e o seletor de tela corrigido não foram executados nesta sessão.
