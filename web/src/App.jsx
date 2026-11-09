import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { MeContext } from './context.js';
import { modules } from './modules.jsx';
import Login from './pages/Login.jsx';
import Avatar from './components/Avatar.jsx';

export default function App() {
  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(() => {
    api.get('/me')
      .then((d) => setState({ status: 'ok', ...d }))
      .catch((e) => setState(e.status === 401 ? { status: 'anon' } : { status: 'error', message: e.message }));
  }, []);

  useEffect(load, [load]);

  if (state.status === 'loading') return <div className="splash">Chargement</div>;
  if (state.status === 'anon') return <Login />;
  if (state.status === 'error') {
    return (
      <div className="splash">
        <p>Le serveur ne répond pas : {state.message}</p>
        <button className="btn" onClick={load}>Réessayer</button>
      </div>
    );
  }

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setState({ status: 'anon' });
  };

  return (
    <MeContext.Provider value={{ me: state.member, config: state.config }}>
      <Layout me={state.member} onLogout={logout} />
    </MeContext.Provider>
  );
}

function Layout({ me, onLogout }) {
  const { search } = useLocation();
  const visible = modules.filter((m) => !m.admin || me.role === 'admin');
  const keepWeek = new URLSearchParams(search).get('w');

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Staff</span>
        <nav className="nav">
          {visible.map((m) => (
            <NavLink key={m.path} to={{ pathname: `/${m.path}`, search: keepWeek ? `?w=${keepWeek}` : '' }}>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="me">
          <Avatar member={me} />
          <span className="me-name">{me.pseudo}</span>
          <button className="btn-text" onClick={onLogout}>Se déconnecter</button>
        </div>
      </header>
      <main className="page">
        <Routes>
          {visible.map((m) => (
            <Route key={m.path} path={`/${m.path}`} element={m.element} />
          ))}
          <Route path="*" element={<Navigate to="/planning" replace />} />
        </Routes>
      </main>
    </div>
  );
}
