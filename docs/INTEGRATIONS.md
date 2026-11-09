# Integrações (arquitetura e contratos futuros)

Estado: **GitHub implementado** (ver `GITHUB_INTEGRATION.md`). **Jira não está implementado**: a API só declara o provedor
com `status: "planned"` em `GET /integrations` e nunca chama o Jira. Tudo na seção "Jira (proposta)" é contrato futuro.

## Arquitetura

```
HTTP (Axum)            handlers por área           domínio puro        fronteira externa          banco
-----------            -----------------           -----------         -----------------          -----
/integrations     ->   integrations.rs             IntegrationProvider
/github/*         ->   github/{profile,contributions,events,pull_requests,repositories}
/servers/{id}/... ->   github/{developer_activity,repositories,pull_requests}
/webhooks/github  ->   github/webhooks
                       github/authentication  ---> github/domain  <--- github/client (trait GitHubApi) ---> github/store (SQL)
                                                                         ├─ HttpGitHub  (reqwest + rustls)
                                                                         └─ MockGitHub  (fixtures, "mock": true)
```

Camadas e regras:

- `domain`: tipos serializáveis e regras puras (agregação de checks, status de revisão, filtros). Sem I/O, testável sozinho.
- `client`: único ponto que fala com o provedor. O trait `GitHubApi` é object-safe (`async-trait`) e fica em `AppState.github`
  (`Arc<dyn GitHubApi>`). Testes injetam outro cliente com `AppState::with_github`. O mock só entra com `GITHUB_MOCK=1` ou
  em teste, e toda resposta que ele produz carrega `"mock": true`.
- `store`: todo o SQL. Sem regra de negócio.
- handlers: validam permissão (`require_member`/`require_admin`), chamam client/store e montam o JSON do contrato.
- `crypto`: AES-256-GCM para tokens em repouso. A chave vem do ambiente, nunca do banco.
- Erros: `ApiError::Coded(status, code, msg)` serializa `{ "error", "code" }`. Erros do provedor são classificados em
  `GhError` (`Unauthorized`, `RateLimited`, `NotFound`, `Upstream`) sem detalhes; só o `code` chega ao cliente.

### `IntegrationProvider`

`services/api/src/integrations.rs`:

```rust
#[async_trait]
pub trait IntegrationProvider: Send + Sync {
    fn id(&self) -> &'static str;                 // "github", "jira"
    fn display_name(&self) -> &'static str;
    fn permissions_note(&self) -> &'static str;   // o que a integração lê
    async fn status(&self, s: &AppState, user_id: &str) -> ApiResult<ProviderStatus>;
    async fn connect(&self, s: &AppState, user_id: &str) -> ApiResult<Value>;
    async fn disconnect(&self, s: &AppState, user_id: &str) -> ApiResult<()>;
}
```

`registry()` devolve os provedores na ordem exibida; `GET /integrations` percorre o registro. `status` é um de
`unconfigured | disconnected | connected | reauth_required | planned`.

### Como adicionar um provedor

1. Migração nova `NNNN_<provedor>.sql` (nunca altere migrações antigas). Tokens sempre cifrados com `github::crypto`
   (ou um `crypto` compartilhado, se um segundo provedor justificar extrair).
2. Módulo `src/<provedor>/` com `domain`, `client` (trait + HTTP real + mock), `store` e handlers, espelhando `github/`.
3. Estruture a config em `config.rs` (struct própria com `Default` e `Debug` que não imprime segredos) e leia no `Config::from_env`.
4. Implemente `IntegrationProvider` e registre em `integrations::registry()`.
5. Rotas em `lib.rs`. Rotas de servidor usam `require_member` (404 para não-membro) e `require_admin` para escrita.
6. Webhooks: corpo bruto (`Bytes`), assinatura validada em tempo constante antes de parsear, idempotência por id de entrega
   e por chave de deduplicação do evento de domínio.
7. Eventos que alimentam o feed entram em `github_events`-equivalente (ou numa tabela genérica `integration_events`
   se o formato convergir) e saem em `GET /servers/{id}/activity` com `source` do provedor.
8. Testes com cliente injetado e SQLite em memória; nada de rede.

---

## Jira (proposta, NÃO implementado)

Nada abaixo existe no código. É a forma pretendida para quando a integração for feita.

### Autenticação: Atlassian OAuth 2.0 (3LO)

- Autorização: `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=…&scope=…&redirect_uri=…&state=…&response_type=code&prompt=consent`.
- Troca de código: `POST https://auth.atlassian.com/oauth/token` (`grant_type=authorization_code`).
- Renovação: `grant_type=refresh_token`, exige o escopo `offline_access`. O refresh token do Atlassian **rotaciona** a cada uso
  (guardar o novo, serializar renovações como já é feito no GitHub).
- Sites acessíveis: `GET https://api.atlassian.com/oauth/token/accessible-resources` (devolve `cloudId` e `url` de cada site).
- Todas as chamadas: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...` com `Authorization: Bearer`.
- Escopos mínimos (somente leitura): `read:jira-work`, `read:jira-user`, `offline_access`.
- Diferente do GitHub, não há Device Flow: o desktop (Tauri) precisa de redirect. Opções: loopback `http://127.0.0.1:<porta>/callback`
  aberto pelo app, ou callback na própria API com `state` assinado e vinculado à sessão do Squak. O frontend continua sem ver tokens.
- Tabelas propostas: `jira_accounts(user_id PK, account_id, cloud_id, site_url, access_token_enc, refresh_token_enc, access_expires_at, status, connected_at)`
  e `server_jira_projects(id PK, server_id, cloud_id, project_key, project_id, activity_channel_id NULL, created_by, created_at, UNIQUE(server_id, project_id))`.

### Endpoints REST v3 previstos

| Necessidade | Endpoint |
|---|---|
| Listar projetos visíveis | `GET /rest/api/3/project/search?startAt=&maxResults=` |
| Issues de um projeto | `GET /rest/api/3/search/jql?jql=project=KEY ORDER BY updated DESC&fields=summary,status,priority,assignee,updated,created&nextPageToken=` |
| Uma issue | `GET /rest/api/3/issue/{key}?fields=summary,status,priority,assignee,reporter,labels` |
| Responsável (assignee) | campo `fields.assignee` (`accountId`, `displayName`, `avatarUrls`) |
| Status | campo `fields.status` (`name`, `statusCategory.key`: `new`/`indeterminate`/`done`) |
| Prioridade | campo `fields.priority` (`name`, `iconUrl`) |
| Comentários | `GET /rest/api/3/issue/{key}/comment?orderBy=-created` |
| Histórico de mudanças | `GET /rest/api/3/issue/{key}/changelog` ou `?expand=changelog` |

Observações: a busca por JQL usa paginação por token (`nextPageToken`), não por `startAt`. Comentários e descrições vêm em
Atlassian Document Format (JSON); o Squak deve converter para texto simples, nunca renderizar HTML recebido.

### Webhooks

- Registro dinâmico: `POST /rest/api/3/webhook` (apps OAuth 3LO), com JQL de filtro e eventos
  `jira:issue_created`, `jira:issue_updated`, `comment_created`, `comment_updated`. Webhooks dinâmicos **expiram em 30 dias** e
  precisam ser renovados (`PUT /rest/api/3/webhook/refresh`).
- Autenticação do webhook: assinatura HMAC com segredo definido no registro (header `X-Hub-Signature`, formato `sha256=<hex>`),
  validada em tempo constante sobre o corpo bruto, como no GitHub.
- Idempotência: `X-Atlassian-Webhook-Identifier` por entrega; chave de domínio `issue:<cloudId>:<issueId>:<evento>:<updated>`.
- Endpoint proposto: `POST /webhooks/jira`.

### Mapeamento para o feed de atividade (`GET /servers/{id}/activity`)

| Evento Jira | `source` | `kind` | `action` | `title` (exemplo) | `detail` |
|---|---|---|---|---|---|
| issue criada | `jira` | `issue` | `created` | `Ana criou PROJ-12` | `{ key, summary, status, priority, assignee }` |
| mudança de status | `jira` | `issue` | `transitioned` | `Ana moveu PROJ-12 para Em revisão` | `{ key, from, to }` (do changelog) |
| mudança de responsável | `jira` | `issue` | `assigned` | `Ana atribuiu PROJ-12 a Bob` | `{ key, assignee }` |
| comentário | `jira` | `issue_comment` | `created` | `Ana comentou em PROJ-12` | `{ key }` |

`repo` fica `null` e o filtro por projeto usaria um novo parâmetro `project` (ou reuso de `repo` com a chave do projeto, a decidir).
`actor.name` seria o `displayName` do Jira. Eventos só entram para projetos vinculados ao servidor.
