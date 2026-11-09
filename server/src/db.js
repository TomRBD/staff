import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

// libSQL : fichier SQLite local (file:...) en dev/Docker, base Turso (libsql://...) sur Vercel.
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

if (config.db.url.startsWith('file:')) {
  fs.mkdirSync(path.dirname(path.resolve(config.db.url.slice(5))), { recursive: true });
}

export const client = createClient({ url: config.db.url, authToken: config.db.authToken });

const clean = (args) => args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a));
const rowsOf = (rs) => rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));
const meta = (rs) => ({ changes: rs.rowsAffected, lastInsertRowid: Number(rs.lastInsertRowid ?? 0) });

function wrap(ex) {
  const exec = (sql, args) => ex.execute({ sql, args: clean(args) });
  return {
    all: async (sql, ...args) => rowsOf(await exec(sql, args)),
    get: async (sql, ...args) => rowsOf(await exec(sql, args))[0],
    run: async (sql, ...args) => meta(await exec(sql, args)),
  };
}

export const db = {
  ...wrap(client),
  // Plusieurs écritures atomiques en un aller-retour : [[sql, ...args], ...]
  async batch(stmts) {
    const res = await client.batch(stmts.map(([sql, ...args]) => ({ sql, args: clean(args) })), 'write');
    return res.map(meta);
  },
  // Transaction interactive (lectures + écritures dépendantes)
  async tx(fn) {
    const t = await client.transaction('write');
    try {
      const out = await fn(wrap(t));
      await t.commit();
      return out;
    } catch (err) {
      await t.rollback().catch(() => {});
      throw err;
    } finally {
      t.close();
    }
  },
};

export const isConstraintError = (err) =>
  /SQLITE_CONSTRAINT/.test(`${err?.code} ${err?.cause?.code} ${err?.message}`) || /UNIQUE constraint/i.test(err?.message || '');

export async function migrate(log = console) {
  await client.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const applied = async () => new Set((await db.all('SELECT name FROM schema_migrations')).map((r) => r.name));
  const done = await applied();
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await client.executeMultiple(
        `BEGIN;\n${sql}\n;INSERT INTO schema_migrations (name) VALUES ('${file.replace(/'/g, "''")}');\nCOMMIT;`
      );
      log.info(`Migration appliquée : ${file}`);
    } catch (err) {
      await client.execute('ROLLBACK').catch(() => {});
      // Une autre instance l'a peut-être appliquée en même temps (démarrages à froid simultanés)
      if ((await applied()).has(file)) continue;
      throw err;
    }
  }
}
