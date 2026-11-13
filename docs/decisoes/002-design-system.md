# ADR 002 — Design system unificado do Squeak

| | |
|---|---|
| **Status** | Aceito |
| **Data** | 2026-11-12 |
| **Autores** | Pedro, Samuel |
| **Revisão** | Samuel, no PR da issue #3 (seção 7) |
| **Fecha** | issue #3 |
| **Depende de** | issue #7 (reorganização do repositório), para o pacote `packages/design-tokens` |
| **Validar na Sprint 1** | pontos 1, 2, 3, 8, 10, 11 e 14, ao aplicar o design system no app (seção 7.3) |

## Sumário

- **Decisão:** o design system do produto inteiro (app desktop e landing) passa a ser o da landing page (`landing-page/src/styles/tokens.css`).
- **Tema do app:** por enquanto o app desktop usa **só o tema escuro**. O tema claro existe na landing e fica **planejado** para o app, sem data.
- **O que muda no app:**
  - o acento laranja "brasa" dá lugar ao amarelo do pato;
  - Segoe UI e Cascadia saem, e entram Bricolage Grotesque, Geist e JetBrains Mono;
  - as superfícies passam para o azul-noite da marca.
- **O que fica do app:**
  - a hierarquia por superfícies em vez de bordas;
  - a grade de 4 px;
  - a escala tipográfica fixa e densa (corpo de 13,5 px);
  - as medidas de layout, os ícones e os componentes de estado.
- **Revisão:** os 16 pontos em aberto foram decididos pelo Samuel (seção 7). Entram tokens novos: `--text-tertiary`, `--border-control`, três superfícies interativas, `--code-function` e `--code-constant`, e `--gutter` do app vira `--app-gutter`. Sete pontos ficam para validação visual na Sprint 1.
- **Próximo passo:** aplicar na Sprint 1, na issue "Aplicar o design system unificado no app". Hoje a fonte única é o `tokens.css` da landing. Depois da issue #7, ela vira `packages/design-tokens`.

**Fontes desta especificação:**

| Arquivo | Uso neste ADR |
|---|---|
| `landing-page/src/styles/tokens.css` | Valores de todos os tokens que já existem |
| `landing-page/docs/brand.md` | Regras de uso |
| `landing-page/docs/alinhamento.md` | Decisões pendentes |
| `apps/desktop/src/design/tokens.css` e `docs/REDESIGN.md` | Sistema atual do app, só para comparar e migrar |
| Revisão do Samuel no PR da issue #3 | Decisões e valores dos tokens novos (seção 7) |

Nenhum valor foi inventado. Os tokens novos usam só os valores que a revisão definiu. O que a revisão não definiu aparece como **a definir**.

---

## Prévia visual

**Para abrir localmente:** [`docs/decisoes/002-design-system-preview.html`](002-design-system-preview.html). Abra direto no navegador, sem build. As fontes vêm do Google Fonts, então é preciso internet.

Como a prévia foi montada:

- Ela importa por caminho relativo `landing-page/src/styles/tokens.css` e `apps/desktop/src/design/tokens.css`. Do arquivo do app, usa só a escala `--t-*`, a grade `--sp-*`, `--r-1`, as medidas de layout e os tokens antigos do "antes".
- Os tokens novos da revisão ainda não existem em `tokens.css`. Eles ficam num único bloco, `<style id="tokens-da-revisao">`, no topo do HTML: `--text-tertiary`, `--border-control` e `--shadow-pop`. Esse bloco sai do HTML quando os tokens entrarem em `tokens.css`, na Sprint 1.
- Fora esse bloco, o HTML não tem valor de cor, fonte ou espaço escrito à mão. A única outra cor literal são os dados fictícios do calendário de contribuições, que imitam o que a API do GitHub devolve (seção 7.3, ponto 14). Os hex e as razões de contraste exibidos são lidos do CSS quando a página abre.
- Ela mostra só o tema escuro.

As capturas abaixo foram feitas em Chrome headless a 2×, no Windows. As capturas dos pontos a validar estão na seção 7.3.

### Paleta

Marca, superfícies, texto com contraste calculado sobre cada superfície (incluindo `--text-tertiary`), bordas contra o mínimo de 3:1, semânticas e tiers de insígnia.

![Paleta: cores de marca, superfícies aninhadas, tabelas de contraste do texto e das bordas, cores semânticas e tiers de insígnia](assets/002/01-paleta.png)

### Tipografia

As quatro famílias com exemplos reais e a escala fixa do app (seção 5.1), com o corpo em 13,5 px.

![Tipografia: Bricolage Grotesque, Geist, JetBrains Mono e Pixelify Sans, e a escala --t-xs a --t-2xl](assets/002/02-tipografia.png)

### Componentes básicos

Botão primário (repouso, hover em `--duck-highlight` e desabilitado), botão secundário com o foco por teclado, campo de texto com `--border-control`, insígnias por tier, barra de XP, link e branch, toast de XP com `--shadow-pop`, status e contagem.

![Componentes básicos na densidade do app](assets/002/03-componentes.png)

### Tela principal do app

A casca atual do app (`Shell.tsx` e `REDESIGN.md`) com os tokens novos:

- barra lateral com a navegação, os canais de texto e voz, e o usuário com o nível;
- topbar com a localização e a paleta de comandos;
- feed de atividade e card de PR na área de conteúdo.

O texto terciário usa `--text-tertiary` sobre `--bg` e `--surface`, e `--text-secondary` nos painéis elevados. Os dados são fictícios.

![Mock da tela Início do app desktop no estilo novo](assets/002/04-app.png)

### Antes e depois

A mesma marcação e o mesmo CSS, mudando só o mapa de tokens.

- À esquerda, os tokens atuais do app: laranja em tudo, cinza neutro e Segoe UI.
- À direita, o design system unificado.
- O "antes" usa Segoe UI Variable Text também nos títulos, porque nesta página o `--font-display` do app é sobrescrito pelo da landing.

![Antes e depois: a mesma tela com os tokens atuais do app e com os tokens da landing](assets/002/05-antes-depois.png)

**O que a prévia ainda assume, porque a revisão não definiu o valor:**

| Elemento | Usado na prévia | Token que vai substituir |
|---|---|---|
| Item ativo da barra lateral | `--surface-elevated` | Superfície interativa "selecionado" (ponto 4) |
| Célula vazia do calendário | `--border` | Superfície interativa "fundo" (ponto 4) |
| Nomes de função e números no código | `--text` | `--code-function` e `--code-constant` (ponto 16) |
| Rampa laranja do calendário | `--sq-o0` a `--sq-o3` | Rampa definida na Sprint 1 (ponto 14) |

---

## 1. Contexto

**Hoje existem dois design systems que não conversam.** O app desktop e a landing nasceram em momentos diferentes e tomaram decisões opostas em quase todos os eixos.

| Eixo | App desktop (`apps/desktop/src/design/tokens.css`) | Landing (`landing-page/src/styles/tokens.css`) |
|---|---|---|
| Acento | Laranja "brasa" `#ff8a3d`, único | Amarelo do pato `#FFC83D` (primária). O laranja `#FF8A3D` é só progressão. |
| Fundo e superfícies | Cinza neutro quase preto, de `#0b0d0f` a `#262c33` (5 níveis) | Azul-noite, de `#0F1420` a `#212839` (3 níveis), com borda `#2C3448` |
| Bordas | Hairlines translúcidas, `rgba(255,255,255,.07/.13)` | Borda sólida `--border` |
| Texto, display | Segoe UI Variable Display | Bricolage Grotesque |
| Texto, corpo | Segoe UI Variable Text | Geist |
| Mono | Cascadia Code | JetBrains Mono |
| Escala tipográfica | Fixa: 11,5 / 12,5 / 13,5 / 15 / 20 / 28 px | Fluida com `clamp()`, de `--step--1` a `--step-5` (até 10 rem) |
| Raios | 4 / 6 / 10 px e pílula | 6 / 12 / 20 px |
| Movimento | `cubic-bezier(.2,.7,.2,1)`, 110 e 180 ms | `cubic-bezier(0.22,1,0.36,1)` e mola, 160 e 320 ms |
| Temas | Só escuro | Escuro (padrão) e claro |
| Mascote e marca | Não aparecem | Squeak, logo, avatares, paleta pixel, tiers de insígnia |
| Nome nos comentários do código | "Squak" | "Squeak" |

**O problema de manter os dois:**

1. **A marca se quebra na passagem.** Quem chega pela landing (amarelo, pato, Bricolage) abre um app laranja em Segoe UI e não reconhece o produto.
2. **A mesma cor diz coisas diferentes.** No app, o laranja é ação primária (botão, foco, seleção). Na landing, o laranja é só progressão, como XP e level up. Quando a reputação chegar ao app, um botão laranja e uma barra de XP laranja vão competir.
3. **Trabalho em dobro.** Toda decisão de cor, contraste ou estado precisa ser tomada, documentada e testada duas vezes.
4. **O app não tem as peças de marca que o produto vai precisar.** Faltam tiers de insígnia, cores do mascote, avatares e paleta pixel do escritório virtual, e tudo isso já existe na landing.

---

## 2. Decisão

1. **O design system do produto inteiro, app desktop e landing, passa a ser o que está hoje na landing page.**
   - Tokens, regras de uso, tipografia e mascote seguem `landing-page/src/styles/tokens.css` e `landing-page/docs/brand.md`.
   - O sistema atual do app é substituído. Dele ficam só as ideias que não conflitam com esta decisão (seção 5.4).
   - Os tokens novos que a revisão criou (seção 7) entram primeiro no `tokens.css` da landing, como qualquer cor nova (regra 7 da seção 4).
2. **Por enquanto, o app desktop terá somente o MODO ESCURO dessa paleta.**
   - O tema escuro da landing (seção 3.2) é o tema oficial do app.
   - O tema claro continua na landing e fica documentado como **planejado para o app, sem data** (seção 3.3).
   - O app não implementa troca de tema nesta etapa.

Até existir `packages/design-tokens` (issue #7), **a fonte de verdade é `landing-page/src/styles/tokens.css`**. O app copia os tokens dali e não cria cor própria.

---

## 3. Especificação do design system

Os valores abaixo vêm de `landing-page/src/styles/tokens.css`, exceto os marcados como **novo**, que vêm da revisão (seção 7). As razões de contraste foram **calculadas** a partir dos hex, pela fórmula de luminância relativa da WCAG 2.

### 3.1 Cores de marca

As cores de marca são iguais nos dois temas.

| Token | Valor | Papel |
|---|---|---|
| `--duck-yellow` | `#FFC83D` | **Primária e recompensa.** CTA, ação principal, `main` no grafo do git e insígnia de ouro. |
| `--beak-orange` | `#FF8A3D` | **Progressão e XP.** Tudo que sobe, enche ou evolui: XP, level up, streak, barras de progresso, calendário de contribuições. |
| `--pond-blue` | `#4DA3FF` | **Links, informação e branches.** No grafo, branch é azul e `main` é amarela. |

### 3.2 Tema escuro (oficial do app)

O seletor na landing é `:root, [data-theme='dark']`, com `color-scheme: dark`.

**Superfícies, texto e bordas**

| Token | Valor | Papel | Contraste sobre `--bg` / `--surface` / `--surface-elevated` |
|---|---|---|---|
| `--bg` | `#0F1420` | Fundo base (o "chão") | — |
| `--surface` | `#171D2B` | Superfície: cartões, painéis, a "folha" | — |
| `--surface-elevated` | `#212839` | Superfície elevada: painéis, popovers, menus e modais | — |
| `--border` | `#2C3448` | Borda e divisória de região | 1,5:1 / 1,4:1 / 1,2:1 |
| `--border-control` | `#6B7693` | **Novo.** Borda de input, select e textarea, e só deles (ponto 11) | 4,1:1 / 3,7:1 / 3,3:1 |
| `--text` | `#F2F4F8` | Texto principal | 16,7:1 / 15,3:1 / 13,4:1 |
| `--text-secondary` | `#9AA3B5` | Texto secundário e metadados | 7,3:1 / 6,6:1 / 5,8:1 |
| `--text-tertiary` | `#7F899E` | **Novo.** Placeholder e texto apagado. **Só sobre `--bg` e `--surface`.** Em popover e modal, usar `--text-secondary` (ponto 5). | 5,2:1 / 4,8:1 / 4,2:1 (não usar) |

**Superfícies interativas (novas, ponto 4).** A revisão decidiu três tokens, mas não definiu nomes nem valores. Os nomes abaixo são proposta.

| Token (nome proposto) | Valor | Papel |
|---|---|---|
| `--surface-control` | **a definir** | Fundo normal de elementos interativos: botão neutro, chip, `.kbd`, ícone de estado, célula vazia do calendário |
| `--surface-hover` | **a definir** | Item sob o cursor |
| `--surface-selected` | **a definir** | Item selecionado ou ativo: navegação, canal, aba, item da paleta de comandos |

- Sobre o mais claro dos três, o texto usa `--text`.
- **Pressionado** é um estado novo, fora do escopo deste ADR. O app não tem `:active` hoje.

**Texto e ícone em cor de marca.** No escuro, a cor pura passa AA.

| Token | Valor | Papel | Contraste sobre `--bg` / `--surface-elevated` |
|---|---|---|---|
| `--yellow-text` | `#FFC83D` | Texto e ícone amarelo | 11,9:1 / 9,5:1 |
| `--orange-text` | `#FF8A3D` | Texto de progressão (XP) | 7,8:1 / 6,3:1 |
| `--link` | `#4DA3FF` | Links e branches | 7,0:1 / 5,6:1 |
| `--success-text` | `#3DDC97` | Texto de sucesso | 10,4:1 / 8,3:1 |
| `--danger-text` | `#FF5C6C` | Texto de erro | 6,1:1 / 4,9:1 |
| `--on-yellow` | `#1A1F2B` | Texto sobre botão ou faixa amarela | 10,7:1 sobre `#FFC83D`; 12,8:1 sobre `#FFE08A` (hover) |
| `--hl` | `#FFC83D` | Destaque em texto corrido | 11,9:1 |

**Fundos suaves (ponto 6).** Fundo de chip, reação, seleção e ícone de estado usa a cor do token com **opacidade 0,14**. A linha ou borda do mesmo elemento usa **opacidade 0,4**. Um chip de erro ou de link sobre `--surface-elevated` usa `--text` no texto.

**Atmosfera, sombra, código e insígnias**

| Token | Valor | Papel |
|---|---|---|
| `--glow-yellow` | `rgba(255, 200, 61, 0.18)` | Brilho de recompensa. No app, **só em momentos de recompensa** (pontos 8 e 13). |
| `--shadow-pop` | `0 12px 40px rgba(0,0,0,.55), 0 0 0 1px var(--border)` | **App.** Sombra de popover, menu, tooltip e modal: o blur atual do app (40 px) com o anel em `--border` (ponto 12) |
| `--shadow-window` | `0 30px 80px -20px rgba(0,0,0,0.65), 0 0 0 1px var(--border)` | Só landing: sombra de janela nos mockups |
| `--grain-opacity` | `0.05` | Só landing: grão sutil sobre o fundo. O app não tem grão (ponto 13). |
| `--code-comment` | `#8B95AD` | Sintaxe: comentário (6,1:1 sobre `--bg`) |
| `--code-keyword` | `#C792FF` | Sintaxe: palavra-chave |
| `--code-string` | `#3DDC97` | Sintaxe: string |
| `--code-function` | **a definir** | **Novo.** Sintaxe: nome de função. Sem laranja (ponto 16). |
| `--code-constant` | **a definir** | **Novo.** Sintaxe: número e constante. Sem laranja (ponto 16). |
| `--badge-face` | `#121826` | Face esmaltada da insígnia |
| `--badge-face-hi` | `#2A3348` | Brilho da face da insígnia |
| `--office-bg` | `#15162A` | Fundo da cena do escritório virtual |

O tema de sintaxe do Shiki no app é montado com os tokens `--code-*`.

### 3.3 Tema claro — somente landing por enquanto; planejado para o app

O seletor é `[data-theme='light']`, com `color-scheme: light`. O app **não** implementa este tema agora. A tabela registra os valores para quando ele entrar.

| Token | Valor | Observação |
|---|---|---|
| `--bg` | `#FAF8F2` | |
| `--surface` | `#FFFFFF` | |
| `--surface-elevated` | `#FFFFFF` | Igual a `--surface`. O claro não tem um terceiro nível. |
| `--border` | `#E4DFD0` | Derivado: não estava no briefing original |
| `--text` | `#1A1F2B` | |
| `--text-secondary` | `#545C6E` | Derivado, 6,4:1 sobre `--bg` |
| `--yellow-text` | `#C99400` | Só para ícone e texto **grande** (3:1) |
| `--hl` | `#8A6400` | Amarelo para texto **pequeno**, AA 5,1:1 sobre `--bg` |
| `--orange-text` | `#B8530F` | |
| `--link` | `#1F6FD1` | |
| `--success-text` | `#138A5A` | |
| `--danger-text` | `#D0283A` | |
| `--on-yellow` | `#1A1F2B` | |
| `--office-bg` | `#15162A` | A cena do escritório continua escura |
| `--duck-outline` | `#3D2A00` | O mascote ganha contorno marrom |
| `--duck-highlight` / `--duck-shadow` | `#FFE08A` / `#E6A817` | |
| `--grain-opacity` | `0.035` | |
| `--glow-yellow` | `rgba(255, 200, 61, 0.28)` | |
| `--shadow-window` | `0 30px 70px -28px rgba(61,42,0,0.28), 0 0 0 1px var(--border)` | |
| `--code-comment` / `--code-keyword` / `--code-string` | `#6B7080` / `#7A3FD1` / `#138A5A` | |
| `--badge-face` / `--badge-face-hi` | `#1F2535` / `#3A4560` | A face da insígnia continua escura |
| `--sq-ink`, `--sq-rim`, `--sq-w0…w4`, `--sq-shadow`, `--sq-wet` | ver `tokens.css`, linhas 211–219 | Contorno marrom e água clara no pato pixel |

- `--hl` e os tokens derivados ainda estão como decisão pendente em `alinhamento.md`, itens 3.4 e 3.5.
- Os tokens novos da revisão (`--text-tertiary`, `--border-control`, superfícies interativas, `--code-function`, `--code-constant` e `--shadow-pop`) só têm valor, ou só foram decididos, para o tema escuro. No claro, ficam a definir quando o tema entrar no app.

### 3.4 Cores semânticas e tiers de insígnia

As semânticas e os tiers são iguais nos dois temas. No claro, o texto usa as versões `*-text`.

| Token | Valor | Papel |
|---|---|---|
| `--success` | `#3DDC97` | Sucesso: check verde, merge, conectado |
| `--danger` | `#FF5C6C` | Erro, falha, ação destrutiva |
| `--warning` | `#FF8A3D` | Alerta. **Token próprio**, com o mesmo valor de `--beak-orange`. Aparece **sempre com ícone e texto**, nunca só pela cor. É a exceção registrada à regra "laranja = progressão" (ponto 7). |
| `--tier-bronze` | `#CD7F32` | Insígnia bronze |
| `--tier-silver` | `#C0C7D1` | Insígnia prata |
| `--tier-gold` | `#FFC83D` | Insígnia ouro (é o amarelo da marca) |
| `--tier-diamond` | `#7DE3FF` | Insígnia diamante |

As insígnias são medalhões hexagonais em SVG (`Badge.tsx`):

- anel no tom do tier, face `--badge-face` e glifo em traço de 1,7 px;
- quatro "pips" de tier embaixo;
- a insígnia secreta é o mesmo medalhão desfocado, com `?`.

### 3.5 Tipografia

**Famílias**

| Token | Pilha | Papel |
|---|---|---|
| `--font-display` | `'Bricolage Grotesque', 'Geist', system-ui, sans-serif` | **Display**: títulos. Na landing usa peso 750–800 e `opsz` 96. |
| `--font-body` | `'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif` | **Texto**: corpo, interface, botões |
| `--font-mono` | `'JetBrains Mono', ui-monospace, 'Cascadia Code', Consolas, monospace` | **Mono**, a "voz de máquina": hash, branch, XP, contadores, comandos, código |
| `--font-pixel` | `'Pixelify Sans', 'JetBrains Mono', monospace` | **Pixel**: só nos balões e no HUD do escritório virtual |

Pesos carregados na landing:

| Família | Pesos |
|---|---|
| Bricolage Grotesque | 400–800, com `opsz` de 12 a 96 |
| Geist | 400–700 |
| JetBrains Mono | 400, 500 e 700 |
| Pixelify Sans | 500 e 700 |

**Escala da landing.** É fluida: o valor mínimo vale a 360 px de largura e o máximo a 1440 px. Ela **não vai para o app** (seção 5.1).

| Token | Valor | Papel |
|---|---|---|
| `--step--1` | `clamp(0.78rem, 0.76rem + 0.1vw, 0.84rem)` | Labels mono |
| `--step-0` | `clamp(1rem, 0.96rem + 0.18vw, 1.125rem)` | Corpo |
| `--step-1` | `clamp(1.2rem, 1.1rem + 0.45vw, 1.5rem)` | Lead |
| `--step-2` | `clamp(1.6rem, 1.3rem + 1.3vw, 2.5rem)` | h3 |
| `--step-3` | `clamp(2.2rem, 1.6rem + 2.8vw, 4.25rem)` | h2 |
| `--step-4` | `clamp(3rem, 1.9rem + 5.2vw, 7.5rem)` | Hero |
| `--step-5` | `clamp(3.4rem, 1.6rem + 8.4vw, 10rem)` | Fechamento |

**Regras de tipografia**

- Títulos usam tracking negativo, de `-0.032em` a `-0.038em`.
- O nome se escreve como componente, `<squeak/>`:
  - `squeak` em Bricolage 800;
  - `<` e `/>` em JetBrains Mono 400–500, na cor `--yellow-text`.
- Em texto corrido e em comandos, o nome fica minúsculo e sem tag (`squeak init`).

### 3.6 Espaçamento, raios e layout

| Token | Valor | Papel |
|---|---|---|
| `--r-1` | `4px` | **App.** Só `.kbd` e código inline (ponto 9) |
| `--radius-s` | `6px` | Controles: botões, inputs, chips |
| `--radius-m` | `12px` | **Raio padrão do app**: cartões, painéis, popovers e modais (ponto 9) |
| `--radius-l` | `20px` | Blocos grandes e janelas |
| `--statusbar-h` | `28px` | Altura da status bar. O app não tem status bar por enquanto (ponto 3). |
| `--app-gutter` | `clamp(1rem, 2.6vw, 3rem)` | **App.** Margem lateral fluida. É o `--gutter` atual do app, renomeado (ponto 15). |
| `--page-max` | `1440px` | Só na landing: largura máxima da página |
| `--spine-x` | `22px` (≥ 900 px de largura: `44px`) | Só na landing: posição da linha do git |
| `--gutter` | `52px` (≥ 900 px de largura: `112px`) | Só na landing: início da coluna de conteúdo |
| `--edge` | `16px` (≥ 900 px de largura: `clamp(24px, 5vw, 80px)`) | Só na landing: margem direita |

**Espaçamento:** a landing **não define escala de espaçamento em tokens**. Cada seção usa valores próprios. O app adota a grade de 4 px que já tem (seção 5.4).

### 3.7 Movimento

| Token | Valor | Uso |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Easing padrão de tudo |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | **Só recompensa**: insígnia, toast de XP, XP |
| `--dur-fast` | `160ms` | Hover, foco e troca de estado. **No app, também modal e popover** (ponto 10). |
| `--dur-med` | `320ms` | Na landing: entradas e trocas de tema. **No app, só o painel lateral deslizando** (ponto 10). |

**Regra de `prefers-reduced-motion`.** Esta é a regra da landing (`global.css`) e vale para o app:

```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

- Com movimento reduzido, cada tela mostra o **estado final** da animação, nunca um estado intermediário ou vazio.
- O mascote fica num quadro parado. Um clique mostra o quadro-chave da reação por 1,4 s.

### 3.8 Mascote

O Squeak é o pato de borracha do time.

**Cores**

| Token | Valor | Papel |
|---|---|---|
| `--duck-body` | `#FFC83D` | Corpo |
| `--duck-beak` | `#FF8A3D` | Bico |
| `--duck-eye` | `#1A1F2B` | Olho |
| `--catchlight` | `#FFFFFF` | Ponto de brilho do olho |
| `--duck-outline` (escuro) | `transparent` | Sem contorno no tema escuro |
| `--duck-highlight` (escuro) | `#FFE08A` | Brilho quente. No app, também o hover do botão primário (ponto 8). |
| `--duck-shadow` (escuro) | `#D99A1A` | Sombra quente |

**Regras de uso no tema escuro**

- **Sem contorno.** O pato se separa do fundo pelo brilho e pela sombra quentes.
- **Logo** (a cabeça do Squeak com óculos thug life, em `public/brand/`):
  - fundo transparente sobre `--bg` e `--surface`, sem borda, porque a arte já tem contorno laranja;
  - respiro mínimo de 1/4 da largura em volta.
- **Pixel art:**
  - sempre em escala inteira, para os pixels ficarem nítidos;
  - o renderizador usa só as rampas `--sq-*`: amarelo `y0–y5`, laranja `o0–o3`, metal `m0–m4`, água `w0–w4`, mais `ink`, `mouth`, `tongue`, `glow`, `rim`, `shadow` e `wet`.
- **Fotos de perfil:** um pato por pessoa (`Avatar.tsx`, `public/avatars/`), geradas por `tools/avatars.py`. São decorativas: o nome aparece sempre ao lado.
- **Nenhuma imagem do mascote vem de IA generativa.**

### 3.9 Paleta pixel art do escritório virtual

A paleta existe e fica em `landing-page/src/styles/tokens.css`, nos tokens com prefixo `--px-*`:

- tem 34 cores, de `--px-ink` a `--px-pot`;
- é derivada da marca;
- a cena é **sempre escura nos dois temas**, porque funciona como uma "tela de jogo";
- a resolução interna é 384×216, escalada por fator inteiro;
- a fonte dos balões é `--font-pixel`.

As regras completas estão em `brand.md`, seção 8.

---

## 4. Regras de uso

Estas regras vêm de `brand.md` e valem para o app e para a landing, com os ajustes da revisão.

| # | Regra | Na prática |
|---|---|---|
| 1 | **60-30-10** | Cerca de 60% de base escura (`--bg`), 30% de superfícies e texto, e 10% de amarelo e laranja. |
| 2 | **Amarelo nunca como fundo de seção** | O amarelo é recompensa e ação principal: botão primário, foco, `main`, insígnia de ouro. Não serve de fundo de painel, barra lateral ou cabeçalho. A única exceção deliberada é a status bar da landing. **No app não há status bar amarela:** se uma status bar entrar, ela usa `--surface` e o amarelo só no texto de `main` (ponto 3). |
| 3 | **Laranja sempre progressão** | Se algo sobe, enche ou evolui, é laranja: XP, level up, streak, barra de progresso, calendário de contribuições. Laranja não é botão, foco nem link. **Exceção registrada:** `--warning` tem o valor do laranja e por isso vem sempre com ícone e texto (ponto 7). Sem laranja na sintaxe de código (ponto 16). |
| 4 | **Azul para branch e link** | Links, nomes de branch e informação são azuis. Assim o amarelo fica exclusivo de `main` e da recompensa. |
| 5 | **Mono só para informação de máquina** | Hash, branch, XP, contadores, comandos, atalhos e código. Não usar mono como decoração nem em texto corrido. |
| 6 | **Contraste mínimo WCAG AA** | Texto normal precisa de 4,5:1, texto grande e ícones de 3:1. No escuro, as cores de texto da seção 3.2 passam sobre as três superfícies, **exceto `--text-tertiary`, que não vai em `--surface-elevated`**. A borda que é o único limite de um controle usa `--border-control` (3:1 ou mais, WCAG 1.4.11). No claro, nunca usar amarelo puro como texto: usar `--hl` em texto pequeno e `--yellow-text` só em texto grande. |
| 7 | **Nenhuma cor solta** | Todo componente usa token. Uma cor nova nasce primeiro no arquivo de tokens. |

---

## 5. Adaptações para o app desktop

**A landing é uma página de marketing e o app é uma ferramenta.** Ficam iguais as famílias tipográficas, todos os tokens de cor, as regras da seção 4 e as curvas de movimento. Mudam a escala tipográfica (fixa e densa), o espaçamento (grade de 4 px), o layout e o uso das durações (seção 3.7).

### 5.1 Escala tipográfica fixa

A escala fluida (`--step-*`, até 10 rem) e os títulos gigantes **não entram no app**. A escala mantém os **tamanhos que o app já usa**, que estão em `apps/desktop/src/design/tokens.css` e são testados em densidade de ferramenta. As famílias passam a ser as da landing.

| Token | Tamanho | Família e peso | Uso |
|---|---|---|---|
| `--t-xs` | 11,5 px | `--font-mono` 500 ou `--font-body` 400 | Labels mono e contadores |
| `--t-sm` | 12,5 px | `--font-body` 400 | Metadados, horários, texto auxiliar |
| `--t-md` | **13,5 px** | `--font-body` 400, `line-height` 1,45 | **Corpo da interface** (`body`) |
| `--t-lg` | 15 px | `--font-body` 600 | Título de painel e de seção |
| `--t-xl` | 20 px | `--font-display` 700 | Título de tela |
| `--t-2xl` | 28 px | `--font-display` 750 | Título de página e tela de boot |

- O corpo fica entre 13 e 14 px, como pedido. O `line-height` de 1,45 é o atual do app.
- No app, o display (Bricolage) aparece **só a partir de `--t-xl`**. Abaixo disso, Geist em peso 600 lê melhor em tamanho pequeno.
- A Geist no corpo e os pesos de display são validados em tela na Sprint 1 (ponto 1).

### 5.2 Hierarquia por superfícies, mapeada para os tokens da landing

O app mantém a ideia de `REDESIGN.md`: **hierarquia por luminosidade, não por borda**. As linhas separam regiões, não objetos.

| Camada (app) | Uso | Token novo |
|---|---|---|
| Chão | Barra lateral, fundo da janela | `--bg` `#0F1420` |
| Folha | Conteúdo principal | `--surface` `#171D2B` |
| Painel | Painéis, popovers, menus, tooltips e modais | `--surface-elevated` `#212839` |
| Fundo interativo | Botão neutro, chip, `.kbd`, ícone de estado | `--surface-control` (valor a definir) |
| Hover | Item sob o cursor | `--surface-hover` (valor a definir) |
| Selecionado | Item ativo da navegação, canal, aba, item da paleta | `--surface-selected` (valor a definir) |
| Pressionado | — | Estado novo, fora do escopo |
| Divisória de região | Linha entre barra lateral e folha | `--border` `#2C3448` |
| Borda de controle | Input, select e textarea | `--border-control` `#6B7693` |

### 5.3 Estados de interação

| Estado | Decisão | Origem |
|---|---|---|
| Foco (`:focus-visible`) | Contorno de 2 px em `--duck-yellow` com `outline-offset` de 1 px | A cor vem da landing (que usa 3 px com offset de 3 px). A espessura vem do app, por causa da densidade. |
| Botão primário | Fundo `--duck-yellow`, texto `--on-yellow` | Landing |
| Hover do primário | Fundo `--duck-highlight` (`#FFE08A`), **sem elevar o botão e sem glow** | Revisão, ponto 8 |
| Hover e selecionado em geral | `--surface-hover` e `--surface-selected`; no mais claro dos três tokens, texto em `--text` | Revisão, ponto 4 |
| Pressionado | Fora do escopo. O app não tem `:active` hoje. | Revisão, ponto 4 |
| Desabilitado | Opacidade 0,45 | App, não conflita |
| Selecionado e ativo (semântica) | `aria-current`, `aria-selected`, `aria-pressed` | App, não conflita |

### 5.4 O que fica do app atual (não conflita com a decisão)

| Item | Por que fica |
|---|---|
| Hierarquia por superfícies em vez de bordas | É uma ideia de composição, não de cor. Ela passa a usar os tokens da landing (seção 5.2). |
| Grade de 4 px: `--sp-1…--sp-7` (4, 8, 12, 16, 24, 32 e 48 px) | A landing não tem escala de espaçamento em tokens. |
| Escala fixa `--t-*` | Adaptação de densidade (seção 5.1) |
| Medidas de layout: `--sidebar-w` 248 px, `--panel-w` 280 px, `--topbar-h` 44 px | São específicas do app. |
| `--r-pill` 999 px e `--r-1` 4 px | Utilitários de forma. `--r-1` fica restrito a `.kbd` e código inline (ponto 9). |
| `--shadow-pop` | Mantém o blur atual; só o anel muda para `--border` (ponto 12). |
| Ícones de traço próprios (`design/Icon.tsx`) e nenhum emoji nos controles | Não conflita. |
| Componentes de estado (`design/states.tsx`) | Não conflita. |
| Nada de gradientes decorativos ou bordas em tudo | Combina com a regra 60-30-10. |

### 5.5 O que da landing não vai para o app

| Item | Motivo |
|---|---|
| Escala fluida `--step-*` | É de marketing. O app usa `--t-*`. |
| `--page-max`, `--spine-x`, `--gutter` e `--edge` | São o layout da landing: linha do git e coluna de conteúdo. |
| Tema claro | Planejado, sem data (decisão 2). |
| Grão (`--grain-opacity`) | O app não tem grão (ponto 13). |
| `--shadow-window` | O app usa `--shadow-pop` (ponto 12). |
| Status bar amarela | O app fica sem status bar por enquanto; se entrar, é a opção (b) (ponto 3). |
| Elevação e glow no hover de botão | Glow só em recompensa (pontos 8 e 13). |

---

## 6. Consequências e migração

### 6.1 Token atual do app → token novo

**Superfícies e texto**

| Token atual do app | Valor atual | Token novo | Valor novo | Observação |
|---|---|---|---|---|
| `--s0` | `#0b0d0f` | `--bg` | `#0F1420` | Chão |
| `--s1` | `#101317` | `--surface` | `#171D2B` | Folha |
| `--s2` | `#161a1f` | `--surface-elevated` | `#212839` | Painel e popover |
| `--s3` | `#1d2227` | `--surface-control`, `--surface-hover` ou `--surface-selected`, conforme o uso | a definir | **Correção:** o texto anterior tratava `--s3` como hover. Dos 25 usos, 9 são hover, 7 são item selecionado e 9 são fundo normal. Cada uso vai para o token do seu papel. |
| `--s4` | `#262c33` | conforme o uso | — | **Correção:** o texto anterior tratava `--s4` como pressionado. Nenhum dos 4 usos é pressionado, e o app não tem `:active`. Os usos: hover de `button` (`base.css:10`) → `--surface-hover`; item ativo da paleta de comandos (`shell.css:67`) → `--surface-selected`; tooltip do calendário (`github.css:60`) → `--surface-elevated`; polegar da scrollbar (`base.css:7`) → a definir na Sprint 1. |
| `--hairline` | `rgba(255,255,255,.07)` | `--border` | `#2C3448` | Divisória de região |
| `--hairline-2` | `rgba(255,255,255,.13)` | `--border-control` em input, select e textarea; `--border` no resto | `#6B7693` / `#2C3448` | Ponto 11 |
| `--fg` | `#e9ebee` | `--text` | `#F2F4F8` | |
| `--fg-2` | `#a5acb5` | `--text-secondary` | `#9AA3B5` | |
| `--fg-3` | `#6e7681` | `--text-tertiary` sobre `--bg` e `--surface`; `--text-secondary` em popover e modal | `#7F899E` | **Correção:** o `--fg-3` atual já reprova AA: 4,24:1, 4,05:1 e 3,80:1 sobre `--s0`, `--s1` e `--s2`. |
| `--fg-inv` | `#160d05` | `--on-yellow` | `#1A1F2B` | Texto sobre o primário |

**Acento e semânticas**

| Token atual do app | Valor atual | Token novo | Valor novo | Observação |
|---|---|---|---|---|
| `--accent` | `#ff8a3d` | `--duck-yellow` (fundo, borda, foco) ou `--yellow-text` (texto) | `#FFC83D` | Ação primária e seleção. Usos de progressão vão para `--beak-orange` (passo 4 em 6.3). |
| `--accent-hi` | `#ffa563` | `--duck-highlight` | `#FFE08A` | Hover do primário (ponto 8) |
| `--accent-soft` | `rgba(255,138,61,.14)` | cor do papel com opacidade 0,14 | — | Em geral `--duck-yellow` a 0,14 (ponto 6) |
| `--accent-line` | `rgba(255,138,61,.4)` | cor do papel com opacidade 0,4 | — | Ponto 6 |
| `--ok` | `#4fd18b` | `--success` / `--success-text` | `#3DDC97` | |
| `--warn` | `#e8c547` | `--warning` | `#FF8A3D` | Sempre com ícone e texto (ponto 7) |
| `--bad` | `#ff5d6c` | `--danger` / `--danger-text` | `#FF5C6C` | |
| `--info` | `#5aa9ff` | `--link` / `--pond-blue` | `#4DA3FF` | |
| `--ok-soft`, `--warn-soft`, `--bad-soft`, `--info-soft` | `rgba(…, .14)` | `--success`, `--warning`, `--danger` e `--pond-blue` com opacidade 0,14 | — | Ponto 6. Chip de erro ou link sobre `--surface-elevated` usa `--text`. |

**Tipografia, espaço, raios, sombra e movimento**

| Token atual do app | Valor atual | Token novo | Valor novo | Observação |
|---|---|---|---|---|
| `--font` | Segoe UI Variable Text | `--font-body` | Geist | Ponto 1 |
| `--font-display` | Segoe UI Variable Display | `--font-display` | Bricolage Grotesque | Mesmo nome, valor novo |
| `--mono` | Cascadia Code | `--font-mono` | JetBrains Mono | Ponto 2 |
| `--t-xs … --t-2xl` | 11,5 a 28 px | mantidos | iguais | Seção 5.1 |
| `--sp-1 … --sp-7` | 4 a 48 px | mantidos | iguais | Seção 5.4 |
| `--r-1` | `4px` | mantido | `4px` | Só `.kbd` e código inline (ponto 9) |
| `--r-2` | `6px` | `--radius-s` | `6px` | Mesmo valor |
| `--r-3` | `10px` | `--radius-m` | `12px` | Raio padrão (ponto 9) |
| `--r-pill` | `999px` | mantido | `999px` | |
| `--shadow-pop` | `0 12px 40px rgba(0,0,0,.55), 0 0 0 1px var(--hairline-2)` | mantido | `0 12px 40px rgba(0,0,0,.55), 0 0 0 1px var(--border)` | Ponto 12 |
| `--ease` | `cubic-bezier(.2,.7,.2,1)` | `--ease-out` | `cubic-bezier(0.22,1,0.36,1)` | |
| `--dur-1` | `110ms` | `--dur-fast` | `160ms` | Ponto 10 |
| `--dur-2` | `180ms` | `--dur-fast` | `160ms` | Inclusive modal e popover. `--dur-med` (320 ms) só no painel lateral deslizando (ponto 10). |
| — | — | `--ease-spring` | `cubic-bezier(0.34,1.56,0.64,1)` | Novo no app, só para recompensa |
| `--sidebar-w`, `--panel-w`, `--topbar-h` | 248, 280 e 44 px | mantidos | iguais | |
| `--gutter` | `clamp(1rem, 2.6vw, 3rem)` | `--app-gutter` | igual | O nome colidia com o `--gutter` da landing. A classe `.gutter` do chat (`messaging.css`) não muda (ponto 15). |
| — | — | `--code-function`, `--code-constant` | a definir | Novos, sem laranja (ponto 16) |

### 6.2 O que muda visualmente no app

| Área | Antes | Depois |
|---|---|---|
| Acento | Laranja "brasa" em botão primário, foco, seleção, abas ativas, chips e links-botão | Amarelo do pato nesses lugares. O laranja só aparece em progressão e no alerta. |
| Fontes | Segoe UI Variable e Cascadia Code: aparência nativa do Windows | Geist no corpo, Bricolage nos títulos de tela, JetBrains Mono no código: a mesma voz da landing |
| Superfícies | Cinza neutro quase preto, em 5 níveis | Azul-noite, em 3 níveis, mais 3 tokens de superfície interativa. O app fica um pouco mais claro e mais frio. |
| Bordas | Hairline translúcida e quase invisível | Borda sólida `#2C3448` nas divisórias; `#6B7693` em input, select e textarea |
| Texto terciário | `#6e7681`, abaixo de AA | `#7F899E`, AA sobre `--bg` e `--surface` |
| Alerta | Amarelo `#e8c547` | Laranja `#FF8A3D`, sempre com ícone e texto |
| Raios | 4, 6 e 10 px | 6 e 12 px; 4 px só em `.kbd` e código inline |
| Movimento | 110 e 180 ms | 160 ms em tudo, inclusive modal e popover; 320 ms só no painel lateral deslizando; mola só em recompensa |
| Calendário de contribuições | Cores que a API do GitHub devolve (rampa verde do tema claro) | Rampa laranja por nível (a validar) |
| Status bar | Não existe | Continua sem, por enquanto |
| Marca | Nenhuma | Logo, avatares de pato e tiers de insígnia disponíveis como tokens |

**Consequências**

| | |
|---|---|
| **Positivas** | Uma marca só, da landing ao app. A reputação (XP, insígnias) chega ao app com a gramática de cor pronta. Uma única tabela de contraste para manter. O texto terciário e a borda de input passam a cumprir a WCAG. |
| **Negativas** | O app perde a aparência nativa do Windows. As fontes passam a ser embutidas no app, o que aumenta o pacote. Ainda faltam valores para os 3 tokens de superfície interativa, os 2 tokens de sintaxe novos, a rampa laranja do calendário e o polegar da scrollbar. Toda tela do app precisa de conferência visual. |

### 6.3 Passos para a Sprint 1 (issue "Aplicar o design system unificado no app")

1. **Embutir as fontes no app.** Bricolage Grotesque, Geist e JetBrains Mono entram como arquivos locais: o app desktop não pode depender do Google Fonts, e a CSP do Tauri não tem `font-src`. Os pesos são os da seção 3.5. Pixelify Sans só entra quando o escritório virtual chegar ao app.
2. **Definir os valores que faltam** e registrar no `tokens.css` da landing, com contraste conferido:
   - `--surface-control`, `--surface-hover` e `--surface-selected`;
   - `--code-function` e `--code-constant`, sem laranja;
   - a rampa laranja do calendário de contribuições;
   - a cor do polegar da scrollbar.
3. **Trocar `apps/desktop/src/design/tokens.css`:**
   - copiar da landing a marca, as semânticas, os tiers, o mascote, o movimento, as famílias e o tema escuro, com `color-scheme: dark`;
   - acrescentar os tokens novos da revisão (`--text-tertiary`, `--border-control`, superfícies interativas, `--code-function`, `--code-constant`);
   - acrescentar os tokens próprios do app (`--t-*`, `--sp-*`, `--r-1`, `--r-pill`, `--shadow-pop`, medidas de layout e `--app-gutter`);
   - não incluir o tema claro.
4. **Criar uma camada de compatibilidade temporária.** Os nomes antigos viram aliases dos novos (por exemplo, `--s1: var(--surface)` e `--fg: var(--text)`). Assim a migração anda arquivo por arquivo: `base.css`, `shell.css`, `messaging.css`, `github.css`, `settings.css` e `voice.css`. Os aliases somem no fim da sprint.
5. **Reclassificar cada uso de `--accent`, `--s3` e `--s4`.** Hoje há 37 usos de `--accent*` nos CSS do app.
   - Ação primária, foco, seleção e item ativo → amarelo.
   - Progressão → laranja.
   - **Correção:** no calendário de contribuições, `--accent` é só o contorno da célula selecionada (`github.css:59`); ele segue a regra da seleção. A cor das células vem da API do GitHub (`ContributionGraph.tsx:13`), e a troca pela rampa laranja é o ponto 14.
   - Cada uso de `--s3` e `--s4` vai para fundo, hover ou selecionado (seção 6.1).
6. **Aplicar a regra de `prefers-reduced-motion`** da seção 3.7 no lugar da regra atual do app, que zera as durações e força 0 ms.
7. **Remover hex soltos dos CSS do app.** Exemplos:
   - `#ffb3ba` e `rgba(255, 93, 108, .35)` em `.error`, em `base.css`;
   - `#0a0d12` e `#11151b` no bloco de código, e `#6e7681` nos números de linha, em `messaging.css`.
8. **Montar o tema do Shiki** com os tokens `--code-*` (ponto 16).
9. **Validar em tela os pontos 1, 2, 3, 8, 10, 11 e 14** (seção 7.3), com capturas antes e depois. Conferir também contraste e estados (hover, foco, desabilitado, selecionado) em todas as telas.
10. **Atualizar `docs/REDESIGN.md`:**
    - seção 4 "Sistema visual", para apontar para este ADR;
    - o calendário de contribuições, que deixa de usar "as cores/níveis reais da API" e passa à rampa laranja (ponto 14).

### 6.4 Fonte única futura: `packages/design-tokens`

Este passo depende da reorganização do repositório (issue #7). Até lá, o app copia os tokens da landing à mão, e qualquer mudança precisa ser feita nos dois lugares.

Estrutura proposta, quando a issue #7 permitir:

| Arquivo | Conteúdo | Quem usa |
|---|---|---|
| `base.css` | Marca, mascote, semânticas, tiers, famílias, movimento, raios, paleta `--px-*` e rampas `--sq-*` | App e landing |
| `theme-dark.css` | Tema escuro (seção 3.2), com os tokens novos da revisão | App e landing |
| `theme-light.css` | Tema claro (seção 3.3) | Landing (e o app, quando o tema claro entrar) |
| `landing.css` | `--step-*`, `--page-max`, `--spine-x`, `--gutter`, `--edge` e `--statusbar-h` | Landing |
| `app.css` | `--t-*`, `--sp-*`, `--r-1`, `--r-pill`, `--shadow-pop`, medidas de layout e `--app-gutter` | App |

Os dois projetos importam o pacote. O `tokens.css` da landing e o do app deixam de ter valores próprios.

---

## 7. Decisões da revisão

O Samuel revisou o ADR no PR da issue #3. Os 16 pontos que estavam em aberto foram decididos. Sete deles ficam para validação visual na Sprint 1, ao aplicar o design system no app.

### 7.1 Decisões

| # | Ponto | Decisão | Situação |
|---|---|---|---|
| 1 | Geist no lugar de Segoe UI | Geist no corpo. Ela é 3,2% mais larga que a Segoe UI. As fontes vão embutidas no app, porque a CSP do Tauri não tem `font-src`. | validar na Sprint 1 |
| 2 | JetBrains Mono no lugar de Cascadia Code | JetBrains Mono substitui a Cascadia. | validar na Sprint 1 |
| 3 | Status bar | Sem status bar no app por enquanto. Quando houver conteúdo para ela, opção (b): fundo `--surface`, com `main` em amarelo no texto. | validar na Sprint 1 |
| 4 | Hover e pressionado | Três tokens de superfície interativa: fundo, hover e selecionado. No mais claro, o texto usa `--text`. Pressionado é um estado novo, fora do escopo. Nomes propostos e valores a definir (seção 3.2). | decidido |
| 5 | Terceiro nível de texto | Novo `--text-tertiary` `#7F899E`, só sobre `--bg` e `--surface`. Em popover e modal, `--text-secondary`. | decidido |
| 6 | Variantes suaves das cores | Fundos coloridos com opacidade 0,14 e linhas com 0,4. Chip de erro ou link sobre `--surface-elevated` usa `--text`. | decidido |
| 7 | Alerta e progressão com a mesma cor | `--warning` é um token separado, com o valor do laranja (`#FF8A3D`), sempre com ícone e texto. A exceção à regra "laranja = progressão" fica registrada (seção 4, regra 3). | decidido |
| 8 | Hover do botão primário | `#FFE08A` (`--duck-highlight`), sem elevar o botão. Glow só em recompensa. | validar na Sprint 1 |
| 9 | Raios | Raio padrão de 12 px (`--radius-m`). Raio de 4 px (`--r-1`) só para `.kbd` e código inline. | decidido |
| 10 | Durações | `--dur-fast` em tudo, inclusive modal e popover. `--dur-med` só para o painel lateral deslizando. | validar na Sprint 1 |
| 11 | Contraste das bordas | Novo `--border-control` `#6B7693`, só em input, select e textarea. | validar na Sprint 1 |
| 12 | Sombra de popover e modal | Sombra do app com o blur atual (40 px) e anel de 1 px em `--border`. | decidido |
| 13 | Grão e glow no app | Sem textura de grão. Glow só em recompensa. | decidido |
| 14 | Calendário de contribuições | Rampa laranja por nível no gráfico de contribuições. Isso altera o `docs/REDESIGN.md`. | validar na Sprint 1 |
| 15 | Colisão de nome `--gutter` | A variável do app vira `--app-gutter`. A classe `.gutter` do chat não muda. | decidido |
| 16 | Tema de sintaxe do código | Tema do Shiki montado com os tokens. Criar ao menos `--code-function` e `--code-constant`. Sem laranja na sintaxe. | decidido |

### 7.2 Correções de fato

A revisão corrigiu quatro afirmações do texto proposto. O texto acima já está corrigido, e as correções ficam registradas aqui.

| # | O que o ADR dizia | O que é verdade | Onde foi corrigido |
|---|---|---|---|
| 4 | `--s3` era hover (25 usos) e `--s4` era pressionado (4 usos). | Dos 25 usos de `--s3`, 9 são hover, 7 são item selecionado e 9 são fundo normal. Nenhum dos 4 usos de `--s4` é estado pressionado, e o app não tem `:active`. | Seções 3.2, 5.2, 5.3 e 6.1 |
| 5 | `--fg-3` precisava de um substituto "conferindo AA", como se o atual passasse. | O `--fg-3` atual já reprova AA: 4,24:1, 4,05:1 e 3,80:1 sobre `--s0`, `--s1` e `--s2`. | Seções 6.1 e 6.2 |
| 11 | Bastava separar o input pelo contraste de superfície ou por um token de borda. | Nenhuma das duas opções do ADR chega a 3:1. Por exemplo, `--bg` dentro de `--surface` dá 1,1:1, e `--border` dá 1,5:1 sobre `--bg`. Daí o `--border-control`. | Seções 3.2, 4 e 6.1 |
| 14 | O calendário (`.cg-cell`) usava `--accent` nas células. | A cor das células vem da API do GitHub (`ContributionGraph.tsx:13`). O `--accent` é só o contorno da célula selecionada (`github.css:59`). | Seção 6.3, passo 5 |

### 7.3 Validar na Sprint 1

As comparações abaixo estão na seção "Pontos a validar" da [prévia HTML](002-design-system-preview.html). Cada uma muda uma coisa só, com dados fictícios. Na prévia, as do ponto 10 também funcionam ao vivo.

**Ponto 1: Geist no corpo.** A mesma conversa em 13,5 px, na mesma largura, em Segoe UI Variable Text e em Geist. A prévia mede a diferença de largura no navegador: nesta captura, 3,3%.

![Ponto 1: a mesma conversa do chat em Segoe UI Variable Text e em Geist, em 13,5 px](assets/002/06-ponto-01-fonte.png)

**Ponto 2: JetBrains Mono.** Um bloco de código e código inline em Cascadia Code e em JetBrains Mono, com os tokens de sintaxe que já existem.

![Ponto 2: bloco de código e código inline em Cascadia Code e em JetBrains Mono](assets/002/07-ponto-02-mono.png)

**Ponto 3: status bar.** A parte de baixo do app sem status bar e com a opção (b). O conteúdo da barra é ilustrativo.

![Ponto 3: a área inferior do app sem status bar e com a status bar da opção (b)](assets/002/08-ponto-03-status-bar.png)

**Ponto 8: hover do primário.** O botão Mergear em repouso e em hover, com o contraste do texto: 10,7:1 e 12,8:1.

![Ponto 8: botão primário em repouso, em --duck-yellow, e em hover, em --duck-highlight](assets/002/09-ponto-08-hover.png)

**Ponto 10: durações.** Botões que abrem um modal e um popover com `--dur-fast` e com `--dur-med`. Os quadros mostram a entrada a cada 40 ms, calculada com `--ease-out`.

![Ponto 10: entrada de modal e popover com --dur-fast e --dur-med, quadro a quadro](assets/002/10-ponto-10-duracao.png)

**Ponto 11: borda de input.** Os mesmos campos com `--border` e com `--border-control`, sobre `--surface` e dentro de um modal, com o contraste da borda calculado.

![Ponto 11: inputs com --border e com --border-control, sobre --surface e dentro de um modal](assets/002/11-ponto-11-borda.png)

**Ponto 14: calendário de contribuições.** O mesmo calendário com as cores da API do GitHub e com uma rampa laranja.

- A rampa laranja é **ilustrativa**: usa `--sq-o0` a `--sq-o3`, que já existem. A rampa final é definida na Sprint 1.
- A captura mostra um efeito da rampa atual: a API devolve a rampa do tema claro do GitHub, então no fundo escuro o nível mais baixo é o mais claro.

![Ponto 14: calendário de contribuições com a rampa verde da API e com a rampa laranja](assets/002/12-ponto-14-contribuicoes.png)

### 7.4 Correções menores, sem discussão

- O comentário em `tokens.css` diz "30 cores no total" para a paleta pixel, mas são 34 tokens `--px-*`, como diz o `brand.md`.
- O comentário do `tokens.css` do app usa o nome "Squak".
- O `brand.md`, seção 4 ("Hero"), ainda descreve o mar de código, mas o hero voltou ao pato em pixel art.
