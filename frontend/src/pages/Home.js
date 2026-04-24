import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { GAME_CONFIGS, getGameConfig } from '../tcgConfig';
import { loginUser, registerUser } from '../services/api';

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

const HOME_FEATURES = [
  {
    title: 'Buscar cartas',
    description: 'Encuentra cartas por nombre, tipo, color, set o codigo sin comerte una lista eterna.',
    bullets: ['Filtros utiles', 'Paginacion ligera', 'Pensado para mazos y coleccion'],
  },
  {
    title: 'Gestionar tu coleccion',
    description: 'Mira cuantas copias tienes, repasa sets y detecta rapido lo que te falta.',
    bullets: ['Control por cantidades', 'Filtros por expansion', 'Revision comoda de faltantes'],
  },
  {
    title: 'Construir mazos',
    description: 'Haz listas, comprueba que cuadran con las reglas del juego y compartelas cuando quieras.',
    bullets: ['Reglas por TCG', 'Exportacion rapida', 'Curva y mano inicial'],
  },
];

const HOME_STEPS = [
  {
    step: '01',
    title: 'Elige juego',
    description: 'Entras, escoges Gundam o One Piece y sigues desde la misma cuenta.',
  },
  {
    step: '02',
    title: 'Busca y guarda',
    description: 'Encuentras una carta, la guardas en tu coleccion o la mandas al mazo en un momento.',
  },
  {
    step: '03',
    title: 'Revisa y comparte',
    description: 'Cuando la lista ya toma forma, revisas la curva y la exportas sin complicarte.',
  },
];

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

function Home({ token, onLoginSuccess, activeTcgSlug, setActiveTcgSlug, availableGames }) {
  const navigate = useNavigate();
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [registerData, setRegisterData] = useState({ username: '', email: '', password: '' });
  const [isRegister, setIsRegister] = useState(false);
  const [authMessage, setAuthMessage] = useState(null);
  const activeGame = getGameConfig(activeTcgSlug);
  const quickActions = [
    { label: `Buscar en ${activeGame.shortName}`, to: '/search', tone: 'primary' },
    { label: 'Abrir mi coleccion', to: '/collection', tone: 'secondary' },
    { label: 'Ir a mis mazos', to: '/decks', tone: 'secondary' },
    { label: 'Ajustes y perfil', to: '/settings', tone: 'ghost' },
  ];
  const authMutation = useMutation({
    mutationFn: async () => {
      if (isRegister) {
        return registerUser(registerData);
      }

      return loginUser(loginData);
    },
    onSuccess: async () => {
      if (isRegister) {
        setAuthMessage({
          type: 'success',
          text: 'Registro completado. Ya puedes iniciar sesion con tu usuario.',
        });
        setRegisterData({ username: '', email: '', password: '' });
        setIsRegister(false);
        return;
      }

      await onLoginSuccess();
    },
    onError: (error) => {
      setAuthMessage({
        type: 'error',
        text: getAuthErrorMessage(error, isRegister),
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    setAuthMessage(null);
    authMutation.mutate();
  };

  const handleGameSelect = (game) => {
    if (!game.available) {
      return;
    }

    flushSync(() => {
      setActiveTcgSlug(game.slug);
    });

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
            <h1>Todo a mano para jugar, coleccionar y montar mazos</h1>
            <p>
              Ahora mismo estas en {activeGame.shortName}. Desde aqui puedes buscar cartas, revisar
              tu coleccion o seguir con tus mazos sin dar vueltas de mas.
            </p>
          </div>

          <div className="home-hero-side">
            <div className="hero-stat">
              <span>Sistema activo</span>
              <strong>{activeGame.shortName}</strong>
            </div>

            <div className="home-status-strip" aria-label="Modulos disponibles">
              <span>Buscar</span>
              <span>Coleccion</span>
              <span>Mazos</span>
            </div>
          </div>
        </section>

        <section className="home-dashboard-grid">
          <article className="panel home-context-panel">
            <div className="home-section-heading">
              <span className="eyebrow">Ruta rapida</span>
              <h2>Entra donde mas te convenga</h2>
              <p>
                Si hoy vienes con una idea clara, entra por aqui y sigue sin rodeos.
              </p>
            </div>

            <div className="home-quick-actions">
              {quickActions.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className={`home-quick-button is-${action.tone}`}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </article>

          <article className="panel home-context-panel">
            <div className="home-section-heading">
              <span className="eyebrow">Como funciona</span>
              <h2>Todo sigue el mismo camino</h2>
              <p>
                La gracia es no ir saltando entre herramientas raras: buscas una carta, la guardas
                y si quieres la conviertes en mazo dentro de la misma cuenta.
              </p>
            </div>

            <div className="home-process-list">
              {HOME_STEPS.map((item) => (
                <article key={item.step} className="home-process-item">
                  <span className="home-process-step">{item.step}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </section>

        <section className="home-feature-grid" aria-label="Funciones principales">
          {HOME_FEATURES.map((feature) => (
            <article key={feature.title} className="panel home-feature-card">
              <div className="home-section-heading">
                <span className="eyebrow">Modulo</span>
                <h2>{feature.title}</h2>
                <p>{feature.description}</p>
              </div>

              <ul className="home-feature-list">
                {feature.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
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
              <span className="eyebrow">Todo en un sitio</span>
              <h1>Busca cartas, lleva tu coleccion y monta mazos sin liarte</h1>
              <p>
                La idea es sencilla: abrir la web y tener a mano lo importante. Gundam y One Piece
                ya estan listos, y la base queda preparada para seguir creciendo.
              </p>
            </div>

            <div className="hero-stat hero-stat-compact">
              <span>Modulos iniciales</span>
              <strong>3</strong>
            </div>
          </section>

          <section className="home-context-grid">
            <article className="panel home-context-panel">
              <div className="home-section-heading">
                <span className="eyebrow">Que puedes hacer</span>
                <h2>Entrar y ponerte al dia en dos minutos</h2>
                <p>
                  Si vienes a mirar cartas, completar tu coleccion o tocar un mazo, aqui lo tienes
                  todo bastante a mano.
                </p>
              </div>

              <div className="home-process-list">
                {HOME_STEPS.map((item) => (
                  <article key={item.step} className="home-process-item">
                    <span className="home-process-step">{item.step}</span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="panel home-context-panel">
              <div className="home-section-heading">
                <span className="eyebrow">Funciones</span>
                <h2>Lo que te vas a encontrar</h2>
                <p>
                  Nada de menus raros ni pasos de mas. Entras y ya ves rapido por donde tirar.
                </p>
              </div>

              <div className="home-capability-grid">
                <div className="home-capability-pill">
                  <strong>Busqueda ligera</strong>
                  <span>Filtros, sets y codigos con paginacion.</span>
                </div>
                <div className="home-capability-pill">
                  <strong>Coleccion viva</strong>
                  <span>Copias, repasos de sets y faltantes.</span>
                </div>
                <div className="home-capability-pill">
                  <strong>Mazos con reglas</strong>
                  <span>Validacion y ayudas segun el TCG.</span>
                </div>
                <div className="home-capability-pill">
                  <strong>Base comun</strong>
                  <span>Una sola cuenta para moverte por los juegos activos.</span>
                </div>
              </div>
            </article>
          </section>

          <section className="home-feature-grid" aria-label="Funciones principales">
            {HOME_FEATURES.map((feature) => (
              <article key={feature.title} className="panel home-feature-card">
                <div className="home-section-heading">
                  <span className="eyebrow">Modulo</span>
                  <h2>{feature.title}</h2>
                  <p>{feature.description}</p>
                </div>

                <ul className="home-feature-list">
                  {feature.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </article>
            ))}
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
              <h2>Entra y empieza</h2>
              <p>Inicia sesion o crea tu perfil para ponerte a buscar cartas, ordenar tu coleccion o montar mazos.</p>
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
              <button type="submit" disabled={authMutation.isPending}>
                {authMutation.isPending
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
