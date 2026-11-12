import { useEffect, useMemo, useState } from 'react';
import { ApiFailure, type Channel } from '../../api';
import { useResource } from '../../app/useResource';
import { Icon } from '../../design/Icon';
import { Async, StateCard } from '../../design/states';
import type { ServerGithub } from '../../domain/github';
import { githubApi, workspaceGithubApi } from '../../infra/githubApi';
import { openUrl } from '../../native';

/**
 * Admin conecta repositórios da GitHub App a um workspace e escolhe o canal onde o feed aparece.
 * Só aparecem repositórios que o próprio usuário já acessa; o backend valida de novo.
 */
export function WorkspaceGithub({ serverId, textChannels, onClose }: { serverId: string; textChannels: Channel[]; onClose: () => void }) {
  const [cfg, reloadCfg] = useResource(() => workspaceGithubApi.get(serverId), [serverId]);
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal wide" role="dialog" aria-label="Repositórios do GitHub" onMouseDown={(e) => e.stopPropagation()}>
        <header className="row between"><h2>Repositórios conectados</h2><button className="icon ghost" aria-label="Fechar" onClick={onClose}><Icon name="x" /></button></header>
        <Async res={cfg} reload={reloadCfg} rows={2}>
          {(c) => <Body c={c} serverId={serverId} textChannels={textChannels} reload={reloadCfg} />}
        </Async>
      </div>
    </div>
  );
}

function Body({ c, serverId, textChannels, reload }: { c: ServerGithub; serverId: string; textChannels: Channel[]; reload: () => void }) {
  const [inst, reloadInst] = useResource(() => githubApi.installations(), []);
  const [instId, setInstId] = useState<number | null>(null);
  const [repos, reloadRepos] = useResource(() => (instId ? githubApi.installationRepos(instId) : Promise.resolve({ items: [] })), [instId]);
  const [picked, setPicked] = useState<Map<number, string>>(new Map());
  const [channel, setChannel] = useState<string>('');
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { if (inst.status === 'ready' && instId === null && inst.data.items[0]) setInstId(inst.data.items[0].id); }, [inst, instId]);
  // Ao trocar de instalação, parte do que já está vinculado a ela.
  useEffect(() => {
    const mine = c.links.filter((l) => l.installation_id === instId);
    setPicked(new Map(mine.map((l) => [l.repo_id, l.repo_full_name])));
    setChannel(mine.find((l) => l.activity_channel_id)?.activity_channel_id ?? '');
  }, [instId, c.links]);

  const list = useMemo(() => (repos.data?.items ?? []).filter((r) => r.full_name.toLowerCase().includes(q.toLowerCase())), [repos.data, q]);
  const toggle = (id: number, name: string) => setPicked((m) => { const n = new Map(m); n.has(id) ? n.delete(id) : n.set(id, name); return n; });

  const save = async () => {
    if (!instId) return;
    setSaving(true); setMsg(null);
    try {
      await workspaceGithubApi.put(serverId, { installation_id: instId, repos: [...picked].map(([id, full_name]) => ({ id, full_name })), activity_channel_id: channel || null });
      setMsg({ ok: true, text: 'Repositórios salvos. Os eventos passam a chegar por webhook.' }); reload();
    } catch (e) { setMsg({ ok: false, text: e instanceof ApiFailure ? e.message : 'Falha ao salvar' }); } finally { setSaving(false); }
  };
  const unlink = async (id: string) => { try { await workspaceGithubApi.unlink(serverId, id); reload(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } };

  return (
    <>
      {c.mock && <div className="callout warn"><Icon name="alert" /> Modo de desenvolvimento: instalações e repositórios são simulados.</div>}
      {!c.configured && <StateCard icon="plug" tone="warn" title="GitHub App ainda não configurada">Veja <span className="mono">docs/GITHUB_INTEGRATION.md</span> para criar a app e preencher o <span className="mono">.env</span>.</StateCard>}
      <section>
        <h4>Conectados a este workspace</h4>
        {c.links.length === 0 ? <p className="muted small">Nenhum repositório conectado.</p> : (
          <ul className="link-list">
            {c.links.map((l) => (
              <li key={l.id}><Icon name="repo" size={14} /> <span className="mono grow">{l.repo_full_name}</span>
                <span className="dim small">{textChannels.find((t) => t.id === l.activity_channel_id)?.name ? '#' + textChannels.find((t) => t.id === l.activity_channel_id)!.name : 'só no feed'}</span>
                {c.can_manage && <button className="ghost danger" onClick={() => void unlink(l.id)}><Icon name="unlink" size={14} /> Remover</button>}</li>
            ))}
          </ul>
        )}
      </section>

      {c.can_manage && c.configured && (
        <section>
          <h4>Adicionar ou alterar</h4>
          <Async res={inst} reload={reloadInst} rows={1}
            isEmpty={(d) => d.items.length === 0}
            empty={<StateCard icon="repo" title="A GitHub App ainda não está instalada" actions={c.install_url ? <button className="primary" onClick={() => void openUrl(c.install_url!)}><Icon name="external" /> Instalar a GitHub App</button> : undefined}>
              Instale a app na sua conta ou organização e escolha os repositórios. Depois volte e atualize.</StateCard>}>
            {(d) => (
              <div className="stack">
                <label className="inline-label">Instalação <select value={instId ?? ''} onChange={(e) => setInstId(Number(e.target.value))}>{d.items.map((i) => <option key={i.id} value={i.id}>{i.account_login}{i.repository_selection === 'all' ? ' (todos os repositórios)' : ''}</option>)}</select></label>
                <input placeholder="Filtrar repositórios" value={q} onChange={(e) => setQ(e.target.value)} />
                <Async res={repos} reload={reloadRepos} rows={2} isEmpty={(r) => r.items.length === 0} empty={<p className="muted small">Esta instalação não expõe repositórios para você.</p>}>
                  {() => (
                    <div className="check-list" role="group" aria-label="Repositórios">
                      {list.map((r) => <label key={r.id} className="check"><input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id, r.full_name)} /> <span className="mono">{r.full_name}</span>{r.private && <Icon name="lock" size={12} />}</label>)}
                    </div>
                  )}
                </Async>
                <label className="inline-label">Canal para destacar atividades
                  <select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">Apenas na aba Atividade</option>{textChannels.map((t) => <option key={t.id} value={t.id}>#{t.name}</option>)}</select></label>
                <p className="dim small">O Squak só recebe eventos dos repositórios marcados, por webhook assinado. Commits e eventos repetidos são ignorados.</p>
                {msg && <div className={'callout ' + (msg.ok ? 'ok' : 'bad')} role="status"><Icon name={msg.ok ? 'check-circle' : 'alert'} /> {msg.text}</div>}
                <div className="row"><button className="primary" disabled={saving || !instId} onClick={save}>{saving ? 'Salvando…' : 'Salvar repositórios'}</button></div>
              </div>
            )}
          </Async>
        </section>
      )}
      {!c.can_manage && <p className="dim small">Somente donos e admins do workspace conectam repositórios.</p>}
    </>
  );
}
