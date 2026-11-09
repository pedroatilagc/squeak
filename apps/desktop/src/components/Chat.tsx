import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, ApiFailure, type Channel, type Member, type Message, type User } from '../api';
import type { Realtime } from '../realtime';
import { Avatar } from './Avatar';
import { Composer } from './Composer';
import { Markdown } from './Markdown';

const EMOJIS = ['👍', '❤️', '😂', '🎉', '👀'];
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });

interface Props { channel: Channel; me: User; members: Member[]; canModerate: boolean; rt: Realtime | null; onUnread: (channelId: string) => void }

export function Chat({ channel, me, members, canModerate, rt }: Props) {
  const [msgs, setMsgs] = useState<Message[]>([]); // ordem cronológica
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef(0);

  const upsert = useCallback((m: Message) => setMsgs((cur) => {
    const i = cur.findIndex((x) => x.id === m.id);
    if (i >= 0) { const n = cur.slice(); n[i] = m; return n; }
    return [...cur, m].sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1));
  }), []);

  const loadLatest = useCallback(async () => {
    setError('');
    try {
      const r = await api<{ messages: Message[]; next_cursor: string | null }>('GET', `/channels/${channel.id}/messages?limit=50`);
      setMsgs((cur) => {
        const pending = cur.filter((m) => m.pending || m.failed);
        return [...r.messages.slice().reverse(), ...pending];
      });
      setCursor(r.next_cursor);
    } catch (e) { setError(e instanceof ApiFailure ? e.message : 'Falha ao carregar'); }
    finally { setLoading(false); }
  }, [channel.id]);

  useEffect(() => { setMsgs([]); setCursor(null); setLoading(true); setReplyTo(null); setEditing(null); stick.current = true; void loadLatest(); }, [channel.id, loadLatest]);

  useEffect(() => {
    if (!rt) return;
    return rt.on((e) => {
      if (e.type === 'resync') { void loadLatest(); return; }
      if ((e.type === 'message.created' || e.type === 'message.updated') && e.message.channel_id === channel.id) upsert(e.message);
      else if (e.type === 'message.deleted' && e.channel_id === channel.id) setMsgs((c) => c.map((m) => m.id === e.message_id ? { ...m, deleted: true, content: '' } : m));
      else if ((e.type === 'message.reaction_added' || e.type === 'message.reaction_removed') && e.channel_id === channel.id) {
        const d = e.type === 'message.reaction_added' ? 1 : -1;
        setMsgs((c) => c.map((m) => {
          if (m.id !== e.message_id) return m;
          const r = m.reactions.some((x) => x.emoji === e.emoji)
            ? m.reactions.map((x) => x.emoji === e.emoji ? { ...x, count: x.count + d } : x)
            : [...m.reactions, { emoji: e.emoji, count: 1 }];
          return { ...m, reactions: r.filter((x) => x.count > 0) };
        }));
      } else if (e.type === 'channel.typing' && e.channel_id === channel.id && e.user_id !== me.id) {
        setTyping((t) => ({ ...t, [e.user_id]: Date.now() + 4000 }));
      }
    });
  }, [rt, channel.id, me.id, upsert, loadLatest]);

  useEffect(() => { const t = setInterval(() => setTyping((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v > Date.now()))), 1000); return () => clearInterval(t); }, []);

  // Rolagem controlada: só cola no fim se o usuário já estava no fim; preserva posição ao carregar histórico.
  useLayoutEffect(() => {
    const el = listRef.current; if (!el) return;
    if (prevHeight.current) { el.scrollTop += el.scrollHeight - prevHeight.current; prevHeight.current = 0; }
    else if (stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const older = async () => {
    if (!cursor) return;
    const r = await api<{ messages: Message[]; next_cursor: string | null }>('GET', `/channels/${channel.id}/messages?limit=50&before=${cursor}`);
    prevHeight.current = listRef.current?.scrollHeight ?? 0;
    setMsgs((c) => [...r.messages.slice().reverse(), ...c]);
    setCursor(r.next_cursor);
  };

  const send = useCallback(async (content: string, reply: Message | null, nonce: string = crypto.randomUUID()) => {
    stick.current = true;
    const pending: Message = { id: 'tmp-' + nonce, nonce, channel_id: channel.id, author: { id: me.id, username: me.username, avatar_url: me.avatar_url }, content, reply_to: reply?.id ?? null, created_at: Date.now(), edited_at: null, deleted: false, reactions: [], pending: true };
    setMsgs((c) => c.some((m) => m.nonce === nonce) ? c.map((m) => m.nonce === nonce ? pending : m) : [...c, pending]);
    try {
      // Só vira "salva" quando o backend confirma; o nonce evita duplicata se reenviar.
      const saved = await api<Message>('POST', `/channels/${channel.id}/messages`, { content, reply_to: reply?.id ?? null, client_nonce: nonce });
      setMsgs((c) => {
        const without = c.filter((m) => m.nonce !== nonce);
        return without.some((m) => m.id === saved.id) ? without : [...without, saved].sort((a, b) => a.created_at - b.created_at);
      });
    } catch {
      setMsgs((c) => c.map((m) => m.nonce === nonce ? { ...m, pending: false, failed: true } : m));
    }
  }, [channel.id, me]);

  const byId = new Map(msgs.map((m) => [m.id, m]));
  const typers = Object.keys(typing).map((id) => members.find((m) => m.id === id)?.username).filter(Boolean);

  const saveEdit = async () => {
    if (!editing) return;
    try { upsert(await api<Message>('PATCH', `/messages/${editing.id}`, { content: editing.text })); setEditing(null); } catch (e) { setError(e instanceof ApiFailure ? e.message : 'Falha ao editar'); }
  };
  const react = (m: Message, emoji: string) => api('PUT', `/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`).catch(() => {});

  return (
    <section className="chat">
      <header className="chat-head"><span className="hash">#</span> {channel.name}</header>
      <div className="messages" ref={listRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {cursor && <button className="more" onClick={older}>Carregar mensagens anteriores</button>}
        {loading && <div className="empty">Carregando…</div>}
        {!loading && msgs.length === 0 && <div className="empty"><h3>Bem-vindo a #{channel.name}</h3><p>Este é o começo do canal. Envie a primeira mensagem.</p></div>}
        {error && <div className="error" role="alert">{error}</div>}
        {msgs.map((m, i) => {
          const p = msgs[i - 1];
          const newDay = !p || fmtDay(p.created_at) !== fmtDay(m.created_at);
          const grouped = !newDay && p && p.author.id === m.author.id && m.created_at - p.created_at < 5 * 60000 && !m.reply_to;
          const parent = m.reply_to ? byId.get(m.reply_to) : null;
          return (
            <div key={m.id}>
              {newDay && <div className="day"><span>{fmtDay(m.created_at)}</span></div>}
              <article className={'msg' + (grouped ? ' grouped' : '') + (m.pending ? ' pending' : '') + (m.failed ? ' failed' : '')}>
                {!grouped ? <Avatar name={m.author.username} url={m.author.avatar_url} /> : <span className="gutter">{fmtTime(m.created_at)}</span>}
                <div className="msg-body">
                  {m.reply_to && <div className="reply-ref">↪ {parent ? <><b>{parent.author.username}</b> {parent.deleted ? 'mensagem removida' : parent.content.slice(0, 80)}</> : 'mensagem anterior'}</div>}
                  {!grouped && <div className="meta"><b>{m.author.username}</b><time>{fmtTime(m.created_at)}</time>{m.edited_at && <span className="muted">(editada)</span>}</div>}
                  {m.deleted ? <em className="muted">Mensagem removida</em>
                    : editing?.id === m.id ? (
                      <div className="edit">
                        <textarea value={editing.text} autoFocus onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveEdit(); } if (e.key === 'Escape') setEditing(null); }} />
                        <small className="muted">Enter salva · Esc cancela</small>
                      </div>
                    ) : <Markdown text={m.content} />}
                  {m.failed && <button className="link danger" onClick={() => send(m.content, null, m.nonce)}>Falhou ao enviar. Tentar de novo</button>}
                  {m.reactions.length > 0 && <div className="reactions">{m.reactions.map((r) => <button key={r.emoji} onClick={() => react(m, r.emoji)}>{r.emoji} {r.count}</button>)}</div>}
                </div>
                {!m.pending && !m.failed && !m.deleted && (
                  <div className="actions">
                    {EMOJIS.map((e) => <button key={e} title={`Reagir ${e}`} onClick={() => react(m, e)}>{e}</button>)}
                    <button title="Responder" onClick={() => setReplyTo(m)}>↩</button>
                    {m.author.id === me.id && <button title="Editar" onClick={() => setEditing({ id: m.id, text: m.content })}>✎</button>}
                    {(m.author.id === me.id || canModerate) && <button title="Excluir" onClick={() => { if (confirm('Excluir esta mensagem?')) void api('DELETE', `/messages/${m.id}`); }}>🗑</button>}
                  </div>
                )}
              </article>
            </div>
          );
        })}
      </div>
      <div className="typing">{typers.length > 0 && `${typers.join(', ')} ${typers.length > 1 ? 'estão' : 'está'} digitando…`}</div>
      <Composer channelName={channel.name} replyTo={replyTo} onCancelReply={() => setReplyTo(null)}
        onTyping={() => rt?.send({ type: 'typing', channel_id: channel.id })}
        onSend={(text) => { void send(text, replyTo); setReplyTo(null); }} />
    </section>
  );
}
