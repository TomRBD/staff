import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useMe } from '../context.js';
import Avatar from '../components/Avatar.jsx';

export default function Admin() {
  return (
    <section className="admin">
      <Members />
      <Types />
    </section>
  );
}

function useList(path) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const reload = () => api.get(path).then(setItems).catch((e) => setError(e.message));
  useEffect(() => { reload(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Couleur : mise à jour locale immédiate, envoi au serveur après 400 ms sans changement
  const timers = useRef({});
  const recolor = (item, color, save) => {
    setItems((list) => list.map((x) => (x.id === item.id ? { ...x, color } : x)));
    clearTimeout(timers.current[item.id]);
    timers.current[item.id] = setTimeout(() => save(item, { color }), 400);
  };
  return { items, setItems, error, setError, reload, recolor };
}

function Members() {
  const { me } = useMe();
  const { items, setItems, error, setError, reload, recolor } = useList('/members?all=1');
  const [draft, setDraft] = useState({ pseudo: '', discord_id: '', role: 'member' });

  const update = async (m, patch) => {
    setError(null);
    try {
      const saved = await api.patch(`/members/${m.id}`, patch);
      setItems((list) => list.map((x) => (x.id === m.id ? saved : x)));
    } catch (e) {
      setError(e.message);
      reload();
    }
  };

  const add = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/members', { ...draft, discord_id: draft.discord_id.trim() || null });
      setDraft({ pseudo: '', discord_id: '', role: 'member' });
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (m) => {
    if (!confirm(`Supprimer ${m.pseudo} et toutes ses dispos ? Pour garder l’historique, désactive plutôt le compte.`)) return;
    try {
      await api.del(`/members/${m.id}`);
      reload();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="panel">
      <h1>Membres</h1>
      <p className="hint">
        Un membre se connecte avec le compte Discord dont l’ID est renseigné. Pour copier un ID : Discord, Paramètres, Avancés,
        Mode développeur, puis clic droit sur le pseudo et Copier l’identifiant.
      </p>
      {error && <p className="alert">{error}</p>}
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr><th /><th>Pseudo</th><th>ID Discord</th><th>Rôle</th><th>Couleur</th><th>Actif</th><th>Dernière connexion</th><th /></tr>
          </thead>
          <tbody>
            {items?.map((m) => {
              const self = m.id === me.id;
              return (
                <tr key={m.id} className={m.active ? '' : 'inactive'}>
                  <td><Avatar member={m} /></td>
                  <td><input defaultValue={m.pseudo} maxLength={40} onBlur={(e) => e.target.value.trim() && e.target.value !== m.pseudo && update(m, { pseudo: e.target.value })} /></td>
                  <td><input className="mono" defaultValue={m.discord_id || ''} placeholder="Non lié" onBlur={(e) => e.target.value.trim() !== (m.discord_id || '') && update(m, { discord_id: e.target.value.trim() || null })} /></td>
                  <td>
                    <select value={m.role} disabled={self} onChange={(e) => update(m, { role: e.target.value })}>
                      <option value="member">Membre</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td><input type="color" value={m.color} onChange={(e) => recolor(m, e.target.value, update)} /></td>
                  <td><input type="checkbox" checked={m.active} disabled={self} onChange={(e) => update(m, { active: e.target.checked })} aria-label="Actif" /></td>
                  <td className="muted">{m.last_login ? new Date(`${m.last_login}Z`).toLocaleDateString('fr-FR') : 'Jamais'}</td>
                  <td>{!self && <button className="btn-text danger" onClick={() => remove(m)}>Supprimer</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form className="row add" onSubmit={add}>
        <label className="field"><span>Pseudo</span><input required maxLength={40} value={draft.pseudo} onChange={(e) => setDraft({ ...draft, pseudo: e.target.value })} /></label>
        <label className="field"><span>ID Discord</span><input className="mono" pattern="\d{15,21}" value={draft.discord_id} onChange={(e) => setDraft({ ...draft, discord_id: e.target.value })} /></label>
        <label className="field">
          <span>Rôle</span>
          <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
            <option value="member">Membre</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button className="btn btn-primary">Ajouter le membre</button>
      </form>
    </div>
  );
}

function Types() {
  const { items, setItems, error, setError, reload, recolor } = useList('/event-types?all=1');
  const [draft, setDraft] = useState({ name: '', color: '#B6D7A8' });

  const update = async (t, patch) => {
    setError(null);
    try {
      const saved = await api.patch(`/event-types/${t.id}`, patch);
      setItems((list) => list.map((x) => (x.id === t.id ? saved : x)));
    } catch (e) {
      setError(e.message);
      reload();
    }
  };

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post('/event-types', draft);
      setDraft({ name: '', color: '#B6D7A8' });
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (t) => {
    try {
      const r = await api.del(`/event-types/${t.id}`);
      if (r?.archived) setError(`« ${t.name} » est utilisé par des événements : il a été masqué au lieu d’être supprimé.`);
      reload();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="panel">
      <h1>Types d’événements</h1>
      {error && <p className="alert">{error}</p>}
      <ul className="types">
        {items?.map((t) => (
          <li key={t.id} className={t.archived ? 'inactive' : ''}>
            <input type="color" value={t.color} onChange={(e) => recolor(t, e.target.value, update)} aria-label="Couleur" />
            <input defaultValue={t.name} maxLength={40} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && update(t, { name: e.target.value })} />
            <label className="check">
              <input type="checkbox" checked={!t.archived} onChange={(e) => update(t, { archived: !e.target.checked })} />
              Proposé
            </label>
            <button className="btn-text danger" onClick={() => remove(t)}>Supprimer</button>
          </li>
        ))}
      </ul>
      <form className="row add" onSubmit={add}>
        <label className="field"><span>Nom</span><input required maxLength={40} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="field"><span>Couleur</span><input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
        <button className="btn btn-primary">Ajouter le type</button>
      </form>
    </div>
  );
}
