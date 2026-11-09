import { useState, type FormEvent } from 'react';
import { api, ApiFailure, type User } from '../api';

export function Auth({ onAuth }: { onAuth: (token: string, user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api<{ token: string; user: User }>('POST', mode === 'login' ? '/auth/login' : '/auth/register', { username, password });
      onAuth(r.token, r.user);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Falha inesperada');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth-hero">
        <h1>Squak</h1><span className="rule" />
        <p>Conversa, chamadas e o andamento do código no mesmo lugar: PRs, reviews e CI ao lado do chat da equipe.</p>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h2>
        <p className="muted">{mode === 'login' ? 'Entre para voltar às suas conversas.' : 'Crie sua conta para começar.'}</p>
        <label>Usuário<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" /></label>
        <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary" disabled={busy || !username || !password}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </div>
  );
}
