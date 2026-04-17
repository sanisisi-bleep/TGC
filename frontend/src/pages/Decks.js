import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { getGameConfig } from '../tcgConfig';
import API_BASE from '../apiBase';

const MAX_COPIES_PER_CARD = 4;

function Decks({ activeTcgSlug, activeTgc }) {
  const activeGame = getGameConfig(activeTcgSlug);
  const [decks, setDecks] = useState([]);
  const [newDeckName, setNewDeckName] = useState('');
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [draftDeckName, setDraftDeckName] = useState('');
  const [advancedMode, setAdvancedMode] = useState(false);
  const advancedDeckControlsEnabled = Boolean(
    selectedDeck?.advanced_mode !== undefined ? selectedDeck.advanced_mode : advancedMode
  );
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [updatingDeckCardId, setUpdatingDeckCardId] = useState(null);
  const [updatingAssignmentCardId, setUpdatingAssignmentCardId] = useState(null);
  const [editingAssignmentCardId, setEditingAssignmentCardId] = useState(null);
  const [deletingDeckId, setDeletingDeckId] = useState(null);
  const [cloningDeckId, setCloningDeckId] = useState(null);
  const [sharingDeckId, setSharingDeckId] = useState(null);
  const [renamingDeckId, setRenamingDeckId] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!activeTgc?.id) {
      return;
    }

    fetchDecks();
  }, [activeTcgSlug, activeTgc]);

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
    const deckId = location.state?.openDeckId;
    if (deckId) {
      viewDeckDetails(deckId);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

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
    }
  };

  const createDeck = async (e) => {
    e.preventDefault();

    try {
      await axios.post(`${API_BASE}/decks`, { name: newDeckName, tgc_id: activeTgc.id });
      setNewDeckName('');
      fetchDecks();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      console.error('Error al crear el mazo:', error);
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
      if (selectedDeck?.id === deckId) {
        setSelectedDeck(null);
      }
      await fetchDecks();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      alert(error.response?.data?.detail || 'No se pudo borrar el mazo');
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
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      alert(error.response?.data?.detail || 'No se pudo clonar el mazo');
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
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        alert('Enlace del mazo copiado al portapapeles');
      } else {
        window.prompt('Copia este enlace del mazo:', shareUrl);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        alert(error.response?.data?.detail || 'No se pudo compartir el mazo');
      }
    } finally {
      setSharingDeckId(null);
    }
  };

  const renameDeck = async () => {
    if (!selectedDeck) {
      return;
    }

    const trimmedName = draftDeckName.trim();
    if (!trimmedName) {
      alert('El nombre del mazo no puede estar vacio');
      return;
    }

    setRenamingDeckId(selectedDeck.id);

    try {
      await axios.patch(`${API_BASE}/decks/${selectedDeck.id}`, { name: trimmedName });
      await fetchDecks();
      await viewDeckDetails(selectedDeck.id);
    } catch (error) {
      alert(error.response?.data?.detail || 'No se pudo cambiar el nombre del mazo');
    } finally {
      setRenamingDeckId(null);
    }
  };

  const adjustDeckCardQuantity = async (deckId, cardId, delta) => {
    setUpdatingDeckCardId(cardId);

    try {
      await axios.post(`${API_BASE}/decks/${deckId}/cards/${cardId}/adjust`, { delta });
      await viewDeckDetails(deckId, { keepCurrentView: true });
      await fetchDecks();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      alert(error.response?.data?.detail || 'No se pudo actualizar la cantidad en el mazo');
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

      alert(error.response?.data?.detail || 'No se pudo ajustar la cobertura del mazo');
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
                  </div>
                  <div className="deck-detail-actions">
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

                <div className="deck-detail-grid">
                  {(selectedDeck?.cards || []).map((card) => (
                    <article key={card.id} className={`deck-card-row ${card.missing_quantity > 0 ? 'has-missing-copies' : ''}`}>
                      <img src={card.image_url} alt={card.name} />
                      <div className="deck-card-copy">
                        <h4>{card.name}</h4>
                        <p>{[card.card_type || 'Sin tipo', card.color || 'Sin color', card.rarity || 'Sin rareza'].join(' · ')}</p>
                        <span>{card.set_name || 'Set desconocido'}</span>
                        <div className="deck-owned-panel">
                          <span>En colección: x{card.owned_quantity || 0}</span>
                        </div>
                        {advancedDeckControlsEnabled && (
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
                        {!advancedDeckControlsEnabled && (
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
                              card.quantity >= MAX_COPIES_PER_CARD
                            }
                          >
                            +
                          </button>
                        </div>
                        <span className="deck-card-limit-note">Max {MAX_COPIES_PER_CARD}</span>
                      </div>
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
