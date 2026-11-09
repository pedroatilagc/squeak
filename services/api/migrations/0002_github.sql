-- Integração GitHub. Tokens ficam cifrados (AES-256-GCM, base64); a chave nunca vai ao banco.

CREATE TABLE github_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  github_id INTEGER NOT NULL,
  login TEXT NOT NULL,
  avatar_url TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  access_expires_at INTEGER,   -- ms
  refresh_expires_at INTEGER,  -- ms
  scopes_note TEXT NOT NULL DEFAULT '',
  connected_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','reauth_required'))
);

CREATE TABLE github_device_flows (
  flow_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_code_enc TEXT NOT NULL,
  user_code TEXT NOT NULL,
  expires_at INTEGER NOT NULL, -- ms
  interval_s INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_github_flows_user ON github_device_flows(user_id);

CREATE TABLE server_github_repos (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  installation_id INTEGER NOT NULL,
  repo_id INTEGER NOT NULL,
  repo_full_name TEXT NOT NULL,
  activity_channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  UNIQUE (server_id, repo_id)
);
CREATE INDEX idx_server_github_repo ON server_github_repos(repo_id);

-- Toda entrega processada (idempotência por X-GitHub-Delivery, mesmo quando não gera evento de domínio).
CREATE TABLE github_deliveries (
  delivery_id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);

-- Eventos de domínio. occurred_at é sempre ISO 8601 UTC com "Z" (ordena como texto).
-- payload_json guarda só o detalhe derivado, nunca o corpo bruto do webhook.
CREATE TABLE github_events (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL UNIQUE,
  dedupe_key TEXT NOT NULL UNIQUE,
  repo_id INTEGER NOT NULL,
  repo_full_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  action TEXT,
  actor_login TEXT NOT NULL DEFAULT '',
  actor_avatar TEXT,
  title TEXT NOT NULL,
  url TEXT,
  payload_json TEXT NOT NULL DEFAULT 'null',
  occurred_at TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX idx_github_events_repo ON github_events(repo_id, occurred_at DESC, id DESC);
CREATE INDEX idx_github_events_actor ON github_events(actor_login);

-- state: open | closed | merged
CREATE TABLE github_pull_requests (
  repo_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  node_id TEXT NOT NULL DEFAULT '',
  repo_full_name TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  author_login TEXT NOT NULL DEFAULT '',
  author_avatar TEXT,
  head_ref TEXT NOT NULL DEFAULT '',
  base_ref TEXT NOT NULL DEFAULT '',
  head_sha TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('open','closed','merged')),
  is_draft INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (repo_id, number)
);
CREATE INDEX idx_github_prs_updated ON github_pull_requests(repo_id, updated_at DESC);
CREATE INDEX idx_github_prs_sha ON github_pull_requests(repo_id, head_sha);

-- state: APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED
CREATE TABLE github_pr_reviews (
  repo_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  reviewer_login TEXT NOT NULL,
  reviewer_avatar TEXT,
  state TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  PRIMARY KEY (repo_id, number, reviewer_login)
);

-- source: check_suite | workflow_run
CREATE TABLE github_checks (
  repo_id INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  conclusion TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (repo_id, head_sha, source, name)
);
