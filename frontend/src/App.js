import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './App.css';
import Home from './pages/Home';
import Search from './pages/Search';
import Collection from './pages/Collection';
import Decks from './pages/Decks';
import Settings from './pages/Settings';
import SharedDeck from './pages/SharedDeck';
import { ToastProvider } from './context/ToastContext';
import { buildTcgMap, DEFAULT_TCG_SLUG, GAME_CONFIGS, getGameConfig } from './tcgConfig';
import API_BASE from './apiBase';

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

function TgcBootstrapPanel({ activeGame, error, onRetry }) {
  const isEmptyCatalog = !error;

  return (
    <div className={`page-shell ${activeGame.palette}`}>
      <section className="page-hero">
        <div>
          <span className="eyebrow">{activeGame.eyebrow}</span>
          <h1>{error ? 'No se pudo preparar el catalogo' : `Preparando ${activeGame.shortName}`}</h1>
          <p>
            {error
              ? `No pudimos cargar la configuracion de ${activeGame.shortName}. Reintenta sin tener que refrescar toda la pagina.`
              : `Preparando ${activeGame.shortName} para que el buscador entre ya con el juego activo correcto.`}
          </p>
        </div>
        {!isEmptyCatalog ? (
          <button type="button" className="logout-button" onClick={onRetry}>
            Reintentar carga
          </button>
        ) : null}
      </section>
    </div>
  );
}

function SessionBootstrapPanel() {
  return (
    <div className="page-shell">
      <section className="page-hero">
        <div>
          <span className="eyebrow">Sesion</span>
          <h1>Preparando la aplicacion</h1>
          <p>Comprobando tu sesion y cargando el estado inicial antes de mostrar el contenido.</p>
        </div>
      </section>
    </div>
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

  const clearSession = useCallback(() => {
    delete axios.defaults.headers.common.Authorization;
    localStorage.removeItem('token');
    setToken(null);
  }, []);

  const handleLoginSuccess = useCallback((nextToken) => {
    if (!nextToken) {
      clearSession();
      setAuthReady(true);
      return;
    }

    localStorage.setItem('token', nextToken);
    setToken(nextToken);
    setAuthReady(true);
  }, [clearSession]);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      return;
    }

    delete axios.defaults.headers.common.Authorization;
  }, [token]);

  useEffect(() => {
    let isCancelled = false;

    const bootstrapSession = async () => {
      const storedToken = localStorage.getItem('token');

      if (!storedToken) {
        if (!isCancelled) {
          setToken(null);
          setAuthReady(true);
        }
        return;
      }

      try {
        await axios.get(`${API_BASE}/settings/me`, {
          headers: {
            Authorization: `Bearer ${storedToken}`,
            Accept: 'application/json',
          },
        });

        if (!isCancelled) {
          setToken(storedToken);
        }
      } catch (error) {
        if (!isCancelled) {
          console.warn('Sesion almacenada no valida, limpiando token local.');
          localStorage.removeItem('token');
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
  }, [clearSession]);

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
    localStorage.setItem('activeTcgSlug', activeTcgSlug);
  }, [activeTcgSlug]);

  useEffect(() => {
    let isCancelled = false;

    const fetchTgcs = async () => {
      setLoadingTgcs(true);
      setTgcLoadError(null);

      let lastError = null;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const response = await axios.get(`${API_BASE}/tgc`);
          if (isCancelled) {
            return;
          }

          const nextTgcMap = buildTcgMap(Array.isArray(response.data) ? response.data : []);
          setTgcBySlug(nextTgcMap);

          setLoadingTgcs(false);
          return;
        } catch (error) {
          lastError = error;

          if (attempt < 2) {
            await new Promise((resolve) => {
              window.setTimeout(resolve, 350);
            });
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
    setActiveTcgSlug(fallbackSlug);
  }, [activeTcgSlug, loadingTgcs, tgcBySlug]);

  const logout = () => {
    clearSession();
    setAuthReady(true);
  };

  const isAuthenticated = authReady && Boolean(token);
  const activeGame = getGameConfig(activeTcgSlug);
  const activeTgc = tgcBySlug[activeTcgSlug] || null;
  const isResolvingActiveTgc = isAuthenticated && loadingTgcs && !activeTgc;
  const shouldShowTgcBootstrapPanel = isAuthenticated && !activeTgc;
  const availableGames = Object.values(tgcBySlug)
    .map((item) => ({
      ...getGameConfig(Object.keys(tgcBySlug).find((slug) => tgcBySlug[slug]?.id === item.id) || DEFAULT_TCG_SLUG),
      id: item.id,
    }))
    .filter((game) => game.available);
  const fallbackGames = Object.values(GAME_CONFIGS).filter((game) => game.available);
  const navGames = availableGames.length > 0 ? availableGames : fallbackGames;
  const protectedCatalogFallback = (
    <TgcBootstrapPanel
      activeGame={activeGame}
      error={tgcLoadError}
      onRetry={() => setTgcReloadNonce((current) => current + 1)}
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
          <nav className="navbar">
            <div className="nav-brand">
              <Link to="/">Multiverse TCG Manager</Link>
            </div>
            {isAuthenticated ? (
              <div className="nav-session">
                <div className="nav-game-switcher" aria-label="Juego activo">
                  {navGames.map((game) => (
                    <button
                      key={game.slug}
                      type="button"
                      className={`nav-game-pill ${activeTcgSlug === game.slug ? 'is-active' : ''}`}
                      onClick={() => setActiveTcgSlug(game.slug)}
                    >
                      {game.shortName}
                    </button>
                  ))}
                </div>
                <ul className="nav-links">
                <li><Link to="/search">Buscar Cartas</Link></li>
                <li><Link to="/collection">Mi Coleccion</Link></li>
                <li><Link to="/decks">Mis Mazos</Link></li>
                <li><Link to="/settings">Configuracion</Link></li>
                <li><button className="logout-button" onClick={logout}>Cerrar Sesion</button></li>
                </ul>
              </div>
            ) : (
              <ul className="nav-links">
                <li><Link to="/">Inicio</Link></li>
              </ul>
            )}
          </nav>
          <main className="main-content">
            <Routes>
              <Route
                path="/"
                element={
                  <Home
                    token={isAuthenticated ? token : null}
                    onLoginSuccess={handleLoginSuccess}
                    activeTcgSlug={activeTcgSlug}
                    setActiveTcgSlug={setActiveTcgSlug}
                    availableGames={navGames}
                  />
                }
              />
              <Route
                path="/search"
                element={
                  isAuthenticated
                    ? (shouldShowTgcBootstrapPanel && (isResolvingActiveTgc || tgcLoadError || !activeTgc)
                      ? protectedCatalogFallback
                      : <Search key={`${activeTcgSlug}-${activeTgc?.id || 'ready'}`} activeTcgSlug={activeTcgSlug} activeTgc={activeTgc} />)
                    : <Navigate to="/" />
                }
              />
              <Route
                path="/collection"
                element={
                  isAuthenticated
                    ? (shouldShowTgcBootstrapPanel && (isResolvingActiveTgc || tgcLoadError || !activeTgc)
                      ? protectedCatalogFallback
                      : <Collection key={`${activeTcgSlug}-${activeTgc?.id || 'ready'}`} activeTcgSlug={activeTcgSlug} activeTgc={activeTgc} />)
                    : <Navigate to="/" />
                }
              />
              <Route
                path="/decks"
                element={
                  isAuthenticated
                    ? (shouldShowTgcBootstrapPanel && (isResolvingActiveTgc || tgcLoadError || !activeTgc)
                      ? protectedCatalogFallback
                      : <Decks key={`${activeTcgSlug}-${activeTgc?.id || 'ready'}`} activeTcgSlug={activeTcgSlug} activeTgc={activeTgc} />)
                    : <Navigate to="/" />
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
