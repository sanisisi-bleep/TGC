import React from 'react';

function SearchCardDetailModal({
  card,
  activeTcgSlug,
  onClose,
  onAddToCollection,
  onAddToDeck,
}) {
  if (!card) {
    return null;
  }

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

        <div className="search-card-detail-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => onAddToCollection(card.id)}
          >
            Agregar a Coleccion
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => onAddToDeck(card.id)}
          >
            Agregar al Mazo
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
