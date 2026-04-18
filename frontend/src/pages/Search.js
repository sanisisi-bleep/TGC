import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { getGameConfig } from '../tcgConfig';
import { useToast } from '../context/ToastContext';
import API_BASE from '../apiBase';
import { getApiErrorMessage } from '../utils/apiMessages';

const SEARCH_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 100;
const SEARCH_INPUT_DELAY_MS = 280;
const createEmptyResults = (limit = DEFAULT_PAGE_SIZE) => ({
  items: [],
  page: 1,
  limit,
  total: 0,
  total_pages: 0,
  has_previous: false,
  has_next: false,
});
const EMPTY_FACETS = {
  card_types: [],
  colors: [],
  rarities: [],
  set_names: [],
};

const buildOrderedOptions = (values, preferredOrder = []) => {
  const available = [...new Set(values.filter(Boolean))];
  const preferred = preferredOrder.filter((value) => available.includes(value));
  const extra = available
    .filter((value) => !preferred.includes(value))
    .sort((a, b) => a.localeCompare(b));

  return [...preferred, ...extra].map((value) => ({ value, label: value }));
};

const buildCardsRequestParams = ({
  tgcId,
  page,
  pageSize,
  searchTerm,
  filters,
}) => {
  if (!tgcId) {
    return null;
  }

  const params = {
    tgc_id: tgcId,
    page,
    limit: pageSize,
  };

  const normalizedSearch = searchTerm.trim();
  if (normalizedSearch) {
    params.search = normalizedSearch;
  }
  if (filters.type) {
    params.card_type = filters.type;
  }
  if (filters.color) {
    params.color = filters.color;
  }
  if (filters.rarity) {
    params.rarity = filters.rarity;
  }
  if (filters.expansion) {
    params.set_name = filters.expansion;
  }

  return params;
};

const normalizeResultsPayload = (payload, fallbackLimit = DEFAULT_PAGE_SIZE) => {
  const safePayload = payload && typeof payload === 'object'
    ? payload
    : createEmptyResults(fallbackLimit);
  const items = Array.isArray(safePayload.items) ? safePayload.items : [];

  return {
    ...createEmptyResults(fallbackLimit),
    ...safePayload,
    items,
  };
};

const isRequestCanceled = (error) => (
  axios.isCancel?.(error)
  || error?.code === 'ERR_CANCELED'
  || error?.name === 'CanceledError'
  || error?.name === 'AbortError'
);

const useDebouncedValue = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [delay, value]);

  return debouncedValue;
};

function Search({ activeTcgSlug, activeTgc }) {
  const activeGame = getGameConfig(activeTcgSlug);
  const { showToast } = useToast();
  const [cards, setCards] = useState([]);
  const [decks, setDecks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, SEARCH_INPUT_DELAY_MS);
  const [filters, setFilters] = useState({
    type: '',
    color: '',
    rarity: '',
    expansion: '',
  });
  const [selectedCard, setSelectedCard] = useState(null);
  const [deckPickerCard, setDeckPickerCard] = useState(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [submittingDeckAction, setSubmittingDeckAction] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pagination, setPagination] = useState(() => createEmptyResults(DEFAULT_PAGE_SIZE));
  const [facets, setFacets] = useState(EMPTY_FACETS);
  const [loadingCards, setLoadingCards] = useState(true);
  const [hasLoadedCards, setHasLoadedCards] = useState(false);
  const [hasLoadedFacets, setHasLoadedFacets] = useState(false);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const cardsCacheRef = useRef(new Map());
  const facetsCacheRef = useRef(new Map());
  const decksCacheRef = useRef(new Map());

  const cardsRequestParams = useMemo(
    () => buildCardsRequestParams({
      tgcId: activeTgc?.id,
      page,
      pageSize,
      searchTerm: debouncedSearchTerm,
      filters,
    }),
    [activeTgc?.id, debouncedSearchTerm, filters, page, pageSize]
  );

  const cardsCacheKey = useMemo(
    () => JSON.stringify(cardsRequestParams ?? {}),
    [cardsRequestParams]
  );

  useEffect(() => {
    setSearchTerm('');
    setFilters({
      type: '',
      color: '',
      rarity: '',
      expansion: '',
    });
    setPage(1);
    setCards([]);
    setPagination((current) => createEmptyResults(current.limit || DEFAULT_PAGE_SIZE));
    setFacets(EMPTY_FACETS);
    setDecks([]);
    setSelectedCard(null);
    setDeckPickerCard(null);
    setNewDeckName('');
    setHasLoadedCards(false);
    setHasLoadedFacets(false);
    setLoadingDecks(false);
  }, [activeTcgSlug, activeTgc?.id]);

  useEffect(() => {
    if (!cardsRequestParams) {
      setCards([]);
      setPagination(createEmptyResults(pageSize));
      setLoadingCards(false);
      setHasLoadedCards(true);
      return undefined;
    }

    const controller = new AbortController();
    const cachedResults = cardsCacheRef.current.get(cardsCacheKey);

    if (cachedResults) {
      setCards(cachedResults.items);
      setPagination(cachedResults);
      setLoadingCards(false);
      setHasLoadedCards(true);
      return () => controller.abort();
    }

    const prefetchNextPage = async (baseParams, nextPage) => {
      const nextParams = {
        ...baseParams,
        page: nextPage,
      };
      const nextCacheKey = JSON.stringify(nextParams);

      if (cardsCacheRef.current.has(nextCacheKey)) {
        return;
      }

      try {
        const prefetchResponse = await axios.get(`${API_BASE}/cards`, {
          params: nextParams,
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        });

        cardsCacheRef.current.set(
          nextCacheKey,
          normalizeResultsPayload(prefetchResponse.data, pageSize)
        );
      } catch (error) {
        if (!isRequestCanceled(error)) {
          console.error('Error al precargar la siguiente pagina del buscador:', error);
        }
      }
    };

    const fetchCards = async () => {
      setLoadingCards(true);

      try {
        const res = await axios.get(`${API_BASE}/cards`, {
          params: cardsRequestParams,
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        });

        const nextPagination = normalizeResultsPayload(res.data, pageSize);
        cardsCacheRef.current.set(cardsCacheKey, nextPagination);

        setCards(nextPagination.items);
        setPagination(nextPagination);

        if (nextPagination.page !== page) {
          setPage(nextPagination.page);
        }

        if (nextPagination.has_next) {
          void prefetchNextPage(cardsRequestParams, nextPagination.page + 1);
        }
      } catch (error) {
        if (isRequestCanceled(error)) {
          return;
        }

        console.error('Error al cargar cartas:', error);
        console.error('Respuesta backend:', error.response?.data);

        if (!hasLoadedCards) {
          setCards([]);
          setPagination(createEmptyResults(pageSize));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingCards(false);
          setHasLoadedCards(true);
        }
      }
    };

    fetchCards();

    return () => {
      controller.abort();
    };
  }, [cardsCacheKey, cardsRequestParams, hasLoadedCards, page, pageSize]);

  useEffect(() => {
    if (!activeTgc?.id) {
      setFacets(EMPTY_FACETS);
      setHasLoadedFacets(true);
      return undefined;
    }

    const controller = new AbortController();
    const facetsCacheKey = String(activeTgc.id);
    const cachedFacets = facetsCacheRef.current.get(facetsCacheKey);

    if (cachedFacets) {
      setFacets(cachedFacets);
      setHasLoadedFacets(true);
      return () => controller.abort();
    }

    const fetchFacets = async () => {
      try {
        const res = await axios.get(`${API_BASE}/cards/facets`, {
          params: { tgc_id: activeTgc.id },
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        });

        const payload = res.data && typeof res.data === 'object' ? res.data : EMPTY_FACETS;
        const nextFacets = {
          card_types: Array.isArray(payload.card_types) ? payload.card_types : [],
          colors: Array.isArray(payload.colors) ? payload.colors : [],
          rarities: Array.isArray(payload.rarities) ? payload.rarities : [],
          set_names: Array.isArray(payload.set_names) ? payload.set_names : [],
        };

        facetsCacheRef.current.set(facetsCacheKey, nextFacets);
        setFacets(nextFacets);
      } catch (error) {
        if (isRequestCanceled(error)) {
          return;
        }

        console.error('Error al cargar filtros del buscador:', error);
        setFacets(EMPTY_FACETS);
      } finally {
        if (!controller.signal.aborted) {
          setHasLoadedFacets(true);
        }
      }
    };

    fetchFacets();

    return () => {
      controller.abort();
    };
  }, [activeTgc?.id]);

  const loadDecksForPicker = async (forceRefresh = false) => {
    if (!activeTgc?.id) {
      setDecks([]);
      return [];
    }

    const decksCacheKey = String(activeTgc.id);

    if (!forceRefresh && decksCacheRef.current.has(decksCacheKey)) {
      const cachedDecks = decksCacheRef.current.get(decksCacheKey);
      setDecks(cachedDecks);
      return cachedDecks;
    }

    setLoadingDecks(true);

    try {
      const res = await axios.get(`${API_BASE}/decks`, {
        params: { tgc_id: activeTgc.id },
      });
      const deckList = Array.isArray(res.data) ? res.data : [];
      decksCacheRef.current.set(decksCacheKey, deckList);
      setDecks(deckList);
      return deckList;
    } catch (error) {
      console.error('Error al cargar mazos para el buscador:', error);
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudieron cargar tus mazos.'),
      });
      return [];
    } finally {
      setLoadingDecks(false);
    }
  };

  const handleAddToCollection = async (cardId) => {
    try {
      const token = localStorage.getItem('token');

      if (!token) {
        showToast({ type: 'error', message: 'Debes iniciar sesion para agregar cartas a tu coleccion.' });
        return;
      }

      const parsedCardId = Number(cardId);

      if (!Number.isInteger(parsedCardId) || parsedCardId <= 0) {
        showToast({ type: 'error', message: 'El ID de carta recibido no es valido.' });
        return;
      }

      const requestData = {
        card_id: parsedCardId,
        quantity: 1,
      };

      await axios.post(
        `${API_BASE}/collection`,
        requestData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );

      showToast({ type: 'success', message: 'Carta agregada a la coleccion.' });
    } catch (error) {
      if (error.response?.status === 401) {
        showToast({ type: 'error', message: 'Sesion expirada. Por favor, inicia sesion de nuevo.' });
        localStorage.removeItem('token');
        return;
      }
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo agregar la carta a la coleccion.'),
      });
    }
  };

  const handleAddToDeck = async (cardId) => {
    const card = cards.find((item) => item.id === cardId) || null;
    setDeckPickerCard(card);
    setNewDeckName(card ? `${card.name} Test` : '');
    await loadDecksForPicker();
  };

  const addCardToExistingDeck = async (deckId) => {
    if (!deckPickerCard) {
      return;
    }

    setSubmittingDeckAction(true);

    try {
      await axios.post(`${API_BASE}/decks/${deckId}/cards`, {
        card_id: deckPickerCard.id,
        quantity: 1,
      });
      showToast({ type: 'success', message: 'Carta agregada al mazo.' });
      setDeckPickerCard(null);
    } catch (error) {
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo agregar la carta al mazo.'),
      });
    } finally {
      setSubmittingDeckAction(false);
    }
  };

  const createDeckAndAddCard = async () => {
    if (!deckPickerCard) {
      return;
    }

    const trimmedDeckName = newDeckName.trim();
    if (!trimmedDeckName) {
      showToast({ type: 'error', message: 'Pon un nombre al mazo nuevo.' });
      return;
    }

    setSubmittingDeckAction(true);

    try {
      const createResponse = await axios.post(`${API_BASE}/decks`, {
        name: trimmedDeckName,
        tgc_id: activeTgc.id,
      });

      const deckId = createResponse.data?.id;
      if (!deckId) {
        throw new Error('Deck creation did not return an id');
      }

      await axios.post(`${API_BASE}/decks/${deckId}/cards`, {
        card_id: deckPickerCard.id,
        quantity: 1,
      });

      await loadDecksForPicker(true);
      showToast({ type: 'success', message: 'Mazo creado y carta agregada.' });
      setDeckPickerCard(null);
      setNewDeckName('');
    } catch (error) {
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo crear el mazo y agregar la carta.'),
      });
    } finally {
      setSubmittingDeckAction(false);
    }
  };

  const handleFilterChange = (filterName, value) => {
    setPage(1);
    setFilters((prev) => ({
      ...prev,
      [filterName]: value,
    }));
  };

  const handleSearchChange = (value) => {
    setPage(1);
    setSearchTerm(value);
  };

  const handlePageSizeChange = (value) => {
    const nextPageSize = Number(value);

    if (!SEARCH_PAGE_SIZE_OPTIONS.includes(nextPageSize)) {
      return;
    }

    setPage(1);
    setPageSize(nextPageSize);
    setPagination(createEmptyResults(nextPageSize));
  };

  const uniqueExpansions = useMemo(() => facets.set_names, [facets.set_names]);

  const availableTypeOptions = useMemo(
    () => buildOrderedOptions(facets.card_types, activeGame.filters.types),
    [activeGame.filters.types, facets.card_types]
  );

  const availableColorOptions = useMemo(
    () => buildOrderedOptions(facets.colors, activeGame.filters.colors),
    [activeGame.filters.colors, facets.colors]
  );

  const availableRarityOptions = useMemo(
    () => [...facets.rarities].sort((a, b) => a.localeCompare(b)),
    [facets.rarities]
  );

  const visiblePageNumbers = useMemo(() => {
    const totalPages = pagination.total_pages;
    const currentPage = pagination.page;

    if (totalPages <= 1) {
      return [];
    }

    const end = Math.min(totalPages, currentPage + 2);
    const start = Math.max(1, end - 4);
    const adjustedEnd = Math.min(totalPages, Math.max(end, start + 4));

    return Array.from(
      { length: adjustedEnd - start + 1 },
      (_, index) => start + index
    );
  }, [pagination.page, pagination.total_pages]);

  const visibleStart = pagination.total === 0
    ? 0
    : ((pagination.page - 1) * pagination.limit) + 1;
  const visibleEnd = pagination.total === 0
    ? 0
    : Math.min(pagination.page * pagination.limit, pagination.total);
  const isInitialLoading = !hasLoadedCards || !hasLoadedFacets;

  if (isInitialLoading) {
    return (
      <div className="search page-shell">
        <section className="page-hero">
          <div>
            <span className="eyebrow">{activeGame.eyebrow}</span>
            <h1>{activeGame.searchTitle}</h1>
            <p>Preparando el catalogo de {activeGame.shortName}...</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="search page-shell">
      <section className="page-hero search-hero">
        <div>
          <span className="eyebrow">{activeGame.eyebrow}</span>
          <h1>{activeGame.searchTitle}</h1>
          <p>
            Filtra el catalogo de {activeGame.shortName} por tipo, color, rareza y set
            para mover cartas directo a tu coleccion.
          </p>
        </div>

        <div className="hero-stat">
          <span>Cartas encontradas</span>
          <strong>{pagination.total}</strong>
        </div>
      </section>

      <div className="search-controls">
        <input
          type="text"
          placeholder="Buscar por nombre o codigo..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
        />

        <select
          value={filters.type}
          onChange={(e) => handleFilterChange('type', e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {availableTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={filters.color}
          onChange={(e) => handleFilterChange('color', e.target.value)}
        >
          <option value="">Todos los colores</option>
          {availableColorOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={filters.rarity}
          onChange={(e) => handleFilterChange('rarity', e.target.value)}
        >
          <option value="">Todas las rarezas</option>
          {availableRarityOptions.map((rarity) => (
            <option key={rarity} value={rarity}>
              {rarity}
            </option>
          ))}
        </select>

        <select
          value={filters.expansion}
          onChange={(e) => handleFilterChange('expansion', e.target.value)}
        >
          <option value="">Todas las expansiones</option>
          {uniqueExpansions.map((exp) => (
            <option key={exp} value={exp}>
              {exp}
            </option>
          ))}
        </select>
      </div>

      <section className="panel search-results-toolbar">
        <div className="search-results-copy">
          <strong>
            Mostrando {visibleStart}-{visibleEnd} de {pagination.total}
          </strong>
          <span>
            {loadingCards
              ? 'Actualizando resultados...'
              : `Pagina ${pagination.page} de ${pagination.total_pages || 1} con ${pagination.limit} cartas por carga.`}
          </span>
        </div>

        <div className="search-results-actions">
          <label className="page-size-control">
            <span>Por pagina</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(e.target.value)}
              disabled={loadingCards}
            >
              {SEARCH_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className="pagination-controls" aria-label="Paginacion del buscador">
            <button
              type="button"
              className="pagination-button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={!pagination.has_previous || loadingCards}
            >
              Anterior
            </button>

            <div className="pagination-page-list">
              {visiblePageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`pagination-button ${pageNumber === pagination.page ? 'is-active' : ''}`}
                  onClick={() => setPage(pageNumber)}
                  disabled={loadingCards}
                >
                  {pageNumber}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="pagination-button"
              onClick={() => setPage((current) => current + 1)}
              disabled={!pagination.has_next || loadingCards}
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>

      <div className="cards-grid">
        {cards.length > 0 ? (
          cards.map((card) => (
            <div
              key={card.id}
              className="card-item"
              onClick={() => setSelectedCard(card)}
              style={{ cursor: 'pointer' }}
            >
              <img
                src={card.image_url}
                alt={card.name}
                loading="lazy"
                decoding="async"
              />
              <h3>{card.name}</h3>
              <p>Set: {card.set_name || 'Sin set'}</p>
              <p>Tipo: {card.card_type || 'Sin tipo'}</p>
              <p>Rareza: {card.rarity || 'Sin rareza'}</p>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddToCollection(card.id);
                }}
              >
                Agregar a Coleccion
              </button>
              <button
                type="button"
                className="ghost-button card-secondary-action"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddToDeck(card.id);
                }}
              >
                Agregar al Mazo
              </button>
            </div>
          ))
        ) : (
          <div className="panel search-empty-state">
            <strong>No se encontraron cartas</strong>
            <p>Prueba con otro nombre o quita algun filtro para ampliar los resultados.</p>
          </div>
        )}
      </div>

      {selectedCard && (
        <div
          className="card-modal"
          onClick={() => setSelectedCard(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="card-detail"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              padding: '30px',
              borderRadius: '10px',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <img
              src={selectedCard.image_url}
              alt={selectedCard.name}
              className="large-image"
              style={{ width: '100%', marginBottom: '20px' }}
            />

            <h2>{selectedCard.name}</h2>
            <p><strong>Tipo:</strong> {selectedCard.card_type}</p>
            <p><strong>Color:</strong> {selectedCard.color}</p>
            <p><strong>Rareza:</strong> {selectedCard.rarity}</p>
            <p><strong>Set:</strong> {selectedCard.set_name || 'Sin set'}</p>
            {selectedCard.lv && <p><strong>Nivel:</strong> {selectedCard.lv}</p>}
            {selectedCard.cost && <p><strong>Costo:</strong> {selectedCard.cost}</p>}
            {selectedCard.ap && (
              <p>
                <strong>{activeTcgSlug === 'one-piece' ? 'Poder' : 'AP'}:</strong> {selectedCard.ap}
              </p>
            )}
            {selectedCard.hp && <p><strong>HP:</strong> {selectedCard.hp}</p>}
            {selectedCard.abilities && (
              <p><strong>{activeTcgSlug === 'one-piece' ? 'Texto' : 'Habilidades'}:</strong> {selectedCard.abilities}</p>
            )}
            {selectedCard.description && (
              <p><strong>Descripcion:</strong> {selectedCard.description}</p>
            )}

            <button
              type="button"
              className="ghost-button"
              onClick={() => handleAddToCollection(selectedCard.id)}
              style={{ marginTop: '20px', marginRight: '10px', padding: '10px 20px' }}
            >
              Agregar a Coleccion
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => handleAddToDeck(selectedCard.id)}
              style={{ marginTop: '20px', marginRight: '10px', padding: '10px 20px' }}
            >
              Agregar al Mazo
            </button>
            <button
              type="button"
              onClick={() => setSelectedCard(null)}
              style={{ marginTop: '20px', padding: '10px 20px' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {deckPickerCard && (
        <div className="card-modal" onClick={() => !submittingDeckAction && setDeckPickerCard(null)}>
          <div className="deck-picker-modal panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-panel-header">
              <h2>Anadir a mazo</h2>
              <p>Elige un mazo existente o crea uno nuevo para {deckPickerCard.name}.</p>
            </div>

            <div className="deck-picker-section">
              <span className="collection-panel-label">Mazos existentes</span>
              <div className="deck-picker-list">
                {loadingDecks ? (
                  <p className="collection-empty-text">Cargando mazos...</p>
                ) : decks.length > 0 ? (
                  decks.map((deck) => (
                    <button
                      key={deck.id}
                      type="button"
                      className="deck-picker-option"
                      onClick={() => addCardToExistingDeck(deck.id)}
                      disabled={submittingDeckAction}
                    >
                      <strong>{deck.name}</strong>
                      <span>Anadir 1 copia a este mazo</span>
                    </button>
                  ))
                ) : (
                  <p className="collection-empty-text">Todavia no tienes mazos de {activeGame.shortName}.</p>
                )}
              </div>
            </div>

            <div className="deck-picker-section">
              <span className="collection-panel-label">Crear mazo nuevo</span>
              <div className="deck-picker-create">
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder={`Nuevo mazo de ${activeGame.shortName}`}
                  maxLength={100}
                  disabled={submittingDeckAction}
                />
                <button type="button" onClick={createDeckAndAddCard} disabled={submittingDeckAction}>
                  {submittingDeckAction ? 'Procesando...' : 'Crear y anadir'}
                </button>
              </div>
            </div>

            <div className="settings-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDeckPickerCard(null)}
                disabled={submittingDeckAction}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Search;
