const env = process.env;
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(env.PORT || 3000),
  publicUrl: (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
  dbPath: env.DB_PATH || './data/planner.db',
  jwtSecret: env.JWT_SECRET || '',
  production: env.NODE_ENV === 'production',
  devLogin: env.DEV_LOGIN === '1' && env.NODE_ENV !== 'production',
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
