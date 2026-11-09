// Répartit les événements d'un jour en voies : les événements qui se chevauchent
// se partagent la largeur de la colonne, les autres prennent toute la largeur.
export function layoutDay(events) {
  const sorted = [...events].sort((a, b) => a.start_min - b.start_min || a.end_min - b.end_min);
  const clusters = [];
  let cur = null;
  for (const e of sorted) {
    if (!cur || e.start_min >= cur.end) {
      cur = { end: e.end_min, lanes: [], items: [] };
      clusters.push(cur);
    }
    let lane = cur.lanes.findIndex((end) => end <= e.start_min);
    if (lane === -1) {
      lane = cur.lanes.length;
      cur.lanes.push(0);
    }
    cur.lanes[lane] = e.end_min;
    cur.end = Math.max(cur.end, e.end_min);
    cur.items.push({ event: e, lane });
  }
  return clusters.flatMap((c) => c.items.map((i) => ({ ...i, lanes: c.lanes.length })));
}
