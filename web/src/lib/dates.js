const pad = (n) => String(n).padStart(2, '0');
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const month = new Intl.DateTimeFormat('fr-FR', { month: 'long' });

const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

export const isDateStr = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toStr(new Date());
export const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return toStr(d);
};
export const dayIndex = (s) => (parse(s).getDay() + 6) % 7;
export const mondayOf = (s) => addDays(s, -dayIndex(s));
export const weekDates = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
export const dayShort = (i) => DAYS[i];
export const dayNum = (s) => parse(s).getDate();
export const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

export const fmtTime = (min) => `${Math.floor(min / 60)}h${min % 60 ? pad(min % 60) : ''}`;
export const fmtLong = (s) => {
  const d = parse(s);
  return `${DAYS_LONG[dayIndex(s)]} ${d.getDate()} ${month.format(d)}`;
};

export function weekLabel(monday) {
  const a = parse(monday);
  const b = parse(addDays(monday, 6));
  const ma = month.format(a);
  const mb = month.format(b);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} au ${b.getDate()} ${mb} ${b.getFullYear()}`
    : `${a.getDate()} ${ma} au ${b.getDate()} ${mb} ${b.getFullYear()}`;
}
