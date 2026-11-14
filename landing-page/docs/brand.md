# Squeak — identidade visual (v0.1, experimental)

> Documento vivo da landing experimental. Tudo aqui está implementado em `src/styles/tokens.css`
> e é consumido pelos componentes. Nenhum componente usa cor solta: se precisar de uma cor nova,
> ela nasce aqui primeiro.

## 1. Ideia central

**Squeak é o pato de borracha do time.** O rubber duck debugging é o ritual mais universal do
desenvolvimento: você explica o problema em voz alta e a resposta aparece. A marca pega esse
objeto (amarelo, redondo, um pouco ridículo, muito confiável) e coloca dentro do vocabulário que
dev já lê sem esforço: git, terminal, IDE, diff.

A regra de ouro da direção de arte: **a página se comporta como uma ferramenta de dev, mas com o
calor de um brinquedo.** O frio vem da estrutura (mono, grafo, status bar). O calor vem do pato e
do amarelo.

## 2. Paleta

### Marca (idêntica nos dois temas)

| Token | Hex | Papel |
|---|---|---|
| `--duck-yellow` | `#FFC83D` | Primária. CTA, recompensa, a status bar. |
| `--beak-orange` | `#FF8A3D` | **Tudo que é progressão**: XP, level up, barras de progresso. |
| `--pond-blue` | `#4DA3FF` | Links, informação e **branches** (a branch do grafo é azul, `main` é amarela). |

### Tema escuro (padrão)

| Token | Hex |
|---|---|
| `--bg` | `#0F1420` |
| `--surface` | `#171D2B` |
| `--surface-elevated` | `#212839` |
| `--border` | `#2C3448` |
| `--text` | `#F2F4F8` |
| `--text-secondary` | `#9AA3B5` |

### Tema claro

| Token | Hex | Observação |
|---|---|---|
| `--bg` | `#FAF8F2` | |
| `--surface` | `#FFFFFF` | |
| `--text` | `#1A1F2B` | |
| `--yellow-text` | `#C99400` | Ícones e texto **grande** (3,0:1) |
| `--hl` | `#8A6400` | Amarelo para texto **pequeno** (5,1:1). Adicionado por mim, ver alinhamento. |
| `--border` | `#E4DFD0` | Derivado (não estava no briefing) |
| `--text-secondary` | `#545C6E` | Derivado, 6,4:1 sobre `--bg` |

### Semânticas e tiers

- Sucesso `#3DDC97` · Erro `#FF5C6C` · Alerta `#FF8A3D`.
- No tema claro, verde/vermelho/laranja **como texto** usam versões escurecidas
  (`--success-text #138A5A`, `--danger-text #D0283A`, `--orange-text #B8530F`) para passar AA.
- Tiers: Bronze `#CD7F32` · Prata `#C0C7D1` · Ouro `#FFC83D` · Diamante `#7DE3FF`.

### Regras

1. **60-30-10.** ~60% base escura, ~30% superfícies e texto, ~10% amarelo/laranja.
   O amarelo é recompensa, nunca fundo de seção.
2. **Exceção deliberada: a status bar é amarela.** É uma faixa de 28px (≈3% da tela), sempre
   presente, e funciona como carimbo da marca, como a status bar colorida de uma IDE.
3. **Laranja = progresso.** Se algo sobe, enche ou evolui, é laranja. Isso ensina o vocabulário
   sem legenda: quando o visitante vê laranja no simulador, ele já sabe que é XP.
4. **Azul = branch e link.** Mantém o amarelo exclusivo de `main`/recompensa.
5. Nunca texto amarelo puro sobre fundo claro. Amarelo vivo no claro só como fundo de botão com
   texto `--on-yellow`.

## 3. Tipografia

| Papel | Família | Por quê |
|---|---|---|
| Display | **Bricolage Grotesque** 750–800, `opsz` 96 | Grotesca com personalidade e irregularidade leve: lembra letreiro, não template de SaaS. O eixo óptico deixa os títulos enormes mais apertados e expressivos. |
| Texto | **Geist** | Neutra, técnica, excelente em tamanhos pequenos. Não compete com a display. |
| Mono | **JetBrains Mono** | Commits, status bar, labels, código. É a "voz de máquina" da página. |

- Escala fluida com `clamp()` em `--step--1` … `--step-5`. `<squeak/>` do hero em clamp próprio (até 140px); a frase do hero em `--step-3`.
- Tracking negativo nos títulos (`-0.032em` a `-0.038em`); testado para não grudar letras.
- **Mono é estrutura, não decoração**: só aparece onde a informação é de máquina (hash, branch,
  XP, contadores, comandos).

## 4. Logo e assinatura

**A logo é a cabeça do Squeak de óculos thug life**, em ilustração lisa e brilhante (a arte original
fica em `tools/brand/squeak-logo-source.png`). Ela convive com o mascote em pixel art: a logo é a
cara da marca, o pixel art é o personagem que anda pela página.

- **Arquivos** (gerados por `python tools/brand-assets.py`, nunca editados à mão):
  `public/brand/squeak-logo.png|.webp` (1024px, transparente), `squeak-logo-256.webp` (cabeçalho,
  feed), `favicon.png` (64),
  `favicon-32.png`, `apple-touch-icon.png` (180, com fundo `--bg`).
- **Nome como componente: `<squeak/>`.** O nome se escreve como uma tag JSX que se fecha sozinha:
  um componente que já traz tudo dentro, assim como o produto. `squeak` em Bricolage 800; `<` e `/>`
  em JetBrains Mono 400–500, em `--yellow-text`. Os sinais ficam ~0,75em do nome, para o nome
  continuar mandando.
- **Logo em camadas** (`src/components/DuckLogo.tsx`): pato sem óculos (`squeak-duck.webp`, cabeça
  reconstruída pelo script), olhos em SVG e óculos soltos (`squeak-glasses.webp`). No hover/foco de
  qualquer elemento com a classe `dl-host`, **os óculos sobem pra cabeça e o pato pisca um olho**;
  ao sair, os óculos descem de volta. Vale no cabeçalho e no hero.
- **Assinatura** (`src/components/Wordmark.tsx`): logo + `<squeak/>`, 34px no cabeçalho.
  No hover, o pato inclina a cabeça.
- Em texto corrido e comandos, o nome continua minúsculo e sem tag (`squeak init`).
- Respiro mínimo em volta da logo: 1/4 da largura. Fundo transparente sobre `--bg` e `--surface`
  nos dois temas; a arte já tem contorno laranja, não precisa de borda.

### Hero

- **`<squeak/>` digitado na chegada** (depois do boot `$ squeak init`): o `<` aparece com o cursor,
  as letras entram num ritmo humano irregular, uma pausa, e o `/>` fecha a tag: os sinais acendem em
  amarelo com um pulo de mola. No hover, as letras dão um pulinho em onda; o clique aperta o pato.
- **O pato nada num mar de código** (`src/hero/sea.ts`, canvas): não existe água desenhada, nem
  reflexo. A "água" são só fileiras de código, caracteres e chips de pull request/XP (`#42 merged`,
  `#51 review`, `+120 XP`) em perspectiva, que se movem com física de água: soma de ondas com
  dispersão de água funda, órbita quase circular de cada bloco, correntes em velocidades diferentes
  entre fileiras vizinhas (os caracteres passam uns pelos outros) e cristas que clareiam.
- **Pato e mar são um sistema só**: o pato (`squeak-swim.webp`) é uma boia com mola amortecida que
  segue a altura e a inclinação da onda embaixo do casco; o casco some abaixo da linha d'água e as
  fileiras da frente passam por cima dele.
- **Desempenho**: blocos de 3 caracteres pré-renderizados (4 no celular), pato pré-renderizado no
  tamanho final, no máximo 60 quadros/s (30 em tela pequena), resolução limitada e qualidade que
  baixa sozinha se os quadros atrasarem. O movimento é por tempo: a velocidade do mar não muda com
  a taxa de quadros. Fora da tela, a animação para.
- **Interação**: o cursor na água abre anéis de ondulação; clicar na água também. **Apertar o pato**
  afunda, levanta respingos de caracteres (`{ } ; => ✓`), toca o squeak e solta `squeak!`; a cada 4
  apertos, um conselho de rubber duck. Quando a tag `<squeak/>` fecha, o pato dá um mergulho.
- O título continua sendo a frase ("Seu time inteiro num lugar só."); o `<squeak/>` gigante é
  decorativo para leitores de tela, que ouvem "Squeak:" no início do h1.
- Com `prefers-reduced-motion`, tudo aparece pronto: tag fechada e o mar num quadro parado.

## 5. Mascote

**O Squeak é um personagem 2D em pixel art, animado e interativo.** (O 3D foi abandonado na v3.)

- Pato de borracha de perfil, com **óculos thug life no rosto** (blocos 2×2 como no meme, em 3/4:
  haste, lente próxima em degraus com brilhos em diagonal, ponte e lente distante) e um **notebook
  fechado debaixo da asa** (alumínio, adesivo amarelo na tampa).
- Olhos redondos e pretos, escondidos pelo óculos; aparecem no "deal with it".
- Sobrancelhas em pixel acima do óculos carregam a expressão: neutra, convencida, surpresa, brava.
- Topete de dois cachos, rabo em ponta, asa com três penas recortadas, bico com interior e língua
  quando abre.

### Como é desenhado

`src/mascot/pixel/render.ts` pinta uma grade **128×112** a cada quadro, como um pixel artist:

1. Formas (elipses e quadriláteros) em camadas; cada pixel calcula uma normal de cúpula.
2. **Rampas de material** (`--sq-*` em `tokens.css`): borracha com 4 tons + brilho, bico com 3,
   metal com 4. Faixas limpas, dither Bayer 4×4 só nas emendas.
3. **Contorno seletivo**: tinta escura do lado da sombra, tom escuro do próprio material do lado
   da luz; linhas internas entre cabeça, asa e penas; luz de borda fria do lado oposto.
4. Detalhes carimbados pixel a pixel: óculos, sobrancelhas, olhos, boca, adesivo, teclas.
5. Água: reflexo em linhas alternadas, ondulado; faixas de luz; anéis e respingos.

No tema claro, o contorno vira marrom `#3D2A00` e a água fica clara.

### Personalidade em movimento (`src/mascot/pixel/squeak.ts`)

| Quando | O que faz |
|---|---|
| Parado | respira (squash de 1–2%), flutua 1px em degrau, abana o rabo |
| Sozinho, a cada 3–7s | brilho varre o óculos · cara de convencido · abana o rabo · olha em volta · **tira o notebook e digita** (com balão: `npm run quack`, `compilando…`) |
| Cursor | a cabeça acompanha; se o cursor passa para trás, **ele vira de lado** |
| Clique (em ciclo) | **QUACK!** de bico aberto · **deal with it** (óculos sobe, mostra os olhos, cai e quica) · **pulo com giro** e respingos · **LGTM ✓** no notebook |
| 5 cliques em 2s | fica bravo: "ei! eu sou o pato, não o bug." |
| Fechamento | ver "Squeak caminhando" abaixo |

- A simulação roda a cada quadro, mas o desenho sai a **12 fps**, como animação de sprite.
  Custo: ~6 ms por quadro desenhado.
- Escala sempre inteira (pixels nítidos). Movimento reduzido: quadro parado; o clique mostra o
  quadro-chave da reação por 1,4s.

### Squeak caminhando (fechamento: "Explique seu bug pro Squeak")

`src/mascot/pixel/walker.ts`: palco de ponta a ponta da tela, mesmo renderizador e mesma paleta.

1. Entra pela esquerda **andando de lado**, com gingado de pato (sobe/desce e balança a cada passo).
   Patas desenhadas a partir da anatomia real: pé **palmado** (três dedos para a frente unidos por
   membrana, dedinho de trás curto no calcanhar), canela grossa de 4 px, pernas recuadas no corpo.
   O pé tem ~1/4 do comprimento do corpo; no balanço a membrana **dobra** (pé mais curto) e no
   contato abre e planta. Pé de trás um tom mais escuro. De frente, sentado: leques palmados com os
   dedos abrindo para fora.
2. Está **molhado, recém-saído da lagoa**: gotinhas escorrem no corpo, gotas pingam no chão com
   respingo, ficam poças e **pegadas molhadas** que somem com dither. Vai secando ao longo do ciclo.
3. No meio: **vira de frente** (achatando no giro), **senta com as patas para a frente**, abre o
   notebook no colo (tampa vista por trás com o adesivo; a luz da tela ilumina o rosto e vaza pela
   borda) e **digita**, com as asas batendo nas teclas.
4. Um terminal pixel ao lado narra o que ele está resolvendo, linha a linha, como no app
   (`squeak fix 58` → `lendo src/auth/session.ts` → `achei: …` → `✓ testes` → `↗ PR aberto`).
   A cara acompanha: sobrancelha para cima no "achei", convencido e brilho no óculos no ✓.
5. Fecha o notebook, levanta, vira de lado e sai pela direita com "+120 XP". Reaparece pela
   esquerda, molhado de novo, e o ciclo recomeça (3 bugs em rodízio).
6. **O bug que o visitante escreve no formulário vira a próxima sessão**
   (`squeak investigate "…"`). Clique no pato: quack.

Vista de frente: óculos thug life simétrico, igual à referência (barra, duas lentes em degraus,
brilhos em diagonal, ponte vazada). Movimento reduzido: quadro parado, sentado programando, com o
terminal completo.

### Outros formatos

| Formato | Onde |
|---|---|
| Fotos de perfil (`Avatar.tsx`, `public/avatars/`) | UI: feed, call, chat, kanban, card do dev, sala de aula. Um pato por pessoa (pedro: headset amarelo · ana: fones rosa · caio: gorro · lu: óculos roxos · bia: laço · leo: óculos na testa · mari: óculos pixelados; o zé reaproveita o do caio). Gerado por `python tools/avatars.py` a partir de `tools/brand/avatars/`. |
| Sprite 16×16 (`src/office/sprites.ts`) | Escritório virtual |
| `favicon.png` e `og-image.jpg` | Renderizados do próprio motor pixel por `tools/favicon.html` e `tools/og.html` |

**Nenhuma imagem do mascote vem de IA generativa.**

## 6. Elementos-assinatura

1. **Grafo do git como espinha.** Linha vertical à esquerda que se desenha com o scroll. Cada
   seção abre com um commit (`hash` + mensagem convencional): é o rótulo real da seção, não um
   ornamento. A seção "Tudo é um evento" abre a branch azul `feat/event-bus` e faz merge no fim.
   O rodapé termina em `HEAD → main · você está aqui`.
2. **Status bar estilo IDE.** `main`, `0 conflitos`, XP de leitura (sobe com o scroll e nunca
   desce), `Ln` (linha real: scroll ÷ 24px), `Col` (coluna do cursor), toggles de som e tema.
   Ler até o fim desbloqueia a insígnia "Leu até o fim".
3. **Squeak vivo.** Flutua no lago (shader de água com reflexo amarelo), gira a cabeça para o
   cursor, faz squash & stretch e ondas na água ao clique, emite "squeak" sintetizado (Web Audio,
   som desligado por padrão).

Recursos de apoio usados com parcimônia: moldura de janela própria (sem imitar macOS/Windows),
diff, terminal, file tree, toasts de XP.

## 7. Movimento

- Easing padrão `cubic-bezier(0.22, 1, 0.36, 1)`; "spring" só para recompensas (badge, toast, XP).
- Storytelling com GSAP ScrollTrigger em três momentos fixados (problema, pilares, fluxo). O resto
  usa no máximo uma entrada suave.
- `prefers-reduced-motion`: sem boot, sem Lenis, sem pin. As seções mostram o **estado final**
  da animação (as janelas já colapsadas, o card já em Done).
- Mobile (< 900px): sem pin, sem 3D (imagem estática), mesmas informações em sequência.

## 8. Escritório virtual (pixel art)

- Resolução interna **384×216**, sempre escalada por **fator inteiro** (pixels nítidos).
- **Paleta própria de 34 cores** (`--px-*` em `tokens.css`), derivada da marca. A cena é noturna
  e escura nos dois temas: funciona como uma "tela de jogo" dentro da página.
- Fonte dos balões e do HUD: **Pixelify Sans** (legível, com acentos). O texto é HTML por cima
  do canvas, não pixels desenhados, para ser nítido e selecionável.
- Personagens: pedro (fone), ana (óculos), caio (gorro), lu (boné), bia (laço), zé (sem acessório).
- Roteiro de ~42s em loop, sempre ligado ao produto: PR aberto, review, merge (confete + XP +
  post-it vai para Done), daily na sala (a TV acende), café (vapor), build testado no fliperama,
  insígnia desbloqueada.
- Vida ambiente: código rolando nos monitores, estrelas e estrela cadente, LEDs do servidor, neon
  que pisca, planta balançando, robô aspirador, relógio do jogo.

## 9. Iconografia e insígnias

- Insígnias são **medalhões hexagonais em SVG** (`Badge.tsx`): anel no tom do tier, face esmaltada
  escura, glifo em traço 1,7px, quatro "pips" de tier embaixo. Uma única linguagem para todas, de
  sistema ou de empresa.
- Insígnia secreta = mesmo medalhão desfocado com `?`.

## 10. Tailwind

`global.css` mapeia os tokens em `@theme inline` (`bg-surface`, `text-duck`, `font-mono`...).
A landing usa CSS semântico por seção, porque cada seção tem um conceito visual próprio. O
mapeamento existe para a UI do produto herdar os mesmos tokens.
