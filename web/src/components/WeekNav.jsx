import { addDays, mondayOf, today, weekLabel } from '../lib/dates.js';

export default function WeekNav({ week, onChange, children }) {
  const isCurrent = week === mondayOf(today());
  return (
    <div className="weeknav">
      <div className="weeknav-ctrl">
        <button className="btn icon" onClick={() => onChange(addDays(week, -7))} aria-label="Semaine précédente">‹</button>
        <button className="btn icon" onClick={() => onChange(addDays(week, 7))} aria-label="Semaine suivante">›</button>
        <button className="btn" onClick={() => onChange(today())} disabled={isCurrent}>Cette semaine</button>
      </div>
      <h1 className="weeknav-title">Semaine du {weekLabel(week)}</h1>
      <div className="weeknav-extra">{children}</div>
    </div>
  );
}
