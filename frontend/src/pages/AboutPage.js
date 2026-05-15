import React from 'react';
import { Link } from 'react-router-dom';
import { ABOUT_SECTIONS, ABOUT_VALUE_POINTS } from '../content/publicContent';
import { GAME_CONFIGS } from '../tcgConfig';

function AboutPage() {
  const activeGameNames = Object.values(GAME_CONFIGS)
    .filter((game) => game.available)
    .map((game) => game.shortName)
    .join(' | ');

  return (
    <div className="page-shell public-page">
      <section className="page-hero public-page-hero">
        <div>
          <span className="eyebrow">Acerca de</span>
          <h1>Que intenta resolver Multiverse TCG Manager</h1>
          <p>
            El proyecto busca juntar buscador, coleccion y mazos en una misma herramienta para que
            el flujo de un jugador no se rompa cada vez que cambia de tarea o de TCG.
          </p>
        </div>

        <div className="hero-stat">
          <span>TCGs activos</span>
          <strong>{activeGameNames}</strong>
        </div>
      </section>

      <section className="info-grid">
        {ABOUT_SECTIONS.map((section) => (
          <article key={section.id} className="panel public-info-card">
            <span className="eyebrow">{section.eyebrow}</span>
            <h2>{section.title}</h2>
            <p>{section.text}</p>
          </article>
        ))}
      </section>

      <section className="panel public-info-card public-info-card--wide">
        <span className="eyebrow">Valor actual</span>
        <h2>Lo que ya se puede hacer hoy</h2>
        <ul className="updates-entry__highlights">
          {ABOUT_VALUE_POINTS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="panel public-cta-panel">
        <div>
          <span className="eyebrow">Siguiente paso</span>
          <h2>Pruebalo sin friccion</h2>
          <p>
            Puedes entrar a la demo para entender el flujo o crear una cuenta para empezar a guardar
            cartas y construir mazos reales.
          </p>
        </div>

        <div className="guest-demo-actions">
          <Link className="guest-demo-primary-link" to="/search">
            Explorar demo
          </Link>
          <Link className="guest-demo-secondary-link" to="/?auth=login&returns=/about">
            Iniciar sesion
          </Link>
        </div>
      </section>
    </div>
  );
}

export default AboutPage;
