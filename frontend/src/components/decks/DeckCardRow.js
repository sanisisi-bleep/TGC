import React from 'react';
import { isInteractiveElementTarget } from '../../utils/clickTargets';

function DeckCardRow({
  card,
  deckCardView,
  actionQuantity,
  advancedDeckControlsEnabled,
  editingAssignmentCardId,
  updatingAssignmentCardId,
  updatingDeckCardId,
  maxCopiesPerCard,
  onActionQuantityChange,
  onApplyBatchQuantity,
  onToggleAssignmentEditor,
  onAdjustCoverage,
  onAdjustQuantity,
  onMoveToConsidering,
  onOpenCard,
}) {
  const isInventoryView = deckCardView === 'inventory';
  const isGridView = deckCardView !== 'detail';
  const isEditingAssignment = editingAssignmentCardId === card.id;
  const isUpdatingAssignment = updatingAssignmentCardId === card.id;
  const isUpdatingQuantity = updatingDeckCardId === card.id;
  const maxCoveredCopies = Math.min(card.quantity || 0, card.owned_quantity || 0);
  const maxQuantity = card.max_quantity_allowed || maxCopiesPerCard || 4;
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

  if (isInventoryView) {
    return (
      <article
        className={`deck-card-row is-inventory ${onOpenCard ? 'is-openable' : ''}`.trim()}
        onClick={handleOpenCard}
        title={`${card.name} x${card.quantity}`}
      >
        <img
          src={card.image_url}
          alt={card.name}
          loading="lazy"
          decoding="async"
        />
        <span className="deck-card-inventory-copy">x{card.quantity}</span>
      </article>
    );
  }

  return (
    <article
      className={`deck-card-row ${card.missing_quantity > 0 ? 'has-missing-copies' : ''} ${isGridView ? 'is-grid' : ''} ${isInventoryView ? 'is-inventory' : ''} ${onOpenCard ? 'is-openable' : ''}`.trim()}
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
          {card.color_matches_leader === false && (
            <span className="deck-role-warning">
              {card.color_warning_text || 'Fuera de color con el Leader'}
            </span>
          )}
        </div>
        <p>{cardSummary}</p>
        <span>{card.set_name || 'Set desconocido'}</span>

        <div className="deck-owned-panel">
          <span>En coleccion: x{card.owned_quantity || 0}</span>
        </div>

        {!isInventoryView && advancedDeckControlsEnabled && (
          <div className="deck-advanced-panel">
            <div className="deck-advanced-header">
              <span className="deck-owned-popover-label">Ajustes avanzados del mazo</span>
              <button
                type="button"
                className="deck-owned-manage"
                onClick={() => onToggleAssignmentEditor(card.id)}
                disabled={isUpdatingAssignment}
              >
                {isEditingAssignment ? 'Ocultar ajuste' : 'Ajustar deck'}
              </button>
            </div>

            {isEditingAssignment && (
              <div className="deck-owned-popover">
                <span className="deck-owned-popover-label">
                  Decide cuantas copias quedan cubiertas en este mazo sin tocar tu coleccion.
                </span>
                <div className="deck-owned-controls">
                  <button
                    type="button"
                    className="deck-owned-button"
                    onClick={() => onAdjustCoverage(card.id, -1)}
                    disabled={isUpdatingAssignment || (card.fulfilled_quantity || 0) <= 0}
                  >
                    Marcar falta 1
                  </button>
                  <button
                    type="button"
                    className="deck-owned-button"
                    onClick={() => onAdjustCoverage(card.id, 1)}
                    disabled={isUpdatingAssignment || (card.fulfilled_quantity || 0) >= maxCoveredCopies}
                  >
                    Cubrir 1
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!isInventoryView && !advancedDeckControlsEnabled && (
          <div className="deck-advanced-hint">
            Activa Ajustes avanzados en Configuracion para marcar copias faltantes sin tocar tu coleccion.
          </div>
        )}

        <div className="deck-copy-slots" aria-label="Estado de copias del mazo">
          {Array.from({ length: card.quantity }, (_, index) => (
            <span
              key={`${card.id}-${index}`}
              className={`deck-copy-slot ${index < (card.fulfilled_quantity || 0) ? 'is-covered' : 'is-missing'}`}
            >
              {index + 1}
            </span>
          ))}
        </div>

        {card.missing_quantity > 0 ? (
          <span className="deck-missing-text">
            Cubiertas x{card.fulfilled_quantity || 0} | Faltan x{card.missing_quantity}
          </span>
        ) : (
          <span className="deck-covered-text">Completa x{card.fulfilled_quantity || 0}</span>
        )}
      </div>
      <div className="deck-card-controls">
        <div className="quantity-stepper-controls deck-stepper-controls">
          <button
            type="button"
            onClick={() => onAdjustQuantity(card.id, -1)}
            disabled={isUpdatingQuantity}
          >
            -
          </button>
          <span className="deck-stepper-value">x{card.quantity}</span>
          <button
            type="button"
            onClick={() => onAdjustQuantity(card.id, 1)}
            disabled={isUpdatingQuantity || card.quantity >= maxQuantity}
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
              disabled={isUpdatingQuantity}
              aria-label="Quitar varias copias del mazo"
            >
              -
            </button>
            <input
              type="number"
              min="1"
              step="1"
              value={String(actionQuantity || '1')}
              onChange={(event) => onActionQuantityChange(card.id, event.target.value)}
              disabled={isUpdatingQuantity}
            />
            <button
              type="button"
              className="secondary-inline-button secondary-inline-button-icon"
              onClick={() => onApplyBatchQuantity(card.id, requestedQuantity)}
              disabled={isUpdatingQuantity}
              aria-label="Anadir varias copias al mazo"
            >
              +
            </button>
          </div>
        </div>
        <span className="deck-card-limit-note">Max {maxQuantity}</span>
        {onMoveToConsidering && (
          <button
            type="button"
            className="deck-action-button is-soft deck-inline-action"
            onClick={() => onMoveToConsidering(card.id, transferQuantity)}
            disabled={isUpdatingQuantity || (card.quantity || 0) <= 0}
          >
            {transferQuantity === 1 ? 'Considering' : `Considering x${transferQuantity}`}
          </button>
        )}
      </div>
    </article>
  );
}

export default DeckCardRow;
