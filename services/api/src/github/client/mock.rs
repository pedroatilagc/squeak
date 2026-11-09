//! Cliente simulado: fixtures determinísticas. Só é usado com GITHUB_MOCK=1 ou em testes.
use super::*;
use crate::github::{
    domain::*,
    time::{fmt_date, fmt_secs, parse_iso, weekday_of_day},
};
use serde_json::json;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Mutex,
};

pub const MOCK_ACCESS_TOKEN: &str = "mock-access-token-NAO-VAZAR";
pub const MOCK_REFRESH_TOKEN: &str = "mock-refresh-token-NAO-VAZAR";
pub const MOCK_INSTALLATION_ID: i64 = 1001;
pub const MOCK_COLORS: [&str; 5] = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
const MOCK_LOGIN: &str = "mock-octocat";

#[derive(Default)]
pub struct MockGitHub {
    failure: Mutex<Option<GhError>>,
    refresh_fails: AtomicBool,
    polls: Mutex<std::collections::HashMap<String, u32>>,
    refresh_calls: AtomicUsize,
    revoke_calls: AtomicUsize,
}

impl MockGitHub {
    pub fn new() -> Self {
        Self::default()
    }

    /// Faz as chamadas de dados (perfil, contribuições, PRs, instalações...) falharem com `e`.
    pub fn fail_with(&self, e: Option<GhError>) {
        if let Ok(mut f) = self.failure.lock() {
            *f = e;
        }
    }

    pub fn set_refresh_fails(&self, v: bool) {
        self.refresh_fails.store(v, Ordering::SeqCst);
    }

    pub fn refresh_calls(&self) -> usize {
        self.refresh_calls.load(Ordering::SeqCst)
    }

    pub fn revoke_calls(&self) -> usize {
        self.revoke_calls.load(Ordering::SeqCst)
    }

    fn check(&self) -> Result<(), GhError> {
        match self.failure.lock() {
            Ok(f) => f.clone().map_or(Ok(()), Err),
            Err(_) => Err(GhError::Upstream),
        }
    }

    fn me() -> Actor {
        Actor { login: MOCK_LOGIN.into(), avatar_url: Some(format!("https://github.com/{MOCK_LOGIN}.png")) }
    }
}

fn level_for(count: u32, max: u32) -> &'static str {
    if count == 0 || max == 0 {
        "NONE"
    } else if count * 4 <= max {
        "FIRST_QUARTILE"
    } else if count * 2 <= max {
        "SECOND_QUARTILE"
    } else if count * 4 <= max * 3 {
        "THIRD_QUARTILE"
    } else {
        "FOURTH_QUARTILE"
    }
}

fn level_index(level: &str) -> usize {
    match level {
        "FIRST_QUARTILE" => 1,
        "SECOND_QUARTILE" => 2,
        "THIRD_QUARTILE" => 3,
        "FOURTH_QUARTILE" => 4,
        _ => 0,
    }
}

fn mock_card(n: i64, title: &str, repo: &str, state: &str, review: &str, checks: &str, now: i64) -> PullRequestCard {
    let me = MockGitHub::me();
    PullRequestCard {
        id: format!("{repo}#{n}"),
        number: n,
        title: title.into(),
        url: format!("https://github.com/{repo}/pull/{n}"),
        repo: repo.into(),
        author: me,
        head_ref: format!("feat/mock-{n}"),
        base_ref: "main".into(),
        state: state.into(),
        is_draft: false,
        review_status: review.into(),
        reviewers: vec![Reviewer {
            login: "mock-ana".into(),
            avatar_url: Some("https://github.com/mock-ana.png".into()),
            state: if review == "approved" { "APPROVED".into() } else { "PENDING".into() },
        }],
        approvals: u32::from(review == "approved"),
        checks: ChecksSummary { state: checks.into(), total: if checks == "none" { 0 } else { 3 } },
        created_at: fmt_secs(now - 5 * 86400),
        updated_at: fmt_secs(now - 3600 * n),
    }
}

#[async_trait]
impl GitHubApi for MockGitHub {
    fn is_mock(&self) -> bool {
        true
    }

    async fn device_start(&self) -> Result<DeviceStart, GhError> {
        Ok(DeviceStart {
            device_code: format!("mock-device-{}", crate::new_id()),
            user_code: "MOCK-1234".into(),
            verification_uri: "https://github.com/login/device".into(),
            expires_in: 899,
            interval: 5,
        })
    }

    /// Primeiro poll de cada código: pendente; o segundo: conectado.
    async fn device_poll(&self, device_code: &str) -> Result<DevicePoll, GhError> {
        let n = {
            let mut polls = self.polls.lock().map_err(|_| GhError::Upstream)?;
            let n = polls.entry(device_code.to_string()).or_insert(0);
            *n += 1;
            *n
        };
        if n < 2 {
            return Ok(DevicePoll::Pending);
        }
        Ok(DevicePoll::Connected(TokenSet {
            access_token: MOCK_ACCESS_TOKEN.into(),
            refresh_token: Some(MOCK_REFRESH_TOKEN.into()),
            expires_in: Some(8 * 3600),
            refresh_token_expires_in: Some(180 * 86400),
        }))
    }

    async fn refresh(&self, refresh_token: &str) -> Result<TokenSet, GhError> {
        self.refresh_calls.fetch_add(1, Ordering::SeqCst);
        if self.refresh_fails.load(Ordering::SeqCst) || refresh_token != MOCK_REFRESH_TOKEN {
            return Err(GhError::Unauthorized);
        }
        Ok(TokenSet {
            access_token: MOCK_ACCESS_TOKEN.into(),
            refresh_token: Some(MOCK_REFRESH_TOKEN.into()),
            expires_in: Some(8 * 3600),
            refresh_token_expires_in: Some(180 * 86400),
        })
    }

    async fn revoke(&self, _access_token: &str) -> Result<(), GhError> {
        self.revoke_calls.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    async fn viewer(&self, _token: &str) -> Result<Viewer, GhError> {
        self.check()?;
        Ok(Viewer { id: 4242, login: MOCK_LOGIN.into(), avatar_url: Self::me().avatar_url })
    }

    async fn profile(&self, _token: &str) -> Result<Profile, GhError> {
        self.check()?;
        let rust = LanguageRef { name: "Rust".into(), color: Some("#dea584".into()) };
        let ts = LanguageRef { name: "TypeScript".into(), color: Some("#3178c6".into()) };
        let repo = |name: &str, lang: &LanguageRef, stars: u64, pushed: &str| RepoSummary {
            name_with_owner: format!("{MOCK_LOGIN}/{name}"),
            description: Some(format!("Repositório de exemplo {name}")),
            url: format!("https://github.com/{MOCK_LOGIN}/{name}"),
            stars,
            forks: stars / 4,
            primary_language: Some(lang.clone()),
            pushed_at: Some(pushed.into()),
            is_private: false,
        };
        let languages = aggregate_languages(
            &[
                vec![("Rust".into(), rust.color.clone(), 61_000), ("TypeScript".into(), ts.color.clone(), 25_000)],
                vec![("TypeScript".into(), ts.color.clone(), 14_000)],
            ],
            8,
        );
        Ok(Profile {
            login: MOCK_LOGIN.into(),
            name: Some("Mock Octocat".into()),
            avatar_url: Self::me().avatar_url.unwrap_or_default(),
            bio: Some("Perfil simulado (GITHUB_MOCK)".into()),
            html_url: format!("https://github.com/{MOCK_LOGIN}"),
            company: None,
            location: Some("Internet".into()),
            followers: 10,
            following: 2,
            public_repos: 8,
            created_at: "2011-01-25T18:44:36Z".into(),
            repositories: vec![
                repo("hello-rust", &rust, 12, "2026-11-01T10:00:00Z"),
                repo("web-ui", &ts, 5, "2026-10-20T08:30:00Z"),
            ],
            languages,
        })
    }

    async fn contributions(&self, _token: &str, from: &str, to: &str) -> Result<ContributionCalendar, GhError> {
        self.check()?;
        let (Some(f), Some(t)) = (parse_iso(from), parse_iso(to)) else { return Err(GhError::Upstream) };
        let (start, end) = (f.div_euclid(86400), t.div_euclid(86400));
        let count = |d: i64| -> u32 { (((d * 37 + d / 7 * 11).rem_euclid(13)) as u32).saturating_sub(3) * 2 };
        let max = (start..=end).map(count).max().unwrap_or(0);
        let mut weeks: Vec<ContributionWeek> = Vec::new();
        let mut total = 0u32;
        for d in start..=end {
            let wd = weekday_of_day(d);
            if wd == 0 || weeks.is_empty() {
                weeks.push(ContributionWeek { first_day: fmt_date(d), days: Vec::new() });
            }
            let c = count(d);
            total += c;
            let level = level_for(c, max);
            if let Some(w) = weeks.last_mut() {
                w.days.push(ContributionDay {
                    date: fmt_date(d),
                    count: c,
                    level: level.into(),
                    color: MOCK_COLORS[level_index(level)].into(),
                    weekday: wd as u8,
                });
            }
        }
        let (issues, prs, reviews) = (total / 20, total / 10, total / 8);
        Ok(ContributionCalendar {
            from: from.into(),
            to: to.into(),
            total_contributions: total,
            total_commits: total.saturating_sub(issues + prs + reviews),
            total_issues: issues,
            total_pull_requests: prs,
            total_reviews: reviews,
            restricted_contributions: 0,
            has_restricted: false,
            colors: MOCK_COLORS.iter().map(|c| c.to_string()).collect(),
            weeks,
        })
    }

    async fn activity(&self, _token: &str, from: &str, to: &str) -> Result<ActivityData, GhError> {
        self.check()?;
        let (Some(f), Some(t)) = (parse_iso(from), parse_iso(to)) else { return Err(GhError::Upstream) };
        let at = |days_before: i64| fmt_secs((t - days_before * 86400).max(f));
        let me = Self::me();
        let item = |id: &str, kind: &str, title: &str, repo: &str, url: String, when: String, detail: Option<serde_json::Value>| {
            ActivityItem {
                id: id.into(),
                kind: kind.into(),
                title: title.into(),
                repo: repo.into(),
                url,
                occurred_at: when,
                author: me.clone(),
                detail,
            }
        };
        let r = format!("{MOCK_LOGIN}/hello-rust");
        let items = vec![
            item("mock-commit-1", "commit", "3 commits em mock-octocat/hello-rust", &r,
                format!("https://github.com/{r}/commits"), at(1), Some(json!({ "count": 3 }))),
            item("mock-pr-12", "pull_request", "Abriu PR #12: Melhora o parser", &r,
                format!("https://github.com/{r}/pull/12"), at(2), Some(json!({ "number": 12, "state": "OPEN" }))),
            item("mock-review-9", "review", "Revisou PR #9: Ajusta CI", "mock-org/api",
                "https://github.com/mock-org/api/pull/9".into(), at(3), Some(json!({ "number": 9, "state": "APPROVED" }))),
            item("mock-issue-4", "issue", "Abriu issue #4: Erro ao salvar", &r,
                format!("https://github.com/{r}/issues/4"), at(4), Some(json!({ "number": 4, "state": "OPEN" }))),
            item("mock-repo-1", "repository", "Criou o repositório mock-octocat/web-ui", "mock-octocat/web-ui",
                "https://github.com/mock-octocat/web-ui".into(), at(5), None),
        ];
        Ok(ActivityData { items, truncated: false })
    }

    async fn pull_requests(&self, _token: &str, role: PrRole) -> Result<Vec<PullRequestCard>, GhError> {
        self.check()?;
        let now = crate::github::time::now_secs();
        Ok(match role {
            PrRole::Authored => vec![
                mock_card(12, "Melhora o parser", "mock-octocat/hello-rust", "open", "review_required", "pending", now),
                mock_card(7, "Atualiza dependências", "mock-octocat/web-ui", "merged", "approved", "success", now),
            ],
            PrRole::ReviewRequested => {
                vec![mock_card(31, "Corrige paginação", "mock-org/api", "open", "review_required", "none", now)]
            }
        })
    }

    async fn installations(&self, _token: &str) -> Result<Vec<Installation>, GhError> {
        self.check()?;
        Ok(vec![Installation {
            id: MOCK_INSTALLATION_ID,
            account_login: "mock-org".into(),
            account_avatar_url: Some("https://github.com/mock-org.png".into()),
            repository_selection: "selected".into(),
        }])
    }

    async fn installation_repositories(&self, _token: &str, installation_id: i64) -> Result<Vec<InstallRepo>, GhError> {
        self.check()?;
        if installation_id != MOCK_INSTALLATION_ID {
            return Err(GhError::NotFound);
        }
        Ok(vec![
            InstallRepo { id: 5001, full_name: "mock-org/api".into(), private: true },
            InstallRepo { id: 5002, full_name: "mock-org/web".into(), private: false },
        ])
    }
}
