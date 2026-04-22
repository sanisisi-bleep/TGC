import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './App.css';
import AppErrorBoundary from './components/AppErrorBoundary';
import Home from './pages/Home';
import Search from './pages/Search';
import Collection from './pages/Collection';
import Decks from './pages/Decks';
import Settings from './pages/Settings';
import SharedDeck from './pages/SharedDeck';
import { ToastProvider } from './context/ToastContext';
import { buildTcgMap, DEFAULT_TCG_SLUG, GAME_CONFIGS, getGameConfig } from './tcgConfig';
import API_BASE from './apiBase';
import {
  clearSessionProfileCache,
  fetchSessionProfile,
  fetchTgcCatalog,
} from './utils/bootstrapCache';

axios.defaults.withCredentials = true;

const TGC_FETCH_RETRY_ATTEMPTS = 2;
const TGC_FETCH_RETRY_DELAY_MS = 350;

const sanitizeTelemetryPayload = (event) => {
  if (!event?.url) {
    return event;
  }

  try {
    const parsedUrl = new URL(event.url);

    if (parsedUrl.pathname.startsWith('/shared-deck/')) {
      parsedUrl.pathname = '/shared-deck/[token]';
    }

    parsedUrl.search = '';

    return {
      ...event,
      url: parsedUrl.toString(),
    };
  } catch (_error) {
    return event;
  }
};

const wait = (durationMs) => new Promise((resolve) => {
  window.setTimeout(resolve, durationMs);
});

const buildAvailableGames = (tgcBySlug) => (
  Object.entries(tgcBySlug)
    .map(([slug, item]) => ({
      ...getGameConfig(slug),
      id: item.id,
    }))
    .filter((game) => game.available)
);

function BootstrapPanel({
  paletteClass = '',
  eyebrow,
  title,
  description,
  action = null,
}) {
  return (
    <div className={`page-shell ${paletteClass}`.trim()}>
      <section className="page-hero">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action}
      </section>
    </div>
  );
}

function SessionBootstrapPanel() {
  return (
    <BootstrapPanel
      eyebrow="Sesion"
      title="Preparando la aplicacion"
      description="Comprobando tu sesion y cargando el estado inicial antes de mostrar el contenido."
    />
  );
}

function TgcBootstrapPanel({ activeGame, error, onRetry }) {
  const action = error ? (
    <button type="button" className="logout-button" onClick={onRetry}>
      Reintentar carga
    </button>
  ) : null;

  return (
    <BootstrapPanel
      paletteClass={activeGame.palette}
      eyebrow={activeGame.eyebrow}
      title={error ? 'No se pudo preparar el catalogo' : `Preparando ${activeGame.shortName}`}
      description={
        error
          ? `No pudimos cargar la configuracion de ${activeGame.shortName}. Reintenta sin tener que refrescar toda la pagina.`
          : `Preparando ${activeGame.shortName} para que el buscador entre ya con el juego activo correcto.`
      }
      action={action}
    />
  );
}

function SiteNavigation({
  isAuthenticated,
  navGames,
  activeTcgSlug,
  onSelectGame,
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
              <li><button className="logout-button" onClick={handleLogout}>Cerrar Sesion</button></li>
            </ul>
          </div>
        ) : (
          <ul className="nav-links">
            <li><Link to="/" onClick={closeMobileMenu}>Inicio</Link></li>
          </ul>
        )}
      </div>
    </nav>
  );
}

function ProtectedGameRoute({
  isAuthenticated,
  isBlocked,
  fallback,
  resetKey,
  children,
}) {
  if (!isAuthenticated) {
    return <Navigate to="/" />;
  }

  if (isBlocked) {
    return fallback;
  }

  return (
    <AppErrorBoundary resetKey={resetKey}>
      {children}
    </AppErrorBoundary>
  );
}

function App() {
  const [token, setToken] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeTcgSlug, setActiveTcgSlug] = useState(localStorage.getItem('activeTcgSlug') || DEFAULT_TCG_SLUG);
  const [tgcBySlug, setTgcBySlug] = useState({});
  const [loadingTgcs, setLoadingTgcs] = useState(true);
  const [tgcLoadError, setTgcLoadError] = useState(null);
  const [tgcReloadNonce, setTgcReloadNonce] = useState(0);

  const updateActiveTcgSlug = useCallback((nextSlug) => {
    const normalizedSlug = (nextSlug || DEFAULT_TCG_SLUG).trim() || DEFAULT_TCG_SLUG;
    localStorage.setItem('activeTcgSlug', normalizedSlug);
    setActiveTcgSlug(normalizedSlug);
  }, []);

  const clearSession = useCallback(() => {
    clearSessionProfileCache();
    setToken(null);
  }, []);

  const handleLoginSuccess = useCallback(() => {
    clearSessionProfileCache();
    setToken('cookie-session');
    setAuthReady(true);
  }, []);

  const retryTgcLoad = useCallback(() => {
    setTgcReloadNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const bootstrapSession = async () => {
      try {
        await fetchSessionProfile(
          () => axios.get(`${API_BASE}/settings/me`, {
            headers: {
              Accept: 'application/json',
            },
          }).then((response) => response.data || null),
          { forceRefresh: true }
        );

        if (!isCancelled) {
          setToken('cookie-session');
        }
      } catch (_error) {
        if (!isCancelled) {
          setToken(null);
        }
      } finally {
        if (!isCancelled) {
          setAuthReady(true);
        }
      }
    };

    bootstrapSession();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          clearSession();
        }

        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [clearSession]);

  useEffect(() => {
    let isCancelled = false;

    const fetchTgcs = async () => {
      setLoadingTgcs(true);
      setTgcLoadError(null);

      let lastError = null;

      for (let attempt = 1; attempt <= TGC_FETCH_RETRY_ATTEMPTS; attempt += 1) {
        try {
          const tgcList = await fetchTgcCatalog(
            () => axios.get(`${API_BASE}/tgc`).then((response) => (
              Array.isArray(response.data) ? response.data : []
            )),
            { forceRefresh: tgcReloadNonce > 0 }
          );
          if (isCancelled) {
            return;
          }

          setTgcBySlug(buildTcgMap(tgcList));
          setLoadingTgcs(false);
          return;
        } catch (error) {
          lastError = error;

          if (attempt < TGC_FETCH_RETRY_ATTEMPTS) {
            await wait(TGC_FETCH_RETRY_DELAY_MS);
          }
        }
      }

      if (!isCancelled) {
        console.error('Error al cargar TCGs:', lastError);
        setTgcLoadError(lastError);
        setLoadingTgcs(false);
      }
    };

    fetchTgcs();

    return () => {
      isCancelled = true;
    };
  }, [token, tgcReloadNonce]);

  useEffect(() => {
    if (loadingTgcs || tgcBySlug[activeTcgSlug]) {
      return;
    }

    const fallbackSlug = Object.keys(tgcBySlug).find((slug) => GAME_CONFIGS[slug]?.available)
      || DEFAULT_TCG_SLUG;
    updateActiveTcgSlug(fallbackSlug);
  }, [activeTcgSlug, loadingTgcs, tgcBySlug, updateActiveTcgSlug]);

  const logout = useCallback(async () => {
    try {
      await axios.post(`${API_BASE}/auth/logout`);
    } catch (_error) {
      // The local session still needs to be cleared even if the network request fails.
    } finally {
      clearSession();
      setAuthReady(true);
    }
  }, [clearSession]);

  const isAuthenticated = authReady && Boolean(token);
  const activeGame = getGameConfig(activeTcgSlug);
  const activeTgc = tgcBySlug[activeTcgSlug] || null;
  const availableGames = useMemo(() => buildAvailableGames(tgcBySlug), [tgcBySlug]);
  const fallbackGames = useMemo(
    () => Object.values(GAME_CONFIGS).filter((game) => game.available),
    []
  );
  const navGames = availableGames.length > 0 ? availableGames : fallbackGames;
  const shouldBlockProtectedGameRoutes = isAuthenticated && (loadingTgcs || !activeTgc || Boolean(tgcLoadError));
  const protectedGameFallback = (
    <TgcBootstrapPanel
      activeGame={activeGame}
      error={tgcLoadError}
      onRetry={retryTgcLoad}
    />
  );

  return (
    <Router>
      <ToastProvider>
        <div className={`App ${activeGame.palette}`}>
          {!authReady ? (
            <main className="main-content">
              <SessionBootstrapPanel />
            </main>
          ) : (
            <>
              <SiteNavigation
                isAuthenticated={isAuthenticated}
                navGames={navGames}
                activeTcgSlug={activeTcgSlug}
                onSelectGame={updateActiveTcgSlug}
                onLogout={logout}
              />

              <main className="main-content">
                <Routes>
                  <Route
                    path="/"
                    element={
                      <Home
                        token={isAuthenticated ? token : null}
                        onLoginSuccess={handleLoginSuccess}
                        activeTcgSlug={activeTcgSlug}
                        setActiveTcgSlug={updateActiveTcgSlug}
                        availableGames={navGames}
                      />
                    }
                  />
                  <Route
                    path="/search"
                    element={
                      <ProtectedGameRoute
                        isAuthenticated={isAuthenticated}
                        isBlocked={shouldBlockProtectedGameRoutes}
                        fallback={protectedGameFallback}
                        resetKey={`search-${activeTcgSlug}-${activeTgc?.id || 'pending'}`}
                      >
                        <Search
                          key={`${activeTcgSlug}-${activeTgc?.id || 'pending'}`}
                          activeTcgSlug={activeTcgSlug}
                          activeTgc={activeTgc}
                        />
                      </ProtectedGameRoute>
                    }
                  />
                  <Route
                    path="/collection"
                    element={
                      <ProtectedGameRoute
                        isAuthenticated={isAuthenticated}
                        isBlocked={shouldBlockProtectedGameRoutes}
                        fallback={protectedGameFallback}
                        resetKey={`collection-${activeTcgSlug}-${activeTgc?.id || 'pending'}`}
                      >
                        <Collection
                          key={`${activeTcgSlug}-${activeTgc?.id || 'pending'}`}
                          activeTcgSlug={activeTcgSlug}
                          activeTgc={activeTgc}
                        />
                      </ProtectedGameRoute>
                    }
                  />
                  <Route
                    path="/decks"
                    element={
                      <ProtectedGameRoute
                        isAuthenticated={isAuthenticated}
                        isBlocked={shouldBlockProtectedGameRoutes}
                        fallback={protectedGameFallback}
                        resetKey={`decks-${activeTcgSlug}-${activeTgc?.id || 'pending'}`}
                      >
                        <Decks
                          key={`${activeTcgSlug}-${activeTgc?.id || 'pending'}`}
                          activeTcgSlug={activeTcgSlug}
                          activeTgc={activeTgc}
                        />
                      </ProtectedGameRoute>
                    }
                  />
                  <Route path="/shared-deck/:shareToken" element={<SharedDeck />} />
                  <Route path="/settings" element={isAuthenticated ? <Settings /> : <Navigate to="/" />} />
                </Routes>
              </main>
            </>
          )}
          <Analytics beforeSend={sanitizeTelemetryPayload} />
          <SpeedInsights beforeSend={sanitizeTelemetryPayload} />
        </div>
      </ToastProvider>
    </Router>
  );
}

export default App;
