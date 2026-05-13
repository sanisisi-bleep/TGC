import React from 'react';
import { buildCollectionMeta } from '../../utils/collectionView';
import { isInteractiveElementTarget } from '../../utils/clickTargets';

const getRoleLabel = (deckRole) => {
  if (deckRole === 'leader') {
    return 'Leader';
  }

  if (deckRole === 'legend') {
    return 'Legend';
  }

  if (deckRole === 'egg') {
    return 'Digi-Egg';
  }

  if (deckRole === 'rune') {
    return 'Rune';
  }

  if (deckRole === 'battlefield') {
    return 'Battlefield';
  }

  if (deckRole === 'sideboard') {
    return 'Sideboard';
  }

  if (deckRole === 'don') {
    return 'DON!!';
  }

  return 'Main';
};

function DeckAdvancedEditorDeckRow({
  card,
  sectionKey,
  isBusy = false,
  activeTcgSlug,
  onAdjustQuantity,
  onMoveToConsidering,
  onMoveToMainDeck,
  onOpenCard,
}) {
  const roleLabel = getRoleLabel(card?.deck_role);
  const metaLine = buildCollectionMeta(card, activeTcgSlug);
  const isConsideringRow = sectionKey === 'considering';
  const maxQuantity = Number(card?.max_quantity_allowed) || 4;

  const handleOpenCard = (event) => {
    if (!onOpenCard || isInteractiveElementTarget(event.target)) {
      return;
    }

    onOpenCard(card);
  };

  return (
    <article
      className={`deck-editor-deck-row ${card?.missing_quantity > 0 ? 'has-missing-copies' : ''} ${onOpenCard ? 'is-openable' : ''}`.trim()}
      onClick={handleOpenCard}
    >
      <img
        src={card?.image_url}
        alt={card?.name}
        width="72"
        height="96"
        loading="lazy"
        decoding="async"
      />

      <div className="deck-editor-deck-copy">
        <div className="deck-editor-deck-heading">
          <h4>{card?.name}</h4>
          <div className="deck-owned-panel">
            <span className={`deck-role-badge is-${card?.deck_role || 'main'}`}>{roleLabel}</span>
            {card?.is_chosen_champion && <span className="deck-role-badge is-main">Chosen Champion</span>}
            {isConsideringRow && <span className="deck-considering-badge">Considering</span>}
          </div>
        </div>

        <p>{metaLine}</p>

        <div className="deck-editor-deck-status">
          <span>{card?.set_name || 'Set desconocido'}</span>
          <span>En coleccion x{Number(card?.owned_quantity) || 0}</span>
          {Number(card?.missing_quantity) > 0 ? (
            <span className="deck-missing-text">
              Faltan x{Number(card?.missing_quantity) || 0}
            </span>
          ) : (
            <span className="deck-covered-text">
              Cubiertas x{Number(card?.fulfilled_quantity) || 0}
            </span>
          )}
        </div>

        {card?.color_matches_leader === false && (
          <div className="deck-role-warning">
            {card?.color_warning_text || 'Fuera de color con el Leader'}
          </div>
        )}
      </div>

      <div className="deck-editor-deck-controls" data-ignore-card-open="true">
        <div className="quantity-stepper-controls deck-stepper-controls">
          <button
            type="button"
            onClick={() => onAdjustQuantity(card.id, -1)}
            disabled={isBusy}
          >
            -
          </button>
          <span className="deck-stepper-value">x{Number(card?.quantity) || 0}</span>
          <button
            type="button"
            onClick={() => onAdjustQuantity(card.id, 1)}
            disabled={isBusy || (Number(card?.quantity) || 0) >= maxQuantity}
          >
            +
          </button>
        </div>

        {isConsideringRow ? (
          <button
            type="button"
            className="deck-action-button is-soft deck-inline-action"
            onClick={() => onMoveToMainDeck(card.id)}
            disabled={isBusy}
          >
            {card?.deck_role === 'egg' ? 'Pasar al Egg' : 'Pasar al mazo'}
          </button>
        ) : (
          <button
            type="button"
            className="deck-action-button is-soft deck-inline-action"
            onClick={() => onMoveToConsidering(card.id)}
            disabled={isBusy || (Number(card?.quantity) || 0) <= 0}
          >
            Considering
          </button>
        )}

        <span className="deck-card-limit-note">Max {maxQuantity}</span>
      </div>
    </article>
  );
}

export default DeckAdvancedEditorDeckRow;
