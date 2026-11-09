import crypto from 'node:crypto';
import { config } from '../config.js';
import { publicMember } from '../lib/http.js';

const DISCORD = 'https://discord.com/api';
const SESSION_DAYS = 30;

export default async function auth(app) {
  const { db } = app;
  const redirectUri = `${config.publicUrl}/api/auth/callback`;
  const scopes = ['identify', ...(config.discord.guildId ? ['guilds.members.read'] : [])];

  const sessionCookie = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: SESSION_DAYS * 86400,
  };

  function openSession(reply, member) {
    const token = app.jwt.sign({ sub: member.id }, { expiresIn: `${SESSION_DAYS}d` });
    reply.setCookie('session', token, sessionCookie);
  }

  app.get('/auth/login', async (req, reply) => {
    if (!config.discord.clientId) return reply.redirect('/?error=config');
    const state = crypto.randomBytes(16).toString('hex');
    reply.setCookie('oauth_state', state, {
      path: '/api/auth',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies,
      signed: true,
      maxAge: 600,
    });
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({
      client_id: config.discord.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      prompt: 'none',
    }).toString();
    return reply.redirect(url.toString());
  });

  app.get('/auth/callback', async (req, reply) => {
    const { code, state } = req.query;
    const saved = req.unsignCookie(req.cookies.oauth_state || '');
    reply.clearCookie('oauth_state', { path: '/api/auth' });
    if (!code || !state || !saved.valid || saved.value !== state) return reply.redirect('/?error=state');

    let token, user;
    try {
      const tokenRes = await fetch(`${DISCORD}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.discord.clientId,
          client_secret: config.discord.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
      token = (await tokenRes.json()).access_token;
      const userRes = await fetch(`${DISCORD}/users/@me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!userRes.ok) throw new Error(`user ${userRes.status}`);
      user = await userRes.json();
    } catch (err) {
      req.log.warn({ err }, 'Échec OAuth Discord');
      return reply.redirect('/?error=discord');
    }

    const displayName = user.global_name || user.username;
    let member = db.prepare('SELECT * FROM members WHERE discord_id = ?').get(user.id);
    const isAdmin = config.adminIds.includes(user.id);

    if (!member) {
      let allowed = isAdmin;
      if (!allowed && config.discord.guildId) allowed = await hasGuildAccess(token, req.log);
      if (!allowed) return reply.redirect('/?error=not_allowed');
      const info = db
        .prepare('INSERT INTO members (discord_id, pseudo, avatar, role) VALUES (?, ?, ?, ?)')
        .run(user.id, displayName, user.avatar, isAdmin ? 'admin' : 'member');
      member = db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid);
    }

    if (!member.active) return reply.redirect('/?error=not_allowed');

    db.prepare(
      `UPDATE members SET avatar = ?, last_login = datetime('now'),
       role = CASE WHEN ? THEN 'admin' ELSE role END WHERE id = ?`
    ).run(user.avatar, isAdmin ? 1 : 0, member.id);

    openSession(reply, member);
    return reply.redirect('/');
  });

  async function hasGuildAccess(token, log) {
    try {
      const res = await fetch(`${DISCORD}/users/@me/guilds/${config.discord.guildId}/member`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      const gm = await res.json();
      return !config.discord.roleId || (gm.roles || []).includes(config.discord.roleId);
    } catch (err) {
      log.warn({ err }, 'Vérification serveur Discord impossible');
      return false;
    }
  }

  if (config.devLogin) {
    app.log.warn('DEV_LOGIN actif : connexion sans Discord ouverte');
    app.get('/auth/dev', async (req, reply) => {
      const pseudo = String(req.query.pseudo || 'Dev').slice(0, 40);
      let member = db.prepare('SELECT * FROM members WHERE pseudo = ?').get(pseudo);
      if (!member) {
        const info = db.prepare("INSERT INTO members (pseudo, role) VALUES (?, 'admin')").run(pseudo);
        member = db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid);
      }
      openSession(reply, member);
      return reply.redirect('/');
    });
  }

  app.post('/auth/logout', async (req, reply) => {
    reply.clearCookie('session', { path: '/' });
    return { ok: true };
  });

  app.get('/me', { preHandler: app.authenticate }, async (req) => ({
    member: publicMember(req.member),
    config: { dayStart: config.dayStart, dayEnd: config.dayEnd },
  }));
}
