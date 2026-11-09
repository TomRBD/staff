import { EventEmitter } from 'node:events';

// Bus interne : les modules publient (event.created...) et d'autres s'y abonnent
// (notifications Discord, export, stats...) sans dépendre les uns des autres.
export const bus = new EventEmitter();
bus.setMaxListeners(50);
