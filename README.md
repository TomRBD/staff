# Staff Planner

Planning d'équipe fait maison : dispos de chaque membre, vue d'équipe, planning de la semaine.
Node 20 + Fastify + SQLite côté serveur, React + Vite côté front, connexion Discord, un seul conteneur Docker.

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

## 2. Déployer sur le VPS

```bash
cp .env.example .env
openssl rand -hex 32          # à coller dans JWT_SECRET
nano .env                     # PUBLIC_URL, DISCORD_*, ADMIN_DISCORD_IDS
docker compose up -d --build
```

Le conteneur écoute sur `127.0.0.1:3000`. Mettre un reverse proxy HTTPS devant, par exemple Caddy :

```
planning.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

La base SQLite vit dans le volume `planner-data`. Les migrations s'appliquent seules au démarrage.

Sauvegarde à chaud :

```bash
docker compose exec planner node -e "new (require('better-sqlite3'))('/data/planner.db').backup('/data/backup.db').then(()=>console.log('ok'))"
docker compose cp planner:/data/backup.db ./backup-$(date +%F).db
```

## 3. Développer en local

```bash
cp .env.example .env    # PUBLIC_URL=http://localhost:5173, JWT_SECRET, DEV_LOGIN=1
cd server && npm install && npm run dev      # API sur :3000
cd web && npm install && npm run dev         # front sur :5173, proxy /api vers :3000
```

Avec `DEV_LOGIN=1` (jamais en production), `http://localhost:5173/api/auth/dev?pseudo=Tom` connecte sans Discord en admin.

## Ajouter une fonctionnalité

Le code est découpé en modules, une fonctionnalité = un module serveur + une page front.

**Serveur**

1. `server/src/modules/ma-feature.js` exporte un plugin Fastify (`export default async function (app) { ... }`).
2. L'ajouter dans `server/src/modules/index.js` : ses routes sont servies sous `/api`.
3. Protéger les routes avec `preHandler: app.authenticate` (ou `[app.authenticate, app.requireAdmin]`). Le membre connecté est dans `req.member`, la base dans `app.db`.
4. Nouvelles tables : `server/migrations/002_ma_feature.sql`. Appliquée une seule fois au prochain démarrage.
5. Réagir aux événements sans toucher au module planning : `bus.on('event.created', ({ event, actor }) => ...)` (voir `notify.js`). Événements publiés : `event.created`, `event.updated`, `event.deleted`.

**Front**

1. `web/src/pages/MaPage.jsx`.
2. L'ajouter dans `web/src/modules.jsx` (`admin: true` pour la réserver aux admins) : l'onglet apparaît dans la barre.
3. Appels API avec `api.get / post / put / patch / del` (`web/src/api.js`), utilisateur et config via `useMe()`, semaine courante via `useWeek()`.

## Sécurité

- Session en cookie `HttpOnly`, `SameSite=Lax`, `Secure` dès que `PUBLIC_URL` est en https, JWT signé 30 jours.
- `state` OAuth signé contre le CSRF de connexion ; toute écriture API exige l'en-tête `X-Requested-With: staff-planner`.
- Le membre est relu en base à chaque requête : désactiver un compte coupe l'accès immédiatement.
- Validation JSON Schema sur toutes les entrées, requêtes SQL préparées, conteneur en utilisateur non root.

## Pistes

Export iCal par membre, rappels Discord avant un événement, événements récurrents, import du Google Sheet actuel, stats de présence, commentaires sur les événements, dispos à la demi-heure.
