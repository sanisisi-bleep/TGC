import React from 'react';

function DeckDetailActions({
  onOpenList,
  onExportJson,
  onShare,
  onClone,
  onDelete,
  onClose,
  isSharing,
  isCloning,
  isDeleting,
}) {
  return (
    <div className="deck-detail-actions">
      <div className="deck-action-group">
        <span className="deck-action-group-label">Compartir y exportar</span>
        <div className="deck-action-strip">
          <button
            type="button"
            className="deck-action-button is-primary"
            onClick={onOpenList}
          >
            Lista del mazo
          </button>
          <button
            type="button"
            className="deck-action-button is-soft"
            onClick={onExportJson}
          >
            Exportar JSON
          </button>
          <button
            type="button"
            className="deck-action-button is-soft"
            onClick={onShare}
            disabled={isSharing}
          >
            {isSharing ? 'Compartiendo...' : 'Compartir'}
          </button>
        </div>
      </div>

      <div className="deck-action-group">
        <span className="deck-action-group-label">Gestion del mazo</span>
        <div className="deck-action-strip">
          <button
            type="button"
            className="deck-action-button is-soft"
            onClick={onClone}
            disabled={isCloning}
          >
            {isCloning ? 'Clonando...' : 'Clonar'}
          </button>
          <button
            type="button"
            className="deck-action-button is-danger"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Borrando...' : 'Borrar'}
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
    </div>
  );
}

export default DeckDetailActions;
