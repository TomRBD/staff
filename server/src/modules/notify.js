import { config } from '../config.js';
import { bus } from '../lib/bus.js';
import { fmtDateFr, fmtTime } from '../lib/dates.js';

// Notifications Discord via webhook. Inactif si DISCORD_WEBHOOK_URL est vide.
export default async function notify(app) {
  const url = config.discord.webhookUrl;
  if (!url) return;
  const { db } = app;

  function describe(event) {
    const people = event.participants.length
      ? db.prepare(`SELECT pseudo, discord_id FROM members WHERE id IN (${event.participants.map(() => '?').join(',')})`)
          .all(...event.participants)
          .map((m) => (m.discord_id ? `<@${m.discord_id}>` : m.pseudo))
          .join(', ')
      : 'aucun';
    return [
      `**${fmtDateFr(event.date)}**, ${fmtTime(event.start_min)} à ${fmtTime(event.end_min)}`,
      `Participants : ${people}`,
      event.notes ? `\n${event.notes.slice(0, 500)}` : '',
    ].join('\n');
  }

  async function send(prefix, { event, actor }) {
    const name = [event.type_name, event.title].filter(Boolean).join(' : ') || 'Événement';
    const color = event.type_color ? parseInt(event.type_color.slice(1), 16) : 0x5865f2;
    const week = `${config.publicUrl}/planning?w=${event.date}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowed_mentions: { parse: [] },
          embeds: [{
            title: `${prefix} ${name}`,
            url: week,
            description: describe(event),
            color,
            footer: { text: `par ${actor.pseudo}` },
          }],
        }),
      });
      if (!res.ok) app.log.warn(`Webhook Discord : HTTP ${res.status}`);
    } catch (err) {
      app.log.warn({ err }, 'Webhook Discord injoignable');
    }
  }

  bus.on('event.created', (p) => send('Nouveau :', p));
  bus.on('event.updated', (p) => send('Modifié :', p));
  bus.on('event.deleted', (p) => send('Annulé :', p));
}
