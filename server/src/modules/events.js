import { config } from '../config.js';
import { publish } from '../lib/bus.js';
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

const marks = (n) => Array(n).fill('?').join(',');

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
  async function statusFor(date, start, end, memberIds, excludeId = 0) {
    if (!memberIds.length) return {};
    const hours = [];
    for (let h = Math.floor(start / 60); h * 60 < end; h++) hours.push(h);
    const [availRows, busyRows] = await Promise.all([
      db.all(
        `SELECT member_id, COUNT(*) AS n FROM availability
         WHERE date = ? AND hour IN (${marks(hours.length)}) GROUP BY member_id`,
        date, ...hours
      ),
      db.all(
        `SELECT DISTINCT p.member_id FROM event_participants p JOIN events e ON e.id = p.event_id
         WHERE e.date = ? AND e.start_min < ? AND e.end_min > ? AND e.id <> ?`,
        date, end, start, excludeId
      ),
    ]);
    const avail = new Map(availRows.map((r) => [r.member_id, r.n]));
    const busy = new Set(busyRows.map((r) => r.member_id));
    const out = {};
    for (const id of memberIds) {
      out[id] = busy.has(id) ? 'busy' : avail.get(id) === hours.length ? 'ok' : 'unavailable';
    }
    return out;
  }

  const baseSelect = `SELECT e.*, t.name AS type_name, t.color AS type_color
    FROM events e LEFT JOIN event_types t ON t.id = e.type_id`;

  async function withDetails(rows, viewer) {
    if (!rows.length) return [];
    const ids = rows.map((e) => e.id);
    const parts = await db.all(`SELECT event_id, member_id FROM event_participants WHERE event_id IN (${marks(ids.length)})`, ...ids);
    const byEvent = new Map(ids.map((id) => [id, []]));
    for (const p of parts) byEvent.get(p.event_id).push(p.member_id);
    return Promise.all(
      rows.map(async (e) => {
        const participants = byEvent.get(e.id);
        return {
          ...e,
          participants,
          status: await statusFor(e.date, e.start_min, e.end_min, participants, e.id),
          can_edit: viewer.role === 'admin' || e.created_by === viewer.id,
        };
      })
    );
  }

  const getEvent = async (id, viewer) => (await withDetails(await db.all(`${baseSelect} WHERE e.id = ?`, id), viewer))[0];

  async function activeIds(q, ids) {
    if (!ids?.length) return [];
    return (await q.all(`SELECT id FROM members WHERE active = 1 AND id IN (${marks(ids.length)})`, ...ids)).map((r) => r.id);
  }

  function save(id, b, memberId) {
    return db.tx(async (q) => {
      const typeId = b.type_id ?? null;
      if (typeId != null && !(await q.get('SELECT 1 AS x FROM event_types WHERE id = ?', typeId))) {
        throw httpError(400, 'Type inconnu');
      }
      const values = [b.date, b.start_min, b.end_min, typeId, (b.title || '').trim(), b.notes || ''];
      if (id) {
        await q.run(
          `UPDATE events SET date=?, start_min=?, end_min=?, type_id=?, title=?, notes=?, updated_at=datetime('now') WHERE id=?`,
          ...values, id
        );
        await q.run('DELETE FROM event_participants WHERE event_id = ?', id);
      } else {
        id = (await q.run(
          'INSERT INTO events (date, start_min, end_min, type_id, title, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ...values, memberId
        )).lastInsertRowid;
      }
      for (const m of await activeIds(q, b.participants)) {
        await q.run('INSERT INTO event_participants (event_id, member_id) VALUES (?, ?)', id, m);
      }
      return Number(id);
    });
  }

  async function editable(id, member) {
    const e = await db.get('SELECT * FROM events WHERE id = ?', id);
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
    const rows = await db.all(`${baseSelect} WHERE e.date BETWEEN ? AND ? ORDER BY e.date, e.start_min`, dates[0], dates[6]);
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
    const ids = (await db.all('SELECT id FROM members WHERE active = 1')).map((r) => r.id);
    const { date, start_min, end_min, exclude_id } = req.body;
    return statusFor(date, start_min, end_min, ids, exclude_id || 0);
  });

  app.post('/events', {
    ...auth,
    schema: { body: { type: 'object', required: ['date', 'start_min', 'end_min'], properties: eventFields, additionalProperties: false } },
  }, async (req, reply) => {
    checkTimes(req.body);
    const id = await save(null, req.body, req.member.id);
    const event = await getEvent(id, req.member);
    await publish('event.created', { event, actor: req.member });
    reply.code(201);
    return event;
  });

  app.patch('/events/:id', {
    ...auth,
    schema: { body: { type: 'object', required: ['date', 'start_min', 'end_min'], properties: eventFields, additionalProperties: false } },
  }, async (req) => {
    const id = Number(req.params.id);
    await editable(id, req.member);
    checkTimes(req.body);
    await save(id, req.body, req.member.id);
    const event = await getEvent(id, req.member);
    await publish('event.updated', { event, actor: req.member });
    return event;
  });

  app.delete('/events/:id', auth, async (req) => {
    const id = Number(req.params.id);
    await editable(id, req.member);
    const event = await getEvent(id, req.member);
    await db.batch([
      ['DELETE FROM event_participants WHERE event_id = ?', id],
      ['DELETE FROM events WHERE id = ?', id],
    ]);
    await publish('event.deleted', { event, actor: req.member });
    return { deleted: true };
  });
}
