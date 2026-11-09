import { isConstraintError } from '../db.js';
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

  const run = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      if (isConstraintError(err)) throw httpError(409, 'Cet ID Discord est déjà utilisé');
      throw err;
    }
  };

  app.get('/members', { preHandler: app.authenticate }, async (req) => {
    const all = req.query.all === '1' && req.member.role === 'admin';
    const rows = await db.all(`SELECT * FROM members ${all ? '' : 'WHERE active = 1'} ORDER BY pseudo COLLATE NOCASE`);
    return rows.map(all ? full : publicMember);
  });

  app.post('/members', {
    ...admin,
    schema: { body: { type: 'object', required: ['pseudo'], properties: fields, additionalProperties: false } },
  }, async (req, reply) => {
    const b = req.body;
    const info = await run(() =>
      db.run(
        'INSERT INTO members (pseudo, discord_id, role, color) VALUES (?, ?, ?, ?)',
        b.pseudo.trim(), b.discord_id || null, b.role || 'member', b.color || '#5865F2'
      )
    );
    reply.code(201);
    return full(await db.get('SELECT * FROM members WHERE id = ?', info.lastInsertRowid));
  });

  app.patch('/members/:id', {
    ...admin,
    schema: { body: { type: 'object', properties: fields, additionalProperties: false } },
  }, async (req) => {
    const id = Number(req.params.id);
    const m = await db.get('SELECT * FROM members WHERE id = ?', id);
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
    await run(() =>
      db.run(
        'UPDATE members SET pseudo=?, discord_id=?, role=?, color=?, active=? WHERE id=?',
        next.pseudo, next.discord_id, next.role, next.color, next.active, id
      )
    );
    return full(await db.get('SELECT * FROM members WHERE id = ?', id));
  });

  // Suppressions en cascade explicites : ne dépend pas de PRAGMA foreign_keys (non persistant sur Turso)
  app.delete('/members/:id', admin, async (req, reply) => {
    const id = Number(req.params.id);
    if (id === req.member.id) throw httpError(400, 'Tu ne peux pas te supprimer toi-même');
    const res = await db.batch([
      ['DELETE FROM availability WHERE member_id = ?', id],
      ['DELETE FROM event_participants WHERE member_id = ?', id],
      ['UPDATE events SET created_by = NULL WHERE created_by = ?', id],
      ['DELETE FROM members WHERE id = ?', id],
    ]);
    if (!res[3].changes) throw httpError(404, 'Membre introuvable');
    return reply.code(204).send();
  });
}
