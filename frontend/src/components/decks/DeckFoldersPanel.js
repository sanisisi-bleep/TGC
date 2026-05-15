import React from 'react';

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
  const handleSubmit = (event) => {
    event.preventDefault();
    onCreateFolder();
  };

  const renderDropSection = ({ id, title, description, decks, isUngrouped = false }) => {
    const isActiveDrop = draggedDeckId !== null;
    return (
      <section
        key={id}
        className={`deck-folder-section panel${isActiveDrop ? ' is-drop-ready' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDropDeckToFolder(isUngrouped ? null : id);
        }}
      >
        <div className="deck-folder-section-header">
          <div>
            <div className="deck-folder-title-row">
              <h3>{title}</h3>
              <span className="deck-folder-count">
                {decks.length} {decks.length === 1 ? 'mazo' : 'mazos'}
              </span>
            </div>
            <p>{description}</p>
          </div>

          {!isUngrouped ? (
            <div className="deck-folder-actions">
              <button
                type="button"
                className="deck-action-button is-soft"
                onClick={() => onRenameFolder(id)}
              >
                Renombrar
              </button>
              <button
                type="button"
                className="deck-action-button is-soft-danger"
                onClick={() => onDeleteFolder(id)}
              >
                Borrar carpeta
              </button>
            </div>
          ) : null}
        </div>

        {decks.length > 0 ? (
          <div className="decks-list deck-folder-decks">
            {decks.map((deck) => renderDeckCard(deck))}
          </div>
        ) : (
          <div className="deck-folder-empty">
            {isUngrouped
              ? `Arrastra aqui mazos de ${activeGame.shortName} para dejarlos fuera de cualquier carpeta.`
              : 'Esta carpeta esta vacia. Suelta mazos aqui para ordenarlos.'}
          </div>
        )}
      </section>
    );
  };

  return (
    <section className="deck-folders-panel panel">
      <div className="deck-folders-copy">
        <strong>Carpetas de mazos</strong>
        <span>
          Ordena tus mazos de {activeGame.shortName} por set, idea o bloque. Puedes arrastrarlos dentro
          de una carpeta o devolverlos a <strong>Sin carpeta</strong>.
        </span>
      </div>

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

      <div className="deck-folders-board">
        {renderDropSection({
          id: 'ungrouped',
          title: 'Sin carpeta',
          description: 'Zona de salida para mazos sueltos o pendientes de ordenar.',
          decks: ungroupedDecks,
          isUngrouped: true,
        })}

        {folders.map((folder) => renderDropSection({
          id: folder.id,
          title: folder.name,
          description: 'Suelta mazos aqui para agruparlos bajo esta carpeta.',
          decks: decksByFolderId[String(folder.id)] || [],
        }))}
      </div>
    </section>
  );
}

export default DeckFoldersPanel;
