import React from 'react';

function DeckListPreviewModal({
  preview,
  onClose,
  onCopy,
  onDownload,
}) {
  if (!preview) {
    return null;
  }

  return (
    <div className="card-modal" onClick={onClose}>
      <div className="deck-list-preview-modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-header">
          <h2>Lista del mazo</h2>
          <p>Formato rapido para copiar, pegar o compartir fuera de la app.</p>
        </div>

        <div className="deck-list-preview-toolbar">
          <div className="deck-list-preview-copy">
            <strong>{preview.name}</strong>
            <span>{preview.text.split('\n').length} lineas listas para compartir.</span>
          </div>
          <div className="deck-action-strip deck-list-preview-actions">
            <button
              type="button"
              className="deck-action-button is-primary"
              onClick={onCopy}
            >
              Copiar lista
            </button>
            <button
              type="button"
              className="deck-action-button is-soft"
              onClick={onDownload}
            >
              Descargar .txt
            </button>
          </div>
        </div>

        <textarea
          className="deck-list-preview-content"
          value={preview.text}
          readOnly
          spellCheck="false"
        />

        <div className="settings-actions">
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

export default DeckListPreviewModal;
