const RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400000;

const toMs = (s) => Date.parse(`${s}T00:00:00Z`);
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);

export const isDate = (s) => typeof s === 'string' && RE.test(s) && fromMs(toMs(s)) === s;
export const addDays = (s, n) => fromMs(toMs(s) + n * DAY);
export const mondayOf = (s) => addDays(s, -((new Date(toMs(s)).getUTCDay() + 6) % 7));
export const weekDates = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export function fmtDateFr(s) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(toMs(s)));
}
export const fmtTime = (min) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;
