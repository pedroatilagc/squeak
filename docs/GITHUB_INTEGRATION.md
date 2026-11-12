# Integração GitHub (contrato da API e configuração)

Estado: **código implementado e testado com mocks**. A integração real com o GitHub está **pendente de configuração**
(é preciso criar a GitHub App abaixo). Sem credenciais, a API responde `status: "unconfigured"` e a interface mostra isso.
Nada aqui foi validado contra o GitHub de verdade.

## Princípios de segurança

- O frontend e o app Tauri **nunca** veem tokens do GitHub. Só a API Rust (Axum) fala com o GitHub.
- Tokens (`access_token`, `refresh_token`) ficam no SQLite **cifrados com AES-256-GCM** (chave em `GITHUB_TOKEN_KEY`, nunca no banco).
  Nonce aleatório de 12 bytes por valor, guardado junto do texto cifrado.
- A chave privada da GitHub App e o `client_secret` ficam só no ambiente do servidor (`.env`, fora do Git).
- Login no Squak e conexão com o GitHub são independentes: a conta GitHub é uma conexão opcional de um usuário já logado.
- Fluxo de autorização: **Device Flow** da GitHub App (sem redirect, ideal para desktop). Tokens de usuário expiram em 8 h e
  são renovados pelo `refresh_token` (a API usa o `client_secret` para renovar; o cliente desktop não tem acesso a ele).
- Permissões mínimas pedidas à GitHub App (veja "Criar a GitHub App").
- Desconectar: a API revoga a autorização no GitHub (`DELETE /applications/{client_id}/grant`) e apaga os tokens locais.
- Webhooks: assinatura `X-Hub-Signature-256` (HMAC-SHA256 com `GITHUB_WEBHOOK_SECRET`) validada em tempo constante **antes** de
  qualquer processamento; idempotência por `X-GitHub-Delivery` e por chave de deduplicação de domínio.
- Contribuições: usa o calendário oficial do GraphQL (`contributionsCollection.contributionCalendar`). `totalContributions` **não é**
  número de commits: soma commits, issues, PRs e reviews e, se o usuário permitir, contribuições privadas anonimizadas.

## Variáveis de ambiente (`.env`, ver `.env.example`)

| Variável | Para quê |
|---|---|
| `GITHUB_APP_CLIENT_ID` | Client ID da GitHub App (Device Flow) |
| `GITHUB_APP_CLIENT_SECRET` | Client secret (renovação do token e revogação) |
| `GITHUB_APP_SLUG` | Slug da app, usado no link de instalação |
| `GITHUB_WEBHOOK_SECRET` | Segredo do webhook |
| `GITHUB_TOKEN_KEY` | 32 bytes em base64 (`openssl rand -base64 32`), cifra tokens no banco |
| `GITHUB_API_BASE` | Padrão `https://api.github.com` (só muda em testes) |
| `GITHUB_MOCK` | `1` liga o cliente simulado (desenvolvimento). Toda resposta traz `"mock": true` |

Estados de configuração: faltou qualquer uma de `CLIENT_ID`, `CLIENT_SECRET`, `TOKEN_KEY` e `GITHUB_MOCK` não é `1` →
**`unconfigured`**. Webhooks exigem também `GITHUB_WEBHOOK_SECRET` (sem ele, `/webhooks/github` responde 503).

## Criar a GitHub App (passo a passo)

1. GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**.
2. Nome e Homepage URL à sua escolha. **Callback URL**: não é usada pelo Device Flow, mas o formulário exige um valor
   (ex.: `http://127.0.0.1:8080/integrations/github/callback`). Desmarque "Expire user authorization tokens"? **Não**: deixe marcado
   (tokens de 8 h com refresh). Marque **Enable Device Flow**.
3. **Webhook**: Active; URL = `https://<seu-host-publico>/webhooks/github` (use um túnel como `cloudflared`/`ngrok` em dev);
   Secret = valor de `GITHUB_WEBHOOK_SECRET`.
4. Permissões de **repositório** (somente leitura): Contents, Metadata, Pull requests, Issues, Checks, Actions, Commit statuses.
   Permissões de **conta**: nenhuma é necessária para perfil público e contribuições públicas
   (as contribuições privadas aparecem como contagem anônima se o usuário habilitar "Private contributions" no perfil do GitHub).
5. Eventos assinados: `push`, `pull_request`, `pull_request_review`, `issues`, `issue_comment`, `check_suite`, `workflow_run`.
6. Crie a app, copie **Client ID**, gere um **Client secret** e anote o **slug** (final da URL pública da app).
7. Preencha o `.env`, reinicie a API e, em Integrações → GitHub, clique em **Conectar**.
8. Para ligar repositórios a um workspace: instale a app na conta/organização (botão "Instalar a GitHub App" na tela do workspace).

## Dados guardados (migração `0002_github.sql`)

- `github_accounts(user_id PK, github_id, login, avatar_url, access_token_enc, refresh_token_enc, access_expires_at, refresh_expires_at, scopes_note, connected_at, status)`
- `github_device_flows(flow_id PK, user_id, device_code_enc, user_code, expires_at, interval_s, created_at)`
- `server_github_repos(id PK, server_id, installation_id, repo_id, repo_full_name, activity_channel_id NULL, created_by, created_at, UNIQUE(server_id, repo_id))`
- `github_deliveries(delivery_id PK, received_at)` (idempotência de toda entrega processada, mesmo sem evento de domínio)
- `github_events(id PK, delivery_id UNIQUE, dedupe_key UNIQUE, repo_id, repo_full_name, kind, action, actor_login, actor_avatar, title, url, payload_json, occurred_at, received_at)`
- `github_pull_requests(repo_id, number, ..., PRIMARY KEY(repo_id, number))`, `github_pr_reviews(repo_id, number, reviewer_login, reviewer_avatar, state, submitted_at, PRIMARY KEY(repo_id, number, reviewer_login))`
- `github_checks(repo_id, head_sha, source, name, status, conclusion, updated_at, PRIMARY KEY(repo_id, head_sha, source, name))`

## Erros

Formato: `{ "error": "mensagem", "code": "<codigo>" }` (o campo `code` só aparece nos erros abaixo).

| HTTP | `code` | Quando |
|---|---|---|
| 503 | `github_unconfigured` | Credenciais da GitHub App ausentes |
| 409 | `github_disconnected` | Usuário ainda não conectou o GitHub |
| 409 | `github_reauth_required` | Token revogado/expirado e sem refresh válido (a conta vira `reauth_required`) |
| 429 | `github_rate_limited` | Limite do GitHub |
| 502 | `github_upstream` | Falha do GitHub (rede, 5xx, GraphQL `errors`) |

Demais erros seguem o formato existente (`401`, `403`, `404`, `400`). `GET /github/installations/{id}/repositories` de instalação invisível → `404`.
O Jira declarado em `GET /integrations` responde `501 integration_planned` se alguém tentar conectar.

## Endpoints (todos com `Authorization: Bearer <sessão do Squak>`, exceto o webhook)

JSON em `snake_case`. Datas em ISO 8601 UTC (`2026-11-08T12:00:00Z`), como vêm do GitHub; `*_at_ms` seria inteiro e não é usado.

### Integrações

`GET /integrations` →
```json
{ "integrations": [
  { "provider": "github", "name": "GitHub", "status": "unconfigured|disconnected|connected|reauth_required",
    "mock": false, "account": { "login": "octocat", "avatar_url": "https://…" } | null,
    "app_slug": "meu-app" | null, "install_url": "https://github.com/apps/meu-app/installations/new" | null,
    "permissions_note": "texto curto sobre o que é lido" },
  { "provider": "jira", "name": "Jira", "status": "planned", "mock": false, "account": null, "app_slug": null, "install_url": null,
    "permissions_note": "Atlassian OAuth 2.0 (3LO) – ainda não implementado" } ] }
```

`POST /integrations/github/device` → `{ "flow_id": "uuid", "user_code": "WDJB-MJHT", "verification_uri": "https://github.com/login/device", "expires_in": 899, "interval": 5 }`

`POST /integrations/github/device/poll` body `{ "flow_id": "uuid" }` →
`{ "status": "pending|slow_down|connected|denied|expired", "interval": 5 }` (`interval` só em `pending`/`slow_down`, em segundos).
`connected` grava a conta (tokens cifrados). `denied`/`expired` apagam o fluxo.

`DELETE /integrations/github` → `{ "ok": true }` (revoga no GitHub quando possível e apaga tokens; idempotente).

### Perfil, contribuições, atividade (usuário conectado; GraphQL)

`GET /github/profile` →
```json
{ "mock": false, "login": "octocat", "name": "The Octocat"|null, "avatar_url": "…", "bio": "…"|null, "html_url": "https://github.com/octocat",
  "company": null, "location": null, "followers": 10, "following": 2, "public_repos": 8, "created_at": "2011-01-25T18:44:36Z",
  "repositories": [ { "name_with_owner": "octocat/hello", "description": null, "url": "…", "stars": 5, "forks": 1,
      "primary_language": { "name": "Rust", "color": "#dea584" } | null, "pushed_at": "…", "is_private": false } ],
  "languages": [ { "name": "Rust", "color": "#dea584", "size": 12345, "percent": 61.2 } ] }
```
`repositories`: até 6, ordenados por `pushed_at` desc (repositórios próprios, não forks). `languages`: soma de `languages(first:…)` desses repositórios, ordenada por `size`, com `percent` calculado pela API, no máximo 8.

`GET /github/contributions?from=<ISO>&to=<ISO>` (opcionais; padrão: últimos 365 dias até agora; intervalo máximo de 1 ano → 400) →
```json
{ "mock": false, "from": "…", "to": "…", "total_contributions": 412, "total_commits": 300, "total_issues": 10, "total_pull_requests": 40,
  "total_reviews": 62, "restricted_contributions": 0, "has_restricted": false, "colors": ["#ebedf0","#9be9a8","#40c463","#30a14e","#216e39"],
  "weeks": [ { "first_day": "2025-11-09", "days": [ { "date": "2025-11-09", "count": 0, "level": "NONE|FIRST_QUARTILE|SECOND_QUARTILE|THIRD_QUARTILE|FOURTH_QUARTILE", "color": "#ebedf0", "weekday": 0 } ] } ] }
```
`total_contributions` vem de `contributionCalendar.totalContributions` (não é contagem de commits). `weekday` 0 = domingo.

`GET /github/activity?types=commit,pull_request,review,issue,repository&from=&to=&limit=100` (padrão: últimos 30 dias; `limit` máx. 200; `types` inválido → 400) →
```json
{ "mock": false, "from": "…", "to": "…", "truncated": false,
  "items": [ { "id": "stable-id", "type": "commit|pull_request|review|issue|repository", "title": "Abriu PR #12: título", "repo": "octocat/hello",
      "url": "https://github.com/…", "occurred_at": "…", "author": { "login": "octocat", "avatar_url": "…" },
      "detail": { "count": 3 } | { "number": 12, "state": "OPEN" } | null } ] }
```
Montada com GraphQL (`commitContributionsByRepository`, `pullRequestContributions`, `pullRequestReviewContributions`, `issueContributions`,
`repositoryContributions`), **não** com `/events`. Ordenada por `occurred_at` desc. Para `commit` o item é por repositório com `detail.count`
(a API de contribuições agrega commits por repositório e dia; `occurred_at` é o dia, e `url` aponta para a lista de commits do dia).

`GET /github/pull-requests?role=authored|review_requested` (padrão `authored`) → `{ "mock": false, "items": [PullRequestCard] }` (até 50, mais recentes primeiro).

### PullRequestCard

```json
{ "id": "gh-node-id-or-repo#number", "number": 12, "title": "…", "url": "https://github.com/…", "repo": "octocat/hello",
  "author": { "login": "octocat", "avatar_url": "…" }, "head_ref": "feat/x", "base_ref": "main",
  "state": "open|closed|merged", "is_draft": false,
  "review_status": "approved|changes_requested|review_required|none",
  "reviewers": [ { "login": "ana", "avatar_url": "…", "state": "APPROVED|CHANGES_REQUESTED|COMMENTED|PENDING|DISMISSED" } ],
  "approvals": 1,
  "checks": { "state": "success|failure|pending|neutral|none|unknown", "total": 4 },
  "created_at": "…", "updated_at": "…" }
```
`state` (ciclo de vida do PR) e `checks.state` (CI) são **independentes**. `review_status` vem do GraphQL `reviewDecision` quando existe,
senão é derivado das reviews recebidas pelo webhook (`changes_requested` se alguma ativa pede mudança, `approved` se há aprovação e nenhum pedido, `none` caso contrário).
`checks.state = "none"` quando não há verificações; `unknown` quando a origem não informou. Nenhum campo é inventado.

### Instalações e repositórios de servidor (admin do servidor)

`GET /github/installations` → `{ "mock": false, "items": [ { "id": 123, "account_login": "minha-org", "account_avatar_url": "…", "repository_selection": "all|selected" } ] }`
(instalações da GitHub App que o usuário conectado pode ver: `GET /user/installations`).

`GET /github/installations/{id}/repositories` → `{ "items": [ { "id": 1, "full_name": "minha-org/api", "private": true } ] }`
(`GET /user/installations/{id}/repositories` com o token do usuário; só mostra o que o usuário já pode acessar).

`GET /servers/{id}/github` (membro) →
```json
{ "configured": true, "mock": false, "can_manage": true, "install_url": "…"|null,
  "links": [ { "id": "uuid", "installation_id": 123, "repo_id": 1, "repo_full_name": "minha-org/api", "activity_channel_id": "uuid"|null } ] }
```

`PUT /servers/{id}/github/repos` (admin/dono) body
`{ "installation_id": 123, "repos": [ { "id": 1, "full_name": "minha-org/api" } ], "activity_channel_id": "uuid"|null }` → mesmo formato do `GET /servers/{id}/github`.
Substitui os vínculos **daquela instalação** neste servidor. Cada repo é verificado com o token do usuário (só repositórios que ele acessa; instalação ou repo invisível → 403); `full_name` gravado é o que o GitHub devolve, não o do corpo.
`activity_channel_id`, se informado, precisa ser canal de texto do mesmo servidor (senão 400).

`DELETE /servers/{id}/github/repos/{link_id}` (admin/dono) → `{ "ok": true }`.

### Atividade e PRs do servidor (membro)

`GET /servers/{id}/activity?actor=&repo=&kind=&before=<cursor>&limit=50` →
```json
{ "items": [ { "id": "ev:uuid", "source": "github|concord",
    "kind": "push|pull_request|review|issue|issue_comment|check|workflow|member_joined|channel_created",
    "action": "opened|closed|merged|approved|changes_requested|…"|null,
    "actor": { "name": "ana", "avatar_url": "…"|null, "user_id": "uuid"|null },
    "title": "Ana abriu o PR #12", "repo": "minha-org/api"|null, "url": "https://github.com/…"|null,
    "occurred_at": "2026-11-08T12:00:00Z", "detail": { … }|null } ],
  "next_before": "cursor"|null,
  "filters": { "actors": ["ana"], "repos": ["minha-org/api"], "kinds": ["push","pull_request"] } }
```
Mistura `github_events` dos repositórios vinculados ao servidor com eventos do próprio Squak derivados do banco
(`member_joined` de `server_members.joined_at`, `channel_created` de `channels.created_at`). Ordem: `occurred_at` desc; cursor opaco.
`actor` casa com `actor.name` (login do GitHub ou username, sem diferenciar maiúsculas). `channel_created` não tem autor no banco: `actor.name` é `"Squak"`.
`/servers/{id}/activity` e `/servers/{id}/pull-requests` leem só o banco: funcionam (vazios) mesmo sem GitHub configurado; o 503 vale para rotas que chamam o GitHub e para `PUT .../github/repos`. `kind` filtra pelo campo `kind`. Sem eventos → `items: []` (nada é inventado).
Eventos de chamada (entrar em voz) não são persistidos hoje; só existem ao vivo no WebSocket e **não** entram neste feed.

`GET /servers/{id}/pull-requests?state=open|in_review|approved|changes_requested|merged|closed` (opcional) → `{ "items": [PullRequestCard] }`
Montado somente do que chegou por webhook (`github_pull_requests`, `github_pr_reviews`, `github_checks`). `in_review` = aberto, não rascunho, com `review_status` em `review_required` ou `none`.
`approved` = aberto com `review_status = approved`; `changes_requested` análogo; `open` = `state = open` (qualquer revisão).

### Webhook (sem Bearer)

`POST /webhooks/github` — cabeçalhos `X-GitHub-Event`, `X-GitHub-Delivery`, `X-Hub-Signature-256`.
Corpo lido **bruto** (bytes) para validar a assinatura. Respostas: `401` assinatura ausente/inválida; `503` segredo não configurado;
`200 {"ok":true,"duplicate":true}` se o `delivery_id` já foi processado; `200 {"ok":true}` processado; `200 {"ok":true,"ignored":true}` evento sem repositório vinculado ou sem tratamento;
`400` JSON inválido. Eventos tratados: `push`, `pull_request`, `pull_request_review`, `issues`, `issue_comment`, `check_suite`, `workflow_run`.
Idempotência: `delivery_id` único e `dedupe_key` único por evento de domínio (ex.: `push:<repo_id>:<after_sha>`, `pull_request:<repo_id>:<number>:<action>:<updated_at>`).
Para cada servidor com o repositório vinculado, publica no hub WebSocket: `{ "type": "github.event", "server_id": "…", "item": <item de atividade> }` e,
em eventos de PR/review/check, `{ "type": "github.pr_updated", "server_id": "…", "repo": "owner/name", "number": 12 }`.

## Jira (futuro)

Contratos e módulo em `docs/INTEGRATIONS.md`. Nada de Jira é chamado hoje.
