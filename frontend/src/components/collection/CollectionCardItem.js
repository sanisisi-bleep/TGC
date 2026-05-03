import React from 'react';
import { isInteractiveElementTarget } from '../../utils/clickTargets';
import { buildCollectionMeta, getCollectionDeckSectionLabel } from '../../utils/collectionView';

function CollectionCardItem({
  item,
  collectionView,
  activeTcgSlug,
  decks,
  isUpdating,
  requestedDeckQuantity,
  quantityInputValue,
  onOpenCard,
  onAdjustQuantity,
  onApplyManualChange,
  onQuantityInputChange,
  onOpenDeck,
  onAddToDeck,
}) {
  const isInventoryView = collectionView === 'inventory';
  const collectionSet = item.card.set_name || 'Sin set';

  return (
    <article
      className={`collection-item ${collectionView !== 'detail' ? 'is-grid' : ''} ${isInventoryView ? 'is-inventory' : ''} is-openable`}
      onClick={(event) => {
        if (isInteractiveElementTarget(event.target)) {
          return;
        }

        onOpenCard(item.card);
      }}
    >
      <div className="collection-visual">
        <img
          src={item.card.image_url}
          alt={item.card.name}
          loading="lazy"
          decoding="async"
        />
        {isInventoryView ? (
          <div className="collection-count-panel">
            <span className="collection-panel-label">Copias</span>
            <strong>x{item.total_quantity}</strong>
            <span>Disponibles x{item.available_quantity}</span>
          </div>
        ) : (
          <div className="collection-stepper-panel">
            <span className="collection-panel-label">Copias</span>
            <div className="quantity-stepper-controls">
              <button
                type="button"
                onClick={() => onAdjustQuantity(item.card.id, -1)}
                disabled={isUpdating}
              >
                -
              </button>
              <span>x{item.total_quantity}</span>
              <button
                type="button"
                onClick={() => onAdjustQuantity(item.card.id, 1)}
                disabled={isUpdating}
              >
                +
              </button>
            </div>

            <div className="collection-batch-editor">
              <div className="collection-batch-controls">
                <button
                  type="button"
                  className="secondary-inline-button secondary-inline-button-icon"
                  onClick={() => onApplyManualChange(item.card.id, 'subtract')}
                  disabled={isUpdating}
                  aria-label="Restar varias copias"
                >
                  -
                </button>
                <input
                  id={`collection-quantity-${item.card.id}`}
                  type="number"
                  min="1"
                  step="1"
                  value={quantityInputValue}
                  onChange={(event) => onQuantityInputChange(item.card.id, event.target.value)}
                  disabled={isUpdating}
                />
                <button
                  type="button"
                  className="secondary-inline-button secondary-inline-button-icon"
                  onClick={() => onApplyManualChange(item.card.id, 'add')}
                  disabled={isUpdating}
                  aria-label="Sumar varias copias"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="collection-main">
        <div className="collection-copy">
          <div className="collection-heading">
            <h3>{item.card.name}</h3>
            <div className="collection-counter-row">
              <span className="card-chip">Total: x{item.total_quantity}</span>
              <span className="card-chip card-chip-secondary">
                Disponible: x{item.available_quantity}
              </span>
            </div>
          </div>

          <p className="collection-meta">
            {buildCollectionMeta(item.card, activeTcgSlug)}
          </p>

          <p className="collection-meta">Set: {collectionSet}</p>

          <div className="collection-decks">
            <strong>En mazos</strong>
            {(item.decks || []).length > 0 ? (
              <div className="deck-link-list">
                {item.decks.map((deck) => (
                  <button
                    key={`${deck.id}-${deck.section || 'main'}`}
                    type="button"
                    className="deck-link-button"
                    onClick={() => onOpenDeck(deck.id)}
                  >
                    {deck.name} {getCollectionDeckSectionLabel(deck.section)} x{deck.quantity}
                  </button>
                ))}
              </div>
            ) : (
              <span className="collection-empty-text">Todavia no esta en ningun mazo.</span>
            )}
          </div>
        </div>

        {!isInventoryView && (
          <div className="collection-actions">
            <span className="collection-panel-label">
              Agregar al mazo x{requestedDeckQuantity}
            </span>
            <div className="deck-buttons">
              {decks.map((deck) => (
                <button
                  key={deck.id}
                  type="button"
                  onClick={() => onAddToDeck(deck.id, item.card.id)}
                >
                  {requestedDeckQuantity === 1
                    ? `Agregar a ${deck.name}`
                    : `Agregar x${requestedDeckQuantity} a ${deck.name}`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export default CollectionCardItem;
