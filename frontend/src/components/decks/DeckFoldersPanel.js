import React, { useEffect, useMemo, useState } from 'react';

const UNGROUPED_FOLDER_KEY = 'ungrouped';

function DeckFoldersPanel({
  activeGame,
  folders,
  ungroupedDecks,
  decksByFolderId,
  newFolderName,
  onNewFolderNameChange,
  onCreateFolder,
  isCreatingFolder,
  draggedDeckId,
  onDropDeckToFolder,
  onRenameFolder,
  onDeleteFolder,
  renderDeckCard,
}) {
  const [activeFolderKey, setActiveFolderKey] = useState(UNGROUPED_FOLDER_KEY);
  const [folderSearchTerm, setFolderSearchTerm] = useState('');

  const filteredFolders = useMemo(() => {
    const normalizedSearch = folderSearchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return folders;
    }

    return folders.filter((folder) => String(folder.name || '').toLowerCase().includes(normalizedSearch));
  }, [folderSearchTerm, folders]);

  useEffect(() => {
    if (activeFolderKey === UNGROUPED_FOLDER_KEY) {
      return;
    }

    const stillExists = folders.some((folder) => String(folder.id) === String(activeFolderKey));
    if (!stillExists) {
      setActiveFolderKey(UNGROUPED_FOLDER_KEY);
    }
  }, [activeFolderKey, folders]);

  const activeFolder = useMemo(
    () => folders.find((folder) => String(folder.id) === String(activeFolderKey)) || null,
    [activeFolderKey, folders]
  );

  const activeDecks = useMemo(() => {
    if (activeFolderKey === UNGROUPED_FOLDER_KEY) {
      return ungroupedDecks;
    }

    return decksByFolderId[String(activeFolderKey)] || [];
  }, [activeFolderKey, decksByFolderId, ungroupedDecks]);

  const totalDecksInsideFolders = useMemo(
    () => folders.reduce((total, folder) => total + ((decksByFolderId[String(folder.id)] || []).length), 0),
    [decksByFolderId, folders]
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    onCreateFolder();
  };

  const activeDropReady = draggedDeckId !== null;
  const activeFolderTitle = activeFolder ? activeFolder.name : 'Sin carpeta';
  const activeFolderDescription = activeFolder
    ? `Mueve aqui mazos de ${activeGame.shortName} o arrastralos a otra carpeta desde la barra superior.`
    : `Aqui caen los mazos que aun no has ordenado. Tambien sirve como zona rapida para sacar mazos de una carpeta.`;

  const renderFolderChip = (folder) => {
    const folderDeckCount = (decksByFolderId[String(folder.id)] || []).length;
    const isSelected = String(activeFolderKey) === String(folder.id);
    const isDropTarget = activeDropReady && !isSelected;

    return (
      <button
        key={folder.id}
        type="button"
        className={`deck-folder-chip${isSelected ? ' is-selected' : ''}${isDropTarget ? ' is-drop-ready' : ''}`}
        onClick={() => setActiveFolderKey(String(folder.id))}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDropDeckToFolder(folder.id);
          setActiveFolderKey(String(folder.id));
        }}
      >
        <span className="deck-folder-chip-name">{folder.name}</span>
        <span className="deck-folder-chip-count">{folderDeckCount}</span>
      </button>
    );
  };

  return (
    <section className="deck-folders-panel panel">
      <div className="deck-folders-header">
        <div className="deck-folders-copy">
          <strong>Carpetas de mazos</strong>
          <span>
            Ordena tus mazos de {activeGame.shortName} sin convertir `Mis Mazos` en una pared infinita.
            Selecciona una carpeta para verla, y arrastra los mazos entre chips para recolocarlos rapido.
          </span>
        </div>

        <div className="deck-folder-metrics" aria-label="Resumen de carpetas">
          <div className="deck-folder-metric">
            <span>Carpetas</span>
            <strong>{folders.length}</strong>
          </div>
          <div className="deck-folder-metric">
            <span>Dentro</span>
            <strong>{totalDecksInsideFolders}</strong>
          </div>
          <div className="deck-folder-metric">
            <span>Sin carpeta</span>
            <strong>{ungroupedDecks.length}</strong>
          </div>
        </div>
      </div>

      <div className="deck-folders-toolbar">
        <form className="deck-folder-create-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={newFolderName}
            onChange={(event) => onNewFolderNameChange(event.target.value)}
            placeholder={`Nueva carpeta, por ejemplo ${activeGame.slug === 'gundam' ? 'GD03' : 'Test / Torneo / Base'}`}
            maxLength={100}
          />
          <button type="submit" disabled={isCreatingFolder}>
            {isCreatingFolder ? 'Creando...' : 'Crear carpeta'}
          </button>
        </form>

        <div className="deck-folder-filter">
          <input
            type="text"
            value={folderSearchTerm}
            onChange={(event) => setFolderSearchTerm(event.target.value)}
            placeholder="Filtrar carpetas"
            maxLength={100}
          />
        </div>
      </div>

      <div className="deck-folder-rail" role="tablist" aria-label="Carpetas de mazos">
        <button
          type="button"
          className={`deck-folder-chip${activeFolderKey === UNGROUPED_FOLDER_KEY ? ' is-selected' : ''}${activeDropReady && activeFolderKey !== UNGROUPED_FOLDER_KEY ? ' is-drop-ready' : ''}`}
          onClick={() => setActiveFolderKey(UNGROUPED_FOLDER_KEY)}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            onDropDeckToFolder(null);
            setActiveFolderKey(UNGROUPED_FOLDER_KEY);
          }}
        >
          <span className="deck-folder-chip-name">Sin carpeta</span>
          <span className="deck-folder-chip-count">{ungroupedDecks.length}</span>
        </button>

        {filteredFolders.map((folder) => renderFolderChip(folder))}
      </div>

      <section className={`deck-folder-focus panel${activeDropReady ? ' is-drop-ready' : ''}`}>
        <div className="deck-folder-focus-header">
          <div>
            <div className="deck-folder-title-row">
              <h3>{activeFolderTitle}</h3>
              <span className="deck-folder-count">
                {activeDecks.length} {activeDecks.length === 1 ? 'mazo' : 'mazos'}
              </span>
            </div>
            <p>{activeFolderDescription}</p>
          </div>

          {activeFolder ? (
            <div className="deck-folder-actions">
              <button
                type="button"
                className="deck-action-button is-soft"
                onClick={() => onRenameFolder(activeFolder.id)}
              >
                Renombrar
              </button>
              <button
                type="button"
                className="deck-action-button is-soft-danger"
                onClick={() => onDeleteFolder(activeFolder.id)}
              >
                Borrar carpeta
              </button>
            </div>
          ) : null}
        </div>

        {activeDecks.length > 0 ? (
          <div className="decks-list deck-folder-decks">
            {activeDecks.map((deck) => renderDeckCard(deck))}
          </div>
        ) : (
          <div className="deck-folder-empty">
            {activeFolder
              ? 'Esta carpeta esta vacia. Arrastra mazos encima del chip de la carpeta para llenarla.'
              : `No hay mazos sueltos ahora mismo. Arrastra un mazo aqui o usa el boton "Sacar" dentro de una carpeta.`}
          </div>
        )}
      </section>
    </section>
  );
}

export default DeckFoldersPanel;
