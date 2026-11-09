const env = process.env;
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

// Sur Vercel, l'URL de prod est fournie automatiquement si PUBLIC_URL n'est pas renseignée
const vercelUrl = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '';

export const config = {
  port: Number(env.PORT || 3000),
  publicUrl: (env.PUBLIC_URL || vercelUrl || 'http://localhost:3000').replace(/\/$/, ''),
  db: {
    url: env.DATABASE_URL || env.TURSO_DATABASE_URL || 'file:./data/planner.db',
    authToken: env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || undefined,
  },
  jwtSecret: env.JWT_SECRET || '',
  production: env.NODE_ENV === 'production' || !!env.VERCEL,
  devLogin: env.DEV_LOGIN === '1' && env.NODE_ENV !== 'production' && !env.VERCEL,
  dayStart: Number(env.DAY_START || 8),
  dayEnd: Number(env.DAY_END || 23),
  adminIds: list(env.ADMIN_DISCORD_IDS),
  discord: {
    clientId: env.DISCORD_CLIENT_ID || '',
    clientSecret: env.DISCORD_CLIENT_SECRET || '',
    guildId: env.DISCORD_GUILD_ID || '',
    roleId: env.DISCORD_ROLE_ID || '',
    webhookUrl: env.DISCORD_WEBHOOK_URL || '',
  },
};

config.secureCookies = config.publicUrl.startsWith('https://');

if (config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET manquant ou trop court (32 caractères min) : openssl rand -hex 32');
}
if (!(config.dayStart >= 0 && config.dayEnd <= 24 && config.dayEnd > config.dayStart)) {
  throw new Error('DAY_START / DAY_END invalides');
}
