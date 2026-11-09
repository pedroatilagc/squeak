use crate::{auth::user_from_token, servers::role_of, state::AppState};
use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{collections::{HashMap, HashSet}, sync::{Arc, Mutex}, time::Duration};
use tokio::sync::broadcast;

#[derive(Clone, Debug)]
pub struct Event {
    pub server_id: String,
    pub payload: Value,
}

#[derive(Clone)]
pub struct Hub {
    tx: broadcast::Sender<Arc<Event>>,
    /// Conexões abertas por usuário (presença baseada em conexão real).
    online: Arc<Mutex<HashMap<String, u32>>>,
    /// Participantes de salas de voz: channel_id -> user_ids.
    voice: Arc<Mutex<HashMap<String, HashSet<String>>>>,
}

impl Hub {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(1024);
        Self { tx, online: Default::default(), voice: Default::default() }
    }
    pub fn publish(&self, server_id: &str, payload: Value) {
        let _ = self.tx.send(Arc::new(Event { server_id: server_id.to_string(), payload }));
    }
    /// Assina o fluxo de eventos (usado pelo WebSocket e pelos testes).
    pub fn subscribe(&self) -> broadcast::Receiver<Arc<Event>> {
        self.tx.subscribe()
    }
    pub fn publish_channel(&self, server_id: &str, _channel_id: &str, payload: Value) {
        self.publish(server_id, payload);
    }
    pub fn voice_members(&self, channel_id: &str) -> Vec<String> {
        self.voice.lock().unwrap().get(channel_id).map(|s| s.iter().cloned().collect()).unwrap_or_default()
    }
    pub fn is_online(&self, user_id: &str) -> bool {
        self.online.lock().unwrap().get(user_id).copied().unwrap_or(0) > 0
    }
}

impl Default for Hub {
    fn default() -> Self {
        Self::new()
    }
}

pub async fn ws_handler(State(s): State<AppState>, ws: WebSocketUpgrade) -> Response {
    ws.max_message_size(16 * 1024).on_upgrade(move |socket| handle(s, socket))
}

async fn user_servers(s: &AppState, user_id: &str) -> Vec<String> {
    sqlx::query_as::<_, (String,)>("SELECT server_id FROM server_members WHERE user_id = ?")
        .bind(user_id).fetch_all(&s.db).await.map(|v| v.into_iter().map(|r| r.0).collect()).unwrap_or_default()
}

async fn handle(s: AppState, socket: WebSocket) {
    let (mut sink, mut stream) = socket.split();

    // O token vai na primeira mensagem (não na URL), com prazo de 10 s.
    let first = tokio::time::timeout(Duration::from_secs(10), stream.next()).await;
    let user_id = match first {
        Ok(Some(Ok(Message::Text(t)))) => {
            let v: Value = serde_json::from_str(&t).unwrap_or(Value::Null);
            match (v["type"].as_str(), v["token"].as_str()) {
                (Some("auth"), Some(tok)) => user_from_token(&s, tok).await.ok(),
                _ => None,
            }
        }
        _ => None,
    };
    let Some(user_id) = user_id else {
        let _ = sink.send(Message::Text(json!({"type": "error", "error": "não autenticado"}).to_string().into())).await;
        return;
    };
    let _ = sink.send(Message::Text(json!({"type": "ready", "user_id": user_id}).to_string().into())).await;

    let mut rx = s.hub.tx.subscribe();
    let first_conn = {
        let mut o = s.hub.online.lock().unwrap();
        let c = o.entry(user_id.clone()).or_insert(0);
        *c += 1;
        *c == 1
    };
    if first_conn {
        announce_presence(&s, &user_id, "online").await;
    }

    let mut joined_voice: HashSet<String> = HashSet::new();
    loop {
        tokio::select! {
            ev = rx.recv() => match ev {
                Ok(ev) => {
                    // Autorização por evento: só entrega se o usuário ainda for membro do servidor.
                    if matches!(role_of(&s, &ev.server_id, &user_id).await, Ok(Some(_))) {
                        if sink.send(Message::Text(ev.payload.to_string().into())).await.is_err() { break; }
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    // Cliente lento perdeu eventos: avisa para ressincronizar via REST.
                    if sink.send(Message::Text(json!({"type": "resync"}).to_string().into())).await.is_err() { break; }
                }
                Err(_) => break,
            },
            msg = stream.next() => match msg {
                Some(Ok(Message::Text(t))) => client_event(&s, &user_id, &t, &mut joined_voice).await,
                Some(Ok(Message::Ping(p))) => { let _ = sink.send(Message::Pong(p)).await; }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                _ => {}
            },
        }
    }

    for ch in joined_voice {
        leave_voice(&s, &user_id, &ch).await;
    }
    let last = {
        let mut o = s.hub.online.lock().unwrap();
        match o.get_mut(&user_id) {
            Some(c) if *c > 1 => { *c -= 1; false }
            _ => { o.remove(&user_id); true }
        }
    };
    if last {
        announce_presence(&s, &user_id, "offline").await;
    }
}

async fn announce_presence(s: &AppState, user_id: &str, status: &str) {
    for sid in user_servers(s, user_id).await {
        s.hub.publish(&sid, json!({"type": "presence.updated", "server_id": sid, "user_id": user_id, "status": status}));
    }
}

async fn channel_server(s: &AppState, cid: &str, kind: &str) -> Option<String> {
    sqlx::query_as::<_, (String,)>("SELECT server_id FROM channels WHERE id = ? AND kind = ?")
        .bind(cid).bind(kind).fetch_optional(&s.db).await.ok().flatten().map(|r| r.0)
}

async fn leave_voice(s: &AppState, user_id: &str, cid: &str) {
    let removed = s.hub.voice.lock().unwrap().get_mut(cid).map(|set| set.remove(user_id)).unwrap_or(false);
    if removed {
        if let Some(sid) = channel_server(s, cid, "voice").await {
            s.hub.publish(&sid, json!({"type": "voice.member_left", "server_id": sid, "channel_id": cid, "user_id": user_id}));
        }
    }
}

async fn client_event(s: &AppState, user_id: &str, text: &str, joined: &mut HashSet<String>) {
    let v: Value = serde_json::from_str(text).unwrap_or(Value::Null);
    let Some(cid) = v["channel_id"].as_str() else { return };
    match v["type"].as_str() {
        Some("typing") => {
            if let Some(sid) = channel_server(s, cid, "text").await {
                if matches!(role_of(s, &sid, user_id).await, Ok(Some(_))) {
                    s.hub.publish(&sid, json!({"type": "channel.typing", "server_id": sid, "channel_id": cid, "user_id": user_id}));
                }
            }
        }
        Some("voice.join") => {
            if let Some(sid) = channel_server(s, cid, "voice").await {
                if matches!(role_of(s, &sid, user_id).await, Ok(Some(_))) {
                    s.hub.voice.lock().unwrap().entry(cid.to_string()).or_default().insert(user_id.to_string());
                    joined.insert(cid.to_string());
                    s.hub.publish(&sid, json!({"type": "voice.member_joined", "server_id": sid, "channel_id": cid, "user_id": user_id}));
                }
            }
        }
        Some("voice.leave") => {
            joined.remove(cid);
            leave_voice(s, user_id, cid).await;
        }
        Some("voice.state") => {
            if joined.contains(cid) {
                if let Some(sid) = channel_server(s, cid, "voice").await {
                    s.hub.publish(&sid, json!({"type": "voice.state_changed", "server_id": sid, "channel_id": cid, "user_id": user_id,
                        "muted": v["muted"].as_bool().unwrap_or(false), "deafened": v["deafened"].as_bool().unwrap_or(false),
                        "camera": v["camera"].as_bool().unwrap_or(false), "screen": v["screen"].as_bool().unwrap_or(false)}));
                }
            }
        }
        _ => {}
    }
}
