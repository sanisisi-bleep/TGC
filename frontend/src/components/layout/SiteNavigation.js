import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

function SiteNavigation({
  isAuthenticated,
  navGames,
  activeTcgSlug,
  themeMode,
  showInstallAction,
  installButtonLabel,
  onInstallApp,
  onSelectGame,
  onToggleTheme,
  onLogout,
}) {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeTcgSlug, isAuthenticated, location.pathname]);

  const handleSelectGame = (slug) => {
    onSelectGame(slug);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = () => {
    setIsMobileMenuOpen(false);
    onLogout();
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const handleInstall = useCallback(() => {
    setIsMobileMenuOpen(false);
    onInstallApp();
  }, [onInstallApp]);

  const themeToggleLabel = themeMode === 'dark'
    ? 'Cambiar a modo claro'
    : 'Cambiar a modo oscuro';
  const themeToggleIcon = themeMode === 'dark' ? '\u2600' : '\u263e';

  const installAction = useMemo(() => {
    if (!showInstallAction) {
      return null;
    }

    return (
      <li>
        <button
          type="button"
          className="nav-install-button"
          onClick={handleInstall}
        >
          {installButtonLabel}
        </button>
      </li>
    );
  }, [handleInstall, installButtonLabel, showInstallAction]);

  return (
    <nav className="navbar">
      <div className="nav-header">
        <div className="nav-brand">
          <Link to="/" onClick={closeMobileMenu}>Multiverse TCG Manager</Link>
        </div>
        <button
          type="button"
          className={`nav-menu-toggle ${isMobileMenuOpen ? 'is-open' : ''}`}
          aria-expanded={isMobileMenuOpen}
          aria-controls="site-navigation-panel"
          aria-label={isMobileMenuOpen ? 'Cerrar menu' : 'Abrir menu'}
          onClick={() => setIsMobileMenuOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div
        id="site-navigation-panel"
        className={`nav-menu-panel ${isMobileMenuOpen ? 'is-open' : ''}`}
      >
        {isAuthenticated ? (
          <div className="nav-session">
            <div className="nav-game-switcher" aria-label="Juego activo">
              {navGames.map((game) => (
                <button
                  key={game.slug}
                  type="button"
                  className={`nav-game-pill ${activeTcgSlug === game.slug ? 'is-active' : ''}`}
                  onClick={() => handleSelectGame(game.slug)}
                >
                  {game.shortName}
                </button>
              ))}
            </div>
            <ul className="nav-links">
              <li><Link to="/search" onClick={closeMobileMenu}>Buscar Cartas</Link></li>
              <li><Link to="/collection" onClick={closeMobileMenu}>Mi Coleccion</Link></li>
              <li><Link to="/decks" onClick={closeMobileMenu}>Mis Mazos</Link></li>
              <li><Link to="/settings" onClick={closeMobileMenu}>Configuracion</Link></li>
              {installAction}
              <li>
                <button
                  type="button"
                  className="nav-theme-toggle"
                  aria-pressed={themeMode === 'dark'}
                  aria-label={themeToggleLabel}
                  title={themeToggleLabel}
                  onClick={onToggleTheme}
                >
                  <span aria-hidden="true" className="nav-theme-toggle-icon">{themeToggleIcon}</span>
                  <span className="sr-only">{themeToggleLabel}</span>
                </button>
              </li>
              <li><button className="logout-button" onClick={handleLogout}>Cerrar Sesion</button></li>
            </ul>
          </div>
        ) : (
          <div className="nav-session nav-session-public">
            <ul className="nav-links">
              <li><Link to="/" onClick={closeMobileMenu}>Inicio</Link></li>
              {installAction}
              <li>
                <button
                  type="button"
                  className="nav-theme-toggle"
                  aria-pressed={themeMode === 'dark'}
                  aria-label={themeToggleLabel}
                  title={themeToggleLabel}
                  onClick={onToggleTheme}
                >
                  <span aria-hidden="true" className="nav-theme-toggle-icon">{themeToggleIcon}</span>
                  <span className="sr-only">{themeToggleLabel}</span>
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>
    </nav>
  );
}

export default SiteNavigation;
