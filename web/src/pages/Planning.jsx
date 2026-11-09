import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useMe } from '../context.js';
import { dayIndex, dayNum, dayShort, fmtTime, range, today, weekDates } from '../lib/dates.js';
import { layoutDay } from '../lib/layout.js';
import { useWeek } from '../lib/useWeek.js';
import WeekNav from '../components/WeekNav.jsx';
import EventDialog from '../components/EventDialog.jsx';

const HOUR_PX = 52;

export default function Planning() {
  const { config } = useMe();
  const [week, setWeek] = useWeek();
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState(null);
  const [types, setTypes] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);

  const dates = weekDates(week);
  const hours = range(config.dayStart, config.dayEnd);
  const now = today();
  const dayStartMin = config.dayStart * 60;

  const loadEvents = useCallback(() => {
    return api.get(`/events?week=${week}`).then(setEvents).catch((e) => setError(e.message));
  }, [week]);

  useEffect(() => {
    setEvents(null);
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    Promise.all([api.get('/event-types'), api.get('/members')])
      .then(([t, m]) => { setTypes(t); setMembers(m); })
      .catch((e) => setError(e.message));
  }, []);

  // Ouverture depuis la page Équipe : ?new=YYYY-MM-DD|H&p=1,2,3
  useEffect(() => {
    const raw = params.get('new');
    if (!raw) return;
    const [date, h] = raw.split('|');
    const participants = (params.get('p') || '').split(',').filter(Boolean).map(Number);
    const start = Number(h) * 60;
    setDialog({ date, start_min: start, end_min: Math.min(start + 60, config.dayEnd * 60), participants });
    setParams((p) => { const n = new URLSearchParams(p); n.delete('new'); n.delete('p'); return n; }, { replace: true });
  }, [params, setParams, config.dayEnd]);

  const openAt = (date, e) => {
    if (e.target.closest('.ev')) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const hour = config.dayStart + Math.max(0, Math.min(hours.length - 1, Math.floor(y / HOUR_PX)));
    setDialog({ date, start_min: hour * 60, end_min: Math.min(hour * 60 + 60, config.dayEnd * 60), participants: [] });
  };

  // Créneau proposé par défaut : 20h-21h si la plage le permet, sinon la première heure
  const newDefault = () => {
    const start = 20 * 60 >= dayStartMin && 21 * 60 <= config.dayEnd * 60 ? 20 * 60 : dayStartMin;
    setDialog({ date: dates.includes(now) ? now : dates[0], start_min: start, end_min: start + 60, participants: [] });
  };

  const byDay = (d) => layoutDay((events || []).filter((e) => e.date === d));
  const usedTypes = types.filter((t) => events?.some((e) => e.type_id === t.id));

  return (
    <section>
      <WeekNav week={week} onChange={setWeek}>
        <button className="btn btn-primary" onClick={newDefault}>
          Nouvel événement
        </button>
      </WeekNav>

      {error && <p className="alert">{error}</p>}

      <div className="scroll-x">
        <div className="cal" style={{ '--hour': `${HOUR_PX}px`, '--rows': hours.length }} aria-busy={!events}>
          <div className="cal-head">
            <div />
            {dates.map((d) => (
              <div key={d} className={`cal-day-head${d === now ? ' is-today' : ''}`}>
                <span className="day-name">{dayShort(dayIndex(d))}</span>
                <span className="day-num">{dayNum(d)}</span>
              </div>
            ))}
          </div>
          <div className="cal-body">
            <div className="cal-hours">
              {hours.map((h) => <div key={h}>{h}h</div>)}
            </div>
            {dates.map((d) => (
              <div
                key={d}
                className={`cal-col${d === now ? ' is-today' : ''}`}
                onClick={(e) => openAt(d, e)}
                title="Cliquer pour créer un événement"
              >
                {byDay(d).map(({ event: ev, lane, lanes }) => {
                  const conflicts = Object.values(ev.status).filter((s) => s !== 'ok').length;
                  const height = ((ev.end_min - ev.start_min) / 60) * HOUR_PX;
                  const names = ev.participants.map((id) => members.find((m) => m.id === id)?.pseudo).filter(Boolean);
                  return (
                    <button
                      key={ev.id}
                      className={`ev${height < 40 ? ' ev-short' : ''}`}
                      style={{
                        top: ((ev.start_min - dayStartMin) / 60) * HOUR_PX,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        '--c': ev.type_color || '#D9D9D9',
                      }}
                      onClick={() => setDialog(ev)}
                    >
                      <span className="ev-time">
                        {fmtTime(ev.start_min)}-{fmtTime(ev.end_min)}
                        {conflicts > 0 && <span className="ev-warn" title={`${conflicts} participant(s) pas libre(s)`}>!</span>}
                      </span>
                      <span className="ev-type">{ev.type_name || 'Sans type'}</span>
                      {ev.title && <span className="ev-title">{ev.title}</span>}
                      {names.length > 0 && <span className="ev-who">{names.join(', ')}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {usedTypes.length > 0 && (
        <ul className="legend">
          {usedTypes.map((t) => <li key={t.id} style={{ '--c': t.color }}>{t.name}</li>)}
        </ul>
      )}
      {events?.length === 0 && <p className="hint">Rien de prévu cette semaine. Clique sur un créneau de la grille pour ajouter un événement.</p>}

      {dialog && (
        <EventDialog
          initial={dialog}
          types={types}
          members={members}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); loadEvents(); }}
        />
      )}
    </section>
  );
}
