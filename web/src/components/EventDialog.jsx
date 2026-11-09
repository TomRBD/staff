import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useMe } from '../context.js';
import { fmtTime } from '../lib/dates.js';
import Dialog from './Dialog.jsx';
import Avatar from './Avatar.jsx';

const STEP = 15;
const LABEL = { ok: 'Libre', busy: 'Déjà pris', unavailable: 'Pas libre' };
const ORDER = { ok: 0, busy: 1, unavailable: 2 };

export default function EventDialog({ initial, types, members, onClose, onSaved }) {
  const { config } = useMe();
  const isNew = !initial.id;
  const canEdit = isNew || initial.can_edit;
  const [form, setForm] = useState(() => ({
    date: initial.date,
    start_min: initial.start_min,
    end_min: initial.end_min,
    type_id: initial.type_id ?? types[0]?.id ?? null,
    title: initial.title || '',
    notes: initial.notes || '',
    participants: initial.participants || [],
  }));
  const [status, setStatus] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const times = useMemo(() => {
    const out = [];
    for (let m = config.dayStart * 60; m <= config.dayEnd * 60; m += STEP) out.push(m);
    return out;
  }, [config]);

  useEffect(() => {
    if (!form.date || form.end_min <= form.start_min) return;
    let alive = true;
    api.post('/events/check', { date: form.date, start_min: form.start_min, end_min: form.end_min, exclude_id: initial.id ?? null })
      .then((s) => alive && setStatus(s))
      .catch(() => {});
    return () => { alive = false; };
  }, [form.date, form.start_min, form.end_min, initial.id]);

  const sorted = [...members].sort(
    (a, b) => (ORDER[status[a.id]] ?? 3) - (ORDER[status[b.id]] ?? 3) || a.pseudo.localeCompare(b.pseudo)
  );
  const chosen = new Set(form.participants);
  const problems = form.participants.filter((id) => status[id] && status[id] !== 'ok').length;

  const toggle = (id) => {
    const next = new Set(chosen);
    next.has(id) ? next.delete(id) : next.add(id);
    set({ participants: [...next] });
  };
  const addAllFree = () => {
    const next = new Set(chosen);
    members.filter((m) => status[m.id] === 'ok').forEach((m) => next.add(m.id));
    set({ participants: [...next] });
  };

  const changeStart = (v) => {
    const start = Number(v);
    const dur = form.end_min - form.start_min;
    set({ start_min: start, end_min: Math.min(start + (dur > 0 ? dur : 60), config.dayEnd * 60) });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isNew) await api.post('/events', form);
      else await api.patch(`/events/${initial.id}`, form);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Supprimer cet événement ?')) return;
    setBusy(true);
    try {
      await api.del(`/events/${initial.id}`);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const footer = canEdit ? (
    <>
      {!isNew && <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>Supprimer</button>}
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Annuler</button>
      <button type="submit" form="event-form" className="btn btn-primary" disabled={busy}>
        {isNew ? 'Créer l’événement' : 'Enregistrer'}
      </button>
    </>
  ) : (
    <>
      <span className="hint">Seuls les admins et l’auteur peuvent modifier cet événement.</span>
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Fermer</button>
    </>
  );

  return (
    <Dialog title={isNew ? 'Nouvel événement' : 'Événement'} onClose={onClose} footer={footer}>
      <form id="event-form" className="form" onSubmit={submit}>
        <fieldset disabled={!canEdit || busy}>
          <div className="row">
            <label className="field grow">
              <span>Type</span>
              <select value={form.type_id ?? ''} onChange={(e) => set({ type_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Sans type</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                {initial.type_id && !types.some((t) => t.id === initial.type_id) && (
                  <option value={initial.type_id}>{initial.type_name}</option>
                )}
              </select>
            </label>
            <label className="field grow">
              <span>Titre</span>
              <input value={form.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder="Facultatif" />
            </label>
          </div>
          <div className="row">
            <label className="field">
              <span>Date</span>
              <input type="date" required value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <label className="field">
              <span>Début</span>
              <select value={form.start_min} onChange={(e) => changeStart(e.target.value)}>
                {times.slice(0, -1).map((m) => <option key={m} value={m}>{fmtTime(m)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Fin</span>
              <select value={form.end_min} onChange={(e) => set({ end_min: Number(e.target.value) })}>
                {times.filter((m) => m > form.start_min).map((m) => <option key={m} value={m}>{fmtTime(m)}</option>)}
              </select>
            </label>
          </div>

          <div className="field">
            <div className="field-head">
              <span>Participants ({chosen.size})</span>
              <button type="button" className="btn-text" onClick={addAllFree}>Ajouter tous les libres</button>
            </div>
            <ul className="plist">
              {sorted.map((m) => (
                <li key={m.id}>
                  <label className={`pitem${chosen.has(m.id) ? ' on' : ''}`}>
                    <input type="checkbox" checked={chosen.has(m.id)} onChange={() => toggle(m.id)} />
                    <Avatar member={m} size={22} />
                    <span className="pname">{m.pseudo}</span>
                    {status[m.id] && <span className={`badge ${status[m.id]}`}>{LABEL[status[m.id]]}</span>}
                  </label>
                </li>
              ))}
            </ul>
            {problems > 0 && (
              <p className="warn">
                {problems === 1 ? '1 participant n’est pas libre' : `${problems} participants ne sont pas libres`} sur ce créneau.
                Tu peux quand même enregistrer.
              </p>
            )}
          </div>

          <label className="field">
            <span>Notes</span>
            <textarea rows={3} maxLength={2000} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>
        </fieldset>
        {error && <p className="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
