// Point d'entrée Vercel : toute requête /api/* arrive ici (rewrite dans vercel.json).
// Import dynamique : une erreur de config ou de base au chargement est renvoyée en JSON.
let ready;

export default async function handler(req, res) {
  ready ??= import('../server/src/app.js')
    .then(({ buildApp }) => buildApp())
    .then(async (app) => {
      await app.ready();
      return app;
    })
    .catch((err) => {
      ready = undefined;
      throw err;
    });

  let app;
  try {
    app = await ready;
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ statusCode: 500, message: `Démarrage impossible : ${err.message}` }));
    return;
  }
  app.server.emit('request', req, res);
}