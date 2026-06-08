import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import queryKeys from '../queryKeys';
import usePageMeta from '../hooks/usePageMeta';
import { getPublicCard } from '../services/api';
import { trackProductEvent } from '../utils/productAnalytics';

const FIELD_LABELS = [
  ['source_card_id', 'Codigo'],
  ['card_type', 'Tipo'],
  ['color', 'Color'],
  ['rarity', 'Rareza'],
  ['cost', 'Coste'],
  ['lv', 'Nivel'],
  ['ap', 'AP'],
  ['hp', 'HP'],
  ['power', 'Power'],
  ['counter', 'Counter'],
  ['attribute_name', 'Atributo'],
  ['artist', 'Artista'],
];

const renderTextBlock = (title, value) => {
  if (!value) {
    return null;
  }

  return (
    <section className="public-detail-text-block">
      <h2>{title}</h2>
      <p>{String(value)}</p>
    </section>
  );
};

function PublicCardPage() {
  const { tgcSlug, sourceCardId } = useParams();
  const publicCardQuery = useQuery({
    queryKey: queryKeys.publicCard(tgcSlug, sourceCardId),
    queryFn: ({ signal }) => getPublicCard(tgcSlug, sourceCardId, signal),
    enabled: Boolean(tgcSlug && sourceCardId),
    staleTime: 60 * 60 * 1000,
  });
  const payload = publicCardQuery.data || null;
  const card = payload?.card || null;
  const tgc = payload?.tgc || null;
  const setName = card?.set_name || card?.version || 'Set desconocido';
  const metaTitle = card ? `${card.name} ${card.source_card_id || ''}`.trim() : 'Carta TCG';
  const metaDescription = card
    ? `${card.name} (${card.source_card_id || 'sin codigo'}) de ${tgc?.name || 'Multiverse TCG Manager'}. Tipo ${card.card_type || 'sin tipo'}, color ${card.color || 'sin color'} y rareza ${card.rarity || 'sin rareza'}.`
    : 'Ficha publica de carta en Multiverse TCG Manager.';

  usePageMeta({
    title: metaTitle,
    description: metaDescription,
    image: card?.image_url,
    canonicalPath: payload?.canonical_path,
    type: 'article',
  });

  useEffect(() => {
    if (!card || !tgc) {
      return;
    }

    trackProductEvent('card_public_viewed', {
      tgc: tgc.slug,
      source_card_id: card.source_card_id,
      set_name: setName,
    });
  }, [card, setName, tgc]);

  const facts = useMemo(() => (
    FIELD_LABELS
      .map(([key, label]) => [label, card?.[key]])
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
  ), [card]);

  if (publicCardQuery.isPending) {
    return (
      <div className="page-shell public-seo-page">
        <section className="page-hero public-page-hero">
          <div>
            <span className="eyebrow">Carta publica</span>
            <h1>Cargando carta...</h1>
          </div>
        </section>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="page-shell public-seo-page">
        <section className="page-hero public-page-hero">
          <div>
            <span className="eyebrow">Carta publica</span>
            <h1>No hemos encontrado esta carta</h1>
            <p>Puede que el codigo no exista todavia en el catalogo o que el TCG no este soportado.</p>
          </div>
          <Link className="ghost-button" to="/search">
            Buscar cartas
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell public-seo-page">
      <section className="page-hero public-page-hero public-card-hero">
        <div>
          <span className="eyebrow">{tgc?.name || 'Carta publica'}</span>
          <h1>{card.name}</h1>
          <p>
            {[card.source_card_id, card.card_type, card.color, card.rarity].filter(Boolean).join(' | ')}
          </p>
          <div className="public-inline-links">
            <Link to={`/sets/${tgc?.slug || tgcSlug}/${encodeURIComponent(setName)}`}>
              Ver set {setName}
            </Link>
            <Link to="/search">Abrir buscador</Link>
          </div>
        </div>
        <div className="hero-stat">
          <span>Set</span>
          <strong>{setName}</strong>
        </div>
      </section>

      <section className="public-card-layout">
        <article className="panel public-card-art-card">
          {card.image_url ? (
            <img src={card.image_url} alt={card.name} loading="eager" decoding="async" />
          ) : (
            <div className="public-card-art-placeholder">Sin imagen</div>
          )}
        </article>

        <article className="panel public-detail-card">
          <span className="eyebrow">Ficha de carta</span>
          <h2>Datos principales</h2>
          <dl className="public-fact-grid">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
            <div>
              <dt>Set</dt>
              <dd>{setName}</dd>
            </div>
          </dl>

          {renderTextBlock('Texto / habilidades', card.abilities || card.ability || card.rule_text)}
          {renderTextBlock('Descripcion', card.description)}
          {renderTextBlock('Traits / familia', card.traits || card.family || card.type_line)}
          {renderTextBlock('QA', card.qa)}
        </article>
      </section>
    </div>
  );
}

export default PublicCardPage;
