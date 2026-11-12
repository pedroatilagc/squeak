import type { Channel, Member, ServerDetail } from '../../api';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../design/Icon';
import { StateCard } from '../../design/states';

/** Tela de Chamadas quando o usuário ainda não está em nenhuma sala. */
export function CallsLobby({ detail, voice, memberById, onJoin }: {
  detail: ServerDetail; voice: Record<string, string[]>; memberById: Map<string, Member>; onJoin: (c: Channel) => void;
}) {
  const rooms = detail.channels.filter((c) => c.kind === 'voice');
  return (
    <div className="area">
      <header className="area-head"><Icon name="volume" size={18} /><h2>Chamadas</h2><span className="muted small">{detail.name}</span></header>
      <div className="area-body">
        {rooms.length === 0
          ? <StateCard icon="volume" title="Este workspace não tem salas de voz">Um admin pode criar uma em "Novo canal", escolhendo Voz.</StateCard>
          : <div className="room-grid">
            {rooms.map((c) => {
              const inside = (voice[c.id] ?? []).map((u) => memberById.get(u)).filter(Boolean) as Member[];
              return (
                <section key={c.id} className="panel room">
                  <header className="panel-head"><Icon name="volume" /><h3>{c.name}</h3><span className="grow" /><span className="dim small">{inside.length ? `${inside.length} na sala` : 'vazia'}</span></header>
                  <div className="avatars wrap">{inside.map((m) => <span key={m.id} title={m.username}><Avatar name={m.username} url={m.avatar_url} size={28} /></span>)}</div>
                  <div className="row start"><button className="primary" onClick={() => onJoin(c)}><Icon name="mic" /> Entrar na sala</button></div>
                </section>
              );
            })}
          </div>}
      </div>
    </div>
  );
}
