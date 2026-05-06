import React, { useRef } from 'react';

function DeckImportPanel({
  isOpen,
  importingDeck,
  importDeckName,
  importDeckText,
  activeTcgSlug,
  onToggle,
  onImportDeckNameChange,
  onImportDeckTextChange,
  onSubmitListImport,
  onImportFile,
}) {
  const fileInputRef = useRef(null);

  const handleFileSelection = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      await onImportFile(file);
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="create-deck-secondary-actions create-deck-secondary-actions-import">
      <button
        type="button"
        className="ghost-button"
        onClick={onToggle}
        disabled={importingDeck}
      >
        {isOpen ? 'Ocultar importador' : 'Importar mazo'}
      </button>

      <span className="deck-import-copy">
        Empieza pegando una lista de cartas. El JSON o TXT queda como opcion secundaria.
      </span>

      {isOpen && (
        <div className="deck-import-panel panel">
          <div className="deck-import-panel-header">
            <div>
              <span className="eyebrow">Importacion rapida</span>
              <h3>Pegar lista de cartas</h3>
              <p>
                Usa una linea por carta, por ejemplo <code>4xST01-005</code> o <code>4 ST01-005 Nombre de carta</code>.
                {activeTcgSlug === 'digimon' ? ' En Digimon tambien acepta listas tipo 4 BT12-002_P0 DemiVeemon y los Digi-Egg se detectan solos.' : ''}
              </p>
            </div>
          </div>

          <div className="deck-import-form">
            <input
              type="text"
              value={importDeckName}
              onChange={(event) => onImportDeckNameChange(event.target.value)}
              placeholder="Nombre opcional del mazo importado"
              maxLength={100}
            />

            <textarea
              value={importDeckText}
              onChange={(event) => onImportDeckTextChange(event.target.value)}
              placeholder={activeTcgSlug === 'digimon'
                ? '4 BT12-002_P0 DemiVeemon\n4 BT12-021 Veemon\n4 AD1-011 Paildramon'
                : '4xOP01-001\n4xOP01-016\n2xST01-005'}
              rows={10}
              spellCheck={false}
            />

            <div className="deck-import-panel-actions">
              <button
                type="button"
                onClick={onSubmitListImport}
                disabled={importingDeck || !importDeckText.trim()}
              >
                {importingDeck ? 'Importando...' : 'Importar desde lista'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importingDeck}
              >
                Cargar archivo JSON o TXT
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.txt,text/plain,application/json"
        className="deck-import-input"
        onChange={handleFileSelection}
      />
    </div>
  );
}

export default DeckImportPanel;
