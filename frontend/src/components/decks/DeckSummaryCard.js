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

  return (
    <article className="deck-item">
      <div className="deck-item-header">
        <div>
          <span className="deck-badge">Deck #{deck.id}</span>
          <h3>{deck.name}</h3>
        </div>
        <span className="deck-date">
          {new Date(deck.created_at).toLocaleDateString()}
        </span>
      </div>

      <p className="deck-copy">
        Revisa cartas, cantidades y composicion del mazo desde el panel de detalle.
      </p>

      <div className="deck-status-row">
        <span className={`deck-status-chip ${deck.is_complete ? 'is-complete' : 'is-incomplete'}`}>
          {deck.is_complete ? 'Listo para jugar' : 'Pendiente de revisar'}
        </span>
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
            {deck.total_cards || 0}/{deck.max_cards || 50}
          </span>
        )}
      </div>

      <div className="deck-card-actions">
        <button
          type="button"
          className="deck-action-button is-primary"
          onClick={onOpen}
        >
          Abrir mazo
        </button>
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
        <button
          type="button"
          className="deck-action-button is-danger"
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
