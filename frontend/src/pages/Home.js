import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
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

const HOME_FEATURES = [
  {
    title: 'Buscar cartas',
    description: 'Filtra por nombre, tipo, color, set o codigo sin cargar miles de resultados de golpe.',
    bullets: ['Filtros rapidos', 'Paginacion ligera', 'Resultados pensados para mazos y coleccion'],
  },
  {
    title: 'Gestionar tu coleccion',
    description: 'Controla copias, revisa sets y localiza huecos de forma mas comoda desde una sola vista.',
    bullets: ['Control por cantidades', 'Filtros por expansion', 'Vista lista para revisar faltantes'],
  },
  {
    title: 'Construir mazos',
    description: 'Monta listas, valida reglas por juego y comparte tus builds sin salir del mismo flujo.',
    bullets: ['Reglas por TCG', 'Exportacion rapida', 'Panel de curva y mano inicial'],
  },
];

const HOME_STEPS = [
  {
    step: '01',
    title: 'Elige juego',
    description: 'Cambia entre Gundam y One Piece sin perder el resto de tu cuenta ni tu forma de trabajo.',
  },
  {
    step: '02',
    title: 'Busca y guarda',
    description: 'Encuentra la carta, anadela a coleccion o usala directamente para montar un mazo.',
  },
  {
    step: '03',
    title: 'Pulsa y comparte',
    description: 'Revisa curva, cantidades y exporta la lista cuando ya la tengas lista para jugar.',
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeGame = getGameConfig(activeTcgSlug);
  const quickActions = [
    { label: `Buscar en ${activeGame.shortName}`, to: '/search', tone: 'primary' },
    { label: 'Abrir mi coleccion', to: '/collection', tone: 'secondary' },
    { label: 'Ir a mis mazos', to: '/decks', tone: 'secondary' },
    { label: 'Ajustes y perfil', to: '/settings', tone: 'ghost' },
  ];

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
        await axios.post(`${API_BASE}/auth/token`, loginData);
        onLoginSuccess();
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
            <h1>Tu base de operaciones para cartas, coleccion y mazos</h1>
            <p>
              Cambia entre sistemas compatibles desde el mismo puente. Ahora mismo estas trabajando
              sobre {activeGame.shortName} y puedes saltar entre buscador, coleccion y construccion
              de mazos desde el mismo flujo.
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
                Si hoy vienes a revisar cartas, completar coleccion o tocar una lista, aqui tienes
                los accesos directos principales.
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
              <h2>Un flujo sencillo y continuo</h2>
              <p>
                La idea es que no tengas que pensar en herramientas separadas: encuentras la carta,
                la guardas y la conviertes en mazo dentro de la misma cuenta.
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
              <span className="eyebrow">Coleccion centralizada</span>
              <h1>Una misma web para buscar cartas, controlar coleccion y crear mazos</h1>
              <p>
                Organiza cartas, colecciones y mazos desde una sola interfaz. Gundam y One Piece
                ya comparten base de operaciones mientras Magic queda preparado para la siguiente fase.
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
                <h2>La web ya cubre el flujo principal</h2>
                <p>
                  No es solo un catalogo. La idea es que puedas pasar de descubrir una carta a usarla
                  dentro de tu coleccion o tu mazo sin cambiar de herramienta.
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
                <h2>Que vas a encontrar al entrar</h2>
                <p>
                  El proyecto esta pensado para moverse rapido, evitar ruido y dejar claro para que
                  sirve cada modulo desde el principio.
                </p>
              </div>

              <div className="home-capability-grid">
                <div className="home-capability-pill">
                  <strong>Busqueda ligera</strong>
                  <span>Filtros, sets y codigos con paginacion.</span>
                </div>
                <div className="home-capability-pill">
                  <strong>Coleccion viva</strong>
                  <span>Control de copias, revisiones y faltantes.</span>
                </div>
                <div className="home-capability-pill">
                  <strong>Mazos con reglas</strong>
                  <span>Validacion y herramientas segun el TCG.</span>
                </div>
                <div className="home-capability-pill">
                  <strong>Base comun</strong>
                  <span>Un mismo perfil para todos los juegos activos.</span>
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
