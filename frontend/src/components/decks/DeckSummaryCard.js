import React from 'react';

function DeckSummaryCard({
  deck,
  onOpen,
  onClone,
  onShare,
  onDelete,
  isCloning,
  isSharing,
  isDeleting,
}) {
  const isOnePieceDeck = deck?.composition?.format_mode === 'one-piece';
  const createdAtLabel = new Date(deck.created_at).toLocaleDateString();
  const totalCards = Number(deck.total_cards) || 0;
  const maxCards = Number(deck.max_cards) || 50;
  const remainingCards = Math.max(Number(deck.remaining_cards) || 0, 0);
  const summaryCopy = isOnePieceDeck
    ? (
      deck.is_complete
        ? 'Leader y main deck listos. Puedes abrirlo para revisar colores, DON y exportacion.'
        : 'Todavia necesita ajustes de leader, main deck o DON antes de quedar listo para jugar.'
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
          {isOnePieceDeck ? `${deck.main_deck_cards || 0}/${deck.required_main_deck_cards || 50} main` : `${totalCards}/${maxCards} cartas`}
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
          Abrir mazo
        </button>

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
      </div>
    </article>
  );
}

export default DeckSummaryCard;
