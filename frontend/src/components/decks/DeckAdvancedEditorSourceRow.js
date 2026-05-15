import React from 'react';
import SearchQuantityControl from '../search/SearchQuantityControl';
import { buildCollectionMeta } from '../../utils/collectionView';
import { getDeckCardRole } from '../../utils/deckTools';
import { isInteractiveElementTarget } from '../../utils/clickTargets';

const getAddLabel = (activeTcgSlug, cardType) => {
  const role = getDeckCardRole(activeTcgSlug, cardType);

  if (role === 'leader') {
    return 'Anadir Leader';
  }

  if (role === 'egg') {
    return 'Anadir al Egg';
  }

  if (role === 'don') {
    return 'Anadir DON!!';
  }

  if (role === 'resource') {
    return 'Anadir Resource';
  }

  return 'Anadir al mazo';
};

function DeckAdvancedEditorSourceRow({
  card,
  sourceMode,
  activeTcgSlug,
  actionQuantity,
  optionState,
  isAdding = false,
  onActionQuantityChange,
  onActionQuantityBlur,
  onDecreaseActionQuantity,
  onIncreaseActionQuantity,
  onAddToDeck,
  onOpenCard,
}) {
  const metaLine = buildCollectionMeta(card, activeTcgSlug);
  const addLabel = getAddLabel(activeTcgSlug, card);
  const collectionAvailable = Number(card?.collection_available_quantity);
  const collectionTotal = Number(card?.collection_total_quantity);

  const handleOpenCard = (event) => {
    if (!onOpenCard || isInteractiveElementTarget(event.target)) {
      return;
    }

    onOpenCard(card);
  };

  return (
    <article
      className={`deck-editor-source-row ${onOpenCard ? 'is-openable' : ''}`.trim()}
      onClick={handleOpenCard}
    >
      <img
        src={card?.thumbnail_url || card?.image_url}
        alt={card?.name}
        width="72"
        height="96"
        loading="lazy"
        decoding="async"
        onError={(event) => {
          if (card?.image_url && event.currentTarget.src !== card.image_url) {
            event.currentTarget.src = card.image_url;
          }
        }}
      />

      <div className="deck-editor-source-copy">
        <div className="deck-editor-source-heading">
          <h4>{card?.name}</h4>
          <span className="deck-status-chip deck-progress-chip">
            {card?.set_name || 'Sin set'}
          </span>
        </div>

        <p>{metaLine}</p>

        <div className="deck-editor-source-status">
          <span>{optionState?.summary}</span>
          {sourceMode === 'collection' && Number.isFinite(collectionTotal) && (
            <span>
              Disponibles x{Number.isFinite(collectionAvailable) ? collectionAvailable : 0}
              {' '}de x{collectionTotal}
            </span>
          )}
        </div>

        {optionState?.helper && (
          <div className={`deck-editor-source-helper ${optionState.disabled ? 'is-warning' : ''}`.trim()}>
            {optionState.helper}
          </div>
        )}
      </div>

      <div className="deck-editor-source-actions" data-ignore-card-open="true">
        <SearchQuantityControl
          value={String(actionQuantity)}
          onChange={onActionQuantityChange}
          onBlur={onActionQuantityBlur}
          onDecrease={onDecreaseActionQuantity}
          onIncrease={onIncreaseActionQuantity}
          disabled={isAdding}
          label="Copias"
          compact
        />
        <button
          type="button"
          className="deck-action-button is-primary"
          onClick={onAddToDeck}
          disabled={isAdding || optionState?.disabled}
        >
          {isAdding ? 'Anadiendo...' : addLabel}
        </button>
      </div>
    </article>
  );
}

export default DeckAdvancedEditorSourceRow;
