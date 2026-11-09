import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useMe } from '../context.js';
import { dayIndex, dayNum, dayShort, range, today, weekDates } from '../lib/dates.js';
import { useWeek } from '../lib/useWeek.js';
import WeekNav from '../components/WeekNav.jsx';

const STATUS = { loading: 'Chargement', saving: 'Enregistrement', saved: 'Enregistré', idle: '' };

export default function Availability() {
  const { me, config } = useMe();
  const [week, setWeek] = useWeek();
  const [sel, setSel] = useState(new Set());
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [saveTick, setSaveTick] = useState(0);
  const selRef = useRef(sel);
  const drag = useRef(null);
  selRef.current = sel;

  const dates = weekDates(week);
  const hours = range(config.dayStart, config.dayEnd);
  const now = today();

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    api.get(`/availability?week=${week}`)
      .then((d) => alive && (setSel(new Set(d.slots[me.id] || [])), setStatus('idle')))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [week, me.id]);

  const persist = useCallback(async (slots) => {
    setStatus('saving');
    setError(null);
    try {
      const d = await api.put('/availability/me', { week, slots: [...slots] });
      setSel(new Set(d.slots));
      setStatus('saved');
    } catch (e) {
      setError(e.message);
      setStatus('idle');
    }
  }, [week]);

  useEffect(() => {
    if (saveTick) persist(selRef.current);
  }, [saveTick, persist]);

  // Peinture au glisser : la première case touchée décide si on coche ou décoche
  const paint = (keys) => {
    const d = drag.current;
    const cur = selRef.current;
    const todo = keys.filter((k) => cur.has(k) !== d.mode);
    if (!todo.length) return;
    const next = new Set(cur);
    todo.forEach((k) => (d.mode ? next.add(k) : next.delete(k)));
    d.changed = true;
    selRef.current = next;
    setSel(next);
  };

  const keysOf = (el) => (el?.dataset.keys ? el.dataset.keys.split(',') : el?.dataset.key ? [el.dataset.key] : null);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest('[data-key],[data-keys]');
    const keys = keysOf(el);
    if (!keys) return;
    e.preventDefault();
    const mode = el.dataset.keys ? !keys.every((k) => sel.has(k)) : !sel.has(keys[0]);
    drag.current = { mode, changed: false, batch: !!el.dataset.keys };
    paint(keys);
  };

  const onPointerMove = (e) => {
    if (!drag.current || drag.current.batch) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-key]');
    if (el) paint([el.dataset.key]);
  };

  useEffect(() => {
    const up = () => {
      if (!drag.current) return;
      const { changed } = drag.current;
      drag.current = null;
      if (changed) setSaveTick((t) => t + 1);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  // Clavier : Entrée / Espace sur une case (click avec detail 0)
  const onKeyToggle = (e, keys) => {
    if (e.detail !== 0) return;
    const add = !keys.every((k) => sel.has(k));
    const next = new Set(sel);
    keys.forEach((k) => (add ? next.add(k) : next.delete(k)));
    setSel(next);
    persist(next);
  };

  const copyPrevious = async () => {
    setStatus('saving');
    try {
      const d = await api.post('/availability/me/copy', { week });
      setSel(new Set(d.slots));
      setStatus('saved');
    } catch (e) {
      setError(e.message);
      setStatus('idle');
    }
  };

  const clearAll = () => {
    if (!sel.size || !confirm('Effacer toutes tes dispos de la semaine ?')) return;
    setSel(new Set());
    persist(new Set());
  };

  const dayKeys = (d) => hours.map((h) => `${d}|${h}`);
  const hourKeys = (h) => dates.map((d) => `${d}|${h}`);
  const total = sel.size;

  return (
    <section>
      <WeekNav week={week} onChange={setWeek}>
        <button className="btn" onClick={copyPrevious}>Reprendre la semaine précédente</button>
        <button className="btn" onClick={clearAll} disabled={!total}>Tout effacer</button>
      </WeekNav>

      <p className="hint">
        Coche les créneaux où tu es libre. Clique-glisse pour en cocher plusieurs, clique sur un jour ou une heure pour la ligne entière.
        <span className="save-state" aria-live="polite">{error ? <span className="err">{error}</span> : STATUS[status]}</span>
      </p>

      <div className="scroll-x">
        <div
          className="agrid"
          style={{ '--rows': hours.length }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          aria-busy={status === 'loading'}
        >
          <div className="agrid-corner">{total} h</div>
          {dates.map((d) => (
            <button
              key={d}
              className={`agrid-day${d === now ? ' is-today' : ''}`}
              data-keys={dayKeys(d).join(',')}
              onClick={(e) => onKeyToggle(e, dayKeys(d))}
            >
              <span className="day-name">{dayShort(dayIndex(d))}</span>
              <span className="day-num">{dayNum(d)}</span>
            </button>
          ))}
          {hours.map((h) => (
            <Row key={h} h={h} dates={dates} sel={sel} now={now} hourKeys={hourKeys(h)} onKeyToggle={onKeyToggle} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Row({ h, dates, sel, now, hourKeys, onKeyToggle }) {
  return (
    <>
      <button className="agrid-hour" data-keys={hourKeys.join(',')} onClick={(e) => onKeyToggle(e, hourKeys)}>
        {h}h
      </button>
      {dates.map((d) => {
        const key = `${d}|${h}`;
        const on = sel.has(key);
        return (
          <button
            key={key}
            data-key={key}
            className={`acell${on ? ' on' : ''}${d === now ? ' is-today' : ''}`}
            aria-pressed={on}
            aria-label={`${d} ${h}h`}
            onClick={(e) => onKeyToggle(e, [key])}
          />
        );
      })}
    </>
  );
}
