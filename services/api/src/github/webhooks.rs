//! POST /webhooks/github. Ordem fixa: segredo -> assinatura (sobre os bytes brutos) -> parse -> idempotência -> gravação -> hub.
use super::{
    domain::{FeedActor, FeedItem},
    store::{self, CheckUpsert, EventInsert, PrUpsert, ReviewUpsert},
    time::{normalize, now_iso},
};
use crate::{error::{ApiError, ApiResult}, state::AppState};
use axum::{body::Bytes, extract::State, http::HeaderMap, Json};
use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::Sha256;

/// Valida `X-Hub-Signature-256` em tempo constante (`verify_slice`).
pub fn verify_signature(secret: &str, body: &[u8], header: &str) -> bool {
    let Some(hex_sig) = header.strip_prefix("sha256=") else { return false };
    let Ok(sig) = hex::decode(hex_sig) else { return false };
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.as_bytes()) else { return false };
    mac.update(body);
    mac.verify_slice(&sig).is_ok()
}

fn header<'a>(h: &'a HeaderMap, name: &str) -> Option<&'a str> {
    h.get(name).and_then(|v| v.to_str().ok()).map(str::trim).filter(|v| !v.is_empty())
}

fn text<'a>(v: &'a Value, ptr: &str) -> Option<&'a str> {
    v.pointer(ptr).and_then(Value::as_str)
}

/// Data do payload normalizada para UTC "Z"; sem data no payload usa o instante do recebimento.
fn when(v: &Value, ptrs: &[&str]) -> String {
    ptrs.iter().find_map(|p| text(v, p).and_then(normalize)).unwrap_or_else(now_iso)
}

struct NewEvent {
    kind: &'static str,
    action: Option<String>,
    title: String,
    url: Option<String>,
    detail: Value,
    occurred_at: String,
    dedupe_key: String,
}

#[derive(Default)]
struct Prepared {
    event: Option<NewEvent>,
    pr: Option<PrUpsert>,
    review: Option<ReviewUpsert>,
    check: Option<CheckUpsert>,
    /// PRs afetados já conhecidos (eventos de PR/review); checks consultam o banco pelo head_sha.
    pr_numbers: Vec<i64>,
    head_sha: Option<String>,
}

fn pr_upsert(repo_id: i64, repo_name: &str, pr: &Value) -> Option<PrUpsert> {
    let number = pr.get("number")?.as_i64()?;
    let merged = pr.get("merged").and_then(Value::as_bool) == Some(true) || pr.get("merged_at").is_some_and(|m| !m.is_null());
    let state = if merged {
        "merged"
    } else if text(pr, "/state") == Some("closed") {
        "closed"
    } else {
        "open"
    };
    let updated = when(pr, &["/updated_at", "/created_at"]);
    Some(PrUpsert {
        repo_id,
        number,
        node_id: text(pr, "/node_id").unwrap_or("").to_string(),
        repo_full_name: repo_name.to_string(),
        title: text(pr, "/title").unwrap_or("").to_string(),
        url: text(pr, "/html_url").unwrap_or("").to_string(),
        author_login: text(pr, "/user/login").unwrap_or("").to_string(),
        author_avatar: text(pr, "/user/avatar_url").map(Into::into),
        head_ref: text(pr, "/head/ref").unwrap_or("").to_string(),
        base_ref: text(pr, "/base/ref").unwrap_or("").to_string(),
        head_sha: text(pr, "/head/sha").unwrap_or("").to_string(),
        state: state.into(),
        is_draft: pr.get("draft").and_then(Value::as_bool) == Some(true),
        created_at: when(pr, &["/created_at", "/updated_at"]),
        updated_at: updated,
    })
}

fn conclusion_text(c: &str) -> String {
    match c {
        "success" => "passou".into(),
        "failure" => "falhou".into(),
        "cancelled" => "foi cancelado".into(),
        "skipped" => "foi ignorado".into(),
        "timed_out" => "expirou".into(),
        "neutral" => "terminou sem resultado".into(),
        other => format!("terminou ({other})"),
    }
}

fn prepare(event: &str, p: &Value, repo_id: i64, repo: &str, actor: &str) -> Option<Prepared> {
    let mut out = Prepared::default();
    match event {
        "push" => {
            let after = text(p, "/after")?;
            let reff = text(p, "/ref").unwrap_or("");
            let branch = reff.strip_prefix("refs/heads/").or_else(|| reff.strip_prefix("refs/tags/")).unwrap_or(reff);
            let n = p.get("commits").and_then(Value::as_array).map_or(0, Vec::len);
            let deleted = p.get("deleted").and_then(Value::as_bool) == Some(true);
            let title = if deleted {
                format!("{actor} removeu {branch}")
            } else if n == 0 {
                format!("{actor} atualizou {branch}")
            } else {
                format!("{actor} enviou {n} {} para {branch}", if n == 1 { "commit" } else { "commits" })
            };
            let occurred = text(p, "/head_commit/timestamp")
                .and_then(normalize)
                .or_else(|| p.pointer("/repository/pushed_at").and_then(Value::as_i64).map(super::time::fmt_secs))
                .unwrap_or_else(now_iso);
            out.event = Some(NewEvent {
                kind: "push",
                action: None,
                title,
                url: text(p, "/compare").map(Into::into),
                detail: json!({ "ref": reff, "branch": branch, "commits": n, "before": text(p, "/before"), "after": after }),
                occurred_at: occurred,
                // Mesmo conjunto de commits reentregue com outro delivery_id não duplica o evento.
                // O ref entra na chave: branch nova ou force-push para um SHA já visto continua sendo atividade.
                dedupe_key: format!("push:{repo_id}:{after}:{reff}"),
            });
        }
        "pull_request" => {
            let action = text(p, "/action")?;
            let pr = p.get("pull_request")?;
            let upsert = pr_upsert(repo_id, repo, pr)?;
            let number = upsert.number;
            let merged = upsert.state == "merged";
            let (action_out, verb) = match action {
                "opened" => ("opened", "abriu"),
                "reopened" => ("reopened", "reabriu"),
                "closed" if merged => ("merged", "fez merge do"),
                "closed" => ("closed", "fechou"),
                "ready_for_review" => ("ready_for_review", "marcou como pronto para revisão o"),
                "converted_to_draft" => ("converted_to_draft", "converteu em rascunho o"),
                _ => ("", ""),
            };
            if !action_out.is_empty() {
                let occurred = match action {
                    "closed" => when(pr, &["/merged_at", "/closed_at", "/updated_at"]),
                    "opened" => when(pr, &["/created_at", "/updated_at"]),
                    _ => when(pr, &["/updated_at"]),
                };
                out.event = Some(NewEvent {
                    kind: "pull_request",
                    action: Some(action_out.into()),
                    title: format!("{actor} {verb} PR #{number}"),
                    url: Some(upsert.url.clone()),
                    detail: json!({ "number": number, "title": upsert.title, "state": upsert.state, "is_draft": upsert.is_draft,
                                    "head_ref": upsert.head_ref, "base_ref": upsert.base_ref }),
                    occurred_at: occurred,
                    dedupe_key: format!("pull_request:{repo_id}:{number}:{action_out}:{}", text(pr, "/updated_at").unwrap_or("")),
                });
            }
            out.pr_numbers.push(number);
            out.pr = Some(upsert);
        }
        "pull_request_review" => {
            let action = text(p, "/action")?;
            let pr = p.get("pull_request")?;
            let review = p.get("review")?;
            let upsert = pr_upsert(repo_id, repo, pr)?;
            let number = upsert.number;
            let reviewer = text(review, "/user/login")?.to_string();
            let state = if action == "dismissed" {
                "DISMISSED".to_string()
            } else {
                text(review, "/state").unwrap_or("commented").to_ascii_uppercase()
            };
            let submitted = if action == "dismissed" {
                when(pr, &["/updated_at"])
            } else {
                when(review, &["/submitted_at"])
            };
            out.review = Some(ReviewUpsert {
                repo_id,
                number,
                reviewer_login: reviewer,
                reviewer_avatar: text(review, "/user/avatar_url").map(Into::into),
                state: state.clone(),
                submitted_at: submitted.clone(),
            });
            if action == "submitted" || action == "dismissed" {
                let (action_out, verb) = if action == "dismissed" {
                    ("dismissed".to_string(), "teve a review descartada no".to_string())
                } else {
                    let a = state.to_ascii_lowercase();
                    let v = match a.as_str() {
                        "approved" => "aprovou o",
                        "changes_requested" => "pediu mudanças no",
                        _ => "comentou no",
                    };
                    (a, v.to_string())
                };
                let review_id = review.get("id").and_then(Value::as_i64).unwrap_or(0);
                out.event = Some(NewEvent {
                    kind: "review",
                    action: Some(action_out.clone()),
                    title: format!("{actor} {verb} PR #{number}"),
                    url: text(review, "/html_url").map(Into::into).or_else(|| Some(upsert.url.clone())),
                    detail: json!({ "number": number, "title": upsert.title, "state": state }),
                    occurred_at: submitted,
                    dedupe_key: format!("review:{repo_id}:{number}:{review_id}:{action}"),
                });
            }
            out.pr_numbers.push(number);
            out.pr = Some(upsert);
        }
        "issues" => {
            let action = text(p, "/action")?;
            let issue = p.get("issue")?;
            let number = issue.get("number")?.as_i64()?;
            let verb = match action {
                "opened" => "abriu a issue",
                "closed" => "fechou a issue",
                "reopened" => "reabriu a issue",
                _ => return Some(out),
            };
            out.event = Some(NewEvent {
                kind: "issue",
                action: Some(action.into()),
                title: format!("{actor} {verb} #{number}"),
                url: text(issue, "/html_url").map(Into::into),
                detail: json!({ "number": number, "title": text(issue, "/title"), "state": text(issue, "/state") }),
                occurred_at: when(issue, &["/updated_at", "/created_at"]),
                dedupe_key: format!("issues:{repo_id}:{number}:{action}:{}", text(issue, "/updated_at").unwrap_or("")),
            });
        }
        "issue_comment" => {
            let action = text(p, "/action")?;
            if action != "created" {
                return Some(out);
            }
            let issue = p.get("issue")?;
            let comment = p.get("comment")?;
            let number = issue.get("number")?.as_i64()?;
            let cid = comment.get("id")?.as_i64()?;
            out.event = Some(NewEvent {
                kind: "issue_comment",
                action: Some("created".into()),
                title: format!("{actor} comentou em #{number}"),
                url: text(comment, "/html_url").map(Into::into),
                detail: json!({ "number": number, "title": text(issue, "/title"), "is_pull_request": issue.get("pull_request").is_some() }),
                occurred_at: when(comment, &["/created_at", "/updated_at"]),
                dedupe_key: format!("issue_comment:{repo_id}:{cid}:{action}"),
            });
        }
        "check_suite" | "workflow_run" => {
            let is_suite = event == "check_suite";
            let obj = p.get(event)?;
            let sha = text(obj, "/head_sha")?.to_string();
            let id = obj.get("id")?.as_i64()?;
            let name = if is_suite {
                text(obj, "/app/name").unwrap_or("check_suite").to_string()
            } else {
                text(obj, "/name").unwrap_or("workflow").to_string()
            };
            let status = text(obj, "/status").unwrap_or("queued").to_string();
            let conclusion = text(obj, "/conclusion").map(Into::into);
            let updated = when(obj, &["/updated_at", "/created_at"]);
            out.check = Some(CheckUpsert {
                repo_id,
                head_sha: sha.clone(),
                source: event.into(),
                name: name.clone(),
                status: status.clone(),
                conclusion: conclusion.clone(),
                updated_at: updated.clone(),
            });
            if text(p, "/action") == Some("completed") {
                if let Some(c) = conclusion.as_deref() {
                    let short = sha.get(..7).unwrap_or(&sha);
                    let attempt = obj.get("run_attempt").and_then(Value::as_i64).unwrap_or(1);
                    out.event = Some(NewEvent {
                        kind: if is_suite { "check" } else { "workflow" },
                        action: Some(c.into()),
                        title: if is_suite {
                            format!("Verificação {name} {} em {short}", conclusion_text(c))
                        } else {
                            format!("Workflow {name} {} em {short}", conclusion_text(c))
                        },
                        url: text(obj, "/html_url").map(Into::into).or_else(|| {
                            text(p, "/repository/html_url").map(|u| format!("{u}/commit/{sha}"))
                        }),
                        detail: json!({ "name": name, "status": status, "conclusion": c, "head_sha": sha }),
                        occurred_at: updated,
                        dedupe_key: if is_suite {
                            format!("check:{repo_id}:{id}:{c}")
                        } else {
                            format!("workflow:{repo_id}:{id}:{attempt}:{c}")
                        },
                    });
                }
            }
            out.head_sha = Some(sha);
        }
        _ => return None,
    }
    Some(out)
}

pub async fn receive(State(s): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult<Json<Value>> {
    let secret = s.cfg.github.webhook_secret.as_str();
    if secret.is_empty() {
        return Err(super::unconfigured());
    }
    // Assinatura sobre os bytes brutos, antes de qualquer parse.
    let sig = header(&headers, "x-hub-signature-256").ok_or(ApiError::Unauthorized)?;
    if !verify_signature(secret, &body, sig) {
        return Err(ApiError::Unauthorized);
    }
    let payload: Value = serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("JSON inválido".into()))?;
    let event = header(&headers, "x-github-event").ok_or_else(|| ApiError::BadRequest("X-GitHub-Event ausente".into()))?;
    let delivery = header(&headers, "x-github-delivery").ok_or_else(|| ApiError::BadRequest("X-GitHub-Delivery ausente".into()))?;
    let ignored = || Ok(Json(json!({ "ok": true, "ignored": true })));

    let (Some(repo_id), Some(repo_name)) =
        (payload.pointer("/repository/id").and_then(Value::as_i64), text(&payload, "/repository/full_name"))
    else {
        return ignored();
    };
    let servers = store::servers_linked_to_repo(&s.db, repo_id).await?;
    if servers.is_empty() {
        return ignored();
    }
    let actor = text(&payload, "/sender/login").unwrap_or("alguém").to_string();
    let Some(prep) = prepare(event, &payload, repo_id, repo_name, &actor) else {
        return ignored();
    };

    let mut tx = s.db.begin().await?;
    if !store::insert_delivery(&mut tx, delivery).await? {
        return Ok(Json(json!({ "ok": true, "duplicate": true })));
    }
    if let Some(pr) = &prep.pr {
        store::upsert_pr(&mut tx, pr).await?;
    }
    if let Some(r) = &prep.review {
        store::upsert_review(&mut tx, r).await?;
    }
    if let Some(c) = &prep.check {
        store::upsert_check(&mut tx, c).await?;
    }
    let mut feed_item: Option<FeedItem> = None;
    if let Some(e) = &prep.event {
        let avatar: Option<String> = text(&payload, "/sender/avatar_url").map(Into::into);
        let id = store::insert_event(
            &mut tx,
            &EventInsert {
                delivery_id: delivery.to_string(),
                dedupe_key: e.dedupe_key.clone(),
                repo_id,
                repo_full_name: repo_name.to_string(),
                kind: e.kind.to_string(),
                action: e.action.clone(),
                actor_login: actor.clone(),
                actor_avatar: avatar.clone(),
                title: e.title.clone(),
                url: e.url.clone(),
                detail_json: e.detail.to_string(),
                occurred_at: e.occurred_at.clone(),
            },
        )
        .await?;
        feed_item = id.map(|id| FeedItem {
            id: format!("ev:{id}"),
            source: "github".into(),
            kind: e.kind.into(),
            action: e.action.clone(),
            actor: FeedActor { name: actor.clone(), avatar_url: avatar, user_id: None },
            title: e.title.clone(),
            repo: Some(repo_name.to_string()),
            url: e.url.clone(),
            occurred_at: e.occurred_at.clone(),
            detail: Some(e.detail.clone()),
        });
    }
    tx.commit().await?;

    // Depois do commit: o que o cliente receber já está no banco.
    let mut numbers = prep.pr_numbers.clone();
    if let Some(sha) = &prep.head_sha {
        for n in store::pr_numbers_by_sha(&s.db, repo_id, sha).await? {
            if !numbers.contains(&n) {
                numbers.push(n);
            }
        }
    }
    for server_id in &servers {
        if let Some(item) = &feed_item {
            s.hub.publish(server_id, json!({ "type": "github.event", "server_id": server_id, "item": item }));
        }
        for n in &numbers {
            s.hub.publish(server_id, json!({ "type": "github.pr_updated", "server_id": server_id, "repo": repo_name, "number": n }));
        }
    }
    Ok(Json(json!({ "ok": true })))
}
