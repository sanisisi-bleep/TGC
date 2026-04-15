import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { getGameConfig } from '../tcgConfig';

const API_BASE = 'http://host.docker.internal:8000';

function Decks({ activeTcgSlug, activeTgc }) {
  const activeGame = getGameConfig(activeTcgSlug);
  const [decks, setDecks] = useState([]);
  const [newDeckName, setNewDeckName] = useState('');
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [updatingDeckCardId, setUpdatingDeckCardId] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!activeTgc?.id) {
      return;
    }

    fetchDecks();
  }, [activeTcgSlug, activeTgc]);

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

  const viewDeckDetails = async (deckId) => {
    setLoadingDetails(true);

    try {
      const res = await axios.get(`${API_BASE}/decks/${deckId}`);
      setSelectedDeck(res.data);
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      console.error('Error al cargar el detalle del mazo:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const adjustDeckCardQuantity = async (deckId, cardId, delta) => {
    setUpdatingDeckCardId(cardId);

    try {
      await axios.post(`${API_BASE}/decks/${deckId}/cards/${cardId}/adjust`, { delta });
      await viewDeckDetails(deckId);
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

            <button type="button" onClick={() => viewDeckDetails(deck.id)}>
              Ver Detalles
            </button>
          </article>
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
                    <h2>{selectedDeck?.name}</h2>
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
                    </div>
                  </div>
                  <button type="button" className="ghost-button" onClick={closeDeckDetails}>
                    Cerrar
                  </button>
                </div>

                <div className="deck-detail-grid">
                  {(selectedDeck?.cards || []).map((card) => (
                    <article key={card.id} className="deck-card-row">
                      <img src={card.image_url} alt={card.name} />
                      <div className="deck-card-copy">
                        <h4>{card.name}</h4>
                        <p>
                          {card.card_type || 'Sin tipo'} · {card.color || 'Sin color'} ·{' '}
                          {card.rarity || 'Sin rareza'}
                        </p>
                        <span>{card.set_name || 'Set desconocido'}</span>
                        <span>En coleccion: x{card.owned_quantity || 0}</span>
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
                            disabled={updatingDeckCardId === card.id}
                          >
                            +
                          </button>
                        </div>
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
