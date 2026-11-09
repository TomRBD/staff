// Serveur classique (dev local, Docker). Sur Vercel, c'est api/index.js qui est utilisé.
import { config } from './config.js';
import { client } from './db.js';
import { buildApp } from './app.js';

const app = await buildApp();

const close = async () => {
  await app.close();
  client.close();
  process.exit(0);
};
process.on('SIGTERM', close);
process.on('SIGINT', close);

await app.listen({ port: config.port, host: '0.0.0.0' });
