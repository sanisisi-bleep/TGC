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
