import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PUBLIC_UPDATES } from '../content/publicContent';

function UpdatesPage() {
  const latestUpdate = useMemo(() => PUBLIC_UPDATES[0] || null, []);

  return (
    <div className="page-shell public-page">
      <section className="page-hero public-page-hero">
        <div>
          <span className="eyebrow">Novedades</span>
          <h1>Ultimas actualizaciones del proyecto</h1>
          <p>
            Aqui dejamos visible lo que se va moviendo: mejoras, fixes, nuevas secciones y cambios
            que afectan a coleccion, mazos o datos.
          </p>
        </div>

        <div className="hero-stat">
          <span>Ultima actualizacion</span>
          <strong>
            {latestUpdate
              ? new Date(latestUpdate.date).toLocaleDateString('es-ES', { dateStyle: 'medium' })
              : 'Sin datos'}
          </strong>
        </div>
      </section>

      <section className="updates-feed">
        {PUBLIC_UPDATES.map((entry) => (
          <article key={entry.id} className="panel updates-entry">
            <div className="updates-entry__header">
              <div>
                <span className="eyebrow">{entry.type}</span>
                <h2>{entry.title}</h2>
                <p>{entry.summary}</p>
              </div>
              <time dateTime={entry.date}>
                {new Date(entry.date).toLocaleDateString('es-ES', { dateStyle: 'medium' })}
              </time>
            </div>

            {entry.highlights?.length > 0 && (
              <ul className="updates-entry__highlights">
                {entry.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}

            {entry.tags?.length > 0 && (
              <div className="updates-entry__tags">
                {entry.tags.map((tag) => (
                  <span key={tag} className="deck-status-chip deck-progress-chip">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="panel public-cta-panel">
        <div>
          <span className="eyebrow">Quieres probarlo?</span>
          <h2>Entra en la demo o crea tu cuenta</h2>
          <p>
            Si quieres ver como aterrizan estos cambios en la experiencia real, puedes entrar a la
            demo o registrarte para usar coleccion y mazos.
          </p>
        </div>

        <div className="guest-demo-actions">
          <Link className="guest-demo-primary-link" to="/search">
            Ver demo
          </Link>
          <Link className="guest-demo-secondary-link" to="/?auth=register&returns=/updates">
            Registrarme
          </Link>
        </div>
      </section>
    </div>
  );
}

export default UpdatesPage;
