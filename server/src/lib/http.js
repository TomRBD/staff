export const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export const avatarUrl = (m) =>
  m.discord_id && m.avatar ? `https://cdn.discordapp.com/avatars/${m.discord_id}/${m.avatar}.png?size=64` : null;

export const publicMember = (m) => ({
  id: m.id,
  pseudo: m.pseudo,
  color: m.color,
  role: m.role,
  avatar: avatarUrl(m),
});

export const dateSchema = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
export const colorSchema = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
