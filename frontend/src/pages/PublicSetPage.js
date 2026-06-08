import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import queryKeys from '../queryKeys';
import usePageMeta from '../hooks/usePageMeta';
import { getPublicSet } from '../services/api';
import { trackProductEvent } from '../utils/productAnalytics';

const EMPTY_PUBLIC_CARDS = [];

const getCardSearchText = (card) => (
  [
    card?.name,
    card?.source_card_id,
    card?.card_type,
    card?.color,
    card?.rarity,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
);

function PublicSetPage() {
  const { tgcSlug, setCode } = useParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const publicSetQuery = useQuery({
    queryKey: queryKeys.publicSet(tgcSlug, setCode),
    queryFn: ({ signal }) => getPublicSet(tgcSlug, setCode, signal),
    enabled: Boolean(tgcSlug && setCode),
    staleTime: 60 * 60 * 1000,
  });
  const payload = publicSetQuery.data || null;
  const set = payload?.set || null;
  const tgc = payload?.tgc || null;
  const cards = payload?.cards || EMPTY_PUBLIC_CARDS;
  const typeOptions = useMemo(() => (
    Object.keys(payload?.facets?.card_types || {}).sort((a, b) => a.localeCompare(b))
  ), [payload?.facets?.card_types]);
  const visibleCards = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return cards.filter((card) => {
      const matchesSearch = !normalizedSearch || getCardSearchText(card).includes(normalizedSearch);
      const matchesType = !selectedType || card.card_type === selectedType;
      return matchesSearch && matchesType;
    });
  }, [cards, searchTerm, selectedType]);

  usePageMeta({
    title: set ? `${set.name} - ${tgc?.name || 'TCG'}` : 'Set TCG',
    description: set
      ? `${set.name} de ${tgc?.name || 'TCG'} con ${set.card_count} cartas indexadas en Multiverse TCG Manager.`
      : 'Pagina publica de set en Multiverse TCG Manager.',
    canonicalPath: payload?.canonical_path,
  });

  useEffect(() => {
    if (!set || !tgc) {
      return;
    }

    trackProductEvent('set_public_viewed', {
      tgc: tgc.slug,
      set_name: set.name,
      card_count: set.card_count,
    });
  }, [set, tgc]);

  if (publicSetQuery.isPending) {
    return (
      <div className="page-shell public-seo-page">
        <section className="page-hero public-page-hero">
          <div>
            <span className="eyebrow">Set publico</span>
            <h1>Cargando set...</h1>
          </div>
        </section>
      </div>
    );
  }

  if (!set) {
    return (
      <div className="page-shell public-seo-page">
        <section className="page-hero public-page-hero">
          <div>
            <span className="eyebrow">Set publico</span>
            <h1>No hemos encontrado este set</h1>
            <p>Puede que el set todavia no este cargado o que el codigo no coincida con el catalogo.</p>
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
      <section className="page-hero public-page-hero">
        <div>
          <span className="eyebrow">{tgc?.name || 'Set publico'}</span>
          <h1>{set.name}</h1>
          <p>
            Catalogo publico del set con enlaces a fichas individuales de cartas, filtros basicos y datos utiles para descubrir el TCG.
          </p>
        </div>
        <div className="hero-stat">
          <span>Cartas indexadas</span>
          <strong>{set.card_count}</strong>
        </div>
      </section>

      <section className="panel public-set-toolbar">
        <label className="settings-field">
          <span>Buscar dentro del set</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Nombre, codigo, tipo, color..."
          />
        </label>

        {typeOptions.length > 0 && (
          <div className="public-chip-filter" aria-label="Filtrar por tipo">
            <button
              type="button"
              className={!selectedType ? 'is-active' : ''}
              onClick={() => setSelectedType('')}
            >
              Todo
            </button>
            {typeOptions.map((type) => (
              <button
                key={type}
                type="button"
                className={selectedType === type ? 'is-active' : ''}
                onClick={() => setSelectedType(type)}
              >
                {type}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="public-card-grid" aria-label={`Cartas de ${set.name}`}>
        {visibleCards.map((card) => (
          <Link
            key={`${card.id}-${card.source_card_id}`}
            to={`/cards/${tgc?.slug || tgcSlug}/${encodeURIComponent(card.source_card_id || card.deck_key || card.id)}`}
            className="panel public-card-tile"
          >
            {card.thumbnail_url || card.image_url ? (
              <img src={card.thumbnail_url || card.image_url} alt={card.name} loading="lazy" decoding="async" />
            ) : (
              <div className="public-card-thumb-placeholder">Sin imagen</div>
            )}
            <div>
              <strong>{card.name}</strong>
              <span>{[card.source_card_id, card.card_type, card.color].filter(Boolean).join(' | ')}</span>
            </div>
          </Link>
        ))}
      </section>

      {visibleCards.length === 0 && (
        <section className="panel empty-state subtle-empty">
          <p>No hay cartas que coincidan con este filtro dentro del set.</p>
        </section>
      )}
    </div>
  );
}

export default PublicSetPage;
