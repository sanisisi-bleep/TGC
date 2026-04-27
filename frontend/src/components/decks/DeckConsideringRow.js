import React from 'react';
import { isInteractiveElementTarget } from '../../utils/clickTargets';

function DeckConsideringRow({
  card,
  movingConsideringCardId,
  updatingConsideringCardId,
  onAdjustQuantity,
  onMoveToMainDeck,
  onOpenCard,
}) {
  const isMoving = movingConsideringCardId === card.id;
  const isUpdating = updatingConsideringCardId === card.id;
  const roleLabel = card.deck_role === 'leader'
    ? 'Leader'
    : card.deck_role === 'egg'
      ? 'Digi-Egg'
    : card.deck_role === 'don'
      ? 'DON!!'
      : 'Main';
  const cardSummary = [
    card.card_type || 'Sin tipo',
    card.color || 'Sin color',
    card.rarity || 'Sin rareza',
  ].join(' | ');

  const handleOpenCard = (event) => {
    if (!onOpenCard || isInteractiveElementTarget(event.target)) {
      return;
    }

    onOpenCard(card);
  };

  return (
    <article
      className={`deck-card-row deck-considering-row ${onOpenCard ? 'is-openable' : ''}`.trim()}
      onClick={handleOpenCard}
    >
      <img
        src={card.image_url}
        alt={card.name}
        loading="lazy"
        decoding="async"
      />

      <div className="deck-card-copy">
        <h4>{card.name}</h4>
        <div className="deck-owned-panel">
          <span className={`deck-role-badge is-${card.deck_role || 'main'}`}>{roleLabel}</span>
          <span className="deck-considering-badge">Considering</span>
        </div>
        <p>{cardSummary}</p>
        <span>{card.set_name || 'Set desconocido'}</span>

        <div className="deck-owned-panel">
          <span>En coleccion: x{card.owned_quantity || 0}</span>
          <span>Guardadas aqui: x{card.quantity}</span>
        </div>

        <div className="deck-considering-copy">
          Estas copias se quedan fuera del mazo principal, de la curva y de la mano inicial.
        </div>
      </div>

      <div className="deck-card-controls deck-considering-controls">
        <div className="quantity-stepper-controls deck-stepper-controls">
          <button
            type="button"
            onClick={() => onAdjustQuantity(card.id, -1)}
            disabled={isUpdating}
          >
            -
          </button>
          <span className="deck-stepper-value">x{card.quantity}</span>
          <button
            type="button"
            onClick={() => onAdjustQuantity(card.id, 1)}
            disabled={isUpdating || card.quantity >= (card.max_quantity_allowed || 4)}
          >
            +
          </button>
        </div>

        <button
          type="button"
          className="deck-action-button is-soft"
          onClick={() => onMoveToMainDeck(card.id)}
          disabled={isMoving}
        >
          {isMoving
            ? 'Moviendo...'
            : card.deck_role === 'egg'
              ? 'Pasar 1 al Digi-Egg'
              : 'Pasar 1 al mazo'}
        </button>

        <span className="deck-card-limit-note">Max {card.max_quantity_allowed || 4}</span>
      </div>
    </article>
  );
}

export default DeckConsideringRow;
