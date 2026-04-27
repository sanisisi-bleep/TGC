import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import CardDetailModal from '../components/cards/CardDetailModal';
import queryKeys from '../queryKeys';
import { getSharedDeck } from '../services/api';
import { resolveTcgSlug } from '../tcgConfig';

function SharedDeck() {
  const { shareToken } = useParams();
  const navigate = useNavigate();
  const [selectedCard, setSelectedCard] = useState(null);
  const sharedDeckQuery = useQuery({
    queryKey: queryKeys.sharedDeck(shareToken),
    queryFn: ({ signal }) => getSharedDeck(shareToken, signal),
    enabled: Boolean(shareToken),
    staleTime: 5 * 60 * 1000,
  });
  const deck = sharedDeckQuery.data || null;
  const loading = sharedDeckQuery.isPending;
  const activeTcgSlug = resolveTcgSlug(deck?.tgc_name || '');

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

  const isOnePieceDeck = deck?.composition?.format_mode === 'one-piece';
  const isDigimonDeck = deck?.composition?.format_mode === 'digimon';
  const distinctCardCount = isDigimonDeck
    ? (deck?.cards?.length || 0) + (deck?.egg_cards?.length || 0)
    : (deck?.cards?.length || 0);
  const sharedDeckSummary = isOnePieceDeck
    ? `Leader ${deck.leader_cards || 0}/${deck.required_leader_cards || 1} | Main ${deck.main_deck_cards || 0}/${deck.required_main_deck_cards || 50} | DON ${deck.don_cards || 0}/${deck.recommended_don_cards || 10}`
    : isDigimonDeck
      ? `Main ${deck.main_deck_cards || 0}/${deck.required_main_deck_cards || 50} | Eggs ${deck.egg_cards || 0}/${deck.max_egg_cards || 5}`
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
              : `${deck.total_cards || 0}/${deck.max_cards || 50}`}
          </strong>
        </div>
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
              Eggs {deck.egg_cards || 0}/{deck.max_egg_cards || 5}
            </span>
          )}
        </div>

        <div className="deck-detail-grid">
          {(deck.cards || []).map((card) => (
            <article
              key={`${card.id}-${card.quantity}`}
              className="deck-card-row is-openable"
              onClick={() => setSelectedCard(card)}
            >
              <img src={card.image_url} alt={card.name} />
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
                  <img src={card.image_url} alt={card.name} />
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
