import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import SearchCardDetailModal from '../components/search/SearchCardDetailModal';
import SearchCardTile from '../components/search/SearchCardTile';
import SearchDeckPickerModal from '../components/search/SearchDeckPickerModal';
import SearchFiltersPanel from '../components/search/SearchFiltersPanel';
import SearchResultsToolbar from '../components/search/SearchResultsToolbar';
import { getGameConfig } from '../tcgConfig';
import { useToast } from '../context/ToastContext';
import API_BASE from '../apiBase';
import { getApiErrorMessage } from '../utils/apiMessages';
import {
  readCacheMap,
  readStoredEnumValue,
  setLimitedCacheEntry,
  writeCacheMap,
  writeStoredValue,
} from '../utils/searchCache';

const SEARCH_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const MOBILE_BREAKPOINT_QUERY = '(max-width: 768px)';
const MOBILE_DEFAULT_PAGE_SIZE = 20;
const DESKTOP_DEFAULT_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = DESKTOP_DEFAULT_PAGE_SIZE;
const SEARCH_CARD_VIEW_MODES = ['detail', 'compact'];
const SEARCH_INPUT_DELAY_MS = 280;
const DEFAULT_ACTION_QUANTITY = 1;
const MAX_ACTION_QUANTITY = 99;
const SEARCH_CACHE_STORAGE_KEYS = {
  cards: 'tgc-search-cards-cache-v1',
  facets: 'tgc-search-facets-cache-v1',
  decks: 'tgc-search-decks-cache-v1',
  pageSize: 'tgc-search-page-size-v1',
  cardViewMode: 'tgc-search-card-view-mode-v1',
};
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

const getIsMobileLayout = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches
);

const getRecommendedPageSize = () => (
  getIsMobileLayout() ? MOBILE_DEFAULT_PAGE_SIZE : DESKTOP_DEFAULT_PAGE_SIZE
);

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

const normalizeQuantityInput = (value) => value.replace(/[^\d]/g, '');

const clampActionQuantity = (value) => {
  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isFinite(parsedValue) || parsedValue < DEFAULT_ACTION_QUANTITY) {
    return DEFAULT_ACTION_QUANTITY;
  }

  return Math.min(parsedValue, MAX_ACTION_QUANTITY);
};

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
  const [actionQuantityDrafts, setActionQuantityDrafts] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => readStoredEnumValue(
    SEARCH_CACHE_STORAGE_KEYS.pageSize,
    SEARCH_PAGE_SIZE_OPTIONS,
    getRecommendedPageSize()
  ));
  const [isMobileLayout, setIsMobileLayout] = useState(getIsMobileLayout);
  const [cardViewMode, setCardViewMode] = useState(() => readStoredEnumValue(
    SEARCH_CACHE_STORAGE_KEYS.cardViewMode,
    SEARCH_CARD_VIEW_MODES,
    'detail'
  ));
  const [pagination, setPagination] = useState(() => createEmptyResults(pageSize));
  const [facets, setFacets] = useState(EMPTY_FACETS);
  const [loadingCards, setLoadingCards] = useState(true);
  const [hasLoadedCards, setHasLoadedCards] = useState(false);
  const [hasLoadedFacets, setHasLoadedFacets] = useState(false);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const cardsCacheRef = useRef(readCacheMap(SEARCH_CACHE_STORAGE_KEYS.cards));
  const facetsCacheRef = useRef(readCacheMap(SEARCH_CACHE_STORAGE_KEYS.facets));
  const decksCacheRef = useRef(readCacheMap(SEARCH_CACHE_STORAGE_KEYS.decks));
  const decksRequestRef = useRef(new Map());

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
  const effectiveCardViewMode = isMobileLayout ? cardViewMode : 'detail';

  const persistCardsCache = useCallback((cacheKey, payload) => {
    setLimitedCacheEntry(cardsCacheRef.current, cacheKey, payload, 24);
    writeCacheMap(SEARCH_CACHE_STORAGE_KEYS.cards, cardsCacheRef.current);
  }, []);

  const persistFacetsCache = useCallback((cacheKey, payload) => {
    setLimitedCacheEntry(facetsCacheRef.current, cacheKey, payload, 12);
    writeCacheMap(SEARCH_CACHE_STORAGE_KEYS.facets, facetsCacheRef.current);
  }, []);

  const persistDecksCache = useCallback((cacheKey, payload) => {
    setLimitedCacheEntry(decksCacheRef.current, cacheKey, payload, 12);
    writeCacheMap(SEARCH_CACHE_STORAGE_KEYS.decks, decksCacheRef.current);
  }, []);

  useEffect(() => {
    writeStoredValue(SEARCH_CACHE_STORAGE_KEYS.pageSize, pageSize);
  }, [pageSize]);

  useEffect(() => {
    writeStoredValue(SEARCH_CACHE_STORAGE_KEYS.cardViewMode, cardViewMode);
  }, [cardViewMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const handleChange = (event) => {
      setIsMobileLayout(event.matches);
    };

    setIsMobileLayout(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

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
    setActionQuantityDrafts({});
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
        persistCardsCache(cardsCacheKey, nextPagination);

        setCards(nextPagination.items);
        setPagination(nextPagination);

        if (nextPagination.page !== page) {
          setPage(nextPagination.page);
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
  }, [cardsCacheKey, cardsRequestParams, hasLoadedCards, page, pageSize, persistCardsCache]);

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

        persistFacetsCache(facetsCacheKey, nextFacets);
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
  }, [activeTgc?.id, persistFacetsCache]);

  const setActionQuantityDraft = useCallback((cardId, value) => {
    if (!cardId) {
      return;
    }

    const normalizedValue = normalizeQuantityInput(String(value));
    setActionQuantityDrafts((current) => ({
      ...current,
      [cardId]: normalizedValue,
    }));
  }, []);

  const getActionQuantity = useCallback((cardId) => {
    const draftValue = actionQuantityDrafts[cardId];
    if (!draftValue) {
      return DEFAULT_ACTION_QUANTITY;
    }

    return clampActionQuantity(draftValue);
  }, [actionQuantityDrafts]);

  const commitActionQuantity = useCallback((cardId) => {
    if (!cardId) {
      return DEFAULT_ACTION_QUANTITY;
    }

    const normalizedValue = clampActionQuantity(actionQuantityDrafts[cardId]);
    setActionQuantityDrafts((current) => ({
      ...current,
      [cardId]: String(normalizedValue),
    }));
    return normalizedValue;
  }, [actionQuantityDrafts]);

  const stepActionQuantity = useCallback((cardId, delta) => {
    if (!cardId) {
      return;
    }

    const nextQuantity = Math.max(
      DEFAULT_ACTION_QUANTITY,
      Math.min(getActionQuantity(cardId) + delta, MAX_ACTION_QUANTITY)
    );
    setActionQuantityDrafts((current) => ({
      ...current,
      [cardId]: String(nextQuantity),
    }));
  }, [getActionQuantity]);

  const getAddedMessage = useCallback((quantity, destinationLabel) => (
    quantity === 1
      ? `1 copia agregada a ${destinationLabel}.`
      : `${quantity} copias agregadas a ${destinationLabel}.`
  ), []);

  const invalidateDeckPickerCache = useCallback(() => {
    if (!activeTgc?.id) {
      return;
    }

    const decksCacheKey = String(activeTgc.id);
    decksCacheRef.current.delete(decksCacheKey);
    writeCacheMap(SEARCH_CACHE_STORAGE_KEYS.decks, decksCacheRef.current);
    setDecks([]);
  }, [activeTgc?.id]);

  const loadDecksForPicker = async (forceRefresh = false) => {
    if (!activeTgc?.id) {
      setDecks([]);
      return [];
    }

    const decksCacheKey = String(activeTgc.id);
    const pendingRequest = decksRequestRef.current.get(decksCacheKey);

    if (!forceRefresh && decksCacheRef.current.has(decksCacheKey)) {
      const cachedDecks = decksCacheRef.current.get(decksCacheKey);
      setDecks(cachedDecks);
      return cachedDecks;
    }

    if (pendingRequest) {
      return pendingRequest;
    }

    setLoadingDecks(true);

    const request = axios.get(`${API_BASE}/decks`, {
      params: { tgc_id: activeTgc.id },
    }).then((res) => {
      const deckList = Array.isArray(res.data) ? res.data : [];
      persistDecksCache(decksCacheKey, deckList);
      setDecks(deckList);
      return deckList;
    }).catch((error) => {
      console.error('Error al cargar mazos para el buscador:', error);
      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudieron cargar tus mazos.'),
      });
      return [];
    }).finally(() => {
      decksRequestRef.current.delete(decksCacheKey);
      setLoadingDecks(false);
    });

    decksRequestRef.current.set(decksCacheKey, request);
    return request;
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

      const quantity = commitActionQuantity(parsedCardId);

      const requestData = {
        card_id: parsedCardId,
        quantity,
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

      showToast({ type: 'success', message: getAddedMessage(quantity, 'la coleccion') });
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
    commitActionQuantity(cardId);
    await loadDecksForPicker();
  };

  const addCardToExistingDeck = async (deckId) => {
    if (!deckPickerCard) {
      return;
    }

    setSubmittingDeckAction(true);

    try {
      const quantity = commitActionQuantity(deckPickerCard.id);
      await axios.post(`${API_BASE}/decks/${deckId}/cards`, {
        card_id: deckPickerCard.id,
        quantity,
      });
      invalidateDeckPickerCache();
      showToast({ type: 'success', message: getAddedMessage(quantity, 'el mazo') });
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
      const quantity = commitActionQuantity(deckPickerCard.id);
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
        quantity,
      });

      invalidateDeckPickerCache();
      showToast({
        type: 'success',
        message: quantity === 1
          ? 'Mazo creado y 1 copia agregada.'
          : `Mazo creado y ${quantity} copias agregadas.`,
      });
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

      <SearchFiltersPanel
        searchTerm={searchTerm}
        filters={filters}
        availableTypeOptions={availableTypeOptions}
        availableColorOptions={availableColorOptions}
        availableRarityOptions={availableRarityOptions}
        uniqueExpansions={uniqueExpansions}
        onSearchChange={handleSearchChange}
        onFilterChange={handleFilterChange}
      />

      <SearchResultsToolbar
        visibleStart={visibleStart}
        visibleEnd={visibleEnd}
        pagination={pagination}
        loadingCards={loadingCards}
        pageSize={pageSize}
        pageSizeOptions={SEARCH_PAGE_SIZE_OPTIONS}
        visiblePageNumbers={visiblePageNumbers}
        cardViewMode={effectiveCardViewMode}
        onPageSizeChange={handlePageSizeChange}
        onPageChange={setPage}
        onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
        onNextPage={() => setPage((current) => current + 1)}
        onCardViewModeChange={setCardViewMode}
      />

      <div className="cards-grid">
        {cards.length > 0 ? (
          cards.map((card) => (
            <SearchCardTile
              key={card.id}
              card={card}
              cardViewMode={effectiveCardViewMode}
              actionQuantity={getActionQuantity(card.id)}
              onActionQuantityChange={setActionQuantityDraft}
              onActionQuantityBlur={commitActionQuantity}
              onIncreaseActionQuantity={(cardId) => stepActionQuantity(cardId, 1)}
              onDecreaseActionQuantity={(cardId) => stepActionQuantity(cardId, -1)}
              onOpen={setSelectedCard}
              onAddToCollection={handleAddToCollection}
              onAddToDeck={handleAddToDeck}
            />
          ))
        ) : (
          <div className="panel search-empty-state">
            <strong>No se encontraron cartas</strong>
            <p>Prueba con otro nombre o quita algun filtro para ampliar los resultados.</p>
          </div>
        )}
      </div>

      <SearchCardDetailModal
        card={selectedCard}
        activeTcgSlug={activeTcgSlug}
        actionQuantity={selectedCard ? getActionQuantity(selectedCard.id) : DEFAULT_ACTION_QUANTITY}
        onActionQuantityChange={setActionQuantityDraft}
        onActionQuantityBlur={commitActionQuantity}
        onIncreaseActionQuantity={(cardId) => stepActionQuantity(cardId, 1)}
        onDecreaseActionQuantity={(cardId) => stepActionQuantity(cardId, -1)}
        onClose={() => setSelectedCard(null)}
        onAddToCollection={handleAddToCollection}
        onAddToDeck={handleAddToDeck}
      />

      <SearchDeckPickerModal
        deckPickerCard={deckPickerCard}
        activeGame={activeGame}
        loadingDecks={loadingDecks}
        decks={decks}
        newDeckName={newDeckName}
        actionQuantity={deckPickerCard ? getActionQuantity(deckPickerCard.id) : DEFAULT_ACTION_QUANTITY}
        submittingDeckAction={submittingDeckAction}
        onClose={() => setDeckPickerCard(null)}
        onActionQuantityChange={(value) => {
          if (deckPickerCard) {
            setActionQuantityDraft(deckPickerCard.id, value);
          }
        }}
        onActionQuantityBlur={() => {
          if (deckPickerCard) {
            commitActionQuantity(deckPickerCard.id);
          }
        }}
        onIncreaseActionQuantity={() => {
          if (deckPickerCard) {
            stepActionQuantity(deckPickerCard.id, 1);
          }
        }}
        onDecreaseActionQuantity={() => {
          if (deckPickerCard) {
            stepActionQuantity(deckPickerCard.id, -1);
          }
        }}
        onNewDeckNameChange={setNewDeckName}
        onAddCardToExistingDeck={addCardToExistingDeck}
        onCreateDeckAndAddCard={createDeckAndAddCard}
      />
    </div>
  );
}

export default Search;
