//! Cliente real: reqwest + rustls. REST para OAuth/instalações, GraphQL para perfil, contribuições, atividade e PRs.
//! Nunca loga tokens nem corpos de resposta; só status e tipo de erro.
use super::*;
use crate::{
    config::GitHubConfig,
    github::{domain::*, time::normalize},
};
use reqwest::{header::HeaderMap, RequestBuilder, StatusCode};
use serde::{de::DeserializeOwned, Deserialize};
use serde_json::{json, Value};
use std::time::Duration;

const WEB_BASE: &str = "https://github.com";

pub struct HttpGitHub {
    http: reqwest::Client,
    api_base: String,
    web_base: String,
    client_id: String,
    client_secret: String,
}

impl HttpGitHub {
    pub fn new(cfg: &GitHubConfig) -> Self {
        Self::with_bases(cfg, &cfg.api_base, WEB_BASE)
    }

    /// Bases configuráveis para testes contra um servidor HTTP local.
    pub fn with_bases(cfg: &GitHubConfig, api_base: &str, web_base: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            http,
            api_base: api_base.trim_end_matches('/').to_string(),
            web_base: web_base.trim_end_matches('/').to_string(),
            client_id: cfg.client_id.clone(),
            client_secret: cfg.client_secret.clone(),
        }
    }

    fn api(&self, rb: RequestBuilder, token: Option<&str>) -> RequestBuilder {
        let rb = rb
            .header("User-Agent", "squak-api")
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28");
        match token {
            Some(t) => rb.bearer_auth(t),
            None => rb,
        }
    }

    async fn send(&self, rb: RequestBuilder) -> Result<reqwest::Response, GhError> {
        rb.send().await.map_err(|e| {
            tracing::warn!("github: falha de rede (timeout={}, connect={})", e.is_timeout(), e.is_connect());
            GhError::Upstream
        })
    }

    async fn json_ok<T: DeserializeOwned>(&self, rb: RequestBuilder) -> Result<T, GhError> {
        let resp = self.send(rb).await?;
        let status = resp.status();
        if !status.is_success() {
            return Err(classify(status, resp.headers()));
        }
        resp.json::<T>().await.map_err(|_| {
            tracing::warn!("github: resposta JSON inesperada");
            GhError::Upstream
        })
    }

    async fn graphql<T: DeserializeOwned>(&self, token: &str, query: &str, variables: Value) -> Result<T, GhError> {
        let rb = self
            .api(self.http.post(format!("{}/graphql", self.api_base)), Some(token))
            .json(&json!({ "query": query, "variables": variables }));
        let resp: Gql<T> = self.json_ok(rb).await?;
        if let Some(errors) = resp.errors.filter(|e| !e.is_empty()) {
            let kind = errors.iter().find_map(|e| e.kind.clone()).unwrap_or_default();
            tracing::warn!("github: GraphQL retornou erros (tipo={kind})");
            return Err(match kind.as_str() {
                "RATE_LIMITED" => GhError::RateLimited,
                "NOT_FOUND" => GhError::NotFound,
                _ => GhError::Upstream,
            });
        }
        resp.data.ok_or(GhError::Upstream)
    }

    async fn oauth(&self, form: &[(&str, &str)]) -> Result<OAuthResp, GhError> {
        let rb = self
            .http
            .post(format!("{}/login/oauth/access_token", self.web_base))
            .header("User-Agent", "squak-api")
            .header("Accept", "application/json")
            .form(form);
        let resp = self.send(rb).await?;
        if !resp.status().is_success() {
            return Err(classify(resp.status(), resp.headers()));
        }
        resp.json().await.map_err(|_| GhError::Upstream)
    }
}

fn classify(status: StatusCode, headers: &HeaderMap) -> GhError {
    tracing::warn!("github: HTTP {}", status.as_u16());
    let limited = headers.get("x-ratelimit-remaining").and_then(|v| v.to_str().ok()) == Some("0")
        || headers.contains_key("retry-after");
    match status {
        StatusCode::UNAUTHORIZED => GhError::Unauthorized,
        StatusCode::NOT_FOUND => GhError::NotFound,
        StatusCode::TOO_MANY_REQUESTS => GhError::RateLimited,
        StatusCode::FORBIDDEN if limited => GhError::RateLimited,
        _ => GhError::Upstream,
    }
}

// ---------- tipos de resposta ----------

#[derive(Deserialize)]
struct Gql<T> {
    data: Option<T>,
    errors: Option<Vec<GqlError>>,
}

#[derive(Deserialize)]
struct GqlError {
    #[serde(rename = "type")]
    kind: Option<String>,
}

#[derive(Deserialize)]
struct OAuthResp {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    refresh_token_expires_in: Option<i64>,
    error: Option<String>,
    interval: Option<i64>,
}

#[derive(Deserialize)]
struct DeviceCodeResp {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: i64,
    interval: i64,
}

#[derive(Deserialize)]
struct RestUser {
    id: i64,
    login: String,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct Count {
    #[serde(rename = "totalCount")]
    total_count: u64,
}

// perfil
#[derive(Deserialize)]
struct ProfileData {
    viewer: GqlViewerProfile,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlViewerProfile {
    login: String,
    name: Option<String>,
    avatar_url: String,
    bio: Option<String>,
    url: String,
    company: Option<String>,
    location: Option<String>,
    created_at: String,
    followers: Count,
    following: Count,
    public_repos: Count,
    repositories: GqlRepos,
}
#[derive(Deserialize)]
struct GqlRepos {
    nodes: Vec<GqlRepo>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlRepo {
    name_with_owner: String,
    description: Option<String>,
    url: String,
    stargazer_count: u64,
    fork_count: u64,
    pushed_at: Option<String>,
    is_private: bool,
    primary_language: Option<GqlLang>,
    languages: Option<GqlLangEdges>,
}
#[derive(Deserialize)]
struct GqlLang {
    name: String,
    color: Option<String>,
}
#[derive(Deserialize)]
struct GqlLangEdges {
    edges: Vec<GqlLangEdge>,
}
#[derive(Deserialize)]
struct GqlLangEdge {
    size: u64,
    node: GqlLang,
}

// contribuições
#[derive(Deserialize)]
struct ContribData {
    viewer: ContribViewer,
}
#[derive(Deserialize)]
struct ContribViewer {
    #[serde(rename = "contributionsCollection")]
    collection: ContribCollection,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContribCollection {
    total_commit_contributions: u32,
    total_issue_contributions: u32,
    total_pull_request_contributions: u32,
    total_pull_request_review_contributions: u32,
    restricted_contributions_count: u32,
    has_any_restricted_contributions: bool,
    contribution_calendar: GqlCalendar,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlCalendar {
    total_contributions: u32,
    colors: Vec<String>,
    weeks: Vec<GqlWeek>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlWeek {
    first_day: String,
    contribution_days: Vec<GqlDay>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlDay {
    date: String,
    contribution_count: u32,
    contribution_level: String,
    color: String,
    weekday: u8,
}

// atividade
#[derive(Deserialize)]
struct ActivityGql {
    viewer: ActivityViewer,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivityViewer {
    login: String,
    avatar_url: Option<String>,
    contributions_collection: ActivityCollection,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivityCollection {
    commit_contributions_by_repository: Vec<CommitsByRepo>,
    pull_request_contributions: Nodes<PrContribution>,
    pull_request_review_contributions: Nodes<ReviewContribution>,
    issue_contributions: Nodes<IssueContribution>,
    repository_contributions: Nodes<RepoContribution>,
}
#[derive(Deserialize)]
struct Nodes<T> {
    nodes: Vec<T>,
    #[serde(rename = "pageInfo")]
    page_info: Option<PageInfo>,
}
#[derive(Deserialize)]
struct PageInfo {
    #[serde(rename = "hasNextPage")]
    has_next_page: bool,
}
#[derive(Deserialize)]
struct CommitsByRepo {
    repository: GqlRepoRef,
    contributions: Nodes<CommitNode>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlRepoRef {
    name_with_owner: String,
    url: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitNode {
    commit_count: u32,
    occurred_at: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlPrRef {
    id: String,
    number: i64,
    title: String,
    url: String,
    state: String,
    repository: GqlRepoRef,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrContribution {
    occurred_at: String,
    pull_request: GqlPrRef,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewContribution {
    occurred_at: String,
    pull_request_review: GqlReview,
    pull_request: GqlPrRef,
}
#[derive(Deserialize)]
struct GqlReview {
    id: String,
    state: String,
    url: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueContribution {
    occurred_at: String,
    issue: GqlIssue,
}
#[derive(Deserialize)]
struct GqlIssue {
    id: String,
    number: i64,
    title: String,
    url: String,
    state: String,
    repository: GqlRepoRef,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoContribution {
    occurred_at: String,
    repository: GqlRepoRef,
}

// pull requests
#[derive(Deserialize)]
struct SearchData {
    search: SearchNodes,
}
#[derive(Deserialize)]
struct SearchNodes {
    nodes: Vec<SearchPr>,
}
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct SearchPr {
    id: Option<String>,
    number: Option<i64>,
    title: String,
    url: String,
    is_draft: bool,
    state: String,
    merged: bool,
    created_at: String,
    updated_at: String,
    head_ref_name: String,
    base_ref_name: String,
    review_decision: Option<String>,
    author: Option<GqlActor>,
    repository: Option<GqlRepoNameOnly>,
    latest_reviews: Option<ReviewNodes>,
    review_requests: Option<RequestNodes>,
    commits: Option<CommitNodes>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlActor {
    login: String,
    avatar_url: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlRepoNameOnly {
    name_with_owner: String,
}
#[derive(Deserialize)]
struct ReviewNodes {
    nodes: Vec<ReviewNode>,
}
#[derive(Deserialize)]
struct ReviewNode {
    state: String,
    author: Option<GqlActor>,
}
#[derive(Deserialize)]
struct RequestNodes {
    nodes: Vec<RequestNode>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestNode {
    requested_reviewer: Option<ReqActor>,
}
/// Revisor solicitado pode ser Team/Bot (union): `{}` quando não é User.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ReqActor {
    login: Option<String>,
    avatar_url: Option<String>,
}
#[derive(Deserialize)]
struct CommitNodes {
    nodes: Vec<CommitWrap>,
}
#[derive(Deserialize)]
struct CommitWrap {
    commit: CommitRollup,
}
#[derive(Deserialize)]
struct CommitRollup {
    #[serde(rename = "statusCheckRollup")]
    rollup: Option<Rollup>,
}
#[derive(Deserialize)]
struct Rollup {
    state: String,
    contexts: Option<Count>,
}

// instalações
#[derive(Deserialize)]
struct InstallationsResp {
    installations: Vec<RestInstallation>,
}
#[derive(Deserialize)]
struct RestInstallation {
    id: i64,
    account: Option<RestAccount>,
    repository_selection: Option<String>,
}
#[derive(Deserialize)]
struct RestAccount {
    login: String,
    avatar_url: Option<String>,
}
#[derive(Deserialize)]
struct ReposResp {
    repositories: Vec<RestRepo>,
}
#[derive(Deserialize)]
struct RestRepo {
    id: i64,
    full_name: String,
    private: bool,
}

// ---------- consultas GraphQL ----------

const PROFILE_QUERY: &str = "query { viewer { login name avatarUrl bio url company location createdAt \
followers { totalCount } following { totalCount } \
publicRepos: repositories(ownerAffiliations: OWNER, privacy: PUBLIC) { totalCount } \
repositories(first: 6, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) { nodes { \
nameWithOwner description url stargazerCount forkCount pushedAt isPrivate primaryLanguage { name color } \
languages(first: 5, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } } } } } }";

pub const CONTRIBUTIONS_QUERY: &str = "query($from: DateTime!, $to: DateTime!) { viewer { contributionsCollection(from: $from, to: $to) { \
totalCommitContributions totalIssueContributions totalPullRequestContributions totalPullRequestReviewContributions \
restrictedContributionsCount hasAnyRestrictedContributions \
contributionCalendar { totalContributions colors weeks { firstDay contributionDays { date contributionCount contributionLevel color weekday } } } } } }";

const ACTIVITY_QUERY: &str = "query($from: DateTime!, $to: DateTime!) { viewer { login avatarUrl contributionsCollection(from: $from, to: $to) { \
commitContributionsByRepository(maxRepositories: 25) { repository { nameWithOwner url } contributions(first: 100) { nodes { commitCount occurredAt } pageInfo { hasNextPage } } } \
pullRequestContributions(first: 100) { nodes { occurredAt pullRequest { id number title url state repository { nameWithOwner url } } } pageInfo { hasNextPage } } \
pullRequestReviewContributions(first: 100) { nodes { occurredAt pullRequestReview { id state url } pullRequest { id number title url state repository { nameWithOwner url } } } pageInfo { hasNextPage } } \
issueContributions(first: 100) { nodes { occurredAt issue { id number title url state repository { nameWithOwner url } } } pageInfo { hasNextPage } } \
repositoryContributions(first: 100) { nodes { occurredAt repository { nameWithOwner url } } pageInfo { hasNextPage } } } } }";

const PRS_QUERY: &str = "query($q: String!) { search(query: $q, type: ISSUE, first: 50) { nodes { ... on PullRequest { \
id number title url isDraft state merged createdAt updatedAt headRefName baseRefName reviewDecision \
author { login avatarUrl } repository { nameWithOwner } \
latestReviews(first: 20) { nodes { state author { login avatarUrl } } } \
reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login avatarUrl } } } } \
commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 1) { totalCount } } } } } } } } }";

// ---------- conversões puras (testáveis sem rede) ----------

fn norm(s: &str) -> String {
    normalize(s).unwrap_or_else(|| s.to_string())
}

fn to_profile(v: GqlViewerProfile) -> Profile {
    let per_repo: Vec<Vec<(String, Option<String>, u64)>> = v
        .repositories
        .nodes
        .iter()
        .map(|r| {
            r.languages
                .as_ref()
                .map(|l| l.edges.iter().map(|e| (e.node.name.clone(), e.node.color.clone(), e.size)).collect())
                .unwrap_or_default()
        })
        .collect();
    Profile {
        login: v.login,
        name: v.name,
        avatar_url: v.avatar_url,
        bio: v.bio.filter(|b| !b.is_empty()),
        html_url: v.url,
        company: v.company.filter(|c| !c.is_empty()),
        location: v.location.filter(|c| !c.is_empty()),
        followers: v.followers.total_count,
        following: v.following.total_count,
        public_repos: v.public_repos.total_count,
        created_at: v.created_at,
        repositories: v
            .repositories
            .nodes
            .into_iter()
            .map(|r| RepoSummary {
                name_with_owner: r.name_with_owner,
                description: r.description,
                url: r.url,
                stars: r.stargazer_count,
                forks: r.fork_count,
                primary_language: r.primary_language.map(|l| LanguageRef { name: l.name, color: l.color }),
                pushed_at: r.pushed_at,
                is_private: r.is_private,
            })
            .collect(),
        languages: aggregate_languages(&per_repo, 8),
    }
}

fn to_calendar(c: ContribCollection, from: &str, to: &str) -> ContributionCalendar {
    ContributionCalendar {
        from: from.into(),
        to: to.into(),
        total_contributions: c.contribution_calendar.total_contributions,
        total_commits: c.total_commit_contributions,
        total_issues: c.total_issue_contributions,
        total_pull_requests: c.total_pull_request_contributions,
        total_reviews: c.total_pull_request_review_contributions,
        restricted_contributions: c.restricted_contributions_count,
        has_restricted: c.has_any_restricted_contributions,
        colors: c.contribution_calendar.colors,
        weeks: c
            .contribution_calendar
            .weeks
            .into_iter()
            .map(|w| ContributionWeek {
                first_day: w.first_day,
                days: w
                    .contribution_days
                    .into_iter()
                    .map(|d| ContributionDay {
                        date: d.date,
                        count: d.contribution_count,
                        level: d.contribution_level,
                        color: d.color,
                        weekday: d.weekday,
                    })
                    .collect(),
            })
            .collect(),
    }
}

fn to_activity(v: ActivityViewer) -> ActivityData {
    let author = Actor { login: v.login.clone(), avatar_url: v.avatar_url.clone() };
    let c = v.contributions_collection;
    let mut truncated = c.commit_contributions_by_repository.len() >= 25;
    let more = |n: &Option<PageInfo>| n.as_ref().is_some_and(|p| p.has_next_page);
    let mut items: Vec<ActivityItem> = Vec::new();

    for repo in c.commit_contributions_by_repository {
        truncated |= more(&repo.contributions.page_info);
        for n in repo.contributions.nodes {
            let day = n.occurred_at.get(..10).unwrap_or("").to_string();
            items.push(ActivityItem {
                id: format!("commit:{}:{day}", repo.repository.name_with_owner),
                kind: "commit".into(),
                title: format!(
                    "{} {} em {}",
                    n.commit_count,
                    if n.commit_count == 1 { "commit" } else { "commits" },
                    repo.repository.name_with_owner
                ),
                repo: repo.repository.name_with_owner.clone(),
                url: format!("{}/commits?author={}&since={day}&until={day}", repo.repository.url, v.login),
                occurred_at: norm(&n.occurred_at),
                author: author.clone(),
                detail: Some(json!({ "count": n.commit_count })),
            });
        }
    }
    truncated |= more(&c.pull_request_contributions.page_info);
    for n in c.pull_request_contributions.nodes {
        let pr = n.pull_request;
        items.push(ActivityItem {
            id: format!("pr:{}", pr.id),
            kind: "pull_request".into(),
            title: format!("Abriu PR #{}: {}", pr.number, pr.title),
            repo: pr.repository.name_with_owner,
            url: pr.url,
            occurred_at: norm(&n.occurred_at),
            author: author.clone(),
            detail: Some(json!({ "number": pr.number, "state": pr.state })),
        });
    }
    truncated |= more(&c.pull_request_review_contributions.page_info);
    for n in c.pull_request_review_contributions.nodes {
        let pr = n.pull_request;
        items.push(ActivityItem {
            id: format!("review:{}", n.pull_request_review.id),
            kind: "review".into(),
            title: format!("Revisou PR #{}: {}", pr.number, pr.title),
            repo: pr.repository.name_with_owner,
            url: n.pull_request_review.url.unwrap_or(pr.url),
            occurred_at: norm(&n.occurred_at),
            author: author.clone(),
            detail: Some(json!({ "number": pr.number, "state": n.pull_request_review.state })),
        });
    }
    truncated |= more(&c.issue_contributions.page_info);
    for n in c.issue_contributions.nodes {
        let i = n.issue;
        items.push(ActivityItem {
            id: format!("issue:{}", i.id),
            kind: "issue".into(),
            title: format!("Abriu issue #{}: {}", i.number, i.title),
            repo: i.repository.name_with_owner,
            url: i.url,
            occurred_at: norm(&n.occurred_at),
            author: author.clone(),
            detail: Some(json!({ "number": i.number, "state": i.state })),
        });
    }
    truncated |= more(&c.repository_contributions.page_info);
    for n in c.repository_contributions.nodes {
        items.push(ActivityItem {
            id: format!("repo:{}", n.repository.name_with_owner),
            kind: "repository".into(),
            title: format!("Criou o repositório {}", n.repository.name_with_owner),
            repo: n.repository.name_with_owner,
            url: n.repository.url,
            occurred_at: norm(&n.occurred_at),
            author: author.clone(),
            detail: None,
        });
    }
    items.sort_by(|a, b| b.occurred_at.cmp(&a.occurred_at).then_with(|| b.id.cmp(&a.id)));
    ActivityData { items, truncated }
}

fn to_cards(nodes: Vec<SearchPr>) -> Vec<PullRequestCard> {
    nodes
        .into_iter()
        .filter_map(|p| {
            let number = p.number?;
            let repo = p.repository?.name_with_owner;
            let mut reviewers: Vec<Reviewer> = p
                .latest_reviews
                .map(|r| r.nodes)
                .unwrap_or_default()
                .into_iter()
                .filter_map(|r| {
                    r.author.map(|a| Reviewer { login: a.login, avatar_url: a.avatar_url, state: r.state })
                })
                .collect();
            for req in p.review_requests.map(|r| r.nodes).unwrap_or_default() {
                if let Some(ReqActor { login: Some(login), avatar_url }) = req.requested_reviewer {
                    if !reviewers.iter().any(|r| r.login == login) {
                        reviewers.push(Reviewer { login, avatar_url, state: "PENDING".into() });
                    }
                }
            }
            let review_status = match p.review_decision.as_deref() {
                Some("APPROVED") => "approved".to_string(),
                Some("CHANGES_REQUESTED") => "changes_requested".to_string(),
                Some("REVIEW_REQUIRED") => "review_required".to_string(),
                _ => derive_review_status(&reviewers),
            };
            // Sem commit informado => unknown; commit sem rollup => none (não há verificações).
            let checks = match p.commits.and_then(|c| c.nodes.into_iter().next()) {
                None => ChecksSummary { state: "unknown".into(), total: 0 },
                Some(w) => match w.commit.rollup {
                    None => ChecksSummary { state: "none".into(), total: 0 },
                    Some(r) => ChecksSummary {
                        state: match r.state.as_str() {
                            "SUCCESS" => "success",
                            "FAILURE" | "ERROR" => "failure",
                            "PENDING" | "EXPECTED" => "pending",
                            _ => "unknown",
                        }
                        .into(),
                        total: r.contexts.map(|c| c.total_count as u32).unwrap_or(0),
                    },
                },
            };
            let state = if p.merged {
                "merged"
            } else if p.state == "CLOSED" {
                "closed"
            } else {
                "open"
            };
            let author = p.author.map(|a| Actor { login: a.login, avatar_url: a.avatar_url })
                .unwrap_or(Actor { login: "ghost".into(), avatar_url: None });
            Some(PullRequestCard {
                id: p.id.unwrap_or_else(|| format!("{repo}#{number}")),
                number,
                title: p.title,
                url: p.url,
                repo,
                author,
                head_ref: p.head_ref_name,
                base_ref: p.base_ref_name,
                state: state.into(),
                is_draft: p.is_draft,
                approvals: count_approvals(&reviewers),
                review_status,
                reviewers,
                checks,
                created_at: p.created_at,
                updated_at: p.updated_at,
            })
        })
        .collect()
}

fn token_set(r: OAuthResp) -> Result<TokenSet, GhError> {
    Ok(TokenSet {
        access_token: r.access_token.ok_or(GhError::Upstream)?,
        refresh_token: r.refresh_token,
        expires_in: r.expires_in,
        refresh_token_expires_in: r.refresh_token_expires_in,
    })
}

#[async_trait]
impl GitHubApi for HttpGitHub {
    fn is_mock(&self) -> bool {
        false
    }

    async fn device_start(&self) -> Result<DeviceStart, GhError> {
        let rb = self
            .http
            .post(format!("{}/login/device/code", self.web_base))
            .header("User-Agent", "squak-api")
            .header("Accept", "application/json")
            .form(&[("client_id", self.client_id.as_str())]);
        let r: DeviceCodeResp = self.json_ok(rb).await?;
        Ok(DeviceStart {
            device_code: r.device_code,
            user_code: r.user_code,
            verification_uri: r.verification_uri,
            expires_in: r.expires_in,
            interval: r.interval,
        })
    }

    async fn device_poll(&self, device_code: &str) -> Result<DevicePoll, GhError> {
        let r = self
            .oauth(&[
                ("client_id", self.client_id.as_str()),
                ("device_code", device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .await?;
        match r.error.as_deref() {
            None => Ok(DevicePoll::Connected(token_set(r)?)),
            Some("authorization_pending") => Ok(DevicePoll::Pending),
            Some("slow_down") => Ok(DevicePoll::SlowDown { interval: r.interval }),
            Some("expired_token") | Some("incorrect_device_code") => Ok(DevicePoll::Expired),
            Some("access_denied") => Ok(DevicePoll::Denied),
            Some(other) => {
                tracing::warn!("github: device flow retornou erro '{other}'");
                Err(GhError::Upstream)
            }
        }
    }

    async fn refresh(&self, refresh_token: &str) -> Result<TokenSet, GhError> {
        let r = self
            .oauth(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
            ])
            .await?;
        match r.error.as_deref() {
            None => token_set(r),
            Some("bad_refresh_token") => Err(GhError::Unauthorized),
            Some(other) => {
                tracing::warn!("github: refresh retornou erro '{other}'");
                Err(GhError::Upstream)
            }
        }
    }

    async fn revoke(&self, access_token: &str) -> Result<(), GhError> {
        let rb = self
            .api(self.http.delete(format!("{}/applications/{}/grant", self.api_base, self.client_id)), None)
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .json(&json!({ "access_token": access_token }));
        let resp = self.send(rb).await?;
        match resp.status() {
            s if s.is_success() => Ok(()),
            StatusCode::NOT_FOUND => Ok(()), // já revogado
            s => Err(classify(s, resp.headers())),
        }
    }

    async fn viewer(&self, token: &str) -> Result<Viewer, GhError> {
        let u: RestUser = self.json_ok(self.api(self.http.get(format!("{}/user", self.api_base)), Some(token))).await?;
        Ok(Viewer { id: u.id, login: u.login, avatar_url: u.avatar_url })
    }

    async fn profile(&self, token: &str) -> Result<Profile, GhError> {
        let d: ProfileData = self.graphql(token, PROFILE_QUERY, json!({})).await?;
        Ok(to_profile(d.viewer))
    }

    async fn contributions(&self, token: &str, from: &str, to: &str) -> Result<ContributionCalendar, GhError> {
        let d: ContribData = self.graphql(token, CONTRIBUTIONS_QUERY, json!({ "from": from, "to": to })).await?;
        Ok(to_calendar(d.viewer.collection, from, to))
    }

    async fn activity(&self, token: &str, from: &str, to: &str) -> Result<ActivityData, GhError> {
        let d: ActivityGql = self.graphql(token, ACTIVITY_QUERY, json!({ "from": from, "to": to })).await?;
        Ok(to_activity(d.viewer))
    }

    async fn pull_requests(&self, token: &str, role: PrRole) -> Result<Vec<PullRequestCard>, GhError> {
        let q = match role {
            PrRole::Authored => "is:pr author:@me sort:updated-desc",
            PrRole::ReviewRequested => "is:pr is:open review-requested:@me sort:updated-desc",
        };
        let d: SearchData = self.graphql(token, PRS_QUERY, json!({ "q": q })).await?;
        Ok(to_cards(d.search.nodes))
    }

    async fn installations(&self, token: &str) -> Result<Vec<Installation>, GhError> {
        let rb = self.api(self.http.get(format!("{}/user/installations?per_page=100", self.api_base)), Some(token));
        let r: InstallationsResp = self.json_ok(rb).await?;
        Ok(r.installations
            .into_iter()
            .map(|i| Installation {
                id: i.id,
                account_login: i.account.as_ref().map(|a| a.login.clone()).unwrap_or_default(),
                account_avatar_url: i.account.and_then(|a| a.avatar_url),
                repository_selection: i.repository_selection.unwrap_or_else(|| "selected".into()),
            })
            .collect())
    }

    async fn installation_repositories(&self, token: &str, installation_id: i64) -> Result<Vec<InstallRepo>, GhError> {
        let mut out = Vec::new();
        for page in 1..=10 {
            let url = format!(
                "{}/user/installations/{installation_id}/repositories?per_page=100&page={page}",
                self.api_base
            );
            let r: ReposResp = self.json_ok(self.api(self.http.get(url), Some(token))).await?;
            let n = r.repositories.len();
            out.extend(r.repositories.into_iter().map(|r| InstallRepo { id: r.id, full_name: r.full_name, private: r.private }));
            if n < 100 {
                break;
            }
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpListener};

    /// Servidor HTTP mínimo: responde sempre com a resposta pronta e devolve o pedido bruto recebido.
    async fn serve_once(status: &str, body: &str, extra_headers: &str) -> (String, tokio::task::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let resp = format!(
            "HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n{extra_headers}\r\n{body}",
            body.len()
        );
        let h = tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 16 * 1024];
            let mut got = Vec::new();
            // lê até ter o corpo completo (cabeçalhos + content-length)
            loop {
                let n = sock.read(&mut buf).await.unwrap();
                got.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&got).to_string();
                if let Some(idx) = text.find("\r\n\r\n") {
                    let len = text[..idx]
                        .lines()
                        .find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap_or(0)))
                        .unwrap_or(0);
                    if got.len() >= idx + 4 + len || n == 0 {
                        break;
                    }
                }
                if n == 0 {
                    break;
                }
            }
            sock.write_all(resp.as_bytes()).await.unwrap();
            String::from_utf8_lossy(&got).to_string()
        });
        (base, h)
    }

    fn client(base: &str) -> HttpGitHub {
        let cfg = GitHubConfig { client_id: "cid".into(), client_secret: "csec".into(), ..Default::default() };
        HttpGitHub::with_bases(&cfg, base, base)
    }

    #[tokio::test]
    async fn contributions_query_is_real_and_parsed_with_github_colors() {
        let body = r##"{"data":{"viewer":{"contributionsCollection":{
          "totalCommitContributions":5,"totalIssueContributions":1,"totalPullRequestContributions":2,
          "totalPullRequestReviewContributions":3,"restrictedContributionsCount":4,"hasAnyRestrictedContributions":true,
          "contributionCalendar":{"totalContributions":15,"colors":["#aaaaaa","#bbbbbb","#cccccc","#dddddd","#eeeeee"],
            "weeks":[{"firstDay":"2025-01-05","contributionDays":[
              {"date":"2025-01-05","contributionCount":0,"contributionLevel":"NONE","color":"#aaaaaa","weekday":0},
              {"date":"2025-01-06","contributionCount":9,"contributionLevel":"FOURTH_QUARTILE","color":"#eeeeee","weekday":1}]}]}}}}}"##;
        let (base, h) = serve_once("200 OK", body, "").await;
        let cal = client(&base).contributions("tok-secreto", "2025-01-05T00:00:00Z", "2025-01-11T00:00:00Z").await.unwrap();
        assert_eq!(cal.total_contributions, 15);
        assert_eq!(cal.total_commits, 5);
        assert!(cal.has_restricted && cal.restricted_contributions == 4);
        assert_eq!(cal.colors[4], "#eeeeee", "cores vêm do GitHub");
        assert_eq!(cal.weeks[0].days[1].level, "FOURTH_QUARTILE");
        assert_eq!(cal.weeks[0].days[1].color, "#eeeeee");
        let raw = h.await.unwrap();
        assert!(raw.starts_with("POST /graphql"));
        assert!(raw.to_ascii_lowercase().contains("authorization: bearer tok-secreto"));
        for needle in ["contributionCalendar", "totalContributions", "contributionLevel", "contributionsCollection(from: $from, to: $to)"] {
            assert!(raw.contains(needle), "consulta sem {needle}");
        }
    }

    #[tokio::test]
    async fn http_errors_are_classified() {
        let (base, _h) = serve_once("401 Unauthorized", r#"{"message":"Bad credentials"}"#, "").await;
        assert_eq!(client(&base).viewer("t").await.err(), Some(GhError::Unauthorized));
        let (base, _h) = serve_once("403 Forbidden", "{}", "x-ratelimit-remaining: 0\r\n").await;
        assert_eq!(client(&base).viewer("t").await.err(), Some(GhError::RateLimited));
        let (base, _h) = serve_once("500 Internal Server Error", "{}", "").await;
        assert_eq!(client(&base).viewer("t").await.err(), Some(GhError::Upstream));
        let (base, _h) = serve_once("200 OK", r#"{"data":null,"errors":[{"type":"RATE_LIMITED","message":"x"}]}"#, "").await;
        assert_eq!(client(&base).profile("t").await.err(), Some(GhError::RateLimited));
        let (base, _h) = serve_once("200 OK", r#"{"errors":[{"type":"OUTRO","message":"x"}]}"#, "").await;
        assert_eq!(client(&base).profile("t").await.err(), Some(GhError::Upstream));
    }

    #[tokio::test]
    async fn device_flow_oauth_errors_are_mapped() {
        let (base, _h) = serve_once("200 OK", r#"{"error":"authorization_pending"}"#, "").await;
        assert!(matches!(client(&base).device_poll("dc").await, Ok(DevicePoll::Pending)));
        let (base, _h) = serve_once("200 OK", r#"{"error":"slow_down","interval":10}"#, "").await;
        assert!(matches!(client(&base).device_poll("dc").await, Ok(DevicePoll::SlowDown { interval: Some(10) })));
        let (base, _h) = serve_once("200 OK", r#"{"error":"bad_refresh_token"}"#, "").await;
        assert_eq!(client(&base).refresh("rt").await.err(), Some(GhError::Unauthorized));
        let (base, h) = serve_once(
            "200 OK",
            r#"{"access_token":"a","refresh_token":"r","expires_in":28800,"refresh_token_expires_in":15897600}"#,
            "",
        )
        .await;
        match client(&base).refresh("rt").await {
            Ok(t) => assert_eq!((t.access_token.as_str(), t.expires_in), ("a", Some(28800))),
            Err(_) => panic!("refresh deveria funcionar"),
        }
        assert!(h.await.unwrap().contains("client_secret=csec"));
    }

    #[test]
    fn pull_request_cards_from_graphql() {
        let nodes: Vec<SearchPr> = serde_json::from_str(
            r#"[{},{"id":"PR_1","number":3,"title":"t","url":"u","isDraft":false,"state":"OPEN","merged":false,
              "createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z","headRefName":"h","baseRefName":"main",
              "reviewDecision":null,"author":{"login":"ana","avatarUrl":null},"repository":{"nameWithOwner":"o/r"},
              "latestReviews":{"nodes":[{"state":"CHANGES_REQUESTED","author":{"login":"bob","avatarUrl":null}}]},
              "reviewRequests":{"nodes":[{"requestedReviewer":{"login":"cy","avatarUrl":null}},{"requestedReviewer":{}}]},
              "commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":"FAILURE","contexts":{"totalCount":4}}}}]}}]"#,
        )
        .unwrap();
        let cards = to_cards(nodes);
        assert_eq!(cards.len(), 1, "nó vazio é descartado");
        let c = &cards[0];
        assert_eq!((c.state.as_str(), c.review_status.as_str(), c.checks.state.as_str(), c.checks.total), ("open", "changes_requested", "failure", 4));
        assert_eq!(c.reviewers.len(), 2);
    }
}
