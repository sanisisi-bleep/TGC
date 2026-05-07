import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const normalizeReturnTo = (pathname) => {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) {
    return '/search';
  }

  return pathname;
};

const buildAuthHref = (mode, returnTo) => {
  const params = new URLSearchParams();
  params.set('auth', mode);
  params.set('returnTo', normalizeReturnTo(returnTo));
  return `/?${params.toString()}`;
};

function GuestDemoBanner({
  title = 'Estas viendo una demo',
  description = 'Explora esta seccion en modo lectura. Registrate o inicia sesion para guardar cambios y usar todas las herramientas.',
}) {
  const location = useLocation();
  const returnTo = normalizeReturnTo(location.pathname);

  return (
    <section className="panel guest-demo-banner" aria-label="Modo demo para invitados">
      <div className="guest-demo-copy">
        <span className="eyebrow">Modo demo</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      <div className="guest-demo-actions">
        <Link className="guest-demo-primary-link" to={buildAuthHref('register', returnTo)}>
          Registrarse
        </Link>
        <Link className="guest-demo-secondary-link" to={buildAuthHref('login', returnTo)}>
          Iniciar sesion
        </Link>
      </div>

      <div className="guest-demo-links" aria-label="Secciones demo">
        <Link to="/search">Buscar</Link>
        <Link to="/collection">Mi coleccion</Link>
        <Link to="/decks">Mazos</Link>
      </div>
    </section>
  );
}

export default GuestDemoBanner;
