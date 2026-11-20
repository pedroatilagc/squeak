# Como contribuir

## Estrutura

| Pasta | O que é |
|---|---|
| `services/api/` | API em Rust (Axum + SQLx) |
| `apps/desktop/` | App Tauri 2 + React |
| `apps/landing/` | Landing page (Vite + React) |
| `docs/arquitetura/` | Integrações, redesign e diagramas |
| `docs/decisoes/` | ADRs e protótipos |
| `docs/produto/` | Identidade visual e alinhamento da landing |

## Rodar localmente

Requisitos: Rust, Node.js 24, podman e o WebView2 do Windows. O passo a passo completo está no [README](README.md#-quickstart).

**API**, na raiz do repositório:

```powershell
Copy-Item .env.example .env          # só na primeira vez
powershell -File scripts\livekit-up.ps1
cargo run -p squak-api               # escuta em 127.0.0.1:8080
```

**App desktop.** Ele é o único workspace npm da raiz:

```powershell
cd apps\desktop
npm install
npm run dev                          # http://localhost:1420
```

**Landing.** Ela tem `package-lock.json` próprio e fica fora do workspace npm:

```powershell
cd apps\landing
npm install
npm run dev
```

Antes de abrir o PR, rode o mesmo que o CI roda:

```powershell
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
npm test --workspace apps/desktop; npm run build --workspace apps/desktop
cd apps\landing; npm test; npm run build
```

## Branches

Crie a branch a partir da `main` atualizada, no formato `tipo/descricao-curta`:

- `feat/github-app`
- `fix/login-bloqueado`
- `docs/prototipo-navegacao`
- `chore/estrutura-repo`

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/pt-br/), no formato `tipo(escopo): descrição`:

- `feat(landing): avatares dos personagens`
- `fix(api): ...`
- `docs(decisoes): ...`
- `chore(ci): ...`

Os tipos são `feat`, `fix`, `docs`, `refactor`, `test` e `chore`. O escopo é opcional.

## Pull requests

A `main` é protegida. Nada entra nela sem PR. Para mergear, o PR precisa de:

- **1 aprovação**;
- **CI verde** nos checks `rust`, `desktop` e `landing`;
- a branch **atualizada** com a `main`.

O modelo de PR pede o que muda, como testar e o `Closes #` da issue. O arquivo [`.github/CODEOWNERS`](.github/CODEOWNERS) diz quem é chamado para revisar cada pasta.

## Decisões de arquitetura

As decisões ficam em [`docs/decisoes/`](docs/decisoes/), uma por arquivo, numeradas (`002-design-system.md`). Abra um ADR quando a mudança escolher entre alternativas que afetam mais de uma parte do projeto, como um design system, uma estrutura de pastas ou um protocolo.
