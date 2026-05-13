import React from 'react';
import DeckAdvancedEditorPanel from './DeckAdvancedEditorPanel';
import DeckStatsPanel from './DeckStatsPanel';

function DeckAdvancedEditorPage({
  selectedDeck,
  selectedDeckDistinctCards,
  selectedDeckSummary,
  selectedDeckConsideringTotal,
  selectedDeckEggCount,
  selectedDeckIsDigimon,
  activeGame,
  activeTgc,
  deckStats,
  addingDeckCardId,
  onAddCardToDeck,
  updatingDeckCardId,
  updatingConsideringCardId,
  movingConsideringCardId,
  onAdjustDeckQuantity,
  onAdjustConsideringQuantity,
  onMoveDeckCardToConsidering,
  onMoveConsideringCardToDeck,
  onOpenCard,
  onBackToDetail,
  onClose,
}) {
  if (!selectedDeck) {
    return null;
  }

  return (
    <div className="decks page-shell deck-editor-page">
      <section className="page-hero decks-hero deck-editor-hero">
        <div>
          <span className="eyebrow">Editor avanzado</span>
          <h1>{selectedDeck.name}</h1>
          <p>
            {`${selectedDeckDistinctCards} cartas distintas | ${selectedDeckSummary}${selectedDeckConsideringTotal > 0 ? ` | Considering ${selectedDeckConsideringTotal}` : ''}`}
          </p>
          <div className="deck-status-row">
            <span className={`deck-status-chip ${selectedDeck?.is_complete ? 'is-complete' : 'is-incomplete'}`}>
              {selectedDeck?.is_complete ? 'Mazo completo' : 'Mazo incompleto'}
            </span>
            {selectedDeckIsDigimon && (
              <span className="deck-status-chip deck-progress-chip">
                Eggs {selectedDeckEggCount || 0}/{selectedDeck?.max_egg_cards || 5}
              </span>
            )}
            {(selectedDeck?.missing_copies || 0) > 0 && (
              <span className="deck-status-chip deck-missing-chip">
                Faltan {selectedDeck?.missing_copies} copias
              </span>
            )}
          </div>
        </div>

        <div className="deck-detail-actions">
          <div className="deck-action-group">
            <span className="deck-action-group-label">Navegacion del editor</span>
            <div className="deck-action-strip">
              <button
                type="button"
                className="deck-action-button is-soft"
                onClick={onBackToDetail}
              >
                Volver al detalle
              </button>
              <button
                type="button"
                className="deck-action-button is-neutral"
                onClick={onClose}
              >
                Cerrar editor
              </button>
            </div>
          </div>
        </div>
      </section>

      <DeckStatsPanel stats={deckStats} />

      <DeckAdvancedEditorPanel
        selectedDeck={selectedDeck}
        activeTcgSlug={activeGame?.slug || 'gundam'}
        activeTgc={activeTgc}
        activeGame={activeGame}
        selectedDeckIsOnePiece={selectedDeck?.composition?.format_mode === 'one-piece'}
        selectedDeckIsDigimon={selectedDeckIsDigimon}
        addingDeckCardId={addingDeckCardId}
        onAddCardToDeck={onAddCardToDeck}
        updatingDeckCardId={updatingDeckCardId}
        updatingConsideringCardId={updatingConsideringCardId}
        movingConsideringCardId={movingConsideringCardId}
        onAdjustDeckQuantity={onAdjustDeckQuantity}
        onAdjustConsideringQuantity={onAdjustConsideringQuantity}
        onMoveDeckCardToConsidering={onMoveDeckCardToConsidering}
        onMoveConsideringCardToDeck={onMoveConsideringCardToDeck}
        onOpenCard={onOpenCard}
      />
    </div>
  );
}

export default DeckAdvancedEditorPage;
