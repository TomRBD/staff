import { isConstraintError } from '../db.js';
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
  const get = (id) => db.get('SELECT * FROM event_types WHERE id = ?', id);

  const run = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      if (isConstraintError(err)) throw httpError(409, 'Ce nom de type existe déjà');
      throw err;
    }
  };

  app.get('/event-types', { preHandler: app.authenticate }, async (req) => {
    const all = req.query.all === '1';
    const rows = await db.all(`SELECT * FROM event_types ${all ? '' : 'WHERE archived = 0'} ORDER BY position, name`);
    return rows.map(out);
  });

  app.post('/event-types', {
    ...admin,
    schema: { body: { type: 'object', required: ['name', 'color'], properties: fields, additionalProperties: false } },
  }, async (req, reply) => {
    const { p: pos } = await db.get('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM event_types');
    const info = await run(() =>
      db.run('INSERT INTO event_types (name, color, position) VALUES (?, ?, ?)', req.body.name.trim(), req.body.color, req.body.position ?? pos)
    );
    reply.code(201);
    return out(await get(info.lastInsertRowid));
  });

  app.patch('/event-types/:id', {
    ...admin,
    schema: { body: { type: 'object', properties: fields, additionalProperties: false } },
  }, async (req) => {
    const t = await get(Number(req.params.id));
    if (!t) throw httpError(404, 'Type introuvable');
    const b = req.body;
    await run(() =>
      db.run(
        'UPDATE event_types SET name=?, color=?, position=?, archived=? WHERE id=?',
        b.name?.trim() ?? t.name,
        b.color ?? t.color,
        b.position ?? t.position,
        b.archived === undefined ? t.archived : b.archived ? 1 : 0,
        t.id
      )
    );
    return out(await get(t.id));
  });

  // Supprime si inutilisé, sinon masque (les événements existants gardent leur type)
  app.delete('/event-types/:id', admin, async (req) => {
    const id = Number(req.params.id);
    if (!(await get(id))) throw httpError(404, 'Type introuvable');
    const used = await db.get('SELECT 1 AS x FROM events WHERE type_id = ? LIMIT 1', id);
    if (used) {
      await db.run('UPDATE event_types SET archived = 1 WHERE id = ?', id);
      return { archived: true };
    }
    await db.run('DELETE FROM event_types WHERE id = ?', id);
    return { deleted: true };
  });
}
