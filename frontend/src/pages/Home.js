import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { GAME_CONFIGS, getGameConfig } from '../tcgConfig';
import API_BASE from '../apiBase';

const PUBLIC_GAME_OPTIONS = Object.values(GAME_CONFIGS);

const VALIDATION_MESSAGE_MAP = {
  'String should have at least 3 characters': 'El usuario debe tener al menos 3 caracteres.',
  'String should have at least 5 characters': 'El email debe tener al menos 5 caracteres.',
  'String should have at least 8 characters': 'La contrasena debe tener al menos 8 caracteres.',
  'Username may only contain letters, numbers, dots, hyphens, and underscores': 'El usuario solo puede contener letras, numeros, puntos, guiones y guiones bajos.',
  'Invalid email format': 'El email no tiene un formato valido.',
  'Invalid username format': 'El usuario no tiene un formato valido.',
};

const FIELD_LABELS = {
  username: 'Usuario',
  email: 'Email',
  password: 'Contrasena',
};

const translateValidationMessage = (message) => VALIDATION_MESSAGE_MAP[message] || message;

const formatValidationError = (error) => {
  const message = translateValidationMessage(error?.msg || 'Dato no valido');
  const fieldName = Array.isArray(error?.loc) ? error.loc[error.loc.length - 1] : '';
  const label = FIELD_LABELS[fieldName];

  return label ? `${label}: ${message}` : message;
};

const getAuthErrorMessage = (error, isRegister) => {
  const detail = error?.response?.data?.detail;

  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map(formatValidationError).join(' ');
  }

  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (error?.response?.status === 422) {
    return isRegister
      ? 'Revisa los datos del registro. La contrasena debe tener al menos 8 caracteres.'
      : 'Revisa los datos del login antes de volver a intentarlo.';
  }

  return isRegister ? 'No se pudo completar el registro.' : 'No se pudo iniciar sesion.';
};

function Home({ token, setToken, activeTcgSlug, setActiveTcgSlug, availableGames }) {
  const navigate = useNavigate();
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [registerData, setRegisterData] = useState({ username: '', email: '', password: '' });
  const [isRegister, setIsRegister] = useState(false);
  const [authMessage, setAuthMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeGame = getGameConfig(activeTcgSlug);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setAuthMessage(null);
    setIsSubmitting(true);

    try {
      if (isRegister) {
        await axios.post(`${API_BASE}/auth/register`, registerData);
        setAuthMessage({
          type: 'success',
          text: 'Registro completado. Ya puedes iniciar sesion con tu usuario.',
        });
        setRegisterData({ username: '', email: '', password: '' });
        setIsRegister(false);
      } else {
        const res = await axios.post(`${API_BASE}/auth/token`, loginData);
        setToken(res.data.access_token);
        localStorage.setItem('token', res.data.access_token);
      }
    } catch (err) {
      setAuthMessage({
        type: 'error',
        text: getAuthErrorMessage(err, isRegister),
      });
    } finally {
      setIsSubmitting(false);
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
              <button
                onClick={() => {
                  setIsRegister(false);
                  setAuthMessage(null);
                }}
                className={!isRegister ? 'active' : ''}
                type="button"
              >
                Iniciar Sesion
              </button>
              <button
                onClick={() => {
                  setIsRegister(true);
                  setAuthMessage(null);
                }}
                className={isRegister ? 'active' : ''}
                type="button"
              >
                Registrarse
              </button>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              {authMessage && (
                <div
                  className={`auth-feedback ${authMessage.type === 'error' ? 'is-error' : 'is-success'}`}
                  role="alert"
                  aria-live="polite"
                >
                  {authMessage.text}
                </div>
              )}

              {isRegister ? (
                <>
                  <input
                    type="text"
                    placeholder="Usuario"
                    value={registerData.username}
                    minLength={3}
                    maxLength={50}
                    autoComplete="username"
                    onChange={(e) => {
                      setAuthMessage(null);
                      setRegisterData({ ...registerData, username: e.target.value });
                    }}
                    required
                  />
                  <p className="auth-helper-text">Usa letras, numeros, puntos, guiones o guion bajo.</p>
                  <input
                    type="email"
                    placeholder="Email"
                    value={registerData.email}
                    maxLength={100}
                    autoComplete="email"
                    onChange={(e) => {
                      setAuthMessage(null);
                      setRegisterData({ ...registerData, email: e.target.value });
                    }}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Contrasena"
                    value={registerData.password}
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    onChange={(e) => {
                      setAuthMessage(null);
                      setRegisterData({ ...registerData, password: e.target.value });
                    }}
                    required
                  />
                  <p className="auth-helper-text">La contrasena debe tener entre 8 y 72 caracteres.</p>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Usuario o email"
                    value={loginData.username}
                    maxLength={100}
                    autoComplete="username"
                    onChange={(e) => {
                      setAuthMessage(null);
                      setLoginData({ ...loginData, username: e.target.value });
                    }}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Contrasena"
                    value={loginData.password}
                    maxLength={72}
                    autoComplete="current-password"
                    onChange={(e) => {
                      setAuthMessage(null);
                      setLoginData({ ...loginData, password: e.target.value });
                    }}
                    required
                  />
                </>
              )}
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? 'Procesando...'
                  : isRegister
                    ? 'Registrarse'
                    : 'Iniciar Sesion'}
              </button>
            </form>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default Home;
