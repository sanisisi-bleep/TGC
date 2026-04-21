import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { getGameConfig } from '../tcgConfig';
import API_BASE from '../apiBase';
import { getApiErrorMessage } from '../utils/apiMessages';

const buildOrderedOptions = (values, preferredOrder = []) => {
  const available = [...new Set(values.filter(Boolean))];
  const preferred = preferredOrder.filter((value) => available.includes(value));
  const extra = available
    .filter((value) => !preferred.includes(value))
    .sort((a, b) => a.localeCompare(b));

  return [...preferred, ...extra];
};

const normalizeText = (value) => (value || '').toString().trim().toLowerCase();
const normalizeCollectionCardType = (cardType, tcgSlug) => {
  const normalizedType = (cardType || '').toString().trim();
  if (!normalizedType) {
    return '';
  }

  if (tcgSlug === 'one-piece' && normalizedType.toUpperCase().includes('DON')) {
    return 'DON!!';
  }

  return normalizedType;
};

const buildCollectionMeta = (card, tcgSlug) => (
  [
    normalizeCollectionCardType(card?.card_type, tcgSlug) || 'Sin tipo',
    card?.color || 'Sin color',
    card?.rarity || 'Sin rareza',
  ].join(' | ')
);

function Collection({ activeTcgSlug, activeTgc }) {
  const activeGame = getGameConfig(activeTcgSlug);
  const { showToast } = useToast();
  const [collection, setCollection] = useState([]);
  const [decks, setDecks] = useState([]);
  const [loadingCollectionPage, setLoadingCollectionPage] = useState(true);
  const [updatingCardId, setUpdatingCardId] = useState(null);
  const [quantityInputs, setQuantityInputs] = useState({});
  const [collectionSearchTerm, setCollectionSearchTerm] = useState('');
  const [collectionFilters, setCollectionFilters] = useState({
    type: '',
    color: '',
    rarity: '',
    set: '',
  });
  const [collectionSort, setCollectionSort] = useState('name-asc');
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
    setCollectionSearchTerm('');
    setCollectionFilters({
      type: '',
      color: '',
      rarity: '',
      set: '',
    });
    setCollectionSort('name-asc');
  }, [activeTcgSlug, activeTgc?.id]);

  useEffect(() => {
    if (!activeTgc?.id) {
      setCollection([]);
      setDecks([]);
      setLoadingCollectionPage(false);
      return;
    }

    const loadCollectionPage = async () => {
      setLoadingCollectionPage(true);

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
        showToast({
          type: 'error',
          message: getApiErrorMessage(error, 'No se pudo cargar la coleccion.'),
        });
      } finally {
        setLoadingCollectionPage(false);
      }
    };

    loadCollectionPage();
  }, [activeTgc?.id, navigate, showToast, syncQuantityInputs]);

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

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo actualizar la cantidad en coleccion.'),
      });
    } finally {
      setUpdatingCardId(null);
    }
  };

  const applyManualCollectionChange = async (cardId, direction) => {
    const rawValue = quantityInputs[cardId] || '1';
    const parsedValue = Number(rawValue);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      showToast({ type: 'error', message: 'La cantidad debe ser un numero entero mayor que 0.' });
      return;
    }

    await adjustCollectionQuantity(cardId, direction === 'add' ? parsedValue : -parsedValue);
  };

  const addCardToDeck = async (deckId, cardId) => {
    try {
      await axios.post(`${API_BASE}/decks/${deckId}/cards`, { card_id: cardId, quantity: 1 });
      await loadCollection(true);
      showToast({ type: 'success', message: 'Carta agregada al mazo.' });
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/');
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo agregar la carta al mazo.'),
      });
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

  const availableTypeOptions = useMemo(
    () => buildOrderedOptions(
      safeCollection.map((item) => normalizeCollectionCardType(item.card.card_type, activeTcgSlug)),
      activeGame.filters.types
    ),
    [activeGame.filters.types, activeTcgSlug, safeCollection]
  );

  const availableColorOptions = useMemo(
    () => buildOrderedOptions(
      safeCollection.map((item) => item.card.color),
      activeGame.filters.colors
    ),
    [activeGame.filters.colors, safeCollection]
  );

  const availableRarityOptions = useMemo(
    () => buildOrderedOptions(safeCollection.map((item) => item.card.rarity)),
    [safeCollection]
  );

  const availableSetOptions = useMemo(
    () => buildOrderedOptions(safeCollection.map((item) => item.card.set_name)),
    [safeCollection]
  );

  const visibleCollection = useMemo(() => {
    const normalizedSearch = normalizeText(collectionSearchTerm);
    const nextCollection = safeCollection.filter((item) => {
      const card = item.card;
      const normalizedCardType = normalizeCollectionCardType(card.card_type, activeTcgSlug);

      if (normalizedSearch) {
        const matchesSearch = [
          card.name,
          card.source_card_id,
          card.set_name,
          normalizedCardType,
        ].some((value) => normalizeText(value).includes(normalizedSearch));

        if (!matchesSearch) {
          return false;
        }
      }

      if (collectionFilters.type && normalizedCardType !== collectionFilters.type) {
        return false;
      }
      if (collectionFilters.color && card.color !== collectionFilters.color) {
        return false;
      }
      if (collectionFilters.rarity && card.rarity !== collectionFilters.rarity) {
        return false;
      }
      if (collectionFilters.set && card.set_name !== collectionFilters.set) {
        return false;
      }

      return true;
    });

    const sortedCollection = [...nextCollection];
    sortedCollection.sort((left, right) => {
      const leftCard = left.card;
      const rightCard = right.card;

      switch (collectionSort) {
        case 'set-asc':
          return normalizeText(leftCard.set_name).localeCompare(normalizeText(rightCard.set_name))
            || normalizeText(leftCard.name).localeCompare(normalizeText(rightCard.name));
        case 'rarity-asc':
          return normalizeText(leftCard.rarity).localeCompare(normalizeText(rightCard.rarity))
            || normalizeText(leftCard.name).localeCompare(normalizeText(rightCard.name));
        case 'quantity-desc':
          return (right.total_quantity || 0) - (left.total_quantity || 0)
            || normalizeText(leftCard.name).localeCompare(normalizeText(rightCard.name));
        case 'available-desc':
          return (right.available_quantity || 0) - (left.available_quantity || 0)
            || normalizeText(leftCard.name).localeCompare(normalizeText(rightCard.name));
        case 'name-asc':
        default:
          return normalizeText(leftCard.name).localeCompare(normalizeText(rightCard.name));
      }
    });

    return sortedCollection;
  }, [activeTcgSlug, collectionFilters, collectionSearchTerm, collectionSort, safeCollection]);

  const hasCollectionFilters = Boolean(
    collectionSearchTerm.trim()
    || collectionFilters.type
    || collectionFilters.color
    || collectionFilters.rarity
    || collectionFilters.set
    || collectionSort !== 'name-asc'
  );

  const clearCollectionFilters = () => {
    setCollectionSearchTerm('');
    setCollectionFilters({
      type: '',
      color: '',
      rarity: '',
      set: '',
    });
    setCollectionSort('name-asc');
  };

  if (loadingCollectionPage && safeCollection.length === 0) {
    return (
      <div className="collection page-shell">
        <section className="page-hero collection-hero">
          <div>
            <span className="eyebrow">{activeGame.eyebrow}</span>
            <h1>{activeTcgSlug === 'one-piece' ? 'Mi Tripulacion' : 'Mi Coleccion'}</h1>
            <p>Cargando tu inventario de {activeGame.shortName}...</p>
          </div>
        </section>
      </div>
    );
  }

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

      <section className="panel collection-controls-panel">
        <div className="collection-controls-copy">
          <strong>Filtra tu coleccion</strong>
          <span>
            Mostrando {visibleCollection.length} de {safeCollection.length} cartas registradas.
          </span>
        </div>

        <div className="collection-controls">
          <input
            type="text"
            placeholder="Buscar por nombre, codigo o set..."
            value={collectionSearchTerm}
            onChange={(e) => setCollectionSearchTerm(e.target.value)}
          />

          <select
            value={collectionFilters.type}
            onChange={(e) => setCollectionFilters((current) => ({ ...current, type: e.target.value }))}
          >
            <option value="">Todos los tipos</option>
            {availableTypeOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>

          <select
            value={collectionFilters.color}
            onChange={(e) => setCollectionFilters((current) => ({ ...current, color: e.target.value }))}
          >
            <option value="">Todos los colores</option>
            {availableColorOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>

          <select
            value={collectionFilters.rarity}
            onChange={(e) => setCollectionFilters((current) => ({ ...current, rarity: e.target.value }))}
          >
            <option value="">Todas las rarezas</option>
            {availableRarityOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>

          <select
            value={collectionFilters.set}
            onChange={(e) => setCollectionFilters((current) => ({ ...current, set: e.target.value }))}
          >
            <option value="">Todos los sets</option>
            {availableSetOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>

          <select
            value={collectionSort}
            onChange={(e) => setCollectionSort(e.target.value)}
          >
            <option value="name-asc">Orden: Nombre</option>
            <option value="set-asc">Orden: Set</option>
            <option value="rarity-asc">Orden: Rareza</option>
            <option value="quantity-desc">Orden: Total copias</option>
            <option value="available-desc">Orden: Disponibles</option>
          </select>

          <button
            type="button"
            className="ghost-button collection-clear-button"
            onClick={clearCollectionFilters}
            disabled={!hasCollectionFilters}
          >
            Limpiar
          </button>
        </div>
      </section>

      <div className={`collection-list ${collectionView !== 'detail' ? 'is-grid' : ''}`}>
        {visibleCollection.map((item) => {
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
                    {buildCollectionMeta(item.card, activeTcgSlug)}
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
                      <span className="collection-empty-text">Todavia no esta en ningun mazo.</span>
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
            <p>Anade cartas desde el buscador para empezar a construir mazos.</p>
          </div>
        )}

        {safeCollection.length > 0 && visibleCollection.length === 0 && (
          <div className="empty-state panel">
            <h3>No hay cartas que coincidan con esos filtros</h3>
            <p>Prueba con otro nombre, set o quita alguno de los filtros activos.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Collection;
