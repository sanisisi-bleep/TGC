import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { getGameConfig } from '../tcgConfig';
import API_BASE from '../apiBase';
import { getApiErrorMessage } from '../utils/apiMessages';

const MAX_COPIES_PER_CARD = 4;

const safeFilename = (value) => (
  (value || 'mazo')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'mazo'
);

const buildDeckExportPayload = (deck) => ({
  format: 'tgc-deck-v1',
  exported_at: new Date().toISOString(),
  deck: {
    name: deck.name,
    tgc_id: deck.tgc_id,
    tgc_name: deck.tgc_name,
    total_cards: deck.total_cards,
    cards: (deck.cards || []).map((card) => ({
      card_id: card.id,
      source_card_id: card.source_card_id,
      version: card.version,
      name: card.name,
      set_name: card.set_name,
      quantity: card.quantity,
    })),
  },
});

const buildDeckListText = (deck) => (
  (deck?.cards || [])
    .filter((card) => (Number(card.quantity) || 0) > 0)
    .map((card) => `${Number(card.quantity)}x${card.source_card_id || `CARD-${card.id}`}`)
    .join('\n')
);

const downloadJson = (filename, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
};

const downloadText = (filename, text) => {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
};

const buildDeckStats = (deck) => {
  if (!deck?.cards?.length) {
    return null;
  }

  const typeMap = new Map();
  const colorMap = new Map();
  const rarityMap = new Map();
  const setMap = new Map();
  const curveMap = new Map();
  let coveredCopies = 0;
  let missingCopies = 0;

  const addToMap = (map, key, amount) => {
    map.set(key, (map.get(key) || 0) + amount);
  };

  const toSortedEntries = (map) => (
    [...map.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
  );

  deck.cards.forEach((card) => {
    const quantity = Number(card.quantity) || 0;
    if (quantity <= 0) {
      return;
    }

    addToMap(typeMap, card.card_type || 'Sin tipo', quantity);
    addToMap(colorMap, card.color || 'Sin color', quantity);
    addToMap(rarityMap, card.rarity || 'Sin rareza', quantity);
    addToMap(setMap, card.set_name || 'Sin set', quantity);

    const rawCurveValue = Number.isFinite(card.cost) ? card.cost : card.lv;
    const normalizedCurveValue = Number.isFinite(rawCurveValue)
      ? rawCurveValue
      : Number(rawCurveValue);
    const curveKey = Number.isFinite(normalizedCurveValue)
      ? (normalizedCurveValue >= 6 ? '6+' : String(normalizedCurveValue))
      : '?';
    addToMap(curveMap, curveKey, quantity);

    coveredCopies += Number(card.fulfilled_quantity) || 0;
    missingCopies += Number(card.missing_quantity) || 0;
  });

  const curveOrder = ['0', '1', '2', '3', '4', '5', '6+', '?'];
  const curveEntries = curveOrder
    .map((key) => [key, curveMap.get(key) || 0])
    .filter(([, value]) => value > 0);

  return {
    uniqueCards: deck.cards.length,
    totalCards: deck.total_cards || 0,
    coveredCopies,
    missingCopies,
    typeEntries: toSortedEntries(typeMap),
    colorEntries: toSortedEntries(colorMap),
    rarityEntries: toSortedEntries(rarityMap),
    setEntries: toSortedEntries(setMap),
    curveEntries,
  };
};

const parseImportedDeckFile = (payload, fallbackTgcId) => {
  const deckPayload = payload?.deck || payload;
  const cards = Array.isArray(deckPayload?.cards) ? deckPayload.cards : [];

  return {
    name: deckPayload?.name || 'Mazo importado',
    tgc_id: deckPayload?.tgc_id || fallbackTgcId || null,
    cards: cards.map((card) => ({
      card_id: card.card_id ?? null,
      source_card_id: card.source_card_id ?? null,
      version: card.version ?? null,
      quantity: Number(card.quantity) || 0,
    })),
  };
};

const parseDeckListText = (rawContent, fallbackTgcId) => {
  const lines = rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('El archivo no contiene cartas importables.');
  }

  const cards = lines.map((line, index) => {
    const match = line.match(/^(\d+)\s*x\s*([A-Za-z0-9._-]+)$/i);

    if (!match) {
      throw new Error(`Linea ${index + 1} invalida: ${line}`);
    }

    return {
      card_id: null,
      source_card_id: match[2],
      version: null,
      quantity: Number(match[1]),
    };
  });

  return {
    name: 'Mazo importado',
    tgc_id: fallbackTgcId || null,
    cards,
  };
};

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
  const importDeckInputRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const deckStats = useMemo(() => buildDeckStats(selectedDeck), [selectedDeck]);

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
        if (error.response?.status === 401) {
          navigate('/');
          return;
        }

        console.error('Error al cargar los mazos:', error);
        showToast({
          type: 'error',
          message: getApiErrorMessage(error, 'No se pudo cargar la lista de mazos.'),
        });
      } finally {
        setLoadingDeckList(false);
      }
    };

    loadDecks();
  }, [activeTgc?.id, navigate, showToast]);

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const response = await axios.get(`${API_BASE}/settings/me`);
        setAdvancedMode(Boolean(response.data?.advanced_mode));
      } catch (error) {
        if (error.response?.status === 401) {
          navigate('/');
        }
      }
    };

    fetchPreferences();
  }, [navigate]);

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
          if (error.response?.status === 401) {
            navigate('/');
            return;
          }

          console.error('Error al cargar el detalle del mazo:', error);
          showToast({
            type: 'error',
            message: getApiErrorMessage(error, 'No se pudo cargar el detalle del mazo.'),
          });
        } finally {
          setLoadingDetails(false);
        }
      };

      openSelectedDeck();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate, showToast]);

  const fetchDecks = async () => {
    try {
      const res = await axios.get(`${API_BASE}/decks`, {
        params: { tgc_id: activeTgc.id },
      });
      setDecks(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      console.error('Error al cargar los mazos:', error);
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo actualizar la lista de mazos.'),
      });
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
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      console.error('Error al crear el mazo:', error);
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo crear el mazo.'),
      });
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
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo borrar el mazo.'),
      });
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
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      console.error('Error al cargar el detalle del mazo:', error);
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo cargar el detalle del mazo.'),
      });
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
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo clonar el mazo.'),
      });
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
        showToast({
          type: 'error',
          message: getApiErrorMessage(error, 'No se pudo compartir el mazo.'),
        });
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
    downloadJson(`${safeFilename(deck.name)}.json`, payload);
  };

  const exportDeckList = (deck) => {
    if (!deck) {
      return;
    }

    const listText = buildDeckListText(deck);
    if (!listText) {
      showToast({ type: 'error', message: 'Este mazo no tiene cartas para exportar.' });
      return;
    }

    downloadText(`${safeFilename(deck.name)}.txt`, listText);
    showToast({ type: 'success', message: 'Lista del mazo exportada en formato texto.' });
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
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo importar el mazo.'),
      });
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
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo cambiar el nombre del mazo.'),
      });
    } finally {
      setRenamingDeckId(null);
    }
  };

  const adjustDeckCardQuantity = async (deckId, cardId, delta) => {
    setUpdatingDeckCardId(cardId);

    try {
      await axios.post(`${API_BASE}/decks/${deckId}/cards/${cardId}/adjust`, { delta });
      await viewDeckDetails(deckId, { keepCurrentView: true });
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo actualizar la cantidad en el mazo.'),
      });
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
      await axios.post(`${API_BASE}/decks/${selectedDeck.id}/cards/${cardId}/assignment`, { delta });
      await viewDeckDetails(selectedDeck.id, { keepCurrentView: true });
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo ajustar la cobertura del mazo.'),
      });
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
            {importingDeck ? 'Importando...' : 'Importar JSON'}
          </button>
          <input
            ref={importDeckInputRef}
            type="file"
            accept="application/json"
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
          <article key={deck.id} className="deck-item">
            <div className="deck-item-header">
              <div>
                <span className="deck-badge">Deck #{deck.id}</span>
                <h3>{deck.name}</h3>
              </div>
              <span className="deck-date">
                {new Date(deck.created_at).toLocaleDateString()}
              </span>
            </div>

            <p className="deck-copy">
              Revisa cartas, cantidades y composicion del mazo desde el panel de detalle.
            </p>

            <div className="deck-card-actions">
              <button type="button" onClick={() => viewDeckDetails(deck.id)}>
                Ver Detalles
              </button>
              <button
                type="button"
                className="danger-ghost-button"
                onClick={() => deleteDeck(deck.id, deck.name)}
                disabled={deletingDeckId === deck.id}
              >
                {deletingDeckId === deck.id ? 'Borrando...' : 'Borrar Mazo'}
              </button>
            </div>
          </article>
        ))}

        {decks.length === 0 && (
          <div className="empty-state panel">
            <h3>Aun no tienes mazos de {activeGame.shortName}</h3>
            <p>Crea el primero para empezar a organizar tu colección.</p>
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
                      {selectedDeck?.cards?.length || 0} cartas distintas,{' '}
                      {selectedDeck?.total_cards || 0} cartas en total
                    </p>
                    <div className="deck-status-row">
                      <span className={`deck-status-chip ${selectedDeck?.is_complete ? 'is-complete' : 'is-incomplete'}`}>
                        {selectedDeck?.is_complete ? 'Mazo completo' : 'Mazo incompleto'}
                      </span>
                      <span className="deck-status-chip deck-progress-chip">
                        {selectedDeck?.total_cards || 0}/{selectedDeck?.max_cards || 50}
                      </span>
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
                  <div className="deck-detail-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => exportDeckList(selectedDeck)}
                    >
                      Exportar Lista
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => exportDeck(selectedDeck)}
                    >
                      Exportar JSON
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => cloneDeck(selectedDeck.id)}
                      disabled={cloningDeckId === selectedDeck?.id}
                    >
                      {cloningDeckId === selectedDeck?.id ? 'Clonando...' : 'Clonar Mazo'}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => shareDeck(selectedDeck)}
                      disabled={sharingDeckId === selectedDeck?.id}
                    >
                      {sharingDeckId === selectedDeck?.id ? 'Compartiendo...' : 'Compartir'}
                    </button>
                    <button
                      type="button"
                      className="danger-ghost-button"
                      onClick={() => deleteDeck(selectedDeck.id, selectedDeck.name)}
                      disabled={deletingDeckId === selectedDeck?.id}
                    >
                      {deletingDeckId === selectedDeck?.id ? 'Borrando...' : 'Borrar Mazo'}
                    </button>
                    <button type="button" className="ghost-button" onClick={closeDeckDetails}>
                      Cerrar
                    </button>
                  </div>
                </div>

                {deckStats && (
                  <section className="deck-stats-panel">
                    <div className="deck-stats-summary">
                      <article className="deck-stat-card">
                        <span>Cartas distintas</span>
                        <strong>{deckStats.uniqueCards}</strong>
                      </article>
                      <article className="deck-stat-card">
                        <span>Total en mazo</span>
                        <strong>{deckStats.totalCards}</strong>
                      </article>
                      <article className="deck-stat-card">
                        <span>Copias cubiertas</span>
                        <strong>{deckStats.coveredCopies}</strong>
                      </article>
                      <article className="deck-stat-card">
                        <span>Copias faltantes</span>
                        <strong>{deckStats.missingCopies}</strong>
                      </article>
                    </div>

                    <div className="deck-stats-grid">
                      <div className="deck-stat-block">
                        <h3>Curva</h3>
                        <div className="deck-stat-chip-list">
                          {deckStats.curveEntries.map(([label, value]) => (
                            <span key={label} className="deck-stat-chip">
                              {label}: {value}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="deck-stat-block">
                        <h3>Tipos</h3>
                        <div className="deck-stat-chip-list">
                          {deckStats.typeEntries.slice(0, 6).map(([label, value]) => (
                            <span key={label} className="deck-stat-chip">
                              {label}: {value}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="deck-stat-block">
                        <h3>Colores</h3>
                        <div className="deck-stat-chip-list">
                          {deckStats.colorEntries.slice(0, 6).map(([label, value]) => (
                            <span key={label} className="deck-stat-chip">
                              {label}: {value}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="deck-stat-block">
                        <h3>Sets</h3>
                        <div className="deck-stat-chip-list">
                          {deckStats.setEntries.slice(0, 6).map(([label, value]) => (
                            <span key={label} className="deck-stat-chip">
                              {label}: {value}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                <div className={`deck-detail-grid ${deckCardView === 'grid' ? 'is-grid' : ''}`}>
                  {(selectedDeck?.cards || []).map((card) => (
                    <article
                      key={card.id}
                      className={`deck-card-row ${card.missing_quantity > 0 ? 'has-missing-copies' : ''} ${deckCardView !== 'detail' ? 'is-grid' : ''} ${deckCardView === 'inventory' ? 'is-inventory' : ''}`}
                    >
                      <img
                        src={card.image_url}
                        alt={card.name}
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="deck-card-copy">
                        <h4>{card.name}</h4>
                        <p>{[card.card_type || 'Sin tipo', card.color || 'Sin color', card.rarity || 'Sin rareza'].join(' · ')}</p>
                        <span>{card.set_name || 'Set desconocido'}</span>
                        <div className="deck-owned-panel">
                          <span>En colección: x{card.owned_quantity || 0}</span>
                        </div>
                        {deckCardView !== 'inventory' && advancedDeckControlsEnabled && (
                          <div className="deck-advanced-panel">
                            <div className="deck-advanced-header">
                              <span className="deck-owned-popover-label">Ajustes avanzados del mazo</span>
                              <button
                                type="button"
                                className="deck-owned-manage"
                                onClick={() => toggleAssignmentEditor(card.id)}
                                disabled={updatingAssignmentCardId === card.id}
                              >
                                {editingAssignmentCardId === card.id ? 'Ocultar ajuste' : 'Ajustar deck'}
                              </button>
                            </div>
                            {editingAssignmentCardId === card.id && (
                              <div className="deck-owned-popover">
                                <span className="deck-owned-popover-label">
                                  Decide cuantas copias quedan cubiertas en este mazo sin tocar tu colección.
                                </span>
                                <div className="deck-owned-controls">
                                  <button
                                    type="button"
                                    className="deck-owned-button"
                                    onClick={() => adjustDeckCoverage(card.id, -1)}
                                    disabled={updatingAssignmentCardId === card.id || (card.fulfilled_quantity || 0) <= 0}
                                  >
                                    Marcar falta 1
                                  </button>
                                  <button
                                    type="button"
                                    className="deck-owned-button"
                                    onClick={() => adjustDeckCoverage(card.id, 1)}
                                    disabled={
                                      updatingAssignmentCardId === card.id ||
                                      (card.fulfilled_quantity || 0) >= Math.min(card.quantity || 0, card.owned_quantity || 0)
                                    }
                                  >
                                    Cubrir 1
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {deckCardView !== 'inventory' && !advancedDeckControlsEnabled && (
                          <div className="deck-advanced-hint">
                            Activa Ajustes avanzados en Configuración para marcar copias faltantes sin tocar tu colección.
                          </div>
                        )}
                        <div className="deck-copy-slots" aria-label="Estado de copias del mazo">
                          {Array.from({ length: card.quantity }, (_, index) => (
                            <span
                              key={`${card.id}-${index}`}
                              className={`deck-copy-slot ${index < (card.fulfilled_quantity || 0) ? 'is-covered' : 'is-missing'}`}
                            >
                              {index + 1}
                            </span>
                          ))}
                        </div>
                        {card.missing_quantity > 0 ? (
                          <span className="deck-missing-text">
                            Cubiertas x{card.fulfilled_quantity || 0} · Faltan x{card.missing_quantity}
                          </span>
                        ) : (
                          <span className="deck-covered-text">Completa x{card.fulfilled_quantity || 0}</span>
                        )}
                      </div>
                      {deckCardView === 'inventory' ? (
                        <div className="deck-card-controls deck-card-controls-static">
                          <div className="deck-card-quantity-display">
                            <span className="collection-panel-label">Copias</span>
                            <strong>x{card.quantity}</strong>
                          </div>
                        </div>
                      ) : (
                        <div className="deck-card-controls">
                          <div className="quantity-stepper-controls deck-stepper-controls">
                            <button
                              type="button"
                              onClick={() => adjustDeckCardQuantity(selectedDeck.id, card.id, -1)}
                              disabled={updatingDeckCardId === card.id}
                            >
                              -
                            </button>
                            <span className="deck-stepper-value">x{card.quantity}</span>
                            <button
                              type="button"
                              onClick={() => adjustDeckCardQuantity(selectedDeck.id, card.id, 1)}
                              disabled={
                                updatingDeckCardId === card.id ||
                                card.quantity >= (selectedDeck?.max_copies_per_card || MAX_COPIES_PER_CARD)
                              }
                            >
                              +
                            </button>
                          </div>
                          <span className="deck-card-limit-note">
                            Max {selectedDeck?.max_copies_per_card || MAX_COPIES_PER_CARD}
                          </span>
                        </div>
                      )}
                    </article>
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
    </div>
  );
}

export default Decks;
