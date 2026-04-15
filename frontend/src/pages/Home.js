import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { GAME_CONFIGS, getGameConfig } from '../tcgConfig';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const PUBLIC_GAME_OPTIONS = Object.values(GAME_CONFIGS);

function Home({ token, setToken, activeTcgSlug, setActiveTcgSlug, availableGames }) {
  const navigate = useNavigate();
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [registerData, setRegisterData] = useState({ username: '', email: '', password: '' });
  const [isRegister, setIsRegister] = useState(false);
  const activeGame = getGameConfig(activeTcgSlug);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isRegister) {
        await axios.post(`${API_BASE}/auth/register`, registerData);
        alert('Registrado exitosamente');
        setIsRegister(false);
      } else {
        const res = await axios.post(`${API_BASE}/auth/token`, loginData);
        setToken(res.data.access_token);
        localStorage.setItem('token', res.data.access_token);
      }
    } catch (err) {
      alert(isRegister ? 'Error en registro' : 'Error en login');
    }
  };

  const handleGameSelect = (game) => {
    if (!game.available) {
      return;
    }

    setActiveTcgSlug(game.slug);
    if (token) {
      navigate('/search');
    }
  };

  if (token) {
    return (
      <div className="home home-dashboard">
        <section className="page-hero home-hero home-hero-logged">
          <div className="home-hero-copy">
            <span className="eyebrow">Hub multijuego</span>
            <h1>Elige el TCG con el que quieres trabajar</h1>
            <p>
              Cambia entre sistemas compatibles desde el mismo puente. La zona activa
              actual es {activeGame.shortName} y el resto de modulos creceran desde la misma base.
            </p>
          </div>

          <div className="hero-stat">
            <span>Sistema activo</span>
            <strong>{activeGame.shortName}</strong>
          </div>
        </section>

        <section className="game-grid home-game-grid">
          {availableGames.map((game) => (
            <article key={game.slug} className={`game-card ${game.accentClass} ${activeTcgSlug === game.slug ? 'is-selected' : ''}`}>
              <div className="game-card-top">
                <span className="game-chip">{activeTcgSlug === game.slug ? 'En cubierta' : 'Disponible'}</span>
                <h2>{game.name}</h2>
              </div>
              <p>{game.description}</p>
              <button
                type="button"
                className={`game-card-button ${game.available ? 'is-available' : 'is-disabled'}`}
                onClick={() => handleGameSelect(game)}
                disabled={!game.available}
              >
                {activeTcgSlug === game.slug ? `Seguir en ${game.shortName}` : `Entrar en ${game.shortName}`}
              </button>
            </article>
          ))}
        </section>
      </div>
    );
  }

  return (
    <div className="home home-landing">
      <section className="home-landing-grid">
        <div className="home-landing-main">
          <section className="page-hero home-hero home-hero-public">
            <div className="home-hero-copy">
              <span className="eyebrow">Coleccion centralizada</span>
              <h1>Un centro de mando para varios TCG</h1>
              <p>
                Organiza cartas, colecciones y mazos desde una sola interfaz. Gundam y
                One Piece ya comparten base de operaciones mientras Magic queda preparado para la siguiente fase.
              </p>
            </div>

            <div className="hero-stat hero-stat-compact">
              <span>Modulos iniciales</span>
              <strong>3</strong>
            </div>
          </section>

          <section className="game-grid home-game-grid">
            {PUBLIC_GAME_OPTIONS.map((game) => (
              <article key={game.slug} className={`game-card ${game.accentClass}`}>
                <div className="game-card-top">
                  <span className="game-chip">{game.available ? 'Disponible' : 'Proximamente'}</span>
                  <h2>{game.name}</h2>
                </div>
                <p>{game.description}</p>
                {game.available ? (
                  <button
                    type="button"
                    className="game-card-button is-available"
                    onClick={() => handleGameSelect(game)}
                  >
                    Entrar en {game.shortName}
                  </button>
                ) : (
                  <div className="game-card-soon">Disponible pronto</div>
                )}
              </article>
            ))}
          </section>
        </div>

        <aside className="auth-shell">
          <div className="auth-container auth-home-card">
            <div className="auth-copy">
              <span className="eyebrow">Acceso</span>
              <h2>Entra en el hangar</h2>
              <p>Inicia sesion o crea tu perfil para entrar en Gundam o zarpar hacia One Piece.</p>
            </div>

            <div className="auth-toggle">
              <button onClick={() => setIsRegister(false)} className={!isRegister ? 'active' : ''}>Iniciar Sesion</button>
              <button onClick={() => setIsRegister(true)} className={isRegister ? 'active' : ''}>Registrarse</button>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              {isRegister ? (
                <>
                  <input type="text" placeholder="Usuario" onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })} required />
                  <input type="email" placeholder="Email" onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })} required />
                  <input type="password" placeholder="Contrasena" onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })} required />
                </>
              ) : (
                <>
                  <input type="text" placeholder="Usuario" onChange={(e) => setLoginData({ ...loginData, username: e.target.value })} required />
                  <input type="password" placeholder="Contrasena" onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} required />
                </>
              )}
              <button type="submit">{isRegister ? 'Registrarse' : 'Iniciar Sesion'}</button>
            </form>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default Home;
