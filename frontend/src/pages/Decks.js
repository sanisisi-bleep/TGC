import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import DeckCardRow from '../components/decks/DeckCardRow';
import DeckDetailActions from '../components/decks/DeckDetailActions';
import DeckListPreviewModal from '../components/decks/DeckListPreviewModal';
import DeckStatsPanel from '../components/decks/DeckStatsPanel';
import DeckSummaryCard from '../components/decks/DeckSummaryCard';
import { useToast } from '../context/ToastContext';
import { getGameConfig } from '../tcgConfig';
import API_BASE from '../apiBase';
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
import { fetchSessionProfile } from '../utils/bootstrapCache';

function Decks({ activeTcgSlug, activeTgc }) {
  const activeGame = getGameConfig(activeTcgSlug);
  const { showToast } = useToast();
  const [decks, setDecks] = useState([]);
  const [newDeckName, setNewDeckName] = useState('');
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [draftDeckName, setDraftDeckName] = useState('');
  const [advancedMode, setAdvancedMode] = useState(false);
  const [deckCardView, setDeckCardView] = useState(
    () => localStorage.getItem('deckCardViewMode') || 'detail'
  );
  const advancedDeckControlsEnabled = Boolean(
    selectedDeck?.advanced_mode !== undefined ? selectedDeck.advanced_mode : advancedMode
  );
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingDeckList, setLoadingDeckList] = useState(true);
  const [updatingDeckCardId, setUpdatingDeckCardId] = useState(null);
  const [updatingAssignmentCardId, setUpdatingAssignmentCardId] = useState(null);
  const [editingAssignmentCardId, setEditingAssignmentCardId] = useState(null);
  const [deletingDeckId, setDeletingDeckId] = useState(null);
  const [cloningDeckId, setCloningDeckId] = useState(null);
  const [sharingDeckId, setSharingDeckId] = useState(null);
  const [renamingDeckId, setRenamingDeckId] = useState(null);
  const [importingDeck, setImportingDeck] = useState(false);
  const [deckListPreview, setDeckListPreview] = useState(null);
  const importDeckInputRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const deckStats = useMemo(() => buildDeckStats(selectedDeck), [selectedDeck]);
  const selectedDeckIsOnePiece = selectedDeck?.composition?.format_mode === 'one-piece';
  const selectedDeckSummary = selectedDeckIsOnePiece
    ? `Leader ${selectedDeck?.leader_cards || 0}/${selectedDeck?.required_leader_cards || 1} | Main ${selectedDeck?.main_deck_cards || 0}/${selectedDeck?.required_main_deck_cards || 50} | DON ${selectedDeck?.don_cards || 0}/${selectedDeck?.recommended_don_cards || 10}`
    : `${selectedDeck?.total_cards || 0} cartas en total`;

  const shouldRedirectToLogin = useCallback((error) => {
    if (error.response?.status === 401) {
      navigate('/');
      return true;
    }

    return false;
  }, [navigate]);

  const notifyDeckError = useCallback((error, fallback) => {
    showToast({
      type: 'error',
      message: getApiErrorMessage(error, fallback),
    });
  }, [showToast]);

  const handleDeckRequestError = useCallback((error, fallback, logMessage) => {
    if (shouldRedirectToLogin(error)) {
      return true;
    }

    if (logMessage) {
      console.error(logMessage, error);
    }

    notifyDeckError(error, fallback);
    return false;
  }, [notifyDeckError, shouldRedirectToLogin]);

  useEffect(() => {
    if (!activeTgc?.id) {
      setLoadingDeckList(false);
      return;
    }

    const loadDecks = async () => {
      setLoadingDeckList(true);

      try {
        const res = await axios.get(`${API_BASE}/decks`, {
          params: { tgc_id: activeTgc.id },
        });
        setDecks(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        handleDeckRequestError(
          error,
          'No se pudo cargar la lista de mazos.',
          'Error al cargar los mazos:'
        );
      } finally {
        setLoadingDeckList(false);
      }
    };

    loadDecks();
  }, [activeTgc?.id, handleDeckRequestError]);

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const profile = await fetchSessionProfile(
          () => axios.get(`${API_BASE}/settings/me`).then((response) => response.data || {}),
          { forceRefresh: false }
        );
        setAdvancedMode(Boolean(profile?.advanced_mode));
      } catch (error) {
        shouldRedirectToLogin(error);
      }
    };

    fetchPreferences();
  }, [shouldRedirectToLogin]);

  useEffect(() => {
    localStorage.setItem('deckCardViewMode', deckCardView);
  }, [deckCardView]);

  useEffect(() => {
    const deckId = location.state?.openDeckId;
    if (deckId) {
      const openSelectedDeck = async () => {
        setLoadingDetails(true);

        try {
          const res = await axios.get(`${API_BASE}/decks/${deckId}`);
          setSelectedDeck(res.data);
          setDraftDeckName(res.data?.name || '');
        } catch (error) {
          handleDeckRequestError(
            error,
            'No se pudo cargar el detalle del mazo.',
            'Error al cargar el detalle del mazo:'
          );
        } finally {
          setLoadingDetails(false);
        }
      };

      openSelectedDeck();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [handleDeckRequestError, location.pathname, location.state, navigate]);

  const fetchDecks = async () => {
    try {
      const res = await axios.get(`${API_BASE}/decks`, {
        params: { tgc_id: activeTgc.id },
      });
      setDecks(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      handleDeckRequestError(
        error,
        'No se pudo actualizar la lista de mazos.',
        'Error al cargar los mazos:'
      );
    }
  };

  const createDeck = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post(`${API_BASE}/decks`, { name: newDeckName, tgc_id: activeTgc.id });
      setNewDeckName('');
      if (response.data?.id) {
        setDecks((current) => [response.data, ...current]);
      } else {
        await fetchDecks();
      }
      showToast({ type: 'success', message: 'Mazo creado.' });
    } catch (error) {
      handleDeckRequestError(error, 'No se pudo crear el mazo.', 'Error al crear el mazo:');
    }
  };

  const deleteDeck = async (deckId, deckName) => {
    const confirmed = window.confirm(`Se borrara el mazo "${deckName}". Esta accion no se puede deshacer.`);
    if (!confirmed) {
      return;
    }

    setDeletingDeckId(deckId);

    try {
      await axios.delete(`${API_BASE}/decks/${deckId}`);
      setDecks((current) => current.filter((deck) => deck.id !== deckId));
      if (selectedDeck?.id === deckId) {
        setSelectedDeck(null);
      }
      showToast({ type: 'success', message: 'Mazo borrado.' });
    } catch (error) {
      handleDeckRequestError(error, 'No se pudo borrar el mazo.');
    } finally {
      setDeletingDeckId(null);
    }
  };

  const viewDeckDetails = async (deckId, options = {}) => {
    const { keepCurrentView = false } = options;

    if (!keepCurrentView) {
      setLoadingDetails(true);
    }

    try {
      const res = await axios.get(`${API_BASE}/decks/${deckId}`);
      setSelectedDeck(res.data);
      setDraftDeckName(res.data?.name || '');
    } catch (error) {
      handleDeckRequestError(
        error,
        'No se pudo cargar el detalle del mazo.',
        'Error al cargar el detalle del mazo:'
      );
    } finally {
      if (!keepCurrentView) {
        setLoadingDetails(false);
      }
    }
  };

  const cloneDeck = async (deckId) => {
    setCloningDeckId(deckId);

    try {
      const response = await axios.post(`${API_BASE}/decks/${deckId}/clone`);
      await fetchDecks();
      if (response.data?.deck_id) {
        await viewDeckDetails(response.data.deck_id);
      }
      showToast({ type: 'success', message: 'Mazo clonado.' });
    } catch (error) {
      handleDeckRequestError(error, 'No se pudo clonar el mazo.');
    } finally {
      setCloningDeckId(null);
    }
  };

  const shareDeck = async (deck) => {
    if (!deck) {
      return;
    }

    setSharingDeckId(deck.id);

    try {
      const response = await axios.post(`${API_BASE}/decks/${deck.id}/share`);
      const shareUrl = `${window.location.origin}/shared-deck/${response.data.share_token}`;

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
      if (error?.name !== 'AbortError') {
        handleDeckRequestError(error, 'No se pudo compartir el mazo.');
      }
    } finally {
      setSharingDeckId(null);
    }
  };

  const exportDeck = (deck) => {
    if (!deck) {
      return;
    }

    const payload = buildDeckExportPayload(deck);
    downloadJson(`${safeDeckFilename(deck.name)}.json`, payload);
  };

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

      const response = await axios.post(`${API_BASE}/decks/import`, payload);
      await fetchDecks();

      if (response.data?.deck_id) {
        await viewDeckDetails(response.data.deck_id);
      }
      showToast({ type: 'success', message: 'Mazo importado.' });
    } catch (error) {
      handleDeckRequestError(error, 'No se pudo importar el mazo.');
    } finally {
      if (event.target) {
        event.target.value = '';
      }
      setImportingDeck(false);
    }
  };

  const renameDeck = async () => {
    if (!selectedDeck) {
      return;
    }

    const trimmedName = draftDeckName.trim();
    if (!trimmedName) {
      showToast({ type: 'error', message: 'El nombre del mazo no puede estar vacio.' });
      return;
    }

    setRenamingDeckId(selectedDeck.id);

    try {
      const response = await axios.patch(`${API_BASE}/decks/${selectedDeck.id}`, { name: trimmedName });
      const nextName = response.data?.name || trimmedName;

      setDraftDeckName(nextName);
      setSelectedDeck((current) => (
        current && current.id === selectedDeck.id
          ? { ...current, name: nextName }
          : current
      ));
      setDecks((current) => current.map((deck) => (
        deck.id === selectedDeck.id
          ? { ...deck, name: nextName }
          : deck
      )));
      showToast({ type: 'success', message: 'Nombre del mazo actualizado.' });
    } catch (error) {
      handleDeckRequestError(error, 'No se pudo cambiar el nombre del mazo.');
    } finally {
      setRenamingDeckId(null);
    }
  };

  const adjustDeckCardQuantity = async (deckId, cardId, delta) => {
    setUpdatingDeckCardId(cardId);

    try {
      const response = await axios.post(`${API_BASE}/decks/${deckId}/cards/${cardId}/adjust`, { delta });
      const payload = response.data || {};
      setSelectedDeck((current) => applyDeckQuantityMutation(current, cardId, payload));
      if (payload.deck) {
        setDecks((current) => mergeDeckOverviewInList(current, payload.deck));
      }
    } catch (error) {
      handleDeckRequestError(error, 'No se pudo actualizar la cantidad en el mazo.');
    } finally {
      setUpdatingDeckCardId(null);
    }
  };

  const adjustDeckCoverage = async (cardId, delta) => {
    if (!selectedDeck?.id) {
      return;
    }

    setUpdatingAssignmentCardId(cardId);

    try {
      const response = await axios.post(`${API_BASE}/decks/${selectedDeck.id}/cards/${cardId}/assignment`, { delta });
      setSelectedDeck((current) => applyDeckAssignmentMutation(current, cardId, response.data || {}));
    } catch (error) {
      handleDeckRequestError(error, 'No se pudo ajustar la cobertura del mazo.');
    } finally {
      setUpdatingAssignmentCardId(null);
    }
  };

  const toggleAssignmentEditor = (cardId) => {
    setEditingAssignmentCardId((current) => (current === cardId ? null : cardId));
  };

  const closeDeckDetails = () => {
    setSelectedDeck(null);
  };

  if (loadingDeckList && decks.length === 0) {
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
        <form onSubmit={createDeck} className="create-deck-form">
          <input
            type="text"
            placeholder={`Nombre del mazo de ${activeGame.shortName}`}
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            required
          />
          <button type="submit">Crear Mazo</button>
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
            onClone={() => cloneDeck(deck.id)}
            onShare={() => shareDeck(deck)}
            onDelete={() => deleteDeck(deck.id, deck.name)}
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

      {(selectedDeck || loadingDetails) && (
        <div className="card-modal deck-modal" onClick={closeDeckDetails}>
          <div className="deck-detail panel" onClick={(e) => e.stopPropagation()}>
            {loadingDetails ? (
              <div className="deck-detail-loading">
                <h2>Cargando mazo...</h2>
              </div>
            ) : (
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
                        onClick={renameDeck}
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
                    onExportJson={() => exportDeck(selectedDeck)}
                    onShare={() => shareDeck(selectedDeck)}
                    onClone={() => cloneDeck(selectedDeck.id)}
                    onDelete={() => deleteDeck(selectedDeck.id, selectedDeck.name)}
                    onClose={closeDeckDetails}
                    isSharing={sharingDeckId === selectedDeck?.id}
                    isCloning={cloningDeckId === selectedDeck?.id}
                    isDeleting={deletingDeckId === selectedDeck?.id}
                  />
                </div>

                <DeckStatsPanel stats={deckStats} />

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
                    />
                  ))}
                </div>

                {(selectedDeck?.cards || []).length === 0 && (
                  <div className="empty-state subtle-empty">
                    <p>Este mazo todavia no tiene cartas.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

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
