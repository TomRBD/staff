import { EventEmitter } from 'node:events';

// Bus interne : les modules publient (event.created...) et d'autres s'y abonnent
// (notifications Discord, export, stats...) sans dépendre les uns des autres.
export const bus = new EventEmitter();
bus.setMaxListeners(50);

// Publie et attend les abonnés : en serverless, rien ne doit tourner après la réponse.
export async function publish(name, payload) {
  await Promise.allSettled(bus.listeners(name).map((fn) => fn(payload)));
}
