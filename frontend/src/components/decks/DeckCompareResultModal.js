import React, { useMemo } from 'react';
import { buildDeckComparison } from '../../utils/deckCompare';

function DeckCompareList({ title, items, tone, quantityLabelBuilder }) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="deck-compare-section panel">
      <div className="deck-considering-header">
        <div>
          <span className="eyebrow">{tone}</span>
          <h3>{title}</h3>
        </div>
        <span className="deck-status-chip deck-progress-chip">{items.length}</span>
      </div>

      <div className="deck-compare-list">
        {items.map((item) => (
          <article key={item.key} className="deck-compare-entry">
            <div className="deck-compare-entry__copy">
              <strong>{item.name}</strong>
              <p>{`${item.sectionLabel} | ${item.sourceCardId || item.deckKey || 'Sin codigo'}`}</p>
            </div>
            <div className="deck-compare-entry__quantity">
              <span>{quantityLabelBuilder(item)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DeckCompareResultModal({
  isOpen,
  title,
  baseDeck,
  targetDeck,
  isLoading = false,
  onClose,
}) {
  const comparison = useMemo(
    () => buildDeckComparison(baseDeck, targetDeck),
    [baseDeck, targetDeck]
  );

  if (!isOpen) {
    return null;
  }

  const hasDifferences = comparison.added.length > 0
    || comparison.removed.length > 0
    || comparison.changed.length > 0;

  return (
    <div className="card-modal deck-modal" onClick={onClose}>
      <div className="deck-compare-result panel" onClick={(event) => event.stopPropagation()}>
        <div className="deck-history-modal__header">
          <div>
            <span className="eyebrow">Comparacion</span>
            <h2>{title}</h2>
            <p>
              {`${baseDeck?.name || 'Mazo actual'} frente a ${targetDeck?.name || 'objetivo de comparacion'}`}
            </p>
          </div>

          <button
            type="button"
            className="deck-action-button is-neutral"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        <div className="deck-status-row">
          <span className="deck-status-chip deck-progress-chip">
            Entran {comparison.summary.addedCards}
          </span>
          <span className="deck-status-chip deck-progress-chip">
            Salen {comparison.summary.removedCards}
          </span>
          <span className="deck-status-chip deck-progress-chip">
            Cambian {comparison.summary.changedCards}
          </span>
          <span className={`deck-status-chip ${comparison.summary.totalDelta >= 0 ? 'is-complete' : 'is-incomplete'}`}>
            Delta {comparison.summary.totalDelta >= 0 ? '+' : ''}{comparison.summary.totalDelta}
          </span>
        </div>

        {isLoading ? (
          <div className="empty-state subtle-empty">
            <p>Preparando comparacion...</p>
          </div>
        ) : !hasDifferences ? (
          <div className="empty-state subtle-empty">
            <p>Las dos versiones del mazo son iguales.</p>
          </div>
        ) : (
          <div className="deck-compare-grid">
            <DeckCompareList
              title="Cartas que entran"
              tone="Entran"
              items={comparison.added}
              quantityLabelBuilder={(item) => `+${item.quantity}`}
            />
            <DeckCompareList
              title="Cartas que salen"
              tone="Salen"
              items={comparison.removed}
              quantityLabelBuilder={(item) => `-${item.previousQuantity}`}
            />
            <DeckCompareList
              title="Cartas que cambian cantidad"
              tone="Cambian"
              items={comparison.changed}
              quantityLabelBuilder={(item) => `${item.previousQuantity} -> ${item.quantity}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default DeckCompareResultModal;
