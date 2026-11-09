import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { db, migrate } from './db.js';
import { modules } from './modules/index.js';

// Construit l'app sans l'écouter : utilisée par index.js (Docker / local) et api/index.js (Vercel)
export async function buildApp() {
  const app = Fastify({
    logger: { level: config.production ? 'info' : 'debug' },
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });

  await migrate(app.log);

  await app.register(cookie, { secret: config.jwtSecret });
  await app.register(jwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'session', signed: false },
  });

  app.decorate('db', db);

  // Charge le membre connecté à chaque requête : un membre désactivé perd l'accès immédiatement
  app.decorate('authenticate', async (req, reply) => {
    try {
      const payload = await req.jwtVerify();
      const member = await db.get('SELECT * FROM members WHERE id = ? AND active = 1', payload.sub);
      if (!member) throw new Error('inactive');
      req.member = member;
    } catch {
      return reply.code(401).send({ statusCode: 401, message: 'Connexion requise' });
    }
  });

  app.decorate('requireAdmin', async (req, reply) => {
    if (req.member?.role !== 'admin') {
      return reply.code(403).send({ statusCode: 403, message: 'Réservé aux admins' });
    }
  });

  // Anti-CSRF : toute écriture sur l'API doit venir du front (en-tête personnalisé)
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers['x-requested-with'] !== 'staff-planner') {
        return reply.code(403).send({ statusCode: 403, message: 'Requête refusée' });
      }
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.get('/api/health', async () => ({ ok: true }));

  for (const mod of modules) {
    await app.register(mod, { prefix: '/api' });
  }

  // Docker : front compilé copié dans server/public + fallback SPA. Sur Vercel, le front est servi par le CDN.
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
  if (fs.existsSync(publicDir)) {
    await app.register(fastifyStatic, { root: publicDir, wildcard: false });
  }
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.method !== 'GET' || !fs.existsSync(publicDir)) {
      return reply.code(404).send({ statusCode: 404, message: 'Introuvable' });
    }
    return reply.sendFile('index.html');
  });

  return app;
}
