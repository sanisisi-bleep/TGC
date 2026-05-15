import React from 'react';

function DeckHistoryModal({
  isOpen,
  deckName,
  history = [],
  isLoading = false,
  isSavingCheckpoint = false,
  onCreateCheckpoint,
  onCompareVersion,
  onClose,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="card-modal deck-modal" onClick={onClose}>
      <div className="deck-history-modal panel" onClick={(event) => event.stopPropagation()}>
        <div className="deck-history-modal__header">
          <div>
            <span className="eyebrow">Historial del mazo</span>
            <h2>{deckName || 'Mazo'}</h2>
            <p>Revisa checkpoints automáticos y compara el mazo actual con cualquier version guardada.</p>
          </div>

          <div className="deck-action-strip">
            <button
              type="button"
              className="deck-action-button is-soft"
              onClick={onCreateCheckpoint}
              disabled={isSavingCheckpoint}
            >
              {isSavingCheckpoint ? 'Guardando...' : 'Guardar checkpoint'}
            </button>
            <button
              type="button"
              className="deck-action-button is-neutral"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state subtle-empty">
            <p>Cargando historial...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="empty-state subtle-empty">
            <p>Todavia no hay versiones guardadas para este mazo.</p>
          </div>
        ) : (
          <div className="deck-history-list">
            {history.map((entry) => (
              <article key={entry.id} className="deck-history-entry">
                <div className="deck-history-entry__copy">
                  <div className="deck-history-entry__title">
                    <strong>{`v${entry.version_number}`}</strong>
                    <span>{entry.source_label}</span>
                    {entry.label && <em>{entry.label}</em>}
                  </div>
                  <p>
                    {`${entry.distinct_cards || 0} cartas distintas | ${entry.total_cards || 0} copias`}
                  </p>
                  <div className="deck-status-row">
                    <span className={`deck-status-chip ${entry.is_complete ? 'is-complete' : 'is-incomplete'}`}>
                      {entry.is_complete ? 'Version completa' : 'Version incompleta'}
                    </span>
                    {(entry.considering_total_cards || 0) > 0 && (
                      <span className="deck-status-chip deck-progress-chip">
                        Considering {entry.considering_total_cards}
                      </span>
                    )}
                    {(entry.egg_total_cards || 0) > 0 && (
                      <span className="deck-status-chip deck-progress-chip">
                        Eggs {entry.egg_total_cards}
                      </span>
                    )}
                    {(entry.don_cards || 0) > 0 && (
                      <span className="deck-status-chip deck-progress-chip">
                        DON {entry.don_cards}
                      </span>
                    )}
                    {(entry.rune_total_cards || 0) > 0 && (
                      <span className="deck-status-chip deck-progress-chip">
                        Runes {entry.rune_total_cards}
                      </span>
                    )}
                  </div>
                </div>

                <div className="deck-history-entry__actions">
                  <time dateTime={entry.created_at}>
                    {new Date(entry.created_at).toLocaleString('es-ES', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </time>
                  <button
                    type="button"
                    className="deck-action-button is-primary"
                    onClick={() => onCompareVersion(entry)}
                  >
                    Comparar con actual
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DeckHistoryModal;
