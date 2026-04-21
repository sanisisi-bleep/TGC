import React from 'react';
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
    <div className="card-modal" onClick={onClose}>
      <div className="card-detail search-card-detail" onClick={(e) => e.stopPropagation()}>
        <img
          src={card.image_url}
          alt={card.name}
          className="large-image search-card-detail-image"
        />

        <h2>{card.name}</h2>
        <p><strong>Tipo:</strong> {card.card_type}</p>
        <p><strong>Color:</strong> {card.color}</p>
        <p><strong>Rareza:</strong> {card.rarity}</p>
        <p><strong>Set:</strong> {card.set_name || 'Sin set'}</p>
        {card.lv && <p><strong>Nivel:</strong> {card.lv}</p>}
        {card.cost && <p><strong>Costo:</strong> {card.cost}</p>}
        {card.ap && (
          <p>
            <strong>{activeTcgSlug === 'one-piece' ? 'Poder' : 'AP'}:</strong> {card.ap}
          </p>
        )}
        {card.hp && <p><strong>HP:</strong> {card.hp}</p>}
        {card.abilities && (
          <p><strong>{activeTcgSlug === 'one-piece' ? 'Texto' : 'Habilidades'}:</strong> {card.abilities}</p>
        )}
        {card.description && (
          <p><strong>Descripcion:</strong> {card.description}</p>
        )}

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
      </div>
    </div>
  );
}

export default SearchCardDetailModal;
