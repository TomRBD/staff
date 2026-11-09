const ERRORS = {
  not_allowed: "Ce compte Discord n'a pas accès au planning. Demande à un admin de t'ajouter.",
  state: 'La connexion a expiré. Relance-la.',
  discord: "Discord n'a pas répondu. Relance la connexion.",
  config: "L'application Discord n'est pas configurée sur le serveur (DISCORD_CLIENT_ID).",
};

export default function Login() {
  const error = ERRORS[new URLSearchParams(window.location.search).get('error')];
  return (
    <div className="login">
      <div className="login-card">
        <p className="brand brand-xl">Staff</p>
        <p className="login-lead">Dispos de l'équipe et planning de la semaine.</p>
        {error && <p className="alert">{error}</p>}
        <a className="btn btn-discord" href="/api/auth/login">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.2a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
          </svg>
          Se connecter avec Discord
        </a>
      </div>
    </div>
  );
}
