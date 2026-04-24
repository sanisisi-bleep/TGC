import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import CardDetailModal from '../components/cards/CardDetailModal';
import DeckCardRow from '../components/decks/DeckCardRow';
import DeckDetailActions from '../components/decks/DeckDetailActions';
import DeckListPreviewModal from '../components/decks/DeckListPreviewModal';
import DeckStatsPanel from '../components/decks/DeckStatsPanel';
import DeckSummaryCard from '../components/decks/DeckSummaryCard';
import { isUnauthorizedError, useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import queryKeys from '../queryKeys';
import { getGameConfig } from '../tcgConfig';
import { getApiErrorMessage } from '../utils/apiMessages';
import {
  MAX_COPIES_PER_CARD,
  applyDeckAssignmentMutation,
  applyDeckQuantityMutation,
  buildDeckExportPayload,
  buildDeckListText,
  buildDeckStats,
  copyTextToClipboard,
  downloadJson,
  downloadText,
  mergeDeckOverviewInList,
  parseDeckListText,
  parseImportedDeckFile,
  safeDeckFilename,
} from '../utils/deckTools';
import {
  adjustDeckAssignment,
  adjustDeckCard,
  cloneDeck,
  createDeck,
  deleteDeck,
  getDeckDetail,
  getDecks,
  importDeck,
  renameDeck,
  shareDeck,
} from '../services/api';

function Decks({ activeTcgSlug, activeTgc }) {
  const activeGame = getGameConfig(activeTcgSlug);
  const { showToast } = useToast();
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const [newDeckName, setNewDeckName] = useState('');
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [draftDeckName, setDraftDeckName] = useState('');
  const [deckCardView, setDeckCardView] = useState(
    () => localStorage.getItem('deckCardViewMode') || 'detail'
  );
  const [selectedCard, setSelectedCard] = useState(null);
  const [editingAssignmentCardId, setEditingAssignmentCardId] = useState(null);
  const [deletingDeckId, setDeletingDeckId] = useState(null);
  const [cloningDeckId, setCloningDeckId] = useState(null);
  const [sharingDeckId, setSharingDeckId] = useState(null);
  const [renamingDeckId, setRenamingDeckId] = useState(null);
  const [importingDeck, setImportingDeck] = useState(false);
  const [updatingDeckCardId, setUpdatingDeckCardId] = useState(null);
  const [updatingAssignmentCardId, setUpdatingAssignmentCardId] = useState(null);
  const [deckListPreview, setDeckListPreview] = useState(null);
  const importDeckInputRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  const deckListQuery = useQuery({
    queryKey: queryKeys.decks(activeTgc?.id),
    queryFn: ({ signal }) => getDecks(activeTgc.id, signal),
    enabled: Boolean(activeTgc?.id),
    staleTime: 2 * 60 * 1000,
  });
  const selectedDeckQuery = useQuery({
    queryKey: queryKeys.deckDetail(selectedDeckId),
    queryFn: ({ signal }) => getDeckDetail(selectedDeckId, signal),
    enabled: Boolean(selectedDeckId),
    staleTime: 60 * 1000,
  });

  const decks = deckListQuery.data || [];
  const selectedDeck = selectedDeckQuery.data || null;
  const advancedMode = Boolean(profile?.advanced_mode);
  const userRole = (profile?.role || 'player').toLowerCase();
  const advancedDeckControlsEnabled = Boolean(
    selectedDeck?.advanced_mode !== undefined ? selectedDeck.advanced_mode : advancedMode
  );
  const deckStats = useMemo(() => buildDeckStats(selectedDeck), [selectedDeck]);
  const isAdmin = userRole === 'admin';
  const selectedDeckIsOnePiece = selectedDeck?.composition?.format_mode === 'one-piece';
  const selectedDeckSummary = selectedDeckIsOnePiece
    ? `Leader ${selectedDeck?.leader_cards || 0}/${selectedDeck?.required_leader_cards || 1} | Main ${selectedDeck?.main_deck_cards || 0}/${selectedDeck?.required_main_deck_cards || 50} | DON ${selectedDeck?.don_cards || 0}/${selectedDeck?.recommended_don_cards || 10}`
    : `${selectedDeck?.total_cards || 0} cartas en total`;

  useEffect(() => {
    localStorage.setItem('deckCardViewMode', deckCardView);
  }, [deckCardView]);

  useEffect(() => {
    if (selectedDeck?.name) {
      setDraftDeckName(selectedDeck.name);
    }
  }, [selectedDeck?.name]);

  useEffect(() => {
    const deckId = location.state?.openDeckId;
    if (!deckId) {
      return;
    }

    setSelectedDeckId(deckId);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    const error = deckListQuery.error || selectedDeckQuery.error;
    if (!error || isUnauthorizedError(error)) {
      return;
    }

    showToast({
      type: 'error',
      message: getApiErrorMessage(error, 'No se pudieron cargar los datos de mazos.'),
    });
  }, [deckListQuery.error, selectedDeckQuery.error, showToast]);

  const createDeckMutation = useMutation({
    mutationFn: createDeck,
    onSuccess: (createdDeck) => {
      queryClient.setQueryData(queryKeys.decks(activeTgc?.id), (current) => (
        Array.isArray(current) ? [createdDeck, ...current] : [createdDeck]
      ));
      setNewDeckName('');
      showToast({ type: 'success', message: 'Mazo creado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo crear el mazo.'),
      });
    },
  });

  const deleteDeckMutation = useMutation({
    mutationFn: deleteDeck,
    onSuccess: (_data, deckId) => {
      queryClient.setQueryData(queryKeys.decks(activeTgc?.id), (current) => (
        Array.isArray(current) ? current.filter((deck) => deck.id !== deckId) : current
      ));
      queryClient.removeQueries({ queryKey: queryKeys.deckDetail(deckId) });
      if (selectedDeckId === deckId) {
        setSelectedDeckId(null);
      }
      showToast({ type: 'success', message: 'Mazo borrado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo borrar el mazo.'),
      });
    },
    onSettled: () => {
      setDeletingDeckId(null);
    },
  });

  const cloneDeckMutation = useMutation({
    mutationFn: cloneDeck,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) });
      if (response?.deck_id) {
        setSelectedDeckId(response.deck_id);
      }
      showToast({ type: 'success', message: 'Mazo clonado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo clonar el mazo.'),
      });
    },
    onSettled: () => {
      setCloningDeckId(null);
    },
  });

  const renameDeckMutation = useMutation({
    mutationFn: ({ deckId, name }) => renameDeck(deckId, { name }),
    onSuccess: (response, variables) => {
      const nextName = response?.name || variables.name;
      setDraftDeckName(nextName);
      queryClient.setQueryData(queryKeys.deckDetail(variables.deckId), (current) => (
        current ? { ...current, name: nextName } : current
      ));
      queryClient.setQueryData(queryKeys.decks(activeTgc?.id), (current) => (
        Array.isArray(current)
          ? current.map((deck) => (deck.id === variables.deckId ? { ...deck, name: nextName } : deck))
          : current
      ));
      showToast({ type: 'success', message: 'Nombre del mazo actualizado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo cambiar el nombre del mazo.'),
      });
    },
    onSettled: () => {
      setRenamingDeckId(null);
    },
  });

  const adjustDeckCardMutation = useMutation({
    mutationFn: ({ deckId, cardId, delta }) => adjustDeckCard(deckId, cardId, delta),
    onSuccess: (payload, variables) => {
      queryClient.setQueryData(queryKeys.deckDetail(variables.deckId), (current) => (
        applyDeckQuantityMutation(current, variables.cardId, payload || {})
      ));
      if (payload?.deck) {
        queryClient.setQueryData(queryKeys.decks(activeTgc?.id), (current) => (
          mergeDeckOverviewInList(Array.isArray(current) ? current : [], payload.deck)
        ));
      }
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo actualizar la cantidad en el mazo.'),
      });
    },
    onSettled: () => {
      setUpdatingDeckCardId(null);
    },
  });

  const adjustAssignmentMutation = useMutation({
    mutationFn: ({ deckId, cardId, delta }) => adjustDeckAssignment(deckId, cardId, delta),
    onSuccess: (payload, variables) => {
      queryClient.setQueryData(queryKeys.deckDetail(variables.deckId), (current) => (
        applyDeckAssignmentMutation(current, variables.cardId, payload || {})
      ));
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo ajustar la cobertura del mazo.'),
      });
    },
    onSettled: () => {
      setUpdatingAssignmentCardId(null);
    },
  });

  const importDeckMutation = useMutation({
    mutationFn: importDeck,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) });
      if (response?.deck_id) {
        setSelectedDeckId(response.deck_id);
      }
      showToast({ type: 'success', message: 'Mazo importado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo importar el mazo.'),
      });
    },
    onSettled: () => {
      setImportingDeck(false);
    },
  });

  const shareDeckMutation = useMutation({
    mutationFn: shareDeck,
  });

  const closeDeckListPreview = () => {
    setDeckListPreview(null);
  };

  const copyDeckList = async (deckName, listText) => {
    try {
      await copyTextToClipboard(listText);
      showToast({ type: 'success', message: `Lista de ${deckName} copiada al portapapeles.` });
    } catch (_error) {
      showToast({
        type: 'info',
        message: 'No se pudo copiar automaticamente. Te dejo la lista abierta para copiarla manualmente.',
      });
    }
  };

  const openDeckListPreview = async (deck) => {
    if (!deck) {
      return;
    }

    const listText = buildDeckListText(deck);
    if (!listText) {
      showToast({ type: 'error', message: 'Este mazo no tiene cartas para exportar.' });
      return;
    }

    setDeckListPreview({
      name: deck.name,
      filename: `${safeDeckFilename(deck.name)}.txt`,
      text: listText,
    });

    await copyDeckList(deck.name, listText);
  };

  const triggerDeckImport = () => {
    importDeckInputRef.current?.click();
  };

  const handleDeckImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setImportingDeck(true);

    try {
      const rawContent = await file.text();
      let payload;

      try {
        const parsedContent = JSON.parse(rawContent);
        payload = parseImportedDeckFile(parsedContent, activeTgc?.id);
      } catch (_jsonError) {
        payload = parseDeckListText(rawContent, activeTgc?.id);
      }

      if (!payload.cards.length) {
        throw new Error('El archivo no contiene cartas importables.');
      }

      try {
        await importDeckMutation.mutateAsync(payload);
      } catch (_error) {
        // The mutation already reports backend errors through the shared toast flow.
      }
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        showToast({
          type: 'error',
          message: getApiErrorMessage(error, 'No se pudo importar el mazo.'),
        });
      }
      setImportingDeck(false);
    } finally {
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const createDeckHandler = (e) => {
    e.preventDefault();
    createDeckMutation.mutate({ name: newDeckName, tgc_id: activeTgc.id });
  };

  const deleteDeckHandler = (deckId, deckName) => {
    const confirmed = window.confirm(`Se borrara el mazo "${deckName}". Esta accion no se puede deshacer.`);
    if (!confirmed) {
      return;
    }

    setDeletingDeckId(deckId);
    deleteDeckMutation.mutate(deckId);
  };

  const viewDeckDetails = (deckId) => {
    setSelectedDeckId(deckId);
  };

  const cloneDeckHandler = (deckId) => {
    setCloningDeckId(deckId);
    cloneDeckMutation.mutate(deckId);
  };

  const shareDeckHandler = async (deck) => {
    if (!deck) {
      return;
    }

    setSharingDeckId(deck.id);

    try {
      const response = await shareDeckMutation.mutateAsync(deck.id);
      const shareUrl = `${window.location.origin}/shared-deck/${response.share_token}`;

      if (navigator.share) {
        await navigator.share({
          title: deck.name,
          text: `Consulta este mazo compartido de ${deck.tgc_name || activeGame.shortName}`,
          url: shareUrl,
        });
        showToast({ type: 'success', message: 'Enlace del mazo listo para compartir.' });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showToast({ type: 'success', message: 'Enlace del mazo copiado al portapapeles.' });
      } else {
        window.prompt('Copia este enlace del mazo:', shareUrl);
      }
    } catch (error) {
      if (error?.name !== 'AbortError' && !isUnauthorizedError(error)) {
        showToast({
          type: 'error',
          message: getApiErrorMessage(error, 'No se pudo compartir el mazo.'),
        });
      }
    } finally {
      setSharingDeckId(null);
    }
  };

  const exportDeckHandler = (deck) => {
    if (!deck) {
      return;
    }

    const payload = buildDeckExportPayload(deck);
    downloadJson(`${safeDeckFilename(deck.name)}.json`, payload);
  };

  const renameDeckHandler = () => {
    if (!selectedDeck) {
      return;
    }

    const trimmedName = draftDeckName.trim();
    if (!trimmedName) {
      showToast({ type: 'error', message: 'El nombre del mazo no puede estar vacio.' });
      return;
    }

    setRenamingDeckId(selectedDeck.id);
    renameDeckMutation.mutate({ deckId: selectedDeck.id, name: trimmedName });
  };

  const adjustDeckCardQuantity = (deckId, cardId, delta) => {
    setUpdatingDeckCardId(cardId);
    adjustDeckCardMutation.mutate({ deckId, cardId, delta });
  };

  const adjustDeckCoverage = (cardId, delta) => {
    if (!selectedDeck?.id) {
      return;
    }

    setUpdatingAssignmentCardId(cardId);
    adjustAssignmentMutation.mutate({ deckId: selectedDeck.id, cardId, delta });
  };

  const toggleAssignmentEditor = (cardId) => {
    setEditingAssignmentCardId((current) => (current === cardId ? null : cardId));
  };

  const closeDeckDetails = () => {
    setSelectedCard(null);
    setSelectedDeckId(null);
  };

  if (deckListQuery.isPending && decks.length === 0) {
    return (
      <div className="decks page-shell">
        <section className="page-hero decks-hero">
          <div>
            <span className="eyebrow">{activeGame.eyebrow}</span>
            <h1>{activeGame.decksTitle}</h1>
            <p>Cargando tus mazos de {activeGame.shortName}...</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="decks page-shell">
      <section className="page-hero decks-hero">
        <div>
          <span className="eyebrow">{activeGame.eyebrow}</span>
          <h1>{activeGame.decksTitle}</h1>
          <p>
            Organiza tus listas de {activeGame.shortName}, revisa cantidades reales y
            ajusta cada carta del mazo sin salir del panel de detalle.
          </p>
        </div>

        <div className="hero-stat">
          <span>Total de mazos</span>
          <strong>{decks.length}</strong>
        </div>
      </section>

      <section className="panel create-deck-panel">
        <form onSubmit={createDeckHandler} className="create-deck-form">
          <input
            type="text"
            placeholder={`Nombre del mazo de ${activeGame.shortName}`}
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            required
          />
          <button type="submit" disabled={createDeckMutation.isPending}>
            {createDeckMutation.isPending ? 'Creando...' : 'Crear Mazo'}
          </button>
        </form>
        <div className="create-deck-secondary-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={triggerDeckImport}
            disabled={importingDeck}
          >
            {importingDeck ? 'Importando...' : 'Importar mazo'}
          </button>
          <input
            ref={importDeckInputRef}
            type="file"
            accept=".json,.txt,text/plain,application/json"
            className="deck-import-input"
            onChange={handleDeckImport}
          />
          <span className="deck-import-copy">
            Importa un mazo desde JSON o desde una lista tipo 4xST01-005.
          </span>
        </div>
      </section>

      <section className="decks-list">
        {decks.map((deck) => (
          <DeckSummaryCard
            key={deck.id}
            deck={deck}
            onOpen={() => viewDeckDetails(deck.id)}
            onClone={() => cloneDeckHandler(deck.id)}
            onShare={() => shareDeckHandler(deck)}
            onDelete={() => deleteDeckHandler(deck.id, deck.name)}
            isCloning={cloningDeckId === deck.id}
            isSharing={sharingDeckId === deck.id}
            isDeleting={deletingDeckId === deck.id}
          />
        ))}

        {decks.length === 0 && (
          <div className="empty-state panel">
            <h3>Aun no tienes mazos de {activeGame.shortName}</h3>
            <p>Crea el primero para empezar a organizar tu coleccion.</p>
          </div>
        )}
      </section>

      {selectedDeckId && (
        <div className="card-modal deck-modal" onClick={closeDeckDetails}>
          <div className="deck-detail panel" onClick={(e) => e.stopPropagation()}>
            {selectedDeckQuery.isPending && !selectedDeck ? (
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
                        onChange={(e) => setDraftDeckName(e.target.value)}
                        maxLength={100}
                      />
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={renameDeckHandler}
                        disabled={renamingDeckId === selectedDeck?.id}
                      >
                        {renamingDeckId === selectedDeck?.id ? 'Guardando...' : 'Renombrar'}
                      </button>
                    </div>
                    <p>
                      {`${selectedDeck?.cards?.length || 0} cartas distintas | ${selectedDeckSummary}`}
                    </p>
                    <div className="deck-status-row">
                      <span className={`deck-status-chip ${selectedDeck?.is_complete ? 'is-complete' : 'is-incomplete'}`}>
                        {selectedDeck?.is_complete ? 'Mazo completo' : 'Mazo incompleto'}
                      </span>
                      <span className="deck-status-chip deck-progress-chip">
                        {selectedDeckIsOnePiece
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
                      {(selectedDeck?.missing_copies || 0) > 0 && (
                        <span className="deck-status-chip deck-missing-chip">
                          Faltan {selectedDeck?.missing_copies} copias
                        </span>
                      )}
                    </div>
                    <div className="view-toggle deck-view-toggle" role="tablist" aria-label="Vista del mazo">
                      <button
                        type="button"
                        className={deckCardView === 'detail' ? 'is-active' : ''}
                        onClick={() => setDeckCardView('detail')}
                      >
                        Ficha
                      </button>
                      <button
                        type="button"
                        className={deckCardView === 'grid' ? 'is-active' : ''}
                        onClick={() => setDeckCardView('grid')}
                      >
                        Cuadricula
                      </button>
                      <button
                        type="button"
                        className={deckCardView === 'inventory' ? 'is-active' : ''}
                        onClick={() => setDeckCardView('inventory')}
                      >
                        Solo copias
                      </button>
                    </div>
                  </div>
                  <DeckDetailActions
                    onOpenList={() => openDeckListPreview(selectedDeck)}
                    onExportJson={() => exportDeckHandler(selectedDeck)}
                    onShare={() => shareDeckHandler(selectedDeck)}
                    onClone={() => cloneDeckHandler(selectedDeck.id)}
                    onDelete={() => deleteDeckHandler(selectedDeck.id, selectedDeck.name)}
                    onClose={closeDeckDetails}
                    isSharing={sharingDeckId === selectedDeck?.id}
                    isCloning={cloningDeckId === selectedDeck?.id}
                    isDeleting={deletingDeckId === selectedDeck?.id}
                  />
                </div>

                <DeckStatsPanel stats={deckStats} isAdmin={isAdmin} />

                <div className={`deck-detail-grid ${deckCardView === 'grid' ? 'is-grid' : ''}`}>
                  {(selectedDeck?.cards || []).map((card) => (
                    <DeckCardRow
                      key={card.id}
                      card={card}
                      deckCardView={deckCardView}
                      advancedDeckControlsEnabled={advancedDeckControlsEnabled}
                      editingAssignmentCardId={editingAssignmentCardId}
                      updatingAssignmentCardId={updatingAssignmentCardId}
                      updatingDeckCardId={updatingDeckCardId}
                      maxCopiesPerCard={selectedDeck?.max_copies_per_card || MAX_COPIES_PER_CARD}
                      onToggleAssignmentEditor={toggleAssignmentEditor}
                      onAdjustCoverage={adjustDeckCoverage}
                      onAdjustQuantity={(cardId, delta) => adjustDeckCardQuantity(selectedDeck.id, cardId, delta)}
                      onOpenCard={setSelectedCard}
                    />
                  ))}
                </div>

                {(selectedDeck?.cards || []).length === 0 && (
                  <div className="empty-state subtle-empty">
                    <p>Este mazo todavia no tiene cartas.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="deck-detail-loading">
                <h2>No se pudo cargar el mazo.</h2>
              </div>
            )}
          </div>
        </div>
      )}

      <CardDetailModal
        card={selectedCard}
        activeTcgSlug={activeTcgSlug}
        onClose={() => setSelectedCard(null)}
      />

      <DeckListPreviewModal
        preview={deckListPreview}
        onClose={closeDeckListPreview}
        onCopy={() => copyDeckList(deckListPreview.name, deckListPreview.text)}
        onDownload={() => downloadText(deckListPreview.filename, deckListPreview.text)}
      />
    </div>
  );
}

export default Decks;
