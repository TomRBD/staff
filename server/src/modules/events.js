import { config } from '../config.js';
import { bus } from '../lib/bus.js';
import { isDate, mondayOf, weekDates } from '../lib/dates.js';
import { dateSchema, httpError } from '../lib/http.js';

const STEP = 15; // granularité des horaires en minutes

const timeFields = {
  date: dateSchema,
  start_min: { type: 'integer', minimum: 0, maximum: 1440 },
  end_min: { type: 'integer', minimum: 0, maximum: 1440 },
};
const eventFields = {
  ...timeFields,
  type_id: { type: ['integer', 'null'] },
  title: { type: 'string', maxLength: 120 },
  notes: { type: 'string', maxLength: 2000 },
  participants: { type: 'array', maxItems: 100, uniqueItems: true, items: { type: 'integer' } },
};

export default async function events(app) {
  const { db } = app;
  const auth = { preHandler: app.authenticate };

  function checkTimes({ date, start_min, end_min }) {
    if (!isDate(date)) throw httpError(400, 'Date invalide');
    if (start_min % STEP || end_min % STEP) throw httpError(400, `Horaires au quart d'heure uniquement`);
    if (start_min < config.dayStart * 60 || end_min > config.dayEnd * 60) throw httpError(400, 'Horaire hors plage');
    if (end_min <= start_min) throw httpError(400, 'La fin doit être après le début');
  }

  // Statut de chaque membre sur un créneau : ok | unavailable (pas coché dispo) | busy (déjà sur un autre événement)
  function statusFor(date, start, end, memberIds, excludeId = 0) {
    if (!memberIds.length) return {};
    const hours = [];
    for (let h = Math.floor(start / 60); h * 60 < end; h++) hours.push(h);
    const avail = new Map(
      db.prepare(
        `SELECT member_id, COUNT(*) AS n FROM availability
         WHERE date = ? AND hour IN (${hours.map(() => '?').join(',')}) GROUP BY member_id`
      ).all(date, ...hours).map((r) => [r.member_id, r.n])
    );
    const busy = new Set(
      db.prepare(
        `SELECT DISTINCT p.member_id FROM event_participants p JOIN events e ON e.id = p.event_id
         WHERE e.date = ? AND e.start_min < ? AND e.end_min > ? AND e.id <> ?`
      ).all(date, end, start, excludeId).map((r) => r.member_id)
    );
    const out = {};
    for (const id of memberIds) {
      out[id] = busy.has(id) ? 'busy' : avail.get(id) === hours.length ? 'ok' : 'unavailable';
    }
    return out;
  }

  const baseSelect = `SELECT e.*, t.name AS type_name, t.color AS type_color
    FROM events e LEFT JOIN event_types t ON t.id = e.type_id`;

  function withDetails(rows, viewer) {
    if (!rows.length) return [];
    const ids = rows.map((e) => e.id);
    const parts = db
      .prepare(`SELECT event_id, member_id FROM event_participants WHERE event_id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids);
    const byEvent = new Map(ids.map((id) => [id, []]));
    for (const p of parts) byEvent.get(p.event_id).push(p.member_id);
    return rows.map((e) => {
      const participants = byEvent.get(e.id);
      return {
        ...e,
        participants,
        status: statusFor(e.date, e.start_min, e.end_min, participants, e.id),
        can_edit: viewer.role === 'admin' || e.created_by === viewer.id,
      };
    });
  }

  const getEvent = (id, viewer) => withDetails(db.prepare(`${baseSelect} WHERE e.id = ?`).all(id), viewer)[0];

  function activeIds(ids) {
    if (!ids?.length) return [];
    return db
      .prepare(`SELECT id FROM members WHERE active = 1 AND id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids)
      .map((r) => r.id);
  }

  function checkType(typeId) {
    if (typeId == null) return null;
    if (!db.prepare('SELECT 1 FROM event_types WHERE id = ?').get(typeId)) throw httpError(400, 'Type inconnu');
    return typeId;
  }

  const save = db.transaction((id, b, memberId) => {
    const values = [b.date, b.start_min, b.end_min, checkType(b.type_id), (b.title || '').trim(), b.notes || ''];
    if (id) {
      db.prepare(
        `UPDATE events SET date=?, start_min=?, end_min=?, type_id=?, title=?, notes=?, updated_at=datetime('now') WHERE id=?`
      ).run(...values, id);
      db.prepare('DELETE FROM event_participants WHERE event_id = ?').run(id);
    } else {
      id = db.prepare(
        'INSERT INTO events (date, start_min, end_min, type_id, title, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(...values, memberId).lastInsertRowid;
    }
    const ins = db.prepare('INSERT INTO event_participants (event_id, member_id) VALUES (?, ?)');
    for (const m of activeIds(b.participants)) ins.run(id, m);
    return Number(id);
  });

  function editable(id, member) {
    const e = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!e) throw httpError(404, 'Événement introuvable');
    if (member.role !== 'admin' && e.created_by !== member.id) {
      throw httpError(403, "Seuls les admins et l'auteur peuvent modifier cet événement");
    }
    return e;
  }

  app.get('/events', {
    ...auth,
    schema: { querystring: { type: 'object', required: ['week'], properties: { week: dateSchema } } },
  }, async (req) => {
    if (!isDate(req.query.week)) throw httpError(400, 'Semaine invalide');
    const dates = weekDates(mondayOf(req.query.week));
    const rows = db.prepare(`${baseSelect} WHERE e.date BETWEEN ? AND ? ORDER BY e.date, e.start_min`).all(dates[0], dates[6]);
    return withDetails(rows, req.member);
  });

  // Aperçu avant création : statut de tous les membres actifs sur le créneau
  app.post('/events/check', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['date', 'start_min', 'end_min'],
        properties: { ...timeFields, exclude_id: { type: ['integer', 'null'] } },
      },
    },
  }, async (req) => {
    checkTimes(req.body);
    const ids = db.prepare('SELECT id FROM members WHERE active = 1').all().map((r) => r.id);
    const { date, start_min, end_min, exclude_id } = req.body;
    return statusFor(date, start_min, end_min, ids, exclude_id || 0);
  });

  app.post('/events', {
    ...auth,
    schema: { body: { type: 'object', required: ['date', 'start_min', 'end_min'], properties: eventFields, additionalProperties: false } },
  }, async (req, reply) => {
    checkTimes(req.body);
    const id = save(null, req.body, req.member.id);
    const event = getEvent(id, req.member);
    bus.emit('event.created', { event, actor: req.member });
    reply.code(201);
    return event;
  });

  app.patch('/events/:id', {
    ...auth,
    schema: { body: { type: 'object', required: ['date', 'start_min', 'end_min'], properties: eventFields, additionalProperties: false } },
  }, async (req) => {
    const id = Number(req.params.id);
    editable(id, req.member);
    checkTimes(req.body);
    save(id, req.body, req.member.id);
    const event = getEvent(id, req.member);
    bus.emit('event.updated', { event, actor: req.member });
    return event;
  });

  app.delete('/events/:id', auth, async (req) => {
    const id = Number(req.params.id);
    editable(id, req.member);
    const event = getEvent(id, req.member);
    db.prepare('DELETE FROM events WHERE id = ?').run(id);
    bus.emit('event.deleted', { event, actor: req.member });
    return { deleted: true };
  });
}
