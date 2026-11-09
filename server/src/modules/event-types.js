import { colorSchema, httpError } from '../lib/http.js';

const fields = {
  name: { type: 'string', minLength: 1, maxLength: 40 },
  color: colorSchema,
  position: { type: 'integer' },
  archived: { type: 'boolean' },
};

export default async function eventTypes(app) {
  const { db } = app;
  const admin = { preHandler: [app.authenticate, app.requireAdmin] };
  const out = (t) => ({ ...t, archived: !!t.archived });
  const get = (id) => db.prepare('SELECT * FROM event_types WHERE id = ?').get(id);

  const run = (fn) => {
    try {
      return fn();
    } catch (err) {
      if (String(err.code).startsWith('SQLITE_CONSTRAINT')) throw httpError(409, 'Ce nom de type existe déjà');
      throw err;
    }
  };

  app.get('/event-types', { preHandler: app.authenticate }, async (req) => {
    const all = req.query.all === '1';
    return db
      .prepare(`SELECT * FROM event_types ${all ? '' : 'WHERE archived = 0'} ORDER BY position, name`)
      .all()
      .map(out);
  });

  app.post('/event-types', {
    ...admin,
    schema: { body: { type: 'object', required: ['name', 'color'], properties: fields, additionalProperties: false } },
  }, async (req, reply) => {
    const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM event_types').get().p;
    const info = run(() =>
      db.prepare('INSERT INTO event_types (name, color, position) VALUES (?, ?, ?)')
        .run(req.body.name.trim(), req.body.color, req.body.position ?? pos)
    );
    reply.code(201);
    return out(get(info.lastInsertRowid));
  });

  app.patch('/event-types/:id', {
    ...admin,
    schema: { body: { type: 'object', properties: fields, additionalProperties: false } },
  }, async (req) => {
    const t = get(Number(req.params.id));
    if (!t) throw httpError(404, 'Type introuvable');
    const b = req.body;
    run(() =>
      db.prepare('UPDATE event_types SET name=?, color=?, position=?, archived=? WHERE id=?').run(
        b.name?.trim() ?? t.name,
        b.color ?? t.color,
        b.position ?? t.position,
        b.archived === undefined ? t.archived : b.archived ? 1 : 0,
        t.id
      )
    );
    return out(get(t.id));
  });

  // Supprime si inutilisé, sinon masque (les événements existants gardent leur type)
  app.delete('/event-types/:id', admin, async (req) => {
    const id = Number(req.params.id);
    if (!get(id)) throw httpError(404, 'Type introuvable');
    const used = db.prepare('SELECT 1 FROM events WHERE type_id = ? LIMIT 1').get(id);
    if (used) {
      db.prepare('UPDATE event_types SET archived = 1 WHERE id = ?').run(id);
      return { archived: true };
    }
    db.prepare('DELETE FROM event_types WHERE id = ?').run(id);
    return { deleted: true };
  });
}
