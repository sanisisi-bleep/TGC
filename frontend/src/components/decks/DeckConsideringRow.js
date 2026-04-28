import React from 'react';
import { isInteractiveElementTarget } from '../../utils/clickTargets';

function DeckConsideringRow({
  card,
  actionQuantity,
  movingConsideringCardId,
  updatingConsideringCardId,
  onActionQuantityChange,
  onApplyBatchQuantity,
  onAdjustQuantity,
  onMoveToMainDeck,
  onOpenCard,
}) {
  const isMoving = movingConsideringCardId === card.id;
  const isUpdating = updatingConsideringCardId === card.id;
  const requestedQuantity = Number.isInteger(Number(actionQuantity)) && Number(actionQuantity) > 0
    ? Number(actionQuantity)
    : 1;
  const transferQuantity = Math.max(1, Math.min(requestedQuantity, Number(card.quantity) || 1));
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
        <div className="deck-batch-editor">
          <div className="deck-batch-controls">
            <button
              type="button"
              className="secondary-inline-button secondary-inline-button-icon"
              onClick={() => onApplyBatchQuantity(card.id, -requestedQuantity)}
              disabled={isUpdating}
              aria-label="Quitar varias copias de considering"
            >
              -
            </button>
            <input
              type="number"
              min="1"
              step="1"
              value={String(actionQuantity || '1')}
              onChange={(event) => onActionQuantityChange(card.id, event.target.value)}
              disabled={isUpdating}
            />
            <button
              type="button"
              className="secondary-inline-button secondary-inline-button-icon"
              onClick={() => onApplyBatchQuantity(card.id, requestedQuantity)}
              disabled={isUpdating}
              aria-label="Anadir varias copias a considering"
            >
              +
            </button>
          </div>
        </div>

        <button
          type="button"
          className="deck-action-button is-soft"
          onClick={() => onMoveToMainDeck(card.id, transferQuantity)}
          disabled={isMoving}
        >
          {isMoving
            ? 'Moviendo...'
            : card.deck_role === 'egg'
              ? transferQuantity === 1
                ? 'Pasar 1 al Digi-Egg'
                : `Pasar x${transferQuantity} al Digi-Egg`
              : transferQuantity === 1
                ? 'Pasar 1 al mazo'
                : `Pasar x${transferQuantity} al mazo`}
        </button>

        <span className="deck-card-limit-note">Max {card.max_quantity_allowed || 4}</span>
      </div>
    </article>
  );
}

export default DeckConsideringRow;
