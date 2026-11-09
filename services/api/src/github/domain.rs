//! Tipos puros do domínio GitHub (serializáveis, sem I/O) e as regras de derivação dos cards de PR.
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Actor {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Language {
    pub name: String,
    pub color: Option<String>,
    pub size: u64,
    pub percent: f64,
}

#[derive(Serialize, Clone, Debug)]
pub struct LanguageRef {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct RepoSummary {
    pub name_with_owner: String,
    pub description: Option<String>,
    pub url: String,
    pub stars: u64,
    pub forks: u64,
    pub primary_language: Option<LanguageRef>,
    pub pushed_at: Option<String>,
    pub is_private: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct Profile {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
    pub bio: Option<String>,
    pub html_url: String,
    pub company: Option<String>,
    pub location: Option<String>,
    pub followers: u64,
    pub following: u64,
    pub public_repos: u64,
    pub created_at: String,
    pub repositories: Vec<RepoSummary>,
    pub languages: Vec<Language>,
}

/// Soma as linguagens dos repositórios e calcula `percent` (1 casa), no máximo `max` itens.
pub fn aggregate_languages(per_repo: &[Vec<(String, Option<String>, u64)>], max: usize) -> Vec<Language> {
    let mut acc: Vec<(String, Option<String>, u64)> = Vec::new();
    for (name, color, size) in per_repo.iter().flatten() {
        match acc.iter_mut().find(|a| &a.0 == name) {
            Some(a) => a.2 += size,
            None => acc.push((name.clone(), color.clone(), *size)),
        }
    }
    acc.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| a.0.cmp(&b.0)));
    let total: u64 = acc.iter().map(|a| a.2).sum();
    acc.into_iter()
        .take(max)
        .map(|(name, color, size)| Language {
            name,
            color,
            size,
            percent: if total == 0 { 0.0 } else { (size as f64 / total as f64 * 1000.0).round() / 10.0 },
        })
        .collect()
}

#[derive(Serialize, Clone, Debug)]
pub struct ContributionDay {
    pub date: String,
    pub count: u32,
    pub level: String,
    pub color: String,
    pub weekday: u8,
}

#[derive(Serialize, Clone, Debug)]
pub struct ContributionWeek {
    pub first_day: String,
    pub days: Vec<ContributionDay>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ContributionCalendar {
    pub from: String,
    pub to: String,
    pub total_contributions: u32,
    pub total_commits: u32,
    pub total_issues: u32,
    pub total_pull_requests: u32,
    pub total_reviews: u32,
    pub restricted_contributions: u32,
    pub has_restricted: bool,
    pub colors: Vec<String>,
    pub weeks: Vec<ContributionWeek>,
}

/// Item da atividade pessoal (GraphQL). `type`: commit | pull_request | review | issue | repository.
#[derive(Serialize, Clone, Debug)]
pub struct ActivityItem {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub title: String,
    pub repo: String,
    pub url: String,
    pub occurred_at: String,
    pub author: Actor,
    pub detail: Option<Value>,
}

#[derive(Clone, Debug)]
pub struct ActivityData {
    pub items: Vec<ActivityItem>,
    /// Alguma conexão do GitHub tinha mais páginas do que lemos.
    pub truncated: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct Reviewer {
    pub login: String,
    pub avatar_url: Option<String>,
    pub state: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ChecksSummary {
    pub state: String,
    pub total: u32,
}

#[derive(Serialize, Clone, Debug)]
pub struct PullRequestCard {
    pub id: String,
    pub number: i64,
    pub title: String,
    pub url: String,
    pub repo: String,
    pub author: Actor,
    pub head_ref: String,
    pub base_ref: String,
    pub state: String,
    pub is_draft: bool,
    pub review_status: String,
    pub reviewers: Vec<Reviewer>,
    pub approvals: u32,
    pub checks: ChecksSummary,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct Installation {
    pub id: i64,
    pub account_login: String,
    pub account_avatar_url: Option<String>,
    pub repository_selection: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct InstallRepo {
    pub id: i64,
    pub full_name: String,
    pub private: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct FeedActor {
    pub name: String,
    pub avatar_url: Option<String>,
    pub user_id: Option<String>,
}

/// Item do feed de atividade do servidor.
#[derive(Serialize, Clone, Debug)]
pub struct FeedItem {
    pub id: String,
    pub source: String,
    pub kind: String,
    pub action: Option<String>,
    pub actor: FeedActor,
    pub title: String,
    pub repo: Option<String>,
    pub url: Option<String>,
    pub occurred_at: String,
    pub detail: Option<Value>,
}

/// Verificação (check_suite ou workflow_run) como guardada em `github_checks`.
#[derive(Clone, Debug)]
pub struct CheckInput {
    pub source: String,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
}

/// Estado agregado das verificações. `none` quando não há nenhuma; nada é inventado.
pub fn aggregate_checks(checks: &[CheckInput]) -> ChecksSummary {
    // Actions gera um check_suite "GitHub Actions" para cada workflow_run: contar os dois dobraria o total.
    let has_runs = checks.iter().any(|c| c.source == "workflow_run");
    let items: Vec<&CheckInput> =
        checks.iter().filter(|c| !(has_runs && c.source == "check_suite" && c.name == "GitHub Actions")).collect();
    if items.is_empty() {
        return ChecksSummary { state: "none".into(), total: 0 };
    }
    let (mut failure, mut pending, mut success) = (false, false, false);
    for c in &items {
        if c.status != "completed" {
            pending = true;
            continue;
        }
        match c.conclusion.as_deref().unwrap_or("") {
            "success" => success = true,
            "failure" | "timed_out" | "action_required" | "startup_failure" => failure = true,
            _ => {} // neutral, skipped, cancelled, stale
        }
    }
    let state = if failure {
        "failure"
    } else if pending {
        "pending"
    } else if success {
        "success"
    } else {
        "neutral"
    };
    ChecksSummary { state: state.into(), total: items.len() as u32 }
}

/// `approved | changes_requested | review_required | none` a partir das reviews ativas.
pub fn derive_review_status(reviewers: &[Reviewer]) -> String {
    if reviewers.iter().any(|r| r.state == "CHANGES_REQUESTED") {
        "changes_requested"
    } else if reviewers.iter().any(|r| r.state == "APPROVED") {
        "approved"
    } else {
        "none"
    }
    .into()
}

pub fn count_approvals(reviewers: &[Reviewer]) -> u32 {
    reviewers.iter().filter(|r| r.state == "APPROVED").count() as u32
}

/// Filtro de estado da lista de PRs do servidor.
pub fn matches_state_filter(card: &PullRequestCard, filter: &str) -> bool {
    let open = card.state == "open";
    match filter {
        "open" => open,
        "in_review" => open && !card.is_draft && matches!(card.review_status.as_str(), "review_required" | "none"),
        "approved" => open && card.review_status == "approved",
        "changes_requested" => open && card.review_status == "changes_requested",
        "merged" => card.state == "merged",
        "closed" => card.state == "closed",
        _ => false,
    }
}

pub const PR_STATE_FILTERS: [&str; 6] = ["open", "in_review", "approved", "changes_requested", "merged", "closed"];

#[cfg(test)]
mod tests {
    use super::*;

    fn chk(source: &str, name: &str, status: &str, conclusion: Option<&str>) -> CheckInput {
        CheckInput { source: source.into(), name: name.into(), status: status.into(), conclusion: conclusion.map(Into::into) }
    }

    #[test]
    fn checks_aggregation() {
        assert_eq!(aggregate_checks(&[]).state, "none");
        let ok = chk("workflow_run", "CI", "completed", Some("success"));
        assert_eq!(aggregate_checks(std::slice::from_ref(&ok)).state, "success");
        let pend = chk("workflow_run", "Lint", "in_progress", None);
        assert_eq!(aggregate_checks(&[ok.clone(), pend.clone()]).state, "pending");
        let bad = chk("check_suite", "Outro", "completed", Some("failure"));
        assert_eq!(aggregate_checks(&[ok.clone(), pend, bad]).state, "failure");
        assert_eq!(aggregate_checks(&[chk("check_suite", "x", "completed", Some("skipped"))]).state, "neutral");
        // suite do Actions não conta em dobro quando há workflow_run
        let suite = chk("check_suite", "GitHub Actions", "completed", Some("success"));
        assert_eq!(aggregate_checks(&[ok, suite]).total, 1);
    }

    #[test]
    fn languages_percent_and_cap() {
        let repos = vec![
            vec![("Rust".into(), Some("#dea584".into()), 750), ("Go".into(), None, 250)],
            vec![("Rust".into(), Some("#dea584".into()), 250)],
        ];
        let l = aggregate_languages(&repos, 1);
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].size, 1000);
        assert_eq!(l[0].percent, 80.0);
    }
}
