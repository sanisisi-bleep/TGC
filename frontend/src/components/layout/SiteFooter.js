import React from 'react';
import { Link } from 'react-router-dom';

function SiteFooter({ navGames = [] }) {
  const activeGameNames = navGames.map((game) => game.shortName).join(' | ');

  return (
    <footer className="site-footer">
      <div className="site-footer__content">
        <div className="site-footer__brand">
          <strong>Multiverse TCG Manager</strong>
          <p>
            Buscador, coleccion y mazos en una sola cuenta para seguir creciendo juego a juego.
          </p>
          {activeGameNames && (
            <span className="site-footer__games">{`Activos hoy: ${activeGameNames}`}</span>
          )}
        </div>

        <nav className="site-footer__nav" aria-label="Enlaces del sitio">
          <Link to="/">Inicio</Link>
          <Link to="/updates">Novedades</Link>
          <Link to="/guides">Guias</Link>
          <Link to="/contact">Contacto</Link>
          <Link to="/about">Acerca de</Link>
        </nav>
      </div>
    </footer>
  );
}

export default SiteFooter;
