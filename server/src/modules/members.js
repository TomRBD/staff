import { colorSchema, httpError, publicMember } from '../lib/http.js';

const fields = {
  pseudo: { type: 'string', minLength: 1, maxLength: 40 },
  discord_id: { type: ['string', 'null'], pattern: '^\\d{15,21}$' },
  role: { type: 'string', enum: ['admin', 'member'] },
  color: colorSchema,
  active: { type: 'boolean' },
};

export default async function members(app) {
  const { db } = app;
  const admin = { preHandler: [app.authenticate, app.requireAdmin] };

  const full = (m) => ({ ...publicMember(m), discord_id: m.discord_id, active: !!m.active, last_login: m.last_login });

  const run = (fn) => {
    try {
      return fn();
    } catch (err) {
      if (String(err.code).startsWith('SQLITE_CONSTRAINT')) throw httpError(409, 'Cet ID Discord est déjà utilisé');
      throw err;
    }
  };

  app.get('/members', { preHandler: app.authenticate }, async (req) => {
    const all = req.query.all === '1' && req.member.role === 'admin';
    const rows = db
      .prepare(`SELECT * FROM members ${all ? '' : 'WHERE active = 1'} ORDER BY pseudo COLLATE NOCASE`)
      .all();
    return rows.map(all ? full : publicMember);
  });

  app.post('/members', {
    ...admin,
    schema: { body: { type: 'object', required: ['pseudo'], properties: fields, additionalProperties: false } },
  }, async (req, reply) => {
    const b = req.body;
    const info = run(() =>
      db.prepare('INSERT INTO members (pseudo, discord_id, role, color) VALUES (?, ?, ?, ?)')
        .run(b.pseudo.trim(), b.discord_id || null, b.role || 'member', b.color || '#5865F2')
    );
    reply.code(201);
    return full(db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid));
  });

  app.patch('/members/:id', {
    ...admin,
    schema: { body: { type: 'object', properties: fields, additionalProperties: false } },
  }, async (req) => {
    const id = Number(req.params.id);
    const m = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    if (!m) throw httpError(404, 'Membre introuvable');
    const b = req.body;
    if (id === req.member.id && (b.role === 'member' || b.active === false)) {
      throw httpError(400, 'Tu ne peux pas retirer tes propres droits');
    }
    const next = {
      pseudo: b.pseudo?.trim() ?? m.pseudo,
      discord_id: b.discord_id === undefined ? m.discord_id : b.discord_id || null,
      role: b.role ?? m.role,
      color: b.color ?? m.color,
      active: b.active === undefined ? m.active : b.active ? 1 : 0,
    };
    run(() =>
      db.prepare('UPDATE members SET pseudo=?, discord_id=?, role=?, color=?, active=? WHERE id=?')
        .run(next.pseudo, next.discord_id, next.role, next.color, next.active, id)
    );
    return full(db.prepare('SELECT * FROM members WHERE id = ?').get(id));
  });

  app.delete('/members/:id', admin, async (req, reply) => {
    const id = Number(req.params.id);
    if (id === req.member.id) throw httpError(400, 'Tu ne peux pas te supprimer toi-même');
    const info = db.prepare('DELETE FROM members WHERE id = ?').run(id);
    if (!info.changes) throw httpError(404, 'Membre introuvable');
    return reply.code(204).send();
  });
}
