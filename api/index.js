// Point d'entrée Vercel : toute requête /api/* arrive ici (rewrite dans vercel.json)
// et est confiée à Fastify. L'app est construite une fois par instance.
import { buildApp } from '../server/src/app.js';

let ready;

export default async function handler(req, res) {
  ready ??= buildApp()
    .then(async (app) => {
      await app.ready();
      return app;
    })
    .catch((err) => {
      ready = undefined;
      throw err;
    });
  const app = await ready;
  app.server.emit('request', req, res);
}
