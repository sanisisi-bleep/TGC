import React from 'react';

function SearchDeckPickerModal({
  deckPickerCard,
  activeGame,
  loadingDecks,
  decks,
  newDeckName,
  submittingDeckAction,
  onClose,
  onNewDeckNameChange,
  onAddCardToExistingDeck,
  onCreateDeckAndAddCard,
}) {
  if (!deckPickerCard) {
    return null;
  }

  return (
    <div className="card-modal" onClick={() => !submittingDeckAction && onClose()}>
      <div className="deck-picker-modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-header">
          <h2>Anadir a mazo</h2>
          <p>Elige un mazo existente o crea uno nuevo para {deckPickerCard.name}.</p>
        </div>

        <div className="deck-picker-section">
          <span className="collection-panel-label">Mazos existentes</span>
          <div className="deck-picker-list">
            {loadingDecks ? (
              <p className="collection-empty-text">Cargando mazos...</p>
            ) : decks.length > 0 ? (
              decks.map((deck) => (
                <button
                  key={deck.id}
                  type="button"
                  className="deck-picker-option"
                  onClick={() => onAddCardToExistingDeck(deck.id)}
                  disabled={submittingDeckAction}
                >
                  <strong>{deck.name}</strong>
                  <span>Anadir 1 copia a este mazo</span>
                </button>
              ))
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
            <button type="button" onClick={onCreateDeckAndAddCard} disabled={submittingDeckAction}>
              {submittingDeckAction ? 'Procesando...' : 'Crear y anadir'}
            </button>
          </div>
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
