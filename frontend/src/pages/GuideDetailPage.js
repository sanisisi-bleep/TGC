import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { PUBLIC_GUIDES } from '../content/publicContent';
import usePageMeta from '../hooks/usePageMeta';

function GuideDetailPage() {
  const { guideSlug } = useParams();
  const guide = PUBLIC_GUIDES.find((item) => item.slug === guideSlug);

  usePageMeta({
    title: guide?.title || 'Guia TCG',
    description: guide?.summary || 'Guia publica de Multiverse TCG Manager.',
    canonicalPath: guide ? `/guides/${guide.slug}` : '/guides',
    type: 'article',
  });

  if (!guide) {
    return (
      <div className="page-shell public-page">
        <section className="page-hero public-page-hero">
          <div>
            <span className="eyebrow">Guia</span>
            <h1>No hemos encontrado esta guia</h1>
            <p>Puede que se haya movido o que aun no este publicada.</p>
          </div>
          <Link className="ghost-button" to="/guides">
            Ver guias
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell public-page public-guide-detail-page">
      <section className="page-hero public-page-hero">
        <div>
          <span className="eyebrow">Guia practica</span>
          <h1>{guide.title}</h1>
          <p>{guide.summary}</p>
          <div className="updates-entry__tags">
            {guide.tags.map((tag) => (
              <span key={tag} className="deck-status-chip deck-progress-chip">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="hero-stat">
          <span>Actualizada</span>
          <strong>
            {new Date(guide.updatedAt).toLocaleDateString('es-ES', { dateStyle: 'medium' })}
          </strong>
        </div>
      </section>

      <article className="panel guide-article">
        {guide.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </article>

      <section className="panel public-cta-panel">
        <div>
          <span className="eyebrow">Siguiente paso</span>
          <h2>Pruebalo en la app</h2>
          <p>Abre el buscador o la demo para aplicar esta guia con cartas y mazos reales.</p>
        </div>
        <div className="guest-demo-actions">
          <Link className="guest-demo-primary-link" to="/search">
            Abrir buscador
          </Link>
          <Link className="guest-demo-secondary-link" to="/guides">
            Mas guias
          </Link>
        </div>
      </section>
    </div>
  );
}

export default GuideDetailPage;
