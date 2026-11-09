import { config } from '../config.js';
import { addDays, isDate, mondayOf, weekDates } from '../lib/dates.js';
import { dateSchema, httpError, publicMember } from '../lib/http.js';

const SLOT_RE = /^(\d{4}-\d{2}-\d{2})\|(\d{1,2})$/;

export default async function availability(app) {
  const { db } = app;
  const auth = { preHandler: app.authenticate };

  const parseWeek = (w) => {
    if (!isDate(w)) throw httpError(400, 'Semaine invalide');
    return mondayOf(w);
  };

  function slotsOf(memberId, dates) {
    return db
      .prepare('SELECT date, hour FROM availability WHERE member_id = ? AND date BETWEEN ? AND ? ORDER BY date, hour')
      .all(memberId, dates[0], dates[6])
      .map((r) => `${r.date}|${r.hour}`);
  }

  const replaceWeek = db.transaction((memberId, dates, slots) => {
    db.prepare('DELETE FROM availability WHERE member_id = ? AND date BETWEEN ? AND ?').run(memberId, dates[0], dates[6]);
    const ins = db.prepare('INSERT OR IGNORE INTO availability (member_id, date, hour) VALUES (?, ?, ?)');
    for (const [date, hour] of slots) ins.run(memberId, date, hour);
  });

  // Disponibilités de toute l'équipe pour une semaine
  app.get('/availability', {
    ...auth,
    schema: { querystring: { type: 'object', required: ['week'], properties: { week: dateSchema } } },
  }, async (req) => {
    const monday = parseWeek(req.query.week);
    const dates = weekDates(monday);
    const members = db.prepare('SELECT * FROM members WHERE active = 1 ORDER BY pseudo COLLATE NOCASE').all();
    const rows = db
      .prepare('SELECT member_id, date, hour FROM availability WHERE date BETWEEN ? AND ?')
      .all(dates[0], dates[6]);
    const slots = {};
    for (const r of rows) (slots[r.member_id] ??= []).push(`${r.date}|${r.hour}`);
    return { week: monday, dates, members: members.map(publicMember), slots };
  });

  // Remplace mes dispos de la semaine
  app.put('/availability/me', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['week', 'slots'],
        additionalProperties: false,
        properties: {
          week: dateSchema,
          slots: { type: 'array', maxItems: 7 * 24, items: { type: 'string', pattern: SLOT_RE.source } },
        },
      },
    },
  }, async (req) => {
    const dates = weekDates(parseWeek(req.body.week));
    const inWeek = new Set(dates);
    const parsed = req.body.slots.map((s) => {
      const [, date, h] = SLOT_RE.exec(s);
      const hour = Number(h);
      if (!inWeek.has(date) || hour < config.dayStart || hour >= config.dayEnd) {
        throw httpError(400, `Créneau hors semaine ou hors plage : ${s}`);
      }
      return [date, hour];
    });
    replaceWeek(req.member.id, dates, parsed);
    return { slots: slotsOf(req.member.id, dates) };
  });

  // Copie mes dispos de la semaine précédente
  app.post('/availability/me/copy', {
    ...auth,
    schema: { body: { type: 'object', required: ['week'], properties: { week: dateSchema } } },
  }, async (req) => {
    const dates = weekDates(parseWeek(req.body.week));
    const prev = weekDates(addDays(dates[0], -7));
    const shifted = slotsOf(req.member.id, prev).map((s) => {
      const [, date, h] = SLOT_RE.exec(s);
      return [addDays(date, 7), Number(h)];
    });
    replaceWeek(req.member.id, dates, shifted);
    return { slots: slotsOf(req.member.id, dates) };
  });
}
