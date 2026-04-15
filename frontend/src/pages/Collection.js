import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { getGameConfig } from '../tcgConfig';

const API_BASE = 'http://host.docker.internal:8000';

function Collection({ activeTcgSlug, activeTgc }) {
  const activeGame = getGameConfig(activeTcgSlug);
  const [collection, setCollection] = useState([]);
  const [decks, setDecks] = useState([]);
  const [updatingCardId, setUpdatingCardId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!activeTgc?.id) {
      return;
    }

    fetchCollection();
    fetchDecks();
  }, [activeTcgSlug, activeTgc]);

  const fetchCollection = async () => {
    try {
      const res = await axios.get(`${API_BASE}/collection`, {
        params: { tgc_id: activeTgc.id },
      });
      setCollection(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      console.error('Error al cargar la coleccion:', error);
    }
  };

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

  const adjustCollectionQuantity = async (cardId, delta) => {
    setUpdatingCardId(cardId);

    try {
      await axios.post(`${API_BASE}/collection/${cardId}/adjust`, { delta });
      await fetchCollection();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      alert(error.response?.data?.detail || 'No se pudo actualizar la cantidad en coleccion');
    } finally {
      setUpdatingCardId(null);
    }
  };

  const addCardToDeck = async (deckId, cardId) => {
    try {
      await axios.post(`${API_BASE}/decks/${deckId}/cards`, { card_id: cardId, quantity: 1 });
      await fetchCollection();
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      alert(error.response?.data?.detail || 'No se pudo agregar la carta al mazo');
      console.error('Error al agregar carta al mazo:', error);
    }
  };

  const openDeck = (deckId) => {
    navigate('/decks', { state: { openDeckId: deckId } });
  };

  const safeCollection = collection.filter((item) => item?.card);

  return (
    <div className="collection page-shell">
      <section className="page-hero collection-hero">
        <div>
          <span className="eyebrow">{activeGame.eyebrow}</span>
          <h1>{activeTcgSlug === 'one-piece' ? 'Mi Tripulacion' : 'Mi Coleccion'}</h1>
          <p>
            Controla tus copias de {activeGame.shortName}, revisa cuantas siguen libres
            para construir mazos y ajusta cantidades sin salir de esta vista.
          </p>
        </div>

        <div className="hero-stat">
          <span>Cartas registradas</span>
          <strong>{safeCollection.length}</strong>
        </div>
      </section>

      <div className="collection-list">
        {safeCollection.map((item) => {
          const isUpdating = updatingCardId === item.card.id;

          return (
            <article key={item.card.id} className="collection-item">
              <div className="collection-visual">
                <img src={item.card.image_url} alt={item.card.name} />
                <div className="collection-stepper-panel">
                  <span className="collection-panel-label">Copias</span>
                  <div className="quantity-stepper-controls">
                    <button
                      type="button"
                      onClick={() => adjustCollectionQuantity(item.card.id, -1)}
                      disabled={isUpdating}
                    >
                      -
                    </button>
                    <span>x{item.total_quantity}</span>
                    <button
                      type="button"
                      onClick={() => adjustCollectionQuantity(item.card.id, 1)}
                      disabled={isUpdating}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="collection-main">
                <div className="collection-copy">
                  <div className="collection-heading">
                    <h3>{item.card.name}</h3>
                    <div className="collection-counter-row">
                      <span className="card-chip">Total: x{item.total_quantity}</span>
                      <span className="card-chip card-chip-secondary">
                        Disponible: x{item.available_quantity}
                      </span>
                    </div>
                  </div>

                  <p className="collection-meta">
                    {item.card.card_type || 'Sin tipo'} · {item.card.color || 'Sin color'} ·{' '}
                    {item.card.rarity || 'Sin rareza'}
                  </p>

                  <div className="collection-decks">
                    <strong>En mazos</strong>
                    {(item.decks || []).length > 0 ? (
                      <div className="deck-link-list">
                        {item.decks.map((deck) => (
                          <button
                            key={deck.id}
                            type="button"
                            className="deck-link-button"
                            onClick={() => openDeck(deck.id)}
                          >
                            {deck.name} x{deck.quantity}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="collection-empty-text">Todavia no esta en ningun mazo.</span>
                    )}
                  </div>
                </div>

                <div className="collection-actions">
                  <span className="collection-panel-label">Agregar al mazo</span>
                  <div className="deck-buttons">
                    {decks.map((deck) => (
                      <button
                        key={deck.id}
                        type="button"
                        onClick={() => addCardToDeck(deck.id, item.card.id)}
                      >
                        Agregar a {deck.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {safeCollection.length === 0 && (
          <div className="empty-state panel">
            <h3>No hay cartas de {activeGame.shortName} en tu coleccion todavia</h3>
            <p>Anade cartas desde el buscador para empezar a construir mazos.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Collection;
