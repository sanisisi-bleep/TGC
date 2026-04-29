import React from 'react';
import DeckCardRow from './DeckCardRow';
import DeckConsideringRow from './DeckConsideringRow';
import DeckDetailActions from './DeckDetailActions';
import DeckStatsPanel from './DeckStatsPanel';
import { MAX_COPIES_PER_CARD } from '../../utils/deckTools';

function DeckDetailModal({
  isOpen,
  isLoading,
  selectedDeck,
  selectedDeckDistinctCards,
  selectedDeckSummary,
  selectedDeckConsideringTotal,
  selectedDeckIsOnePiece,
  selectedDeckIsDigimon,
  deckCardView,
  onDeckCardViewChange,
  deckStats,
  draftDeckName,
  onDraftDeckNameChange,
  renamingDeckId,
  onRenameDeck,
  sharingDeckId,
  cloningDeckId,
  deletingDeckId,
  onShareDeck,
  onCloneDeck,
  onDeleteDeck,
  onClose,
  onOpenDeckList,
  onExportDeck,
  advancedDeckControlsEnabled,
  editingAssignmentCardId,
  updatingAssignmentCardId,
  updatingDeckCardId,
  movingConsideringCardId,
  updatingConsideringCardId,
  getDeckActionQuantity,
  onDeckActionQuantityChange,
  commitDeckActionQuantity,
  onToggleAssignmentEditor,
  onAdjustCoverage,
  onApplyDeckBatchQuantity,
  onAdjustDeckQuantity,
  onMoveDeckCardToConsidering,
  onApplyConsideringBatchQuantity,
  onAdjustConsideringQuantity,
  onMoveConsideringCardToDeck,
  onOpenCard,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="card-modal deck-modal" onClick={onClose}>
      <div className="deck-detail panel" onClick={(event) => event.stopPropagation()}>
        {isLoading && !selectedDeck ? (
          <div className="deck-detail-loading">
            <h2>Cargando mazo...</h2>
          </div>
        ) : selectedDeck ? (
          <>
            <div className="deck-detail-header">
              <div>
                <span className="eyebrow">Detalle del mazo</span>
                <div className="deck-title-edit">
                  <input
                    type="text"
                    value={draftDeckName}
                    onChange={(event) => onDraftDeckNameChange(event.target.value)}
                    maxLength={100}
                  />
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={onRenameDeck}
                    disabled={renamingDeckId === selectedDeck?.id}
                  >
                    {renamingDeckId === selectedDeck?.id ? 'Guardando...' : 'Renombrar'}
                  </button>
                </div>
                <p>
                  {`${selectedDeckDistinctCards} cartas distintas | ${selectedDeckSummary}${selectedDeckConsideringTotal > 0 ? ` | Considering ${selectedDeckConsideringTotal}` : ''}`}
                </p>
                <div className="deck-status-row">
                  <span className={`deck-status-chip ${selectedDeck?.is_complete ? 'is-complete' : 'is-incomplete'}`}>
                    {selectedDeck?.is_complete ? 'Mazo completo' : 'Mazo incompleto'}
                  </span>
                  <span className="deck-status-chip deck-progress-chip">
                    {selectedDeckIsOnePiece
                      ? `Main ${selectedDeck?.main_deck_cards || 0}/${selectedDeck?.required_main_deck_cards || 50}`
                      : selectedDeckIsDigimon
                        ? `Main ${selectedDeck?.main_deck_cards || 0}/${selectedDeck?.required_main_deck_cards || 50}`
                        : `${selectedDeck?.total_cards || 0}/${selectedDeck?.max_cards || 50}`}
                  </span>
                  {selectedDeckIsOnePiece && (
                    <>
                      <span className="deck-status-chip deck-progress-chip">
                        Leader {selectedDeck?.leader_cards || 0}/{selectedDeck?.required_leader_cards || 1}
                      </span>
                      <span className="deck-status-chip deck-progress-chip">
                        DON {selectedDeck?.don_cards || 0}/{selectedDeck?.recommended_don_cards || 10}
                      </span>
                    </>
                  )}
                  {selectedDeckIsDigimon && (
                    <span className="deck-status-chip deck-progress-chip">
                      Eggs {selectedDeck?.egg_cards || 0}/{selectedDeck?.max_egg_cards || 5}
                    </span>
                  )}
                  {(selectedDeck?.missing_copies || 0) > 0 && (
                    <span className="deck-status-chip deck-missing-chip">
                      Faltan {selectedDeck?.missing_copies} copias
                    </span>
                  )}
                  {selectedDeckConsideringTotal > 0 && (
                    <span className="deck-status-chip deck-progress-chip">
                      Considering {selectedDeckConsideringTotal}
                    </span>
                  )}
                </div>
                <div className="view-toggle deck-view-toggle" role="tablist" aria-label="Vista del mazo">
                  <button
                    type="button"
                    className={deckCardView === 'detail' ? 'is-active' : ''}
                    onClick={() => onDeckCardViewChange('detail')}
                  >
                    Ficha
                  </button>
                  <button
                    type="button"
                    className={deckCardView === 'grid' ? 'is-active' : ''}
                    onClick={() => onDeckCardViewChange('grid')}
                  >
                    Cuadricula
                  </button>
                  <button
                    type="button"
                    className={deckCardView === 'inventory' ? 'is-active' : ''}
                    onClick={() => onDeckCardViewChange('inventory')}
                  >
                    Solo copias
                  </button>
                </div>
              </div>
              <DeckDetailActions
                onOpenList={() => onOpenDeckList(selectedDeck)}
                onExportJson={() => onExportDeck(selectedDeck)}
                onShare={() => onShareDeck(selectedDeck)}
                onClone={() => onCloneDeck(selectedDeck.id)}
                onDelete={() => onDeleteDeck(selectedDeck.id, selectedDeck.name)}
                onClose={onClose}
                isSharing={sharingDeckId === selectedDeck?.id}
                isCloning={cloningDeckId === selectedDeck?.id}
                isDeleting={deletingDeckId === selectedDeck?.id}
              />
            </div>

            <DeckStatsPanel stats={deckStats} />

            <div
              className={`deck-detail-grid ${deckCardView === 'grid' ? 'is-grid' : ''} ${deckCardView === 'inventory' ? 'is-inventory-grid' : ''}`.trim()}
            >
              {(selectedDeck?.cards || []).map((card) => (
                <DeckCardRow
                  key={card.id}
                  card={card}
                  actionQuantity={getDeckActionQuantity(`main:${card.id}`)}
                  deckCardView={deckCardView}
                  advancedDeckControlsEnabled={advancedDeckControlsEnabled}
                  editingAssignmentCardId={editingAssignmentCardId}
                  updatingAssignmentCardId={updatingAssignmentCardId}
                  updatingDeckCardId={updatingDeckCardId}
                  maxCopiesPerCard={selectedDeck?.max_copies_per_card || MAX_COPIES_PER_CARD}
                  onActionQuantityChange={(cardId, value) => onDeckActionQuantityChange(`main:${cardId}`, value)}
                  onApplyBatchQuantity={(cardId, direction) => onApplyDeckBatchQuantity(selectedDeck.id, cardId, `main:${cardId}`, direction)}
                  onToggleAssignmentEditor={onToggleAssignmentEditor}
                  onAdjustCoverage={onAdjustCoverage}
                  onAdjustQuantity={(cardId, delta) => onAdjustDeckQuantity(selectedDeck.id, cardId, delta)}
                  onMoveToConsidering={(cardId) => onMoveDeckCardToConsidering(
                    selectedDeck.id,
                    cardId,
                    Math.min(commitDeckActionQuantity(`main:${cardId}`), Number(card.quantity) || 1),
                  )}
                  onOpenCard={onOpenCard}
                />
              ))}
            </div>

            {(selectedDeck?.cards || []).length === 0 && (
              <div className="empty-state subtle-empty">
                <p>Este mazo todavia no tiene cartas.</p>
              </div>
            )}

            {selectedDeckIsDigimon && (
              <section className="deck-considering-section panel">
                <div className="deck-considering-header">
                  <div>
                    <span className="eyebrow">Digi-Egg Deck</span>
                    <h3>Huevos del mazo</h3>
                    <p>
                      Esta seccion no entra en la mano inicial y se valida aparte del main deck.
                    </p>
                  </div>
                  <div className="deck-status-row">
                    <span className="deck-status-chip deck-progress-chip">
                      {selectedDeck?.egg_unique_cards || 0} distintas
                    </span>
                    <span className="deck-status-chip deck-progress-chip">
                      {selectedDeck?.egg_total_cards || 0} copias
                    </span>
                  </div>
                </div>

                {(selectedDeck?.egg_cards || []).length > 0 ? (
                  <div
                    className={`deck-detail-grid ${deckCardView === 'grid' ? 'is-grid' : ''} ${deckCardView === 'inventory' ? 'is-inventory-grid' : ''}`.trim()}
                  >
                    {(selectedDeck?.egg_cards || []).map((card) => (
                      <DeckCardRow
                        key={`egg-${card.id}`}
                        card={card}
                        actionQuantity={getDeckActionQuantity(`egg:${card.id}`)}
                        deckCardView={deckCardView}
                        advancedDeckControlsEnabled={advancedDeckControlsEnabled}
                        editingAssignmentCardId={editingAssignmentCardId}
                        updatingAssignmentCardId={updatingAssignmentCardId}
                        updatingDeckCardId={updatingDeckCardId}
                        maxCopiesPerCard={selectedDeck?.max_copies_per_card || MAX_COPIES_PER_CARD}
                        onActionQuantityChange={(cardId, value) => onDeckActionQuantityChange(`egg:${cardId}`, value)}
                        onApplyBatchQuantity={(cardId, direction) => onApplyDeckBatchQuantity(selectedDeck.id, cardId, `egg:${cardId}`, direction)}
                        onToggleAssignmentEditor={onToggleAssignmentEditor}
                        onAdjustCoverage={onAdjustCoverage}
                        onAdjustQuantity={(cardId, delta) => onAdjustDeckQuantity(selectedDeck.id, cardId, delta)}
                        onMoveToConsidering={(cardId) => onMoveDeckCardToConsidering(
                          selectedDeck.id,
                          cardId,
                          Math.min(commitDeckActionQuantity(`egg:${cardId}`), Number(card.quantity) || 1),
                        )}
                        onOpenCard={onOpenCard}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state subtle-empty">
                    <p>Todavia no has anadido cartas al Digi-Egg Deck.</p>
                  </div>
                )}
              </section>
            )}

            <section className="deck-considering-section panel">
              <div className="deck-considering-header">
                <div>
                  <span className="eyebrow">Considering</span>
                  <h3>Cartas en observacion</h3>
                  <p>
                    Guarda aqui pruebas y opciones sin que cuenten para la lista principal,
                    la curva ni la mano inicial.
                  </p>
                </div>
                <div className="deck-status-row">
                  <span className="deck-status-chip deck-progress-chip">
                    {selectedDeck?.considering_unique_cards || 0} distintas
                  </span>
                  <span className="deck-status-chip deck-progress-chip">
                    {selectedDeckConsideringTotal} copias
                  </span>
                </div>
              </div>

              {(selectedDeck?.considering_cards || []).length > 0 ? (
                <div className="deck-considering-list">
                  {(selectedDeck?.considering_cards || []).map((card) => (
                    <DeckConsideringRow
                      key={`considering-${card.id}`}
                      card={card}
                      actionQuantity={getDeckActionQuantity(`considering:${card.id}`)}
                      movingConsideringCardId={movingConsideringCardId}
                      updatingConsideringCardId={updatingConsideringCardId}
                      onActionQuantityChange={(cardId, value) => onDeckActionQuantityChange(`considering:${cardId}`, value)}
                      onApplyBatchQuantity={(cardId, direction) => onApplyConsideringBatchQuantity(selectedDeck.id, cardId, `considering:${cardId}`, direction)}
                      onAdjustQuantity={(cardId, delta) => onAdjustConsideringQuantity(selectedDeck.id, cardId, delta)}
                      onMoveToMainDeck={(cardId) => onMoveConsideringCardToDeck(
                        selectedDeck.id,
                        cardId,
                        Math.min(commitDeckActionQuantity(`considering:${cardId}`), Number(card.quantity) || 1),
                      )}
                      onOpenCard={onOpenCard}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state subtle-empty">
                  <p>Todavia no has guardado cartas en considering para este mazo.</p>
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="deck-detail-loading">
            <h2>No se pudo cargar el mazo.</h2>
          </div>
        )}
      </div>
    </div>
  );
}

export default DeckDetailModal;
