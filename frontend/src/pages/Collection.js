import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { getGameConfig } from '../tcgConfig';
import API_BASE from '../apiBase';

function Collection({ activeTcgSlug, activeTgc }) {
  const activeGame = getGameConfig(activeTcgSlug);
  const [collection, setCollection] = useState([]);
  const [decks, setDecks] = useState([]);
  const [updatingCardId, setUpdatingCardId] = useState(null);
  const [quantityInputs, setQuantityInputs] = useState({});
  const [collectionView, setCollectionView] = useState(
    () => localStorage.getItem('collectionViewMode') || 'detail'
  );
  const collectionCacheRef = useRef(new Map());
  const decksCacheRef = useRef(new Map());
  const navigate = useNavigate();

  const syncQuantityInputs = useCallback((items) => {
    setQuantityInputs((current) => {
      const next = { ...current };
      items.forEach((item) => {
        if (item?.card?.id && !next[item.card.id]) {
          next[item.card.id] = '1';
        }
      });
      return next;
    });
  }, []);

  const updateCollectionState = (updater) => {
    setCollection((current) => {
      const next = updater(current);

      if (activeTgc?.id) {
        collectionCacheRef.current.set(String(activeTgc.id), next);
      }

      syncQuantityInputs(next);
      return next;
    });
  };

  const loadCollection = async (forceRefresh = false) => {
    if (!activeTgc?.id) {
      setCollection([]);
      return [];
    }

    const cacheKey = String(activeTgc.id);
    if (!forceRefresh && collectionCacheRef.current.has(cacheKey)) {
      const cachedItems = collectionCacheRef.current.get(cacheKey);
      setCollection(cachedItems);
      syncQuantityInputs(cachedItems);
      return cachedItems;
    }

    const res = await axios.get(`${API_BASE}/collection`, {
      params: { tgc_id: activeTgc.id },
    });
    const items = Array.isArray(res.data) ? res.data : [];
    collectionCacheRef.current.set(cacheKey, items);
    setCollection(items);
    syncQuantityInputs(items);
    return items;
  };

  useEffect(() => {
    localStorage.setItem('collectionViewMode', collectionView);
  }, [collectionView]);

  useEffect(() => {
    if (!activeTgc?.id) {
      setCollection([]);
      setDecks([]);
      return;
    }

    const loadCollectionPage = async () => {
      try {
        const cacheKey = String(activeTgc.id);
        const cachedCollection = collectionCacheRef.current.get(cacheKey);
        const cachedDecks = decksCacheRef.current.get(cacheKey);

        if (cachedCollection) {
          setCollection(cachedCollection);
          syncQuantityInputs(cachedCollection);
        }

        if (cachedDecks) {
          setDecks(cachedDecks);
        }

        const requests = [];

        if (!cachedCollection) {
          requests.push(
            axios.get(`${API_BASE}/collection`, {
              params: { tgc_id: activeTgc.id },
            }).then((res) => {
              const items = Array.isArray(res.data) ? res.data : [];
              collectionCacheRef.current.set(cacheKey, items);
              setCollection(items);
              syncQuantityInputs(items);
            })
          );
        }

        if (!cachedDecks) {
          requests.push(
            axios.get(`${API_BASE}/decks`, {
              params: { tgc_id: activeTgc.id },
            }).then((res) => {
              const deckItems = Array.isArray(res.data) ? res.data : [];
              decksCacheRef.current.set(cacheKey, deckItems);
              setDecks(deckItems);
            })
          );
        }

        await Promise.all(requests);
      } catch (error) {
        if (error.response?.status === 401) {
          navigate('/');
          return;
        }

        console.error('Error al cargar la vista de coleccion:', error);
      }
    };

    loadCollectionPage();
  }, [activeTgc?.id, navigate, syncQuantityInputs]);

  const adjustCollectionQuantity = async (cardId, delta) => {
    setUpdatingCardId(cardId);

    try {
      const response = await axios.post(`${API_BASE}/collection/${cardId}/adjust`, { delta });
      const nextQuantity = Number(response.data?.quantity ?? 0);

      updateCollectionState((current) => current.flatMap((item) => {
        if (item?.card?.id !== cardId) {
          return [item];
        }

        if (nextQuantity <= 0) {
          return [];
        }

        const usedInDecks = Math.max((item.total_quantity || 0) - (item.available_quantity || 0), 0);
        return [{
          ...item,
          total_quantity: nextQuantity,
          available_quantity: Math.max(nextQuantity - usedInDecks, 0),
        }];
      }));
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

  const applyManualCollectionChange = async (cardId, direction) => {
    const rawValue = quantityInputs[cardId] || '1';
    const parsedValue = Number(rawValue);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      alert('La cantidad debe ser un numero entero mayor que 0');
      return;
    }

    await adjustCollectionQuantity(cardId, direction === 'add' ? parsedValue : -parsedValue);
  };

  const addCardToDeck = async (deckId, cardId) => {
    try {
      await axios.post(`${API_BASE}/decks/${deckId}/cards`, { card_id: cardId, quantity: 1 });
      await loadCollection(true);
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

  const safeCollection = useMemo(
    () => collection.filter((item) => item?.card),
    [collection]
  );

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

      <section className="panel view-toggle-panel">
        <div className="view-toggle-copy">
          <strong>Vista de coleccion</strong>
          <span>Cambia entre una ficha amplia o una cuadricula compacta.</span>
        </div>
        <div className="view-toggle" role="tablist" aria-label="Vista de coleccion">
          <button
            type="button"
            className={collectionView === 'detail' ? 'is-active' : ''}
            onClick={() => setCollectionView('detail')}
          >
            Ficha
          </button>
          <button
            type="button"
            className={collectionView === 'grid' ? 'is-active' : ''}
            onClick={() => setCollectionView('grid')}
          >
            Cuadricula
          </button>
          <button
            type="button"
            className={collectionView === 'inventory' ? 'is-active' : ''}
            onClick={() => setCollectionView('inventory')}
          >
            Solo copias
          </button>
        </div>
      </section>

      <div className={`collection-list ${collectionView !== 'detail' ? 'is-grid' : ''}`}>
        {safeCollection.map((item) => {
          const isUpdating = updatingCardId === item.card.id;
          const isInventoryView = collectionView === 'inventory';
          const collectionSet = item.card.set_name || 'Sin set';

          return (
            <article
              key={item.card.id}
              className={`collection-item ${collectionView !== 'detail' ? 'is-grid' : ''} ${isInventoryView ? 'is-inventory' : ''}`}
            >
              <div className="collection-visual">
                <img
                  src={item.card.image_url}
                  alt={item.card.name}
                  loading="lazy"
                  decoding="async"
                />
                {isInventoryView ? (
                  <div className="collection-count-panel">
                    <span className="collection-panel-label">Copias</span>
                    <strong>x{item.total_quantity}</strong>
                    <span>Disponibles x{item.available_quantity}</span>
                  </div>
                ) : (
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

                    <div className="collection-batch-editor">
                      <div className="collection-batch-controls">
                        <button
                          type="button"
                          className="secondary-inline-button secondary-inline-button-icon"
                          onClick={() => applyManualCollectionChange(item.card.id, 'subtract')}
                          disabled={isUpdating}
                          aria-label="Restar varias copias"
                        >
                          -
                        </button>
                        <input
                          id={`collection-quantity-${item.card.id}`}
                          type="number"
                          min="1"
                          step="1"
                          value={quantityInputs[item.card.id] || '1'}
                          onChange={(e) =>
                            setQuantityInputs((current) => ({
                              ...current,
                              [item.card.id]: e.target.value,
                            }))
                          }
                          disabled={isUpdating}
                        />
                        <button
                          type="button"
                          className="secondary-inline-button secondary-inline-button-icon"
                          onClick={() => applyManualCollectionChange(item.card.id, 'add')}
                          disabled={isUpdating}
                          aria-label="Sumar varias copias"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )}
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
                    {[item.card.card_type || 'Sin tipo', item.card.color || 'Sin color', item.card.rarity || 'Sin rareza'].join(' · ')}
                  </p>

                  <p className="collection-meta">Set: {collectionSet}</p>

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
                      <span className="collection-empty-text">Todav?a no esta en ning?n mazo.</span>
                    )}
                  </div>
                </div>

                {!isInventoryView && (
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
                )}
              </div>
            </article>
          );
        })}

        {safeCollection.length === 0 && (
          <div className="empty-state panel">
            <h3>No hay cartas de {activeGame.shortName} en tu coleccion todavia</h3>
            <p>A?ade cartas desde el buscador para empezar a construir mazos.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Collection;
