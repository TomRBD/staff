// Registre des pages. Pour ajouter une fonctionnalité côté front :
// créer pages/MaPage.jsx puis l'ajouter ici (admin: true = visible des admins seulement).
import Planning from './pages/Planning.jsx';
import Availability from './pages/Availability.jsx';
import Team from './pages/Team.jsx';
import Admin from './pages/Admin.jsx';

export const modules = [
  { path: 'planning', label: 'Planning', element: <Planning /> },
  { path: 'dispos', label: 'Mes dispos', element: <Availability /> },
  { path: 'equipe', label: 'Équipe', element: <Team /> },
  { path: 'admin', label: 'Admin', element: <Admin />, admin: true },
];
