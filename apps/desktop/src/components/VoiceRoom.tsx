import { ConnectionState, LocalAudioTrack, Participant, RemoteParticipant, Room, RoomEvent, Track } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiFailure, type Channel, type User } from '../api';
import type { Realtime } from '../realtime';
import { captureConstraints, getVoiceSettings, MicProcessor, playSound, subscribeVoiceSettings } from '../voiceSettings';
import { Avatar } from './Avatar';
import { ShareControl } from './ShareControl';

const isShare = (p: Participant) => p.identity.endsWith('-share');

type Phase = 'connecting' | 'connected' | 'reconnecting' | 'failed';

function Tile({ p, big, onPick, sharing }: { p: Participant; big?: boolean; onPick?: () => void; sharing?: boolean }) {
  const vref = useRef<HTMLVideoElement>(null);
  const cam = p.getTrackPublication(Track.Source.Camera);
  const scr = p.getTrackPublication(Track.Source.ScreenShare);
  const pub = big && scr?.track ? scr : cam;
  useEffect(() => {
    const t = pub?.track;
    if (!t || pub?.isMuted || !vref.current) return;
    t.attach(vref.current);
    return () => { t.detach(vref.current!); };
  }, [pub?.track, pub?.isMuted]);
  const hasVideo = !!pub?.track && !pub.isMuted;
  const micOff = !p.isMicrophoneEnabled;
  return (
    <div className={'tile' + (p.isSpeaking ? ' speaking' : '') + (big ? ' big' : '')} onClick={onPick}>
      {hasVideo ? <video ref={vref} autoPlay playsInline muted /> : <Avatar name={p.name || p.identity} size={big ? 96 : 64} />}
      <div className="tile-name">
        {micOff && <span title="Microfone desligado">🔇</span>}
        {(scr?.track || sharing) && <span title="Compartilhando tela">🖥</span>}
        {p.name || p.identity}{isShare(p) ? ' (tela)' : p.isLocal ? ' (você)' : ''}
      </div>
    </div>
  );
}

export function VoiceRoom({ channel, me, rt, onLeave, onSettings }: { channel: Channel; me: User; rt: Realtime | null; onLeave: () => void; onSettings: () => void }) {
  const roomRef = useRef<Room | null>(null);
  const audioHost = useRef<HTMLDivElement>(null);
  const [, bump] = useState(0);
  const [phase, setPhase] = useState<Phase>('connecting');
  const [error, setError] = useState('');
  const [deaf, setDeaf] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [showVolumes, setShowVolumes] = useState(false);
  const [sharing, setSharing] = useState(false);
  const personal = useRef(new Map<string, number>());
  const deafRef = useRef(false);
  const refresh = useCallback(() => bump((n) => n + 1), []);

  // Volume final de cada participante = volume do alto-falante × volume individual (0 se o áudio local está desativado).
  const applyVolumes = useCallback(() => {
    const room = roomRef.current; if (!room) return;
    const g = deafRef.current ? 0 : getVoiceSettings().speakerVolume;
    room.remoteParticipants.forEach((p) => p.setVolume(g * (personal.current.get(p.identity) ?? 1)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const s0 = getVoiceSettings();
    const room = new Room({
      adaptiveStream: true, dynacast: true,
      audioCaptureDefaults: captureConstraints(s0),
      audioOutput: s0.outputId ? { deviceId: s0.outputId } : undefined,
    });
    roomRef.current = room;
    // Mudanças nas configurações valem durante a chamada.
    let prev = s0;
    const unsub = subscribeVoiceSettings(() => {
      const s = getVoiceSettings();
      applyVolumes();
      if (s.outputId !== prev.outputId) room.switchActiveDevice('audiooutput', s.outputId || 'default').catch(() => {});
      if (s.inputId !== prev.inputId || s.noiseSuppression !== prev.noiseSuppression || s.echoCancellation !== prev.echoCancellation || s.autoGain !== prev.autoGain) {
        const t = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
        t?.restartTrack(captureConstraints(s)).catch(() => setError('Não foi possível aplicar o novo microfone'));
      }
      prev = s;
    });
    (async () => {
      try {
        const t = await api<{ url: string; token: string }>('POST', `/channels/${channel.id}/voice-token`);
        if (cancelled) return;
        for (const ev of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed,
          RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.ActiveSpeakersChanged, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished]) room.on(ev, refresh);
        // A conexão nativa de tela do próprio usuário (`<id>-share`) não é assistida aqui: evita eco do som do
        // sistema e o espelho infinito de uma tela que mostra o próprio app.
        const ownShare = `${me.id}-share`;
        room.on(RoomEvent.TrackPublished, (pub, part) => { if (part.identity === ownShare) pub.setSubscribed(false); });
        room.on(RoomEvent.TrackSubscribed, (track, _pub, part) => {
          if (part.identity === ownShare) return;
          if (track.kind === Track.Kind.Audio && audioHost.current) { audioHost.current.appendChild(track.attach()); applyVolumes(); }
        });
        room.on(RoomEvent.ParticipantConnected, () => playSound('join'));
        room.on(RoomEvent.ParticipantDisconnected, () => playSound('leave'));
        room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
        room.on(RoomEvent.Reconnecting, () => setPhase('reconnecting'));
        room.on(RoomEvent.Reconnected, () => setPhase('connected'));
        room.on(RoomEvent.Disconnected, () => { if (!cancelled) setPhase('failed'); });
        await room.connect(t.url, t.token);
        if (cancelled) { room.disconnect(); return; }
        setPhase('connected');
        rt?.send({ type: 'voice.join', channel_id: channel.id });
        // O microfone só é pedido agora, porque o usuário entrou na sala.
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          // Ganho do microfone e sensibilidade (porta de ruído), lidos ao vivo das configurações.
          await room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack?.setProcessor(new MicProcessor(getVoiceSettings));
        } catch { setError('Microfone indisponível ou permissão negada. Você entrou mudo.'); }
        playSound('join');
        refresh();
      } catch (e) {
        if (!cancelled) { setPhase('failed'); setError(e instanceof ApiFailure ? e.message : 'Não foi possível conectar à sala de voz'); }
      }
    })();
    return () => {
      cancelled = true;
      unsub();
      playSound('leave');
      rt?.send({ type: 'voice.leave', channel_id: channel.id });
      room.disconnect(); // encerra todas as tracks locais
      audioHost.current?.replaceChildren();
    };
  }, [channel.id, rt, refresh, applyVolumes]);

  // Após reconexão do WebSocket, reafirma a presença na sala.
  useEffect(() => rt?.on((e) => { if (e.type === 'resync' && roomRef.current?.state === ConnectionState.Connected) rt.send({ type: 'voice.join', channel_id: channel.id }); }), [rt, channel.id]);

  const room = roomRef.current;
  const lp = room?.localParticipant;
  const announce = () => rt?.send({ type: 'voice.state', channel_id: channel.id, muted: !lp?.isMicrophoneEnabled, deafened: deaf, camera: !!lp?.isCameraEnabled, screen: sharing || !!lp?.isScreenShareEnabled });
  useEffect(announce); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMic = async () => {
    const turningOff = !!lp?.isMicrophoneEnabled;
    try { await lp?.setMicrophoneEnabled(!turningOff); setError(''); playSound(turningOff ? 'mute' : 'unmute'); } catch { setError('Microfone indisponível'); }
    refresh();
  };
  const toggleCam = async () => { try { await lp?.setCameraEnabled(!lp.isCameraEnabled); setError(''); } catch { setError('Câmera indisponível ou em uso por outro app'); } refresh(); };
  const toggleDeaf = () => {
    const next = !deaf; setDeaf(next); deafRef.current = next; applyVolumes();
    playSound(next ? 'deafen' : 'undeafen');
  };

  const all: Participant[] = room ? [room.localParticipant, ...room.remoteParticipants.values()] : [];
  const presenter = all.find((p) => p.getTrackPublication(Track.Source.ScreenShare)?.track);
  const spot = all.find((p) => p.identity === focus) ?? presenter;
  // Conexões `-share` são só o canal da tela: aparecem no destaque, nunca como participante na grade.
  const others = all.filter((p) => p !== spot && !isShare(p));
  const micOn = !!lp?.isMicrophoneEnabled;
  void me; void LocalAudioTrack;

  return (
    <section className="voice">
      <header className="chat-head">🔊 {channel.name}
        <span className={'conn ' + phase}>{{ connecting: 'Conectando…', connected: 'Conectado', reconnecting: 'Reconectando…', failed: 'Desconectado' }[phase]}</span>
      </header>
      {error && <div className="error" role="alert">{error}</div>}
      <div className={'stage' + (spot ? ' presenting' : '')}>
        {spot && <Tile p={spot} big onPick={() => setFocus(null)} />}
        <div className={'grid n' + Math.min(others.length, 9)}>{others.map((p) => <Tile key={p.identity} p={p} sharing={p.isLocal && sharing} onPick={() => setFocus(p.identity)} />)}</div>
        {phase === 'connecting' && <div className="empty">Entrando na sala…</div>}
        {phase === 'failed' && <div className="empty"><p>Conexão perdida.</p><button className="primary" onClick={() => { onLeave(); }}>Voltar</button></div>}
      </div>
      <div ref={audioHost} hidden />
      {showVolumes && (
        <div className="devices">
          {room && room.remoteParticipants.size === 0 && <span className="muted">Ninguém mais na sala.</span>}
          {room && [...room.remoteParticipants.values()].map((p: RemoteParticipant) => (
            <label key={p.identity}>Volume de {p.name}
              <input type="range" min={0} max={1} step={0.05} defaultValue={personal.current.get(p.identity) ?? 1}
                onChange={(e) => { personal.current.set(p.identity, Number(e.target.value)); applyVolumes(); }} /></label>
          ))}
        </div>
      )}
      <div className="voice-controls">
        <button className={micOn ? '' : 'off'} onClick={toggleMic} disabled={phase !== 'connected'} title="Microfone">{micOn ? '🎙' : '🔇'}</button>
        <button className={deaf ? 'off' : ''} onClick={toggleDeaf} title="Silenciar áudio local">{deaf ? '🔈' : '🔊'}</button>
        <button className={lp?.isCameraEnabled ? 'on' : ''} onClick={toggleCam} disabled={phase !== 'connected'} title="Câmera">📷</button>
        <ShareControl room={room} channelId={channel.id} disabled={phase !== 'connected'} onSharing={setSharing} onError={setError} />
        <button onClick={() => setShowVolumes((v) => !v)} title="Volume por participante">🎚</button>
        <button onClick={onSettings} title="Configurações de voz">⚙</button>
        <button className="leave" onClick={onLeave} title="Sair da sala">Sair</button>
      </div>
    </section>
  );
}
