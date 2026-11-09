// Registre des modules API. Pour ajouter une fonctionnalité :
// 1. créer modules/ma-feature.js qui exporte un plugin Fastify
// 2. l'ajouter à cette liste (ses routes seront préfixées par /api)
// 3. si besoin, une migration SQL dans migrations/ (numérotée)
import auth from './auth.js';
import members from './members.js';
import availability from './availability.js';
import eventTypes from './event-types.js';
import events from './events.js';
import notify from './notify.js';

export const modules = [auth, members, availability, eventTypes, events, notify];
