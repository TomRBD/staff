// Applique les migrations sur la base pointée par DATABASE_URL (utile avant un déploiement)
import { client, migrate } from './db.js';

await migrate();
client.close();
console.log('Base à jour');
