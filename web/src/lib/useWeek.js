import { useSearchParams } from 'react-router-dom';
import { isDateStr, mondayOf, today } from './dates.js';

// Semaine affichée, stockée dans l'URL (?w=) pour pouvoir partager un lien
export function useWeek() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('w');
  const week = mondayOf(isDateStr(raw) ? raw : today());
  const setWeek = (w) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (mondayOf(w) === mondayOf(today())) next.delete('w');
      else next.set('w', mondayOf(w));
      return next;
    });
  return [week, setWeek];
}
