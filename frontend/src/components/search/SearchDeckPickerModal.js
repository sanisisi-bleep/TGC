import React from 'react';
import {
  getDeckCardRole,
  getDeckRuleSummary,
  getNewDeckCreationPlan,
  getSearchDeckOptionState,
} from '../../utils/deckTools';
import SearchQuantityControl from './SearchQuantityControl';

function SearchDeckPickerModal({
  deckPickerCard,
  activeGame,
  loadingDecks,
  decks,
  newDeckName,
  actionQuantity,
  submittingDeckAction,
  onClose,
  onActionQuantityChange,
  onActionQuantityBlur,
  onDecreaseActionQuantity,
  onIncreaseActionQuantity,
  onNewDeckNameChange,
  onAddCardToExistingDeck,
  onAddCardToConsidering,
  onCreateDeckAndAddCard,
}) {
  if (!deckPickerCard) {
    return null;
  }

  const activeTcgSlug = activeGame?.slug || 'gundam';
  const cardRole = getDeckCardRole(activeTcgSlug, deckPickerCard.card_type);
  const creationPlan = getNewDeckCreationPlan(activeTcgSlug, deckPickerCard, actionQuantity);
  const ruleSummary = getDeckRuleSummary(activeTcgSlug);

  return (
    <div className="card-modal" onClick={() => !submittingDeckAction && onClose()}>
      <div className="deck-picker-modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-header">
          <h2>Anadir a mazo</h2>
          <p>Elige si {deckPickerCard.name} va al mazo principal o se queda en considering.</p>
          {ruleSummary ? <p>{ruleSummary}</p> : null}
        </div>

        <SearchQuantityControl
          value={String(actionQuantity)}
          onChange={onActionQuantityChange}
          onBlur={onActionQuantityBlur}
          onDecrease={onDecreaseActionQuantity}
          onIncrease={onIncreaseActionQuantity}
          disabled={submittingDeckAction}
          label="Copias a mover"
        />

        <div className="deck-picker-section">
          <span className="collection-panel-label">Mazos existentes</span>
          <div className="deck-picker-list">
            {loadingDecks ? (
              <p className="collection-empty-text">Cargando mazos...</p>
            ) : decks.length > 0 ? (
              decks.map((deck) => {
                const option = getSearchDeckOptionState({
                  activeTcgSlug,
                  deck,
                  card: deckPickerCard,
                  quantity: actionQuantity,
                });
                return (
                  <div key={deck.id} className="deck-picker-option">
                    <strong>{deck.name}</strong>
                    <span>{option.summary}</span>
                    {option.helper && (
                      <span className="deck-picker-option-helper">{option.helper}</span>
                    )}
                    <div className="deck-picker-option-actions">
                      <button
                        type="button"
                        className="deck-action-button is-primary"
                        onClick={() => onAddCardToExistingDeck(deck.id)}
                        disabled={submittingDeckAction || option.disabled}
                      >
                        Anadir al mazo
                      </button>
                      <button
                        type="button"
                        className="deck-action-button is-soft"
                        onClick={() => onAddCardToConsidering(deck.id)}
                        disabled={submittingDeckAction}
                      >
                        Considering
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="collection-empty-text">Todavia no tienes mazos de {activeGame.shortName}.</p>
            )}
          </div>
        </div>

        <div className="deck-picker-section">
          <span className="collection-panel-label">Crear mazo nuevo</span>
          <div className="deck-picker-create">
            <input
              type="text"
              value={newDeckName}
              onChange={(e) => onNewDeckNameChange(e.target.value)}
              placeholder={`Nuevo mazo de ${activeGame.shortName}`}
              maxLength={100}
              disabled={submittingDeckAction}
            />
            <button
              type="button"
              onClick={onCreateDeckAndAddCard}
              disabled={submittingDeckAction || !creationPlan.canCreate}
            >
              {submittingDeckAction ? 'Procesando...' : creationPlan.buttonLabel}
            </button>
          </div>
          {creationPlan.helper && (
            <p className="collection-empty-text">
              {creationPlan.helper}
            </p>
          )}
          {activeTcgSlug === 'one-piece' && cardRole === 'main' && creationPlan.canCreate && (
            <p className="collection-empty-text">
              Si empiezas desde una carta del mazo principal, se creara el mazo y se abrira para que anadas primero el Leader.
            </p>
          )}
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={onClose}
            disabled={submittingDeckAction}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default SearchDeckPickerModal;
