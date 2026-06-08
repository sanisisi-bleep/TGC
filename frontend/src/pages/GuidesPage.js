import React from 'react';
import { Link } from 'react-router-dom';
import { PUBLIC_GUIDES } from '../content/publicContent';
import usePageMeta from '../hooks/usePageMeta';

function GuidesPage() {
  usePageMeta({
    title: 'Guias para jugadores TCG',
    description: 'Guias practicas para importar mazos, organizar carpetas, completar listas con tu coleccion y entender zonas especiales como DON!!.',
    canonicalPath: '/guides',
  });

  return (
    <div className="page-shell public-page public-guides-page">
      <section className="page-hero public-page-hero">
        <div>
          <span className="eyebrow">Guias</span>
          <h1>Ayudas rapidas para jugar mejor con la herramienta</h1>
          <p>
            Contenido practico, corto y enlazable para resolver dudas reales: importar listas,
            ordenar mazos, revisar faltantes y entender zonas especiales por TCG.
          </p>
        </div>
        <div className="hero-stat">
          <span>Guias iniciales</span>
          <strong>{PUBLIC_GUIDES.length}</strong>
        </div>
      </section>

      <section className="guide-grid">
        {PUBLIC_GUIDES.map((guide) => (
          <Link key={guide.slug} to={`/guides/${guide.slug}`} className="panel guide-card">
            <span className="eyebrow">Guia</span>
            <h2>{guide.title}</h2>
            <p>{guide.summary}</p>
            <div className="updates-entry__tags">
              {guide.tags.map((tag) => (
                <span key={tag} className="deck-status-chip deck-progress-chip">
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}

export default GuidesPage;
