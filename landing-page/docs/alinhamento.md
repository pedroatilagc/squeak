# Relatório de alinhamento — landing experimental do Squeak

Rodar: `npm install` e depois `npm run dev`.

Lighthouse desktop no build de produção (`npm run build && npm run preview`), 3 rodadas, GPU Intel UHD 630:
**Performance 93–95 · Acessibilidade 97 · Boas práticas 100**, com LCP de 1,0s, TBT de 40–100ms e CLS de 0,002.

> **v3 (esta revisão):** o Squeak virou um personagem 2D em pixel art, animado e interativo, desenhado
> em código (sem 3D, sem imagens de IA). O escritório virtual segue em pixel art animado.

---

## 1. Onde cada conceito do produto aparece

| Conceito | Seção | Como foi comunicado |
|---|---|---|
| Proposta "seu time inteiro num lugar só" | Hero | Título gigante e feed de eventos ao vivo mostrando chat, PR, kanban e XP na mesma linha do tempo. |
| Comunicação | Problema, Pilares (`comunicacao.ts`) | Mockup com servidores, canais, canal de voz com 3 pessoas e "compartilhando a tela". |
| Execução | Pilares (`execucao.ts`), Fluxo | Kanban com sprint e cards ligados a canais (`# auth`); no fluxo, o card desliza sozinho para Done. |
| GitHub integrado | Pilares (`github.ts`), Fluxo | Timeline do PR #42 (abriu, checks, pediu mudanças, aprovou, mergeou) e a linha "automático: card movido para Done". |
| Reputação | Pilares (`reputacao.ts`), Card do dev, Insígnias | Level, rank por temporada, card do dev com tilt e reflexo holográfico, vitrine de insígnias. |
| **Fluxo de eventos** | "Tudo é um evento" | `gh pr merge 42` gera o chip `pull_request.merged`, que viaja por 3 trilhos até Feed, Kanban e XP. A espinha do git abre a branch `feat/event-bus` e faz merge no fim. O link com o escritório virtual aparece como linha tracejada "em breve". |
| Call com contexto | "Call com contexto" | 3 patos em call; sob cada um, a task, a branch e a issue. Quem está travado aparece em laranja. |
| XP de qualidade, não de volume | Simulador de XP | Ações de qualidade dão XP. "Mandar 100 mensagens", "Ficar 8h online" e "Escrever 2.000 linhas" dão "0 XP · aqui não conta", com o botão tremendo. |
| Insígnias com tiers e raridade | "A vitrine" | 8 insígnias, legenda dos 4 tiers, raridade em texto e em barra ("Diamante · 2% dos devs"). |
| Insígnia secreta | Vitrine | Night Watch aparece desfocada como "???", com dica. |
| Insígnias de empresa | Bloco "pacote de empresa" | 3 insígnias de uma empresa fictícia. |
| Alumni | Bloco com a faixa "alumni" | "As insígnias ficam com você, marcadas como ex-membro." |
| Escritório virtual (teaser) | "Escritório virtual" | Cena em pixel art animada: 6 patos trabalham, andam, fazem pair, mergeiam PR (confete + XP + post-it vai pra Done), fazem a daily (a TV da sala acende), tomam café e testam o build no fliperama. Balões e XP saem dos mesmos eventos do feed. Clique num pato e ele dá um quack. |
| Reputação, não vigilância | Diff | `−` tempo online, tempo ocioso, "está digitando há 2h", monitoramento. `+` eventos de entrega, você controla, rankings desligáveis, exportação. |
| Para quem | "Feito pra quem entrega junto" | 4 tratamentos distintos: burndown (times), caderno com a lista de quem contribuiu e um "carona?" (sala de aula), relógio e placar (hackathon), grade de contribuições (open source). |
| Rubber duck debugging | Fechamento | Campo "Explique seu bug pro Squeak"; o pato reage e responde com uma frase aleatória. |

## 2. O que ficou confuso ou fraco

1. **"Rank por temporada" quase não aparece.** Só está como texto pequeno ("temporada 3 · #4") no card do dev e no pilar. A página não explica o que é uma temporada nem como o ranking zera.
2. **O dev controlar a visibilidade é dito, não mostrado.** O diff afirma "você controla o que aparece", mas não há um toggle visual no card do dev. Um mini switch "mostrar no card público" deixaria isso concreto.
3. **Insígnias de empresa e alumni ficaram juntos e rápidos.** Quem passa pela página pode não entender que são duas coisas diferentes: insígnias customizadas e portabilidade das insígnias.
4. **O fluxo de eventos só funciona de verdade no desktop.** No mobile vira três cards estáticos, e a ideia de "viajar" se perde.
5. **O escritório no mobile fica pequeno.** Abaixo de 384px de largura a cena escala por fator fracionário: continua legível, mas os balões ficam miúdos. Uma alternativa é mostrar só a área de trabalho no mobile.
6. **O roteiro do escritório é fixo** (~42s em loop). Ele comunica bem o conceito, mas não reage ao feed do hero. Ligar os dois ao mesmo "barramento de eventos" fictício seria a demonstração perfeita do "tudo é um evento".

## 3. Decisões que precisam da sua validação antes de virarem padrão

1. **Óculos de sol na testa como acessório fixo do Squeak.** Vieram da exploração do ícone; mudei a posição para os olhos ficarem visíveis, porque o olhar segue o cursor.
2. **Status bar amarela.** É a única área grande de amarelo da página e quebra conscientemente a regra 60-30-10. Para mim é o carimbo mais forte da marca, mas é uma escolha forte.
3. **Branch em azul, `main` em amarelo.** Gramática nova: amarelo = linha principal/recompensa, azul = trabalho paralelo/informação.
4. **Token extra `--hl` (`#8A6400`) no tema claro.** O `#C99400` pedido dá 3,0:1 sobre `#FAF8F2`, o que passa só para texto grande e ícones. Para texto pequeno (hashes, destaques) criei um amarelo mais escuro que dá 5,1:1. Precisa entrar no guia de marca se você concordar.
5. **Tokens derivados no tema claro** (`--border`, `--text-secondary`, `--surface-elevated`) e as versões escurecidas das cores semânticas para texto. O briefing não definia esses tokens.
6. **Bordão "Entregou? Contou."** Aparece no card do dev e resume o antifarming. Candidato a bordão recorrente, como o "Você leu até aqui" da AbacatePay.
7. **Mensagens de commit como rótulo de seção** (`feat:`, `fix:`, `docs:`, `wip:` para o escritório "em breve"). Se o público incluir quem não é dev (professores), pode soar críptico.
8. **Contorno marrom no 3D do tema claro:** resolvido na v2. O shader escurece a silhueta pela normal (`--duck-outline`).
9. **Personalidade do pato pixel:** o ciclo de reações (quack → deal with it → pulo → LGTM), a reação de "bravo" e as frases dos balões são propostas minhas; vale validar o tom.
10. **Estética pixel art só no escritório.** Ela é a "tela de jogo" dentro da página; o resto da marca segue vetorial e 3D. Se a pegada gamer agradar, dá para levar para os toasts de XP e as insígnias.
11. **Laço da bia** (acessório novo, só no pixel art) e o elenco fixo de 6 patos.

## 4. Desvios do briefing (para você saber)

- **"MCP findskills" não existe neste ambiente.** Usei a skill `find-skills` (`npx skills find`). Instalei `greensock/gsap-skills@gsap-scrolltrigger` (oficial, 80K instalações) e `addyosmani/web-quality-skills@accessibility` (68K) em `.agents/skills/`. Para React Three Fiber não havia skill com qualidade, e não havia MCP de Blender.
- **Skills adicionadas na v2:** `omer-metin/skills-for-antigravity@pixel-art-sprites` (3K instalações) e `minimax-ai/skills@shader-dev` (2,6K), as duas marcadas como seguras. Princípios aplicados: silhueta antes de detalhe, paleta limitada, ciclos curtos, escala inteira; WebGL2, raymarching com caixa delimitadora e normal pelo tetraedro.
- **Sem three.js** na v2: `three`, `@react-three/fiber` e `@react-three/drei` foram removidos. O chunk do mascote caiu de 888KB para 16KB.
- **Versões fixadas:** Vite 5.4, React 18.3, three 0.169, R3F 8.17, drei 9.114, GSAP 3.12, Lenis 1.1, Tailwind 4.1.4. O Tailwind 4.0.0 quebrou com um erro interno no plugin do Vite, por isso subi para a 4.1.4.
- **CTAs** não têm função, como pedido. Ao clicar, mostram um toast honesto ("A lista ainda não abriu... é só um protótipo").
- **Assets do Gemini arquivados**, não apagados: `assets/generated/landing-v1-gemini/` (fora de `public/`, não entram no build).

## 5. Revisão crítica (olhar de diretor de arte)

O que ainda parece genérico ou mediano:

- **"Para quem"** ainda é, no fundo, uma grade de cartões. Os tratamentos internos são diferentes, mas a moldura é igual nos quatro. Próximo passo: cada cenário com um formato próprio (o caderno ocupando a largura toda, o hackathon como um telão).
- **A seção da call** tem respiro demais embaixo e pouco movimento. A onda de áudio é o único detalhe vivo.
- **Problema → Squeak**: o colapso funciona, mas a janela final do Squeak é pequena e pouco celebrada. Ela merecia um "pop" com o pato aparecendo.
- **Copy**: o humor está leve e consistente. Os pontos mais fortes são "0 commits · carona?", "nenhum pato foi ferido no debugging" e o simulador. Os títulos de seção ainda podem ganhar mais personalidade.

O que considero forte e manteria como padrão: espinha do git + commits como rótulos, a status bar, o simulador de XP, o diff de "não vigilância" e as insígnias em SVG.

---

## 6. Assets da página (v3, sem IA generativa)

| Arquivo | Origem | Como regenerar |
|---|---|---|
| Squeak (hero e fechamento) | Desenhado em tempo real pelo motor pixel (`src/mascot/pixel/`) | — |
| `public/assets/mascot/og-image.jpg` (1200×630) | HTML com as fontes da marca + quadro do motor pixel | `npm run dev`, abrir `/tools/og.html`, capturar em 1200×630 |
| `public/favicon.png` (64×64) | Recorte da cabeça do quadro do motor pixel | `/tools/favicon.html`, capturar em 64×64 com fundo transparente |
| Bancada de poses | `/tools/pixel-duck.html?p=idle,quack,deal,type,jump,angry&s=4` | — |

O escritório virtual também não usa nenhuma imagem (`src/office/`).

> **Histórico:** a v2 tinha um mascote 3D em shader SDF; foi rejeitado e removido na v3 em favor do
> personagem pixel. Os arquivos do 3D não existem mais no projeto.

### Histórico: assets da v1 (Gemini)

Os 4 assets gerados na v1 com `google/gemini-3-pro-image-preview` (`squeak-sheet`, `squeak-hero-ref`,
`office-isometric`, `og-image`) foram rejeitados na revisão e estão arquivados em
`assets/generated/landing-v1-gemini/`. Os prompts originais ficam registrados abaixo para referência.

### `squeak-sheet.png` — 16:9, 4K (referência: `assets/generated/squeak-v4a.png`)

Avaliação: consistente nas 6 figuras, com as cores corretas. Defeito: um filete azul de rim light parece um contorno deslocado. Serve como referência. Usada como `input_images` nas três gerações seguintes.

```
Professional character model sheet for "Squeak", a rubber duck mascot of a software platform for developer teams. Use the attached image only as a reference for the character's personality, proportions and glossy rubber look.

LAYOUT (single wide 16:9 sheet, solid flat background #0F1420 everywhere, no panels, no boxes, no grid lines, no text or labels of any kind):
- Top row, left to right, the same duck at identical scale standing on an invisible baseline: FRONT view, SIDE PROFILE view (facing right), and THREE-QUARTER view (facing right).
- Bottom row: three head-and-shoulders expression studies of the same duck: HAPPY (big open-beak smile, eyes squinting with joy), FOCUSED (calm, slight determined squint, beak closed, like reading code), SURPRISED (eyes wide open, round beak open in an "oh!").
Even spacing, generous margins, every figure fully visible and not cropped.

CHARACTER DESIGN (must be identical in all six figures):
- Classic rubber duck silhouette: big round head about 55% of body height, plump rounded body with a short upturned tail, small rounded wing on each side. Cute, confident, approachable.
- Body color exactly #FFC83D, core shadows #D99A1A, soft highlight #FFE08A on top of the head and along the back.
- Beak exactly #FF8A3D, wide, soft and rounded, with a slightly darker orange inner line.
- Eyes: large, oval, dark #1A1F2B with one crisp white catch-light dot each — the eyes must be clearly visible.
- Signature accessory: a pair of classic black sunglasses (standard frame: two rounded-rectangle lenses joined by one simple bridge, no top bar) pushed UP and resting on top of the head like a headband, never covering the eyes.

STYLE: modern polished vector illustration for a premium tech brand — clean shapes, smooth shading with 2–3 tones per color, subtle glossy rubber highlights, soft rim light in cool blue #4DA3FF on the edges facing away from the main light. No outlines. Consistent top-left key light in all figures. High-end, crisp, professional, full of personality.

AVOID: text, letters, numbers, labels, logos, watermark, frames, panels, color swatches, extra characters, realistic feathers, hard black outlines, gradients in the background, ground shadows heavier than a soft contact shadow.
```

### `squeak-hero-ref.png` — 1:1, 4K (referência: `squeak-sheet`)

Avaliação: excelente, fiel à folha, com borracha brilhante, reflexo e ondas. O fundo puxa um pouco para azul-violeta e é mais escuro que `#0F1420` nas bordas; resolvido com máscara radial no CSS. Uso: referência do 3D, imagem estática no mobile e enquanto o 3D não carrega.

```
Hero illustration of "Squeak", the exact rubber duck character from the attached character sheet (same proportions, same big oval dark eyes with white catch-lights, same rounded #FF8A3D beak, same black sunglasses resting on top of the head, same #FFC83D body with #FFE08A highlights and #D99A1A shadows).

SCENE: the duck floats calmly on a dark, still pond at night. Three-quarter view facing right, slight confident smile. The water is very dark navy #0F1420, almost black, with gentle concentric ripples spreading from the duck's body. A soft, warm yellow reflection of the duck shimmers on the water below it, broken by the ripples. Above the water the background is the same solid deep navy #0F1420, fading to pure #0F1420 at all four edges so the image blends seamlessly into a web page of that color.

LIGHTING: one soft warm key light from the upper left that makes the rubber look glossy (smooth specular highlights on head and back), a subtle cool blue rim light #4DA3FF on the right edge of the duck, and a faint warm glow on the water around it. Cinematic but restrained.

FRAMING: square, duck centered horizontally, sitting slightly below the vertical center, occupying about 45% of the frame width, generous empty dark space around it. Sharp focus on the duck.

STYLE: premium polished 3D-illustration look, glossy vinyl rubber material, smooth, clean, high-end tech brand quality.

AVOID: text, logos, watermark, stars, moon, plants, other ducks, land, horizon line, bright sky, vignette in a different color, busy reflections, realistic feathers.
```

### `office-isometric.png` — 16:9, 4K (referência: `squeak-sheet`)

Avaliação: muito boa. Patos variados (fone, gorro, óculos, caneca), espaço livre sobre as cabeças para os balões, paleta da marca. O fundo saiu `#15162A`, não `#0F1420`; por isso a cena fica numa moldura com o token `--office-bg`.

```
Clean isometric illustration of a cozy virtual office for a developer team, where every worker is a small rubber duck in the style of the attached character sheet (same yellow #FFC83D body, orange #FF8A3D beak, dark oval eyes; some ducks wear the black sunglasses on their heads, some don't — vary slightly so they read as different teammates: one with a tiny headset, one with a little beanie, one holding a coffee mug).

SCENE: a single isometric floor slab floating on a solid background #0F1420, seen from a classic 2:1 isometric angle. Three small rooms divided by low half-walls: (1) an open desk area with four desks, each with a monitor glowing with abstract colored code lines, one duck per desk; (2) a small meeting room with a round table where two ducks sit facing a wall screen; (3) a lounge corner with a beanbag, a plant and a coffee machine with one duck. Floors in dark slate #212839 with subtle tile seams, walls in #2C3448, desks in #171D2B with warm wood tops. Small accents of #4DA3FF (screen glow) and #3DDC97 (a tiny status light on each monitor).

LEAVE EMPTY SPACE above each duck's head — no speech bubbles, no text, the web page will overlay its own labels there.

STYLE: modern, clean vector isometric illustration, soft flat shading with 2–3 tones per surface, gentle ambient occlusion, warm lamp light pooling on desks, crisp edges, consistent light from top-left. Premium tech-brand illustration quality, charming and calm.

FRAMING: office centered, occupying about 75% of the width, plenty of solid #0F1420 margin on all sides, nothing touching the edges.

AVOID: text, letters, numbers, logos, watermark, speech bubbles, people/humans, real brand logos on screens, background gradients, outer frame.
```

### `og-image.png` → `og-image.jpg` — 16:9, 4K, recortada para 1200×628 (referências: `squeak-hero-ref` e `squeak-sheet`)

Avaliação: excelente na primeira tentativa. Texto escrito corretamente, com acento; o grafo do git aparece na lateral. A fonte do wordmark não é a Bricolage real (o modelo aproxima), então para um OG definitivo vale compor o texto em código.

```
Social share banner (wide 16:9, will be cropped to 1.91:1, so keep everything important inside the central 90% vertically) for "Squeak", a workspace for developer teams.

COMPOSITION: left half holds the wordmark, right half holds the mascot.
- LEFT: the single word "squeak" in lowercase, huge, bold, tight modern grotesque display typeface (similar feel to Bricolage Grotesque ExtraBold), color off-white #F2F4F8, vertically centered, left-aligned with generous left margin. Directly under it, a small monospace line in #9AA3B5: "seu time inteiro num lugar só." Spell every word exactly like this, with these accents. No other text anywhere.
- RIGHT: the exact rubber duck character from the attached references (same body #FFC83D with #FFE08A highlights and #D99A1A shadows, same rounded #FF8A3D beak, same big dark oval eyes #1A1F2B with white catch-lights, same black sunglasses resting on top of the head), floating on a dark still pond, three-quarter view facing left toward the text, soft concentric ripples, warm yellow reflection on the water.
- A thin vertical line in #2C3448 runs down the far left edge with three small circular dots on it, one filled yellow #FFC83D (like a git commit graph) — subtle.

BACKGROUND: solid deep navy #0F1420 everywhere, the water fading seamlessly into it, a faint warm glow behind the duck. No gradient banding, no vignette in another color.

STYLE: premium, polished tech-brand look; glossy rubber material with a soft cool rim light #4DA3FF on the duck; crisp typography; lots of negative space.

AVOID: any extra words, logos of other companies, watermark, frames, borders, UI screenshots, multiple ducks, stars, moon.
```
