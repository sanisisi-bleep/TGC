import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import SearchCardDetailModal from '../components/search/SearchCardDetailModal';
import SearchCardTile from '../components/search/SearchCardTile';
import SearchDeckPickerModal from '../components/search/SearchDeckPickerModal';
import SearchFiltersPanel from '../components/search/SearchFiltersPanel';
import SearchResultsToolbar from '../components/search/SearchResultsToolbar';
import { getGameConfig } from '../tcgConfig';
import { useToast } from '../context/ToastContext';
import { getApiErrorMessage } from '../utils/apiMessages';
import { getNewDeckCreationPlan } from '../utils/deckTools';
import queryKeys from '../queryKeys';
import { QUERY_STALE_TIMES } from '../queryConfig';
import { buildSetFilterOptions } from '../utils/setFilters';
import {
  readStoredEnumValue,
  writeStoredValue,
} from '../utils/searchCache';
import {
  addCardToCollection,
  addCardToConsidering,
  addCardToDeck,
  getCardDetail,
  createDeck,
  getCardFacets,
  getCards,
  getDecks,
} from '../services/api';

const SEARCH_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const MOBILE_BREAKPOINT_QUERY = '(max-width: 768px)';
const MOBILE_DEFAULT_PAGE_SIZE = 20;
const DESKTOP_DEFAULT_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = DESKTOP_DEFAULT_PAGE_SIZE;
const SEARCH_CARD_VIEW_MODES = ['detail', 'compact'];
const SEARCH_INPUT_DELAY_MS = 280;
const DEFAULT_ACTION_QUANTITY = 1;
const MAX_ACTION_QUANTITY = 99;
const SEARCH_SORT_OPTIONS = [
  { value: 'name-asc', label: 'Nombre' },
  { value: 'collection-asc', label: 'Codigo ascendente' },
  { value: 'collection-desc', label: 'Codigo descendente' },
];
const SEARCH_CACHE_STORAGE_KEYS = {
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
const EMPTY_CARDS = [];
const EMPTY_DECKS = [];

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
  sort,
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
  if (sort) {
    params.sort = sort;
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

const normalizeFacetsPayload = (payload) => ({
  card_types: Array.isArray(payload?.card_types) ? payload.card_types : [],
  colors: Array.isArray(payload?.colors) ? payload.colors : [],
  rarities: Array.isArray(payload?.rarities) ? payload.rarities : [],
  set_names: Array.isArray(payload?.set_names) ? payload.set_names : [],
  set_options: Array.isArray(payload?.set_options) ? payload.set_options : [],
});

const normalizeDeckList = (payload) => (Array.isArray(payload) ? payload : EMPTY_DECKS);
const normalizeCardList = (payload) => (Array.isArray(payload) ? payload : EMPTY_CARDS);
const isUnauthorizedError = (error) => error?.response?.status === 401;

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const [actionQuantityDrafts, setActionQuantityDrafts] = useState({});
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('name-asc');
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

  const cardsRequestParams = useMemo(
    () => buildCardsRequestParams({
      tgcId: activeTgc?.id,
      page,
      pageSize,
      searchTerm: debouncedSearchTerm,
      filters,
      sort: sortBy,
    }),
    [activeTgc?.id, debouncedSearchTerm, filters, page, pageSize, sortBy]
  );

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
    setSortBy('name-asc');
    setSelectedCard(null);
    setDeckPickerCard(null);
    setNewDeckName('');
    setActionQuantityDrafts({});
  }, [activeTcgSlug, activeTgc?.id]);

  const cardsQuery = useQuery({
    queryKey: queryKeys.cardsSearch(cardsRequestParams || { tgc_id: activeTgc?.id || 0 }),
    queryFn: ({ signal }) => getCards(cardsRequestParams, signal),
    enabled: Boolean(cardsRequestParams),
    staleTime: QUERY_STALE_TIMES.cardsSearch,
    placeholderData: (previousData) => previousData,
  });
  const selectedCardDetailQuery = useQuery({
    queryKey: queryKeys.cardDetail(selectedCard?.id || 0),
    queryFn: ({ signal }) => getCardDetail(selectedCard.id, signal),
    enabled: Boolean(selectedCard?.id),
    staleTime: QUERY_STALE_TIMES.cardDetail,
  });
  const facetsQuery = useQuery({
    queryKey: queryKeys.cardFacets(activeTgc?.id),
    queryFn: ({ signal }) => getCardFacets(activeTgc.id, signal),
    enabled: Boolean(activeTgc?.id),
    staleTime: QUERY_STALE_TIMES.cardFacets,
  });
  const decksQuery = useQuery({
    queryKey: queryKeys.decks(activeTgc?.id),
    queryFn: ({ signal }) => getDecks(activeTgc.id, signal),
    enabled: Boolean(activeTgc?.id && deckPickerCard),
    staleTime: QUERY_STALE_TIMES.decks,
  });

  useEffect(() => {
    const error = cardsQuery.error || facetsQuery.error || decksQuery.error;
    if (!error || isUnauthorizedError(error)) {
      return;
    }

    showToast({
      type: 'error',
      message: getApiErrorMessage(error, 'No se pudieron cargar los datos del buscador.'),
    });
  }, [cardsQuery.error, decksQuery.error, facetsQuery.error, showToast]);

  const addToCollectionMutation = useMutation({
    mutationFn: addCardToCollection,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collection(activeTgc?.id) });
      showToast({
        type: 'success',
        message: variables.quantity === 1
          ? '1 copia agregada a la coleccion.'
          : `${variables.quantity} copias agregadas a la coleccion.`,
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo agregar la carta a la coleccion.'),
      });
    },
  });

  const addToDeckMutation = useMutation({
    mutationFn: ({ deckId, cardId, quantity }) => addCardToDeck(deckId, {
      card_id: cardId,
      quantity,
    }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) });
      showToast({
        type: 'success',
        message: variables.quantity === 1
          ? '1 copia agregada al mazo.'
          : `${variables.quantity} copias agregadas al mazo.`,
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo agregar la carta al mazo.'),
      });
    },
  });

  const addToConsideringMutation = useMutation({
    mutationFn: ({ deckId, cardId, quantity }) => addCardToConsidering(deckId, {
      card_id: cardId,
      quantity,
    }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) });
      showToast({
        type: 'success',
        message: variables.quantity === 1
          ? '1 copia guardada en considering.'
          : `${variables.quantity} copias guardadas en considering.`,
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo guardar la carta en considering.'),
      });
    },
  });

  const createDeckMutation = useMutation({
    mutationFn: createDeck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) });
    },
  });

  const pagination = useMemo(
    () => normalizeResultsPayload(cardsQuery.data, pageSize),
    [cardsQuery.data, pageSize]
  );
  const facets = useMemo(
    () => normalizeFacetsPayload(facetsQuery.data),
    [facetsQuery.data]
  );
  const decks = useMemo(
    () => normalizeDeckList(decksQuery.data),
    [decksQuery.data]
  );
  const effectiveCardViewMode = isMobileLayout ? cardViewMode : 'detail';
  const cardList = normalizeCardList(pagination.items);
  const resolvedSelectedCard = useMemo(() => {
    if (!selectedCard) {
      return null;
    }

    if (!selectedCardDetailQuery.data) {
      return selectedCard;
    }

    return {
      ...selectedCard,
      ...selectedCardDetailQuery.data,
    };
  }, [selectedCard, selectedCardDetailQuery.data]);

  useEffect(() => {
    if (!cardsRequestParams || !pagination.has_next) {
      return;
    }

    const nextPageParams = {
      ...cardsRequestParams,
      page: pagination.page + 1,
    };

    queryClient.prefetchQuery({
      queryKey: queryKeys.cardsSearch(nextPageParams),
      queryFn: ({ signal }) => getCards(nextPageParams, signal),
      staleTime: QUERY_STALE_TIMES.cardsSearch,
    });
  }, [
    cardsRequestParams,
    pagination.has_next,
    pagination.page,
    queryClient,
  ]);

  useEffect(() => {
    if (pagination.page && pagination.page !== page) {
      setPage(pagination.page);
    }
  }, [page, pagination.page]);

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

  const handleAddToCollection = async (cardId, quantityOverride = null) => {
    const parsedCardId = Number(cardId);

    if (!Number.isInteger(parsedCardId) || parsedCardId <= 0) {
      showToast({ type: 'error', message: 'El ID de carta recibido no es valido.' });
      return;
    }

    const quantity = quantityOverride ?? commitActionQuantity(parsedCardId);

    if (quantityOverride !== null) {
      setActionQuantityDrafts((current) => ({
        ...current,
        [parsedCardId]: String(quantityOverride),
      }));
    }

    addToCollectionMutation.mutate({
      card_id: parsedCardId,
      quantity,
    });
  };

  const handleAddToDeck = async (cardId, quantityOverride = null) => {
    const card = normalizeCardList(cardList).find((item) => item.id === cardId) || null;
    setDeckPickerCard(card);
    setNewDeckName(card ? `${card.name} Test` : '');

    if (quantityOverride !== null) {
      setActionQuantityDrafts((current) => ({
        ...current,
        [cardId]: String(quantityOverride),
      }));
    } else {
      commitActionQuantity(cardId);
    }

    await queryClient.ensureQueryData({
      queryKey: queryKeys.decks(activeTgc?.id),
      queryFn: () => getDecks(activeTgc.id),
      staleTime: QUERY_STALE_TIMES.decks,
    });
  };

  const addCardToExistingDeck = async (deckId) => {
    if (!deckPickerCard) {
      return;
    }

    const quantity = commitActionQuantity(deckPickerCard.id);
    try {
      await addToDeckMutation.mutateAsync({
        deckId,
        cardId: deckPickerCard.id,
        quantity,
      });
      setDeckPickerCard(null);
    } catch (_error) {
      // The mutation already surfaces the error through toasts.
    }
  };

  const addCardToDeckConsidering = async (deckId) => {
    if (!deckPickerCard) {
      return;
    }

    const quantity = commitActionQuantity(deckPickerCard.id);
    try {
      await addToConsideringMutation.mutateAsync({
        deckId,
        cardId: deckPickerCard.id,
        quantity,
      });
      setDeckPickerCard(null);
    } catch (_error) {
      // The mutation already surfaces the error through toasts.
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

    const quantity = commitActionQuantity(deckPickerCard.id);
    const creationPlan = getNewDeckCreationPlan(activeGame.slug, deckPickerCard, quantity);
    if (!creationPlan.canCreate) {
      showToast({
        type: 'error',
        message: creationPlan.helper || 'No se puede crear el mazo con esa carta inicial.',
      });
      return;
    }

    try {
      const createResponse = await createDeckMutation.mutateAsync({
        name: trimmedDeckName,
        tgc_id: activeTgc.id,
      });

      const deckId = createResponse?.id || createResponse?.deck_id;
      if (!deckId) {
        throw new Error('Deck creation did not return an id');
      }

      if (!creationPlan.shouldAddCardAfterCreate) {
        setDeckPickerCard(null);
        setNewDeckName('');
        showToast({
          type: 'info',
          message: creationPlan.postCreateMessage || 'Mazo creado. Completa primero los requisitos del formato antes de anadir esa carta.',
        });
        navigate('/decks', { state: { openDeckId: deckId } });
        return;
      }

      try {
        await addToDeckMutation.mutateAsync({
          deckId,
          cardId: deckPickerCard.id,
          quantity,
        });
        showToast({
          type: 'success',
          message: quantity === 1
            ? 'Mazo creado y 1 copia agregada.'
            : `Mazo creado y ${quantity} copias agregadas.`,
        });
        setDeckPickerCard(null);
        setNewDeckName('');
      } catch (_error) {
        showToast({
          type: 'error',
          message: 'El mazo se creo, pero no se pudo anadir la carta inicial.',
        });
        navigate('/decks', { state: { openDeckId: deckId } });
      }
    } catch (error) {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo crear el mazo y agregar la carta.'),
      });
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
  };

  const handleSortChange = (value) => {
    if (!SEARCH_SORT_OPTIONS.some((option) => option.value === value)) {
      return;
    }

    setPage(1);
    setSortBy(value);
  };

  const availableExpansionOptions = useMemo(() => (
    buildSetFilterOptions(facets.set_options.length > 0 ? facets.set_options : facets.set_names)
  ), [facets.set_names, facets.set_options]);

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
  const isInitialLoading = ((!cardsQuery.isFetched && Boolean(cardsRequestParams)) || (!facetsQuery.isFetched && Boolean(activeTgc?.id))) && cardList.length === 0;

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
        availableExpansionOptions={availableExpansionOptions}
        onSearchChange={handleSearchChange}
        onFilterChange={handleFilterChange}
      />

      <SearchResultsToolbar
        visibleStart={visibleStart}
        visibleEnd={visibleEnd}
        pagination={pagination}
        loadingCards={cardsQuery.isFetching}
        pageSize={pageSize}
        pageSizeOptions={SEARCH_PAGE_SIZE_OPTIONS}
        sortBy={sortBy}
        sortOptions={SEARCH_SORT_OPTIONS}
        visiblePageNumbers={visiblePageNumbers}
        cardViewMode={effectiveCardViewMode}
        onPageSizeChange={handlePageSizeChange}
        onSortChange={handleSortChange}
        onPageChange={setPage}
        onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
        onNextPage={() => setPage((current) => current + 1)}
        onCardViewModeChange={setCardViewMode}
      />

      <div className="cards-grid">
        {cardList.length > 0 ? (
          cardList.map((card) => (
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
        card={resolvedSelectedCard}
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
        loadingDecks={decksQuery.isFetching}
        decks={decks}
        newDeckName={newDeckName}
        actionQuantity={deckPickerCard ? getActionQuantity(deckPickerCard.id) : DEFAULT_ACTION_QUANTITY}
        submittingDeckAction={addToDeckMutation.isPending || addToConsideringMutation.isPending || createDeckMutation.isPending}
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
        onAddCardToConsidering={addCardToDeckConsidering}
        onCreateDeckAndAddCard={createDeckAndAddCard}
      />
    </div>
  );
}

export default Search;
