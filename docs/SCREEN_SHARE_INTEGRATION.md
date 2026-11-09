# Auditoria do compartilhamento de tela (Fase 0)

Projeto auditado: `D:\Downloads\pastas codigo\COMPARTILHARTELAV2` ("PartilharTela" v2.0.5). Nenhum arquivo dele foi alterado.
Nome do produto novo: **Squak**.

## 1. O que existe de verdade

| Peça | Local | Tecnologia |
|---|---|---|
| App Windows | `apps/desktop-tauri` | Tauri 2 + Rust + webview React 18 + Vite |
| Captura de tela | `src-tauri/src/media/capture.rs` | Windows Graphics Capture (crate `windows` 0.62), BGRA→NV12 em Rust |
| Codificação | `src-tauri/src/media/encoder.rs` | H.264 pelo Media Foundation (encoder do Windows) |
| Áudio de sistema/app | `src-tauri/src/media/audio.rs` | WASAPI loopback (crate `wasapi`), por PID ou sistema |
| Publicação | `src-tauri/src/share.rs` | SDK Rust `livekit` 0.10.1 + `libwebrtc` 0.4.0 |
| Lista de fontes | `src-tauri/src/sources.rs` | monitores/janelas + processos com áudio |
| Login/sessão | `src-tauri/src/auth.rs` | OAuth Discord PKCE, sessão guardada com DPAPI |
| Webview (viewer) | `src/RoomScreen.tsx`, `session.ts` | `livekit-client` (JS): só recebe, como espectador |
| Servidor de tokens | `apps/server` | Fastify + SQLite; `livekit-server-sdk`; TTL do token 15 min |
| Infra local | `infra/docker-compose.yml`, `livekit.yaml` | LiveKit em Docker, chaves `devkey`/`secret` (só dev) |

Comandos Tauri expostos: `start_share`, `stop_share`, `set_share_audio_muted`, `list_sources`, `list_audio_processes`,
`authorize_discord`, `consume_pending_join`, `save_session`, `load_session`, `clear_session`.

## 2. Como o compartilhamento funciona

1. O webview conecta ao LiveKit com `livekit-client` como espectador.
2. Ao transmitir, o **Rust abre uma segunda conexão** à mesma sala, com identity `<identity>-share`, captura a fonte,
   codifica em H.264 e publica as tracks `ScreenShare` e `ScreenShareAudio`.
3. Qualidade e modo (movimento/texto) mudam ao vivo republicando a mesma fonte.
4. O token da conexão de share só permite publicar `SCREEN_SHARE` e `SCREEN_SHARE_AUDIO` (`canPublishSources`).
5. No encerramento do app, `share::shutdown` finaliza a publicação.

Não é Electron. Não há `desktopCapturer`, main process nem preload para portar. A captura já é nativa Rust.
O `apps/desktop` guarda apenas `.env` locais.

## 3. Decisão de mídia

**Estratégia híbrida, herdada do projeto existente (sem segunda implementação de WebRTC):**

- **Voz, câmera e recepção de vídeo**: `livekit-client` (JS) no webview. É o caminho mais estável para
  `getUserMedia`, seleção de dispositivos, VAD ("quem fala") e renderização de `<video>`.
- **Compartilhamento de tela**: módulo Rust existente, mantido como está (captura WGC + H.264 nativo + loopback WASAPI).
  Motivo concreto para não usar `getDisplayMedia`: o WebView2 não oferece áudio por aplicativo nem controle de
  codec/bitrate, e o módulo atual já foi validado nesse fluxo.
- **Rust no backend**: autenticação, regras, emissão de tokens (o Squak substitui o servidor Fastify por Axum).

**Justificativa da segunda conexão (`-share`)**: o SDK Rust não compartilha a `Room` com o `livekit-client` do
webview. Manter uma identity `-share` por usuário é o desenho já em produção. Alternativa avaliada e descartada:
publicar a tela pelo SDK JS com `getDisplayMedia` (perde áudio por app e codificação de hardware controlada).
No Squak a identity `-share` fica atrelada ao mesmo usuário e a UI a agrupa no mesmo tile do participante.

## 4. Reaproveitamento

| Item | Ação |
|---|---|
| `media/capture.rs`, `encoder.rs`, `audio.rs`, `sources.rs` | Copiar sem mudança de lógica (renomear crate) |
| `share.rs` | Copiar e adaptar: nome da sala/identity vêm do backend Squak; remover `partilhartela-` hardcoded |
| `SourcePicker.tsx`, `ShareDock.tsx` | Reaproveitar com ajuste de estilo e de props |
| `auth.rs` (DPAPI) | Reaproveitar a parte `save/load/clear_session` (armazenamento seguro). OAuth Discord **não** entra |
| Servidor Fastify, bot Discord, modo RPG, updater | Não migrar nesta entrega |
| Config de build (`.cargo/config.toml`, perfil release sem LTO) | Reaproveitar |

## 5. Riscos

- Dois workspaces Rust pesados (`libwebrtc`, `livekit`) tornam o primeiro build lento (dezenas de minutos).
- Instalador NSIS: o projeto original relata falha de build em sandbox; rodar no terminal do usuário.
- Mesma identity em dois aparelhos derruba a conexão mais antiga (comportamento do LiveKit).
- Áudio por aplicativo: PID inferido por título de janela (heurística).
- Teste de mídia real exige dois clientes Windows; só um computador disponível aqui, então mídia entre pares
  **não será declarada validada** sem teste real.

## 6. Ambiente (decisões do usuário)

- **Banco: SQLite** (via SQLx), no lugar de PostgreSQL. Arquivo em `data/squak.db`, modo WAL.
- **Contêineres: podman** (Docker não existe). O LiveKit local sobe com `scripts/livekit-up.ps1`
  (não há provedor de compose instalado). Requer `podman machine start`.
- Chaves LiveKit de dev ficam no `.env` da raiz (ignorado pelo git); `.env.example` documenta as variáveis.
- Rust 1.99.1, Cargo e Node 24 estão presentes.
