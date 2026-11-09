import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useMe } from '../context.js';
import { dayIndex, dayNum, dayShort, fmtLong, range, today, weekDates } from '../lib/dates.js';
import { useWeek } from '../lib/useWeek.js';
import WeekNav from '../components/WeekNav.jsx';
import Avatar from '../components/Avatar.jsx';

export default function Team() {
  const { config } = useMe();
  const [week, setWeek] = useWeek();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [focus, setFocus] = useState(new Set()); // membres sélectionnés pour chercher un créneau commun
  const [picked, setPicked] = useState(null); // case cliquée

  useEffect(() => {
    let alive = true;
    setData(null);
    setPicked(null);
    api.get(`/availability?week=${week}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [week]);

  const hours = range(config.dayStart, config.dayEnd);
  const dates = weekDates(week);
  const now = today();

  const index = useMemo(() => {
    const map = new Map();
    if (!data) return map;
    for (const [id, slots] of Object.entries(data.slots)) {
      for (const k of slots) {
        if (!map.has(k)) map.set(k, new Set());
        map.get(k).add(Number(id));
      }
    }
    return map;
  }, [data]);

  if (error) return <p className="alert">{error}</p>;

  const members = data?.members || [];
  const pool = focus.size ? members.filter((m) => focus.has(m.id)) : members;
  const missing = members.filter((m) => !data?.slots[m.id]?.length);

  const toggleFocus = (id) => {
    const next = new Set(focus);
    next.has(id) ? next.delete(id) : next.add(id);
    setFocus(next);
  };

  const cell = (d, h) => {
    const key = `${d}|${h}`;
    const avail = index.get(key) || new Set();
    const n = pool.filter((m) => avail.has(m.id)).length;
    const full = pool.length > 0 && n === pool.length;
    const pct = pool.length ? Math.round((n / pool.length) * 100) : 0;
    return (
      <button
        key={key}
        className={`tcell${full ? ' full' : ''}${pct >= 55 ? ' hi' : ''}${picked === key ? ' picked' : ''}${d === now ? ' is-today' : ''}`}
        style={{ '--pct': `${pct}%` }}
        onClick={() => setPicked(key)}
        aria-label={`${d} ${h}h : ${n} sur ${pool.length}`}
      >
        {n > 0 && <span>{n}</span>}
      </button>
    );
  };

  let detail = null;
  if (picked) {
    const [d, h] = picked.split('|');
    const avail = index.get(picked) || new Set();
    const yes = pool.filter((m) => avail.has(m.id));
    const no = pool.filter((m) => !avail.has(m.id));
    const plan = () => {
      const p = new URLSearchParams({ w: week, new: picked, p: yes.map((m) => m.id).join(',') });
      navigate(`/planning?${p}`);
    };
    detail = (
      <aside className="tdetail">
        <h2>{fmtLong(d)}, {h}h à {Number(h) + 1}h</h2>
        <h3>Libres ({yes.length})</h3>
        <ul className="people">{yes.map((m) => <li key={m.id}><Avatar member={m} size={22} />{m.pseudo}</li>)}</ul>
        {no.length > 0 && (
          <>
            <h3>Pas libres ({no.length})</h3>
            <ul className="people muted">{no.map((m) => <li key={m.id}><Avatar member={m} size={22} />{m.pseudo}</li>)}</ul>
          </>
        )}
        <button className="btn btn-primary" onClick={plan}>Créer un événement sur ce créneau</button>
      </aside>
    );
  }

  return (
    <section>
      <WeekNav week={week} onChange={setWeek} />

      <div className="chips" role="group" aria-label="Filtrer les membres">
        <span className="chips-label">{focus.size ? 'Créneau commun pour :' : 'Toute l’équipe. Sélectionne des membres pour trouver un créneau commun :'}</span>
        {members.map((m) => (
          <button key={m.id} className={`chip${focus.has(m.id) ? ' on' : ''}`} style={{ '--c': m.color }} onClick={() => toggleFocus(m.id)} aria-pressed={focus.has(m.id)}>
            <Avatar member={m} size={20} />{m.pseudo}
          </button>
        ))}
        {focus.size > 0 && <button className="btn-text" onClick={() => setFocus(new Set())}>Réinitialiser</button>}
      </div>

      {missing.length > 0 && data && (
        <p className="hint">Pas encore remplies cette semaine : {missing.map((m) => m.pseudo).join(', ')}.</p>
      )}

      <div className="team-layout">
        <div className="scroll-x">
          <div className="tgrid" style={{ '--rows': hours.length }} aria-busy={!data}>
            <div className="agrid-corner" />
            {dates.map((d) => (
              <div key={d} className={`agrid-day static${d === now ? ' is-today' : ''}`}>
                <span className="day-name">{dayShort(dayIndex(d))}</span>
                <span className="day-num">{dayNum(d)}</span>
              </div>
            ))}
            {hours.map((h) => [
              <div key={`h${h}`} className="agrid-hour static">{h}h</div>,
              ...dates.map((d) => cell(d, h)),
            ])}
          </div>
        </div>
        {detail || <aside className="tdetail empty">Clique sur un créneau pour voir qui est libre.</aside>}
      </div>
    </section>
  );
}
