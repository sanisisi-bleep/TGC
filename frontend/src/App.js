import React, { useState, useEffect } from 'react';
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

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [activeTcgSlug, setActiveTcgSlug] = useState(localStorage.getItem('activeTcgSlug') || DEFAULT_TCG_SLUG);
  const [tgcBySlug, setTgcBySlug] = useState({});

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      return;
    }

    delete axios.defaults.headers.common.Authorization;
  }, [token]);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          delete axios.defaults.headers.common.Authorization;
          localStorage.removeItem('token');
          setToken(null);
        }

        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('activeTcgSlug', activeTcgSlug);
  }, [activeTcgSlug]);

  useEffect(() => {
    const fetchTgcs = async () => {
      try {
        const response = await axios.get(`${API_BASE}/tgc`);
        setTgcBySlug(buildTcgMap(Array.isArray(response.data) ? response.data : []));
      } catch (error) {
        console.error('Error al cargar TCGs:', error);
      }
    };

    fetchTgcs();
  }, []);

  const logout = () => {
    setToken(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common.Authorization;
  };

  const activeGame = getGameConfig(activeTcgSlug);
  const activeTgc = tgcBySlug[activeTcgSlug] || null;
  const availableGames = Object.values(tgcBySlug)
    .map((item) => ({
      ...getGameConfig(Object.keys(tgcBySlug).find((slug) => tgcBySlug[slug]?.id === item.id) || DEFAULT_TCG_SLUG),
      id: item.id,
    }))
    .filter((game) => game.available);
  const fallbackGames = Object.values(GAME_CONFIGS).filter((game) => game.available);
  const navGames = availableGames.length > 0 ? availableGames : fallbackGames;

  return (
    <Router>
      <ToastProvider>
        <div className={`App ${activeGame.palette}`}>
          <nav className="navbar">
            <div className="nav-brand">
              <Link to="/">Multiverse TCG Manager</Link>
            </div>
            {token ? (
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
                    token={token}
                    setToken={setToken}
                    activeTcgSlug={activeTcgSlug}
                    setActiveTcgSlug={setActiveTcgSlug}
                    availableGames={navGames}
                  />
                }
              />
              <Route
                path="/search"
                element={token ? <Search activeTcgSlug={activeTcgSlug} activeTgc={activeTgc} /> : <Navigate to="/" />}
              />
              <Route
                path="/collection"
                element={token ? <Collection activeTcgSlug={activeTcgSlug} activeTgc={activeTgc} /> : <Navigate to="/" />}
              />
              <Route
                path="/decks"
                element={token ? <Decks activeTcgSlug={activeTcgSlug} activeTgc={activeTgc} /> : <Navigate to="/" />}
              />
              <Route path="/shared-deck/:shareToken" element={<SharedDeck />} />
              <Route path="/settings" element={token ? <Settings /> : <Navigate to="/" />} />
            </Routes>
          </main>
          <Analytics beforeSend={sanitizeTelemetryPayload} />
          <SpeedInsights beforeSend={sanitizeTelemetryPayload} />
        </div>
      </ToastProvider>
    </Router>
  );
}

export default App;
