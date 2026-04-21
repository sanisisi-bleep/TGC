import React from 'react';
import CardDetailModal from '../cards/CardDetailModal';
import SearchQuantityControl from './SearchQuantityControl';

function SearchCardDetailModal({
  card,
  activeTcgSlug,
  actionQuantity,
  onActionQuantityChange,
  onActionQuantityBlur,
  onIncreaseActionQuantity,
  onDecreaseActionQuantity,
  onClose,
  onAddToCollection,
  onAddToDeck,
}) {
  if (!card) {
    return null;
  }

  const quantityLabel = actionQuantity === 1 ? '1 copia' : `${actionQuantity} copias`;

  return (
    <CardDetailModal
      card={card}
      activeTcgSlug={activeTcgSlug}
      onClose={onClose}
      footer={(
        <>
          <SearchQuantityControl
            value={String(actionQuantity)}
            onChange={(value) => onActionQuantityChange(card.id, value)}
            onBlur={() => onActionQuantityBlur(card.id)}
            onDecrease={() => onDecreaseActionQuantity(card.id)}
            onIncrease={() => onIncreaseActionQuantity(card.id)}
            label="Copias a anadir"
          />

          <div className="search-card-detail-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onAddToCollection(card.id)}
            >
              {`Agregar ${quantityLabel} a Coleccion`}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onAddToDeck(card.id)}
            >
              {`Agregar ${quantityLabel} al Mazo`}
            </button>
            <button
              type="button"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </>
      )}
    />
  );
}

export default SearchCardDetailModal;
