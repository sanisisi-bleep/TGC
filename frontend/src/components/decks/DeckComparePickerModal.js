import React from 'react';

function DeckComparePickerModal({
  isOpen,
  deckName,
  decks = [],
  selectedDeckId = '',
  onSelectDeckId,
  onConfirm,
  onClose,
  isLoading = false,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="card-modal deck-modal" onClick={onClose}>
      <div className="deck-compare-picker panel" onClick={(event) => event.stopPropagation()}>
        <div className="deck-history-modal__header">
          <div>
            <span className="eyebrow">Comparar mazos</span>
            <h2>{deckName || 'Mazo actual'}</h2>
            <p>Elige otro mazo del mismo juego para ver que entra, que sale y que cambia de cantidad.</p>
          </div>

          <button
            type="button"
            className="deck-action-button is-neutral"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        <label className="deck-compare-picker__field">
          <span>Comparar con</span>
          <select
            value={selectedDeckId}
            onChange={(event) => onSelectDeckId(event.target.value)}
          >
            <option value="">Selecciona otro mazo</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </label>

        <div className="deck-action-strip">
          <button
            type="button"
            className="deck-action-button is-primary"
            onClick={onConfirm}
            disabled={!selectedDeckId || isLoading}
          >
            {isLoading ? 'Comparando...' : 'Ver comparacion'}
          </button>
          <button
            type="button"
            className="deck-action-button is-neutral"
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeckComparePickerModal;
