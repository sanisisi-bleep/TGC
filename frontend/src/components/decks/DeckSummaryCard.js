import React from 'react';
import { getDeckEggCardCount } from '../../utils/deckTools';
import { resolveTcgSlug } from '../../tcgConfig';

function DeckSummaryCard({
  deck,
  isGuestDemo = false,
  onOpen,
  onClone,
  onShare,
  onDelete,
  isCloning,
  isSharing,
  isDeleting,
}) {
  const inferredDeckSlug = deck?.tgc_name ? resolveTcgSlug(deck.tgc_name) : null;
  const isGundamDeck = deck?.composition?.format_mode === 'gundam' || inferredDeckSlug === 'gundam';
  const isOnePieceDeck = deck?.composition?.format_mode === 'one-piece';
  const isDigimonDeck = deck?.composition?.format_mode === 'digimon';
  const isRiftboundDeck = deck?.composition?.format_mode === 'riftbound';
  const deckEggCount = isDigimonDeck ? getDeckEggCardCount(deck) : 0;
  const createdAtLabel = new Date(deck.created_at).toLocaleDateString();
  const totalCards = Number(deck.total_cards) || 0;
  const mainDeckCards = Number(deck.main_deck_cards ?? deck.total_cards) || 0;
  const maxCards = isGundamDeck ? 50 : (Number(deck.max_cards) || 50);
  const requiredMainDeckCards = isGundamDeck ? 50 : (Number(deck.required_main_deck_cards) || 50);
  const gundamResourceCards = isGundamDeck ? (Number(deck.resource_cards) || 0) : 0;
  const gundamMaxResourceCards = isGundamDeck ? (Number(deck.max_resource_cards) || 10) : 0;
  const remainingCards = isGundamDeck
    ? Math.max(maxCards - mainDeckCards, 0)
    : Math.max(Number(deck.remaining_cards) || 0, 0);
  const summaryCopy = isOnePieceDeck
    ? (
      deck.is_complete
        ? 'Leader y main deck listos. Puedes abrirlo para revisar colores, DON y exportacion.'
        : 'Todavia necesita ajustes de leader, main deck o DON antes de quedar listo para jugar.'
    )
    : isDigimonDeck
      ? (
        deck.is_complete
          ? 'Main deck y Digi-Eggs listos. Abre el mazo para revisar curva, mano inicial y variantes.'
          : 'Revisa el main deck, los Digi-Eggs y las copias por numero antes de darlo por cerrado.'
      )
      : isRiftboundDeck
        ? (
          deck.is_complete
            ? 'Legend, Main Deck, Runes, Battlefields y Chosen Champion listos para jugar.'
            : 'Revisa la Legend, los domains, el Chosen Champion y las secciones especiales antes de cerrarlo.'
        )
      : isGundamDeck
        ? (
          deck.is_complete
            ? 'Main deck y colores listos. Si quieres, completa tambien el Resource Deck opcional para dejarlo redondo.'
            : 'Todavia le faltan cartas o colores por ajustar antes de dejarlo legal a 50 cartas.'
        )
    : (
      deck.is_complete
        ? 'Mazo completo y listo para afinar copias, curva y sets desde el panel de detalle.'
        : 'Ajusta cantidades, curva y composicion desde el detalle para dejar el mazo cerrado.'
    );

  return (
    <article className="deck-item deck-summary-card">
      <div className="deck-item-header">
        <div>
          <span className="deck-badge">Deck #{deck.id}</span>
          <h3>{deck.name}</h3>
        </div>
        <span className="deck-date">{createdAtLabel}</span>
      </div>

      <p className="deck-copy">{summaryCopy}</p>

      <div className="deck-status-row deck-status-row-primary">
        <span className={`deck-status-chip ${deck.is_complete ? 'is-complete' : 'is-incomplete'}`}>
          {deck.is_complete ? 'Listo para jugar' : 'Pendiente de revisar'}
        </span>
        <span className="deck-status-chip deck-progress-chip">
          {isOnePieceDeck
            ? `${deck.main_deck_cards || 0}/${deck.required_main_deck_cards || 50} main`
            : isDigimonDeck
              ? `${deck.main_deck_cards || 0}/${deck.required_main_deck_cards || 50} main`
              : isGundamDeck
                ? `${mainDeckCards}/${requiredMainDeckCards} main`
              : isRiftboundDeck
                ? `${deck.main_deck_cards || 0}/${deck.required_main_deck_cards || 40} main`
              : `${totalCards}/${maxCards} cartas`}
        </span>
        <span className={`deck-status-chip ${remainingCards > 0 ? 'deck-missing-chip' : 'deck-progress-chip'}`}>
          {remainingCards > 0 ? `Restan ${remainingCards}` : 'Sin huecos'}
        </span>
      </div>

      <div className="deck-status-row deck-status-row-secondary">
        {isOnePieceDeck ? (
          <>
            <span className="deck-status-chip deck-progress-chip">
              Leader {deck.leader_cards}/{deck.required_leader_cards}
            </span>
            <span className="deck-status-chip deck-progress-chip">
              Main {deck.main_deck_cards}/{deck.required_main_deck_cards}
            </span>
            <span className="deck-status-chip deck-progress-chip">
              DON {deck.don_cards}/{deck.recommended_don_cards}
            </span>
          </>
        ) : isDigimonDeck ? (
          <>
            <span className="deck-status-chip deck-progress-chip">
              Main {deck.main_deck_cards || 0}/{deck.required_main_deck_cards || 50}
            </span>
            <span className="deck-status-chip deck-progress-chip">
              Eggs {deckEggCount}/{deck.max_egg_cards || 5}
            </span>
          </>
        ) : isGundamDeck ? (
          <>
            <span className="deck-status-chip deck-progress-chip">
              Main {mainDeckCards}/{requiredMainDeckCards}
            </span>
            <span className="deck-status-chip deck-progress-chip">
              Resources {gundamResourceCards}/{gundamMaxResourceCards}
            </span>
          </>
        ) : isRiftboundDeck ? (
          <>
            <span className="deck-status-chip deck-progress-chip">
              Legend {deck.legend_cards}/{deck.required_legend_cards || 1}
            </span>
            <span className="deck-status-chip deck-progress-chip">
              Runes {deck.rune_cards}/{deck.required_rune_cards || 12}
            </span>
            <span className="deck-status-chip deck-progress-chip">
              Fields {deck.battlefield_cards}/{deck.required_battlefield_cards || 3}
            </span>
            <span className="deck-status-chip deck-progress-chip">
              Champion {deck.chosen_champion_cards}/{deck.required_chosen_champion_cards || 1}
            </span>
          </>
        ) : (
          <span className="deck-status-chip deck-progress-chip">
            Limite {maxCards} cartas
          </span>
        )}
      </div>

      <div className="deck-card-actions">
        <button
          type="button"
          className="deck-action-button is-primary is-wide"
          onClick={onOpen}
        >
          {isGuestDemo ? 'Abrir demo' : 'Abrir mazo'}
        </button>

        {isGuestDemo ? (
          <div className="deck-demo-summary-note">
            Vista demo en solo lectura
          </div>
        ) : (
          <>
            <div className="deck-card-actions-secondary">
              <button
                type="button"
                className="deck-action-button is-soft"
                onClick={onClone}
                disabled={isCloning}
              >
                {isCloning ? 'Clonando...' : 'Clonar'}
              </button>
              <button
                type="button"
                className="deck-action-button is-soft"
                onClick={onShare}
                disabled={isSharing}
              >
                {isSharing ? 'Compartiendo...' : 'Compartir'}
              </button>
            </div>

            <button
              type="button"
              className="deck-action-button is-danger is-ghost-danger"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Borrando...' : 'Borrar mazo'}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export default DeckSummaryCard;
