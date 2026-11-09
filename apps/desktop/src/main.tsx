import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, setToken, type User } from './api';
import { Auth } from './components/Auth';
import { Shell } from './components/Shell';
import { clearSession, loadSession, saveSession } from './native';
import './design/tokens.css';
import './design/base.css';
import './design/shell.css';
import './design/messaging.css';
import './design/voice.css';
import './design/settings.css';
import './design/github.css';

function App() {
  const [boot, setBoot] = useState(true);
  const [auth, setAuth] = useState<{ token: string; user: User } | null>(null);

  useEffect(() => {
    (async () => {
      const raw = await loadSession().catch(() => null);
      if (raw) {
        setToken(raw);
        try { setAuth({ token: raw, user: await api<User>('GET', '/me') }); setBoot(false); return; } catch { setToken(null); await clearSession().catch(() => {}); }
      }
      // Só em `npm run dev`: entra com uma conta de teste local, sem tela de login (não existe no build de produção).
      if (import.meta.env.DEV && !sessionStorage.getItem('squak.noautologin')) {
        try {
          let cred = JSON.parse(localStorage.getItem('squak.devcred') ?? 'null') as { username: string; password: string } | null;
          let r: { token: string; user: User } | null = null;
          if (cred) r = await api<{ token: string; user: User }>('POST', '/auth/login', cred).catch(() => null);
          if (!r) {
            cred = { username: 'teste' + Math.random().toString(36).slice(2, 7), password: crypto.randomUUID() };
            r = await api<{ token: string; user: User }>('POST', '/auth/register', cred);
            localStorage.setItem('squak.devcred', JSON.stringify(cred));
          }
          setToken(r.token); await saveSession(r.token).catch(() => {}); setAuth({ token: r.token, user: r.user });
        } catch { /* API fora do ar: cai na tela de login normal */ }
      }
      setBoot(false);
    })();
  }, []);

  const onAuth = async (token: string, user: User) => { setToken(token); await saveSession(token).catch(() => {}); setAuth({ token, user: await api<User>('GET', '/me').catch(() => user) }); };
  const logout = async () => { sessionStorage.setItem('squak.noautologin', '1'); await api('POST', '/auth/logout').catch(() => {}); setToken(null); await clearSession().catch(() => {}); setAuth(null); };

  if (boot) return <div className="boot">Squak</div>;
  return auth ? <Shell token={auth.token} user={auth.user} onLogout={logout} /> : <Auth onAuth={onAuth} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
