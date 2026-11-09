# Staff Planner

Planning d'équipe fait maison : dispos de chaque membre, vue d'équipe, planning de la semaine.
Node 22 + Fastify + libSQL (SQLite) côté serveur, React + Vite côté front, connexion Discord. Déployable sur Vercel (base Turso) ou en conteneur Docker (fichier SQLite).

## Fonctionnalités

- **Connexion Discord** (OAuth2, scope `identify`). Accès par liste d'admins, ajout manuel par ID Discord, ou inscription automatique des membres d'un serveur Discord (avec rôle optionnel).
- **Mes dispos** : grille par semaine datée, clic-glisser pour cocher, clic sur un jour ou une heure pour la ligne entière, reprise de la semaine précédente, enregistrement automatique.
- **Équipe** : heatmap des dispos, détail de qui est libre par créneau, sélection de membres pour trouver un créneau commun (cases entourées en vert), liste de ceux qui n'ont pas rempli, bouton pour créer un événement directement sur le créneau avec les libres présélectionnés.
- **Planning** : semaine avec navigation (lien partageable `?w=`), événements au quart d'heure, chevauchements répartis en colonnes, création en cliquant sur la grille.
- **Contrôle des conflits** : à la création, chaque membre est marqué Libre / Déjà pris / Pas libre ; un `!` signale les événements avec un participant indisponible.
- **Admin** : membres (rôle, couleur, activation, ID Discord), types d'événements (nom, couleur, masquage).
- **Notifications Discord** (optionnel) : création, modification, annulation postées via webhook.
- Droits : tout membre crée des événements, seuls l'auteur et les admins les modifient.

## 1. Créer l'application Discord

1. https://discord.com/developers/applications > New Application.
2. OAuth2 : copier Client ID et Client Secret.
3. OAuth2 > Redirects : ajouter `https://ton-domaine/api/auth/callback` (et `http://localhost:5173/api/auth/callback` pour le dev).
4. Ton ID Discord (mode développeur activé, clic droit sur ton profil, Copier l'identifiant) va dans `ADMIN_DISCORD_IDS`.

## 2. Déployer sur Vercel

Architecture : le front (`web/dist`) est servi par le CDN Vercel, l'API Fastify tourne dans une fonction serverless (`api/index.js`, toutes les routes `/api/*`), la base est une base Turso (SQLite managé). Les migrations s'appliquent au premier appel de chaque instance.

1. **Base Turso** : créer un compte sur turso.tech, une base en Europe, puis récupérer son URL `libsql://...` et un jeton. Ou, dans Vercel : Storage > Turso, qui pose `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN` tout seul.
2. **Projet Vercel** : Add New > Project > importer le repo GitHub. Laisser Root Directory à la racine, tout le reste est dans `vercel.json`.
3. **Variables d'environnement** (Settings > Environment Variables) : `DATABASE_URL`, `DATABASE_AUTH_TOKEN` (si pas d'intégration), `JWT_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `ADMIN_DISCORD_IDS`, et les optionnelles. `PUBLIC_URL` seulement avec un domaine perso.
4. **Discord** : ajouter `https://<projet>.vercel.app/api/auth/callback` dans OAuth2 > Redirects.
5. Deploy. Chaque push sur `main` redéploie.

Les déploiements de preview ont une autre URL : la connexion Discord n'y marche pas (redirect non déclaré), c'est normal.

## 2 bis. Déployer en Docker (VPS)

```bash
cp .env.example .env    # DATABASE_URL reste un fichier, forcé à /data/planner.db dans l'image
openssl rand -hex 32    # à coller dans JWT_SECRET
docker compose up -d --build
```

Le conteneur écoute sur `127.0.0.1:3000`, à mettre derrière un reverse proxy HTTPS (Caddy : `reverse_proxy 127.0.0.1:3000`). La base vit dans le volume `planner-data`.

## 3. Développer en local

```bash
cp .env.example .env              # JWT_SECRET, DEV_LOGIN=1
npm install && npm install --prefix web
npm run dev:api                   # API sur :3000 (terminal 1)
npm run dev:web                   # front sur :5173, proxy /api vers :3000 (terminal 2)
```

Avec `DEV_LOGIN=1` (ignoré sur Vercel), `http://localhost:5173/api/auth/dev?pseudo=Tom` connecte sans Discord en admin.

`npm run migrate` applique les migrations sur la base pointée par `DATABASE_URL` (pratique pour préparer Turso avant le premier déploiement).

## Ajouter une fonctionnalité

Le code est découpé en modules, une fonctionnalité = un module serveur + une page front.

**Serveur**

1. `server/src/modules/ma-feature.js` exporte un plugin Fastify (`export default async function (app) { ... }`).
2. L'ajouter dans `server/src/modules/index.js` : ses routes sont servies sous `/api`.
3. Protéger les routes avec `preHandler: app.authenticate` (ou `[app.authenticate, app.requireAdmin]`). Le membre connecté est dans `req.member`, la base dans `app.db` (async : `await db.all / get / run(sql, ...args)`, `db.batch([[sql, ...args]])` pour plusieurs écritures atomiques, `db.tx(async (q) => ...)` pour une transaction). Les clés étrangères ne sont pas garanties côté Turso : faire les suppressions en cascade explicitement.
4. Nouvelles tables : `server/migrations/002_ma_feature.sql`. Appliquée une seule fois au prochain démarrage.
5. Réagir aux événements sans toucher au module planning : `bus.on('event.created', async ({ event, actor }) => ...)` (voir `notify.js`). Publier avec `await publish(...)` : en serverless, rien ne tourne après la réponse. Événements publiés : `event.created`, `event.updated`, `event.deleted`.

**Front**

1. `web/src/pages/MaPage.jsx`.
2. L'ajouter dans `web/src/modules.jsx` (`admin: true` pour la réserver aux admins) : l'onglet apparaît dans la barre.
3. Appels API avec `api.get / post / put / patch / del` (`web/src/api.js`), utilisateur et config via `useMe()`, semaine courante via `useWeek()`.

## Sécurité

- Session en cookie `HttpOnly`, `SameSite=Lax`, `Secure` dès que `PUBLIC_URL` est en https, JWT signé 30 jours.
- `state` OAuth signé contre le CSRF de connexion ; toute écriture API exige l'en-tête `X-Requested-With: staff-planner`.
- Le membre est relu en base à chaque requête : désactiver un compte coupe l'accès immédiatement.
- Validation JSON Schema sur toutes les entrées, requêtes SQL paramétrées, conteneur en utilisateur non root.

## Pistes

Export iCal par membre, rappels Discord avant un événement, événements récurrents, import du Google Sheet actuel, stats de présence, commentaires sur les événements, dispos à la demi-heure.
