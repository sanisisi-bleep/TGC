import React from 'react';

function SearchCardTile({
  card,
  cardViewMode,
  onOpen,
  onAddToCollection,
  onAddToDeck,
}) {
  return (
    <div
      className={`card-item search-card-item ${cardViewMode === 'compact' ? 'is-compact' : ''}`}
      onClick={() => onOpen(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(card);
        }
      }}
    >
      <img
        src={card.image_url}
        alt={card.name}
        loading="lazy"
        decoding="async"
      />

      <div className="search-card-meta">
        <h3>{card.name}</h3>
        <div className="search-card-tags">
          <span className="search-card-tag">Set: {card.set_name || 'Sin set'}</span>
          <span className="search-card-tag">Tipo: {card.card_type || 'Sin tipo'}</span>
          <span className="search-card-tag">Rareza: {card.rarity || 'Sin rareza'}</span>
        </div>
      </div>

      <div className="search-card-actions">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAddToCollection(card.id);
          }}
        >
          Agregar a Coleccion
        </button>
        <button
          type="button"
          className="ghost-button card-secondary-action"
          onClick={(event) => {
            event.stopPropagation();
            onAddToDeck(card.id);
          }}
        >
          Agregar al Mazo
        </button>
      </div>
    </div>
  );
}

export default SearchCardTile;
