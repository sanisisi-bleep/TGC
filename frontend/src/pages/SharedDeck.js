import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import CardDetailModal from '../components/cards/CardDetailModal';
import queryKeys from '../queryKeys';
import usePageMeta from '../hooks/usePageMeta';
import { getSharedDeck } from '../services/api';
import { resolveTcgSlug } from '../tcgConfig';
import { getDeckEggCardCount } from '../utils/deckTools';
import { trackProductEvent } from '../utils/productAnalytics';

function SharedDeck() {
  const { shareToken } = useParams();
  const navigate = useNavigate();
  const [selectedCard, setSelectedCard] = useState(null);
  const [copyState, setCopyState] = useState('idle');
  const sharedDeckQuery = useQuery({
    queryKey: queryKeys.sharedDeck(shareToken),
    queryFn: ({ signal }) => getSharedDeck(shareToken, signal),
    enabled: Boolean(shareToken),
    staleTime: 5 * 60 * 1000,
  });
  const deck = sharedDeckQuery.data || null;
  const loading = sharedDeckQuery.isPending;
  const activeTcgSlug = resolveTcgSlug(deck?.tgc_name || '');
  const metaTitle = deck?.name ? `${deck.name} - mazo ${deck.tgc_name || 'TCG'}` : 'Mazo compartido';
  const metaDescription = deck
    ? `Mazo publico de ${deck.tgc_name || 'TCG'} con ${deck.total_cards || deck.main_deck_cards || 0} cartas en Multiverse TCG Manager.`
    : 'Consulta mazos compartidos en Multiverse TCG Manager.';

  usePageMeta({
    title: metaTitle,
    description: metaDescription,
    canonicalPath: shareToken ? `/decks/public/${shareToken}` : '/decks',
  });

  useEffect(() => {
    if (!deck) {
      return;
    }

    trackProductEvent('shared_deck_viewed', {
      tgc: activeTcgSlug,
      deck_id: deck.id,
      total_cards: deck.total_cards || deck.main_deck_cards || 0,
    });
  }, [activeTcgSlug, deck]);

  const copyPublicLink = async () => {
    const publicPath = `/decks/public/${shareToken}`;
    const publicUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${publicPath}`
      : publicPath;

    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyState('copied');
    } catch (_error) {
      setCopyState('failed');
    }

    window.setTimeout(() => setCopyState('idle'), 2200);
  };

  if (loading) {
    return (
      <div className="page-shell">
        <section className="page-hero">
          <div>
            <span className="eyebrow">Compartido</span>
            <h1>Cargando mazo...</h1>
          </div>
        </section>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="page-shell">
        <section className="page-hero">
          <div>
            <span className="eyebrow">Compartido</span>
            <h1>Mazo no encontrado</h1>
            <p>El enlace no existe o ya no esta disponible.</p>
          </div>
          <button type="button" className="ghost-button" onClick={() => navigate('/')}>
            Volver al inicio
          </button>
        </section>
      </div>
    );
  }

  const isGundamDeck = deck?.composition?.format_mode === 'gundam' || activeTcgSlug === 'gundam';
  const isOnePieceDeck = deck?.composition?.format_mode === 'one-piece';
  const isDigimonDeck = deck?.composition?.format_mode === 'digimon';
  const deckEggCount = isDigimonDeck ? getDeckEggCardCount(deck) : 0;
  const mainDeckCards = Number(deck?.main_deck_cards ?? deck?.total_cards) || 0;
  const requiredMainDeckCards = isGundamDeck ? 50 : (Number(deck?.required_main_deck_cards) || 50);
  const gundamResourceCards = isGundamDeck ? (Number(deck?.resource_cards) || 0) : 0;
  const gundamMaxResourceCards = isGundamDeck ? (Number(deck?.max_resource_cards) || 10) : 0;
  const distinctCardCount = isDigimonDeck
    ? (deck?.cards?.length || 0) + (deck?.egg_cards?.length || 0)
    : isGundamDeck
      ? (deck?.cards?.length || 0) + (deck?.resource_cards_data?.length || 0)
    : (deck?.cards?.length || 0);
  const sharedDeckSummary = isOnePieceDeck
    ? `Leader ${deck.leader_cards || 0}/${deck.required_leader_cards || 1} | Main ${deck.main_deck_cards || 0}/${deck.required_main_deck_cards || 50} | DON ${deck.don_cards || 0}/${deck.recommended_don_cards || 10}`
    : isDigimonDeck
      ? `Main ${deck.main_deck_cards || 0}/${deck.required_main_deck_cards || 50} | Eggs ${deckEggCount}/${deck.max_egg_cards || 5}`
      : isGundamDeck
        ? `Main ${mainDeckCards}/${requiredMainDeckCards} | Resources ${gundamResourceCards}/${gundamMaxResourceCards}`
    : `${deck.total_cards || 0} cartas en total`;

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div>
          <span className="eyebrow">Mazo compartido</span>
          <h1>{deck.name}</h1>
          <p>
            {`${deck.tgc_name} | ${distinctCardCount} cartas distintas | ${sharedDeckSummary}`}
          </p>
        </div>

        <div className="hero-stat">
          <span>Progreso</span>
          <strong>
            {isOnePieceDeck
              ? `${deck.main_deck_cards || 0}/${deck.required_main_deck_cards || 50}`
              : isDigimonDeck
                ? `${deck.main_deck_cards || 0}/${deck.required_main_deck_cards || 50}`
                : isGundamDeck
                  ? `${mainDeckCards}/${requiredMainDeckCards}`
              : `${deck.total_cards || 0}/${deck.max_cards || 50}`}
          </strong>
        </div>

        <button type="button" className="ghost-button public-share-copy-button" onClick={copyPublicLink}>
          {copyState === 'copied'
            ? 'Enlace copiado'
            : copyState === 'failed'
              ? 'No se pudo copiar'
              : 'Copiar enlace'}
        </button>
      </section>

      <section className="panel">
        <div className="deck-status-row">
          <span className={`deck-status-chip ${deck.is_complete ? 'is-complete' : 'is-incomplete'}`}>
            {deck.is_complete ? 'Mazo completo' : 'Mazo incompleto'}
          </span>
          {isOnePieceDeck && (
            <>
              <span className="deck-status-chip deck-progress-chip">
                Leader {deck.leader_cards || 0}/{deck.required_leader_cards || 1}
              </span>
              <span className="deck-status-chip deck-progress-chip">
                DON {deck.don_cards || 0}/{deck.recommended_don_cards || 10}
              </span>
            </>
          )}
          {isDigimonDeck && (
            <span className="deck-status-chip deck-progress-chip">
              Eggs {deckEggCount}/{deck.max_egg_cards || 5}
            </span>
          )}
          {isGundamDeck && (
            <>
              <span className="deck-status-chip deck-progress-chip">
                Main {mainDeckCards}/{requiredMainDeckCards}
              </span>
              <span className="deck-status-chip deck-progress-chip">
                Resources {gundamResourceCards}/{gundamMaxResourceCards}
              </span>
            </>
          )}
        </div>

        <div className="deck-detail-grid">
          {(deck.cards || []).map((card) => (
            <article
              key={`${card.id}-${card.quantity}`}
              className="deck-card-row is-openable"
              onClick={() => setSelectedCard(card)}
            >
              <img
                src={card.image_url}
                alt={card.name}
                width="132"
                height="176"
                loading="lazy"
                decoding="async"
              />
              <div className="deck-card-copy">
                <h4>{card.name}</h4>
                <div className="deck-owned-panel">
                  <span className={`deck-role-badge is-${card.deck_role || 'main'}`}>
                    {card.deck_role === 'leader'
                      ? 'Leader'
                      : card.deck_role === 'egg'
                        ? 'Digi-Egg'
                        : card.deck_role === 'don'
                          ? 'DON!!'
                          : 'Main'}
                  </span>
                  {card.color_matches_leader === false && (
                    <span className="deck-role-warning">
                      {card.color_warning_text || 'Fuera de color con el Leader'}
                    </span>
                  )}
                </div>
                <p>{[card.card_type || 'Sin tipo', card.color || 'Sin color', card.rarity || 'Sin rareza'].join(' | ')}</p>
                <span>{card.set_name || 'Set desconocido'}</span>
              </div>
              <div className="deck-card-controls">
                <div className="deck-card-qty">x{card.quantity}</div>
              </div>
            </article>
          ))}
        </div>

        {isDigimonDeck && (deck.egg_cards || []).length > 0 && (
          <div className="deck-considering-section panel">
            <div className="deck-considering-header">
              <div>
                <span className="eyebrow">Digi-Egg Deck</span>
                <h3>Huevos del mazo</h3>
                <p>Estas cartas no entran en la mano inicial. Forman la reserva de Digi-Egg del mazo.</p>
              </div>
            </div>
            <div className="deck-detail-grid">
              {(deck.egg_cards || []).map((card) => (
                <article
                  key={`egg-${card.id}-${card.quantity}`}
                  className="deck-card-row is-openable"
                  onClick={() => setSelectedCard(card)}
                >
                  <img
                    src={card.image_url}
                    alt={card.name}
                    width="132"
                    height="176"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="deck-card-copy">
                    <h4>{card.name}</h4>
                    <div className="deck-owned-panel">
                      <span className="deck-role-badge is-egg">Digi-Egg</span>
                    </div>
                    <p>{[card.card_type || 'Sin tipo', card.color || 'Sin color', card.rarity || 'Sin rareza'].join(' | ')}</p>
                    <span>{card.set_name || 'Set desconocido'}</span>
                  </div>
                  <div className="deck-card-controls">
                    <div className="deck-card-qty">x{card.quantity}</div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {isGundamDeck && (
          <>
            <div className="deck-considering-section panel">
              <div className="deck-considering-header">
                <div>
                  <span className="eyebrow">Resource Deck</span>
                  <h3>Recursos del mazo</h3>
                  <p>Seccion separada del main deck. No cuenta dentro de las 50 cartas principales.</p>
                </div>
              </div>
              {(deck.resource_cards_data || []).length > 0 ? (
                <div className="deck-detail-grid">
                  {(deck.resource_cards_data || []).map((card) => (
                    <article
                      key={`resource-${card.id}-${card.quantity}`}
                      className="deck-card-row is-openable"
                      onClick={() => setSelectedCard(card)}
                    >
                      <img
                        src={card.image_url}
                        alt={card.name}
                        width="132"
                        height="176"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="deck-card-copy">
                        <h4>{card.name}</h4>
                        <div className="deck-owned-panel">
                          <span className="deck-role-badge is-resource">Resource</span>
                        </div>
                        <p>{[card.card_type || 'Sin tipo', card.color || 'Sin color', card.rarity || 'Sin rareza'].join(' | ')}</p>
                        <span>{card.set_name || 'Set desconocido'}</span>
                      </div>
                      <div className="deck-card-controls">
                        <div className="deck-card-qty">x{card.quantity}</div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state subtle-empty">
                  <p>Este mazo compartido todavia no muestra Resource Deck.</p>
                </div>
              )}
            </div>

            <div className="deck-considering-section panel">
              <div className="deck-considering-header">
                <div>
                  <span className="eyebrow">Tokens de inicio</span>
                  <h3>EX Base y EX Resource</h3>
                  <p>Se usan al empezar la partida, pero no forman parte del mazo ni del Resource Deck.</p>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <CardDetailModal
        card={selectedCard}
        activeTcgSlug={activeTcgSlug}
        onClose={() => setSelectedCard(null)}
      />
    </div>
  );
}

export default SharedDeck;
