import React, { startTransition, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import DeckAdvancedEditorDeckRow from './DeckAdvancedEditorDeckRow';
import DeckAdvancedEditorSourceRow from './DeckAdvancedEditorSourceRow';
import { useToast } from '../../context/ToastContext';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import usePositiveIntegerDraftMap from '../../hooks/usePositiveIntegerDraftMap';
import useQueryErrorToast from '../../hooks/useQueryErrorToast';
import queryKeys from '../../queryKeys';
import { QUERY_STALE_TIMES } from '../../queryConfig';
import { getCardFacets, getCards, getCollection } from '../../services/api';
import {
  getDeckAddZone,
  getDeckEggCardCount,
  getSearchDeckOptionState,
} from '../../utils/deckTools';
import {
  buildSetFilterOptions,
  compareCollectionCodes,
  matchesCollectionCodeQuery,
  normalizeText,
} from '../../utils/setFilters';
import { normalizeCollectionCardType } from '../../utils/collectionView';

const SEARCH_PAGE_SIZE = 24;
const SEARCH_INPUT_DELAY_MS = 260;
const EMPTY_RESULTS = {
  items: [],
  page: 1,
  limit: SEARCH_PAGE_SIZE,
  total: 0,
  total_pages: 0,
  has_previous: false,
  has_next: false,
};

const buildOrderedOptions = (values, preferredOrder = []) => {
  const available = [...new Set((values || []).filter(Boolean))];
  const preferred = preferredOrder.filter((value) => available.includes(value));
  const extra = available
    .filter((value) => !preferred.includes(value))
    .sort((left, right) => left.localeCompare(right));

  return [...preferred, ...extra].map((value) => ({ value, label: value }));
};

const normalizeResultsPayload = (payload) => {
  const safePayload = payload && typeof payload === 'object' ? payload : EMPTY_RESULTS;
  return {
    ...EMPTY_RESULTS,
    ...safePayload,
    items: Array.isArray(safePayload?.items) ? safePayload.items : [],
  };
};

const normalizeFacetsPayload = (payload) => ({
  card_types: Array.isArray(payload?.card_types) ? payload.card_types : [],
  colors: Array.isArray(payload?.colors) ? payload.colors : [],
  rarities: Array.isArray(payload?.rarities) ? payload.rarities : [],
  set_names: Array.isArray(payload?.set_names) ? payload.set_names : [],
  set_options: Array.isArray(payload?.set_options) ? payload.set_options : [],
});

const buildCardsRequestParams = ({
  tgcId,
  page,
  searchTerm,
  filters,
}) => {
  if (!tgcId) {
    return null;
  }

  const params = {
    tgc_id: tgcId,
    page,
    limit: SEARCH_PAGE_SIZE,
    sort: 'name-asc',
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

const getSectionTotal = (cards = []) => cards.reduce((total, card) => total + (Number(card?.quantity) || 0), 0);

const buildDeckSections = (deck, { isOnePiece, isDigimon, isRiftbound }) => {
  const mainCards = Array.isArray(deck?.cards) ? deck.cards : [];
  const eggCards = Array.isArray(deck?.egg_cards) ? deck.egg_cards : [];
  const legendCards = Array.isArray(deck?.legend_cards_data) ? deck.legend_cards_data : [];
  const runeCards = Array.isArray(deck?.rune_cards_data) ? deck.rune_cards_data : [];
  const battlefieldCards = Array.isArray(deck?.battlefield_cards_data) ? deck.battlefield_cards_data : [];
  const sideboardCards = Array.isArray(deck?.sideboard_cards_data) ? deck.sideboard_cards_data : [];
  const consideringCards = Array.isArray(deck?.considering_cards) ? deck.considering_cards : [];

  const sections = [];

  if (isOnePiece) {
    const leaderCards = mainCards.filter((card) => card?.deck_role === 'leader');
    const donCards = mainCards.filter((card) => card?.deck_role === 'don');
    const primaryCards = mainCards.filter((card) => !['leader', 'don'].includes(card?.deck_role));

    sections.push(
      {
        key: 'leader',
        title: 'Leader',
        description: 'El eje del mazo de One Piece.',
        cards: leaderCards,
      },
      {
        key: 'main',
        title: 'Main deck',
        description: 'La lista principal con tus personajes, eventos y stages.',
        cards: primaryCards,
      },
      {
        key: 'don',
        title: 'DON!!',
        description: 'Soporte opcional de energia del mazo.',
        cards: donCards,
      },
    );
  } else if (isRiftbound) {
    sections.push(
      {
        key: 'legend',
        title: 'Legend',
        description: 'La identidad principal del mazo y sus domains legales.',
        cards: legendCards,
      },
      {
        key: 'main',
        title: 'Main deck',
        description: 'Las 40 cartas principales del mazo, incluido el Chosen Champion.',
        cards: mainCards,
      },
      {
        key: 'rune',
        title: 'Rune deck',
        description: 'Runes separadas del main deck.',
        cards: runeCards,
      },
      {
        key: 'battlefield',
        title: 'Battlefields',
        description: 'Tres battlefields con nombre unico.',
        cards: battlefieldCards,
      },
      {
        key: 'sideboard',
        title: 'Sideboard',
        description: 'Zona competitiva opcional con limite propio.',
        cards: sideboardCards,
      },
    );
  } else {
    sections.push({
      key: 'main',
      title: isDigimon ? 'Main deck' : 'Lista actual',
      description: isDigimon
        ? 'Las 50 cartas principales del mazo de Digimon.'
        : 'Cartas activas del mazo listo para jugar.',
      cards: mainCards,
    });
  }

  if (isDigimon) {
    sections.push({
      key: 'egg',
      title: 'Digi-Egg deck',
      description: 'Huevos que no cuentan para la mano inicial del main deck.',
      cards: eggCards,
    });
  }

  sections.push({
    key: 'considering',
    title: 'Considering',
    description: 'Opciones de prueba que no cuentan para la lista principal.',
    cards: consideringCards,
  });

  return sections;
};

const getCollectionCardMatchesSearch = (card, rawQuery) => {
  const normalizedQuery = normalizeText(rawQuery);
  if (!normalizedQuery) {
    return true;
  }

  return [
    card?.name,
    card?.source_card_id,
    card?.deck_key,
    card?.set_name,
    card?.version,
    card?.card_type,
    card?.color,
  ].some((value) => normalizeText(value).includes(normalizedQuery))
    || matchesCollectionCodeQuery(rawQuery, card?.source_card_id)
    || matchesCollectionCodeQuery(rawQuery, card?.deck_key);
};

function DeckAdvancedEditorPanel({
  selectedDeck,
  activeTcgSlug,
  activeTgc,
  activeGame,
  selectedDeckIsOnePiece,
  selectedDeckIsDigimon,
  addingDeckCardId,
  onAddCardToDeck,
  updatingDeckCardId,
  updatingConsideringCardId,
  movingConsideringCardId,
  onAdjustDeckQuantity,
  onAdjustConsideringQuantity,
  onMoveDeckCardToConsidering,
  onMoveConsideringCardToDeck,
  onOpenCard,
}) {
  const { showToast } = useToast();
  const [isDeckPaneCollapsed, setIsDeckPaneCollapsed] = useState(false);
  const [sourceMode, setSourceMode] = useState('search');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [searchFilters, setSearchFilters] = useState({
    type: '',
    color: '',
    rarity: '',
    expansion: '',
  });
  const [collectionSearchTerm, setCollectionSearchTerm] = useState('');
  const [collectionFilters, setCollectionFilters] = useState({
    type: '',
    color: '',
    rarity: '',
    expansion: '',
  });
  const [collapsedSections, setCollapsedSections] = useState({
    considering: true,
  });
  const debouncedSearchTerm = useDebouncedValue(searchTerm, SEARCH_INPUT_DELAY_MS);
  const debouncedCollectionSearchTerm = useDebouncedValue(collectionSearchTerm, 140);
  const {
    setDraft: setSourceQuantityDraft,
    getQuantity: getSourceActionQuantity,
    commitQuantity: commitSourceActionQuantity,
    stepQuantity: stepSourceActionQuantity,
    resetDrafts: resetSourceQuantityDrafts,
  } = usePositiveIntegerDraftMap({
    defaultQuantity: 1,
    maxValue: 99,
    maxDigits: 2,
    allowEmpty: false,
  });

  useEffect(() => {
    setIsDeckPaneCollapsed(false);
    setSourceMode('search');
    setSearchTerm('');
    setSearchPage(1);
    setSearchFilters({
      type: '',
      color: '',
      rarity: '',
      expansion: '',
    });
    setCollectionSearchTerm('');
    setCollectionFilters({
      type: '',
      color: '',
      rarity: '',
      expansion: '',
    });
    setCollapsedSections({
      considering: true,
    });
    resetSourceQuantityDrafts();
  }, [activeTcgSlug, activeTgc?.id, resetSourceQuantityDrafts, selectedDeck?.id]);

  useEffect(() => {
    setSearchPage(1);
  }, [debouncedSearchTerm, searchFilters, sourceMode]);

  const searchRequestParams = useMemo(() => buildCardsRequestParams({
    tgcId: activeTgc?.id,
    page: searchPage,
    searchTerm: debouncedSearchTerm,
    filters: searchFilters,
  }), [activeTgc?.id, debouncedSearchTerm, searchFilters, searchPage]);

  const searchQuery = useQuery({
    queryKey: queryKeys.cardsSearch(searchRequestParams || { tgc_id: activeTgc?.id || 0, editor: true }),
    queryFn: ({ signal }) => getCards(searchRequestParams, signal),
    enabled: Boolean(activeTgc?.id && sourceMode === 'search' && searchRequestParams),
    staleTime: QUERY_STALE_TIMES.cardsSearch,
    placeholderData: (previousData) => previousData,
  });
  const facetsQuery = useQuery({
    queryKey: queryKeys.cardFacets(activeTgc?.id),
    queryFn: ({ signal }) => getCardFacets(activeTgc.id, signal),
    enabled: Boolean(activeTgc?.id),
    staleTime: QUERY_STALE_TIMES.cardFacets,
  });
  const collectionQuery = useQuery({
    queryKey: queryKeys.collection(activeTgc?.id),
    queryFn: ({ signal }) => getCollection(activeTgc.id, signal),
    enabled: Boolean(activeTgc?.id && sourceMode === 'collection'),
    staleTime: QUERY_STALE_TIMES.collection,
  });

  useQueryErrorToast(
    [searchQuery.error, facetsQuery.error, collectionQuery.error],
    showToast,
    'No se pudieron cargar los datos del editor avanzado.'
  );

  const normalizedSearchResults = useMemo(
    () => normalizeResultsPayload(searchQuery.data),
    [searchQuery.data]
  );
  const facets = useMemo(
    () => normalizeFacetsPayload(facetsQuery.data),
    [facetsQuery.data]
  );
  const collectionEntries = useMemo(
    () => (Array.isArray(collectionQuery.data) ? collectionQuery.data : []),
    [collectionQuery.data]
  );

  const typeOptions = useMemo(
    () => buildOrderedOptions(facets.card_types, activeGame?.filters?.types || []),
    [activeGame?.filters?.types, facets.card_types]
  );
  const colorOptions = useMemo(
    () => buildOrderedOptions(facets.colors, activeGame?.filters?.colors || []),
    [activeGame?.filters?.colors, facets.colors]
  );
  const rarityOptions = useMemo(
    () => buildOrderedOptions(facets.rarities),
    [facets.rarities]
  );
  const searchSetOptions = useMemo(
    () => buildSetFilterOptions(facets.set_options.length > 0 ? facets.set_options : facets.set_names),
    [facets.set_names, facets.set_options]
  );

  const collectionTypeOptions = useMemo(() => (
    buildOrderedOptions(
      collectionEntries.map((entry) => normalizeCollectionCardType(entry?.card?.card_type, activeTcgSlug)),
      activeGame?.filters?.types || []
    )
  ), [activeGame?.filters?.types, activeTcgSlug, collectionEntries]);
  const collectionColorOptions = useMemo(() => (
    buildOrderedOptions(
      collectionEntries.map((entry) => entry?.card?.color),
      activeGame?.filters?.colors || []
    )
  ), [activeGame?.filters?.colors, collectionEntries]);
  const collectionRarityOptions = useMemo(() => (
    buildOrderedOptions(collectionEntries.map((entry) => entry?.card?.rarity))
  ), [collectionEntries]);
  const collectionSetOptions = useMemo(() => (
    buildSetFilterOptions(collectionEntries.map((entry) => ({
      value: entry?.card?.set_name,
      label: entry?.card?.set_name,
      version: entry?.card?.version,
    })))
  ), [collectionEntries]);

  const filteredCollection = useMemo(() => {
    const rawQuery = debouncedCollectionSearchTerm.trim();

    return collectionEntries
      .filter((entry) => {
        const card = entry?.card;
        if (!card) {
          return false;
        }

        if (!getCollectionCardMatchesSearch(card, rawQuery)) {
          return false;
        }

        const normalizedType = normalizeCollectionCardType(card.card_type, activeTcgSlug);
        if (collectionFilters.type && normalizedType !== collectionFilters.type) {
          return false;
        }
        if (collectionFilters.color && (card.color || '') !== collectionFilters.color) {
          return false;
        }
        if (collectionFilters.rarity && (card.rarity || '') !== collectionFilters.rarity) {
          return false;
        }
        if (collectionFilters.expansion && (card.set_name || '') !== collectionFilters.expansion) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const availableDifference = (Number(right?.available_quantity) || 0) - (Number(left?.available_quantity) || 0);
        if (availableDifference !== 0) {
          return availableDifference;
        }

        const totalDifference = (Number(right?.total_quantity) || 0) - (Number(left?.total_quantity) || 0);
        if (totalDifference !== 0) {
          return totalDifference;
        }

        return compareCollectionCodes(left?.card?.source_card_id || left?.card?.name, right?.card?.source_card_id || right?.card?.name)
          || (left?.card?.name || '').localeCompare(right?.card?.name || '');
      })
      .map((entry) => ({
        ...entry.card,
        collection_total_quantity: Number(entry?.total_quantity) || 0,
        collection_available_quantity: Number(entry?.available_quantity) || 0,
      }));
  }, [activeTcgSlug, collectionEntries, collectionFilters, debouncedCollectionSearchTerm]);

  const deckSections = useMemo(
    () => buildDeckSections(selectedDeck, {
      isOnePiece: selectedDeckIsOnePiece,
      isDigimon: selectedDeckIsDigimon,
      isRiftbound: selectedDeck?.composition?.format_mode === 'riftbound',
    }),
    [selectedDeck, selectedDeckIsDigimon, selectedDeckIsOnePiece]
  );

  const searchCards = Array.isArray(normalizedSearchResults.items) ? normalizedSearchResults.items : [];
  const handleToggleDeckPane = () => {
    setIsDeckPaneCollapsed((current) => !current);
  };

  const toggleSection = (sectionKey) => {
    setCollapsedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  };

  const handleSearchFilterChange = (filterName, value) => {
    startTransition(() => {
      setSearchFilters((current) => ({ ...current, [filterName]: value }));
    });
  };

  const handleCollectionFilterChange = (filterName, value) => {
    startTransition(() => {
      setCollectionFilters((current) => ({ ...current, [filterName]: value }));
    });
  };

  const handleAddCard = (card, sourceKey) => {
    const quantity = commitSourceActionQuantity(sourceKey);
    onAddCardToDeck(card.id, quantity, getDeckAddZone(activeTcgSlug, card));
  };

  const buildOptionState = (card, quantity, sourceKey) => {
    const baseState = getSearchDeckOptionState({
      activeTcgSlug,
      deck: {
        ...selectedDeck,
        egg_cards: getDeckEggCardCount(selectedDeck),
      },
      card,
      quantity,
    });

    if (sourceMode !== 'collection') {
      return baseState;
    }

    const available = Number(card?.collection_available_quantity) || 0;
    if (available >= quantity) {
      return baseState;
    }

    const shortage = quantity - available;
    return {
      ...baseState,
      helper: `${baseState.helper ? `${baseState.helper} ` : ''}${shortage === quantity
        ? 'No te quedan copias libres en coleccion; entrara como faltante.'
        : `Solo tienes ${available} libres; faltara x${shortage}.`}`,
    };
  };

  return (
    <section className={`deck-editor-workspace ${isDeckPaneCollapsed ? 'is-deck-pane-collapsed' : ''}`.trim()}>
      <aside className={`deck-editor-sidebar panel ${isDeckPaneCollapsed ? 'is-collapsed' : ''}`.trim()}>
        <div className={`deck-editor-sidebar-header ${isDeckPaneCollapsed ? 'is-collapsed' : ''}`.trim()}>
          <div>
            <span className="eyebrow">{isDeckPaneCollapsed ? 'Mazo' : 'Editor avanzado'}</span>
            {isDeckPaneCollapsed && <strong className="deck-editor-collapsed-label">Lista actual</strong>}
            {!isDeckPaneCollapsed && <h3>Lista actual del mazo</h3>}
            {!isDeckPaneCollapsed && (
              <p>
                Expande, minimiza y ajusta el mazo desde aqui mientras comparas cartas a la derecha.
              </p>
            )}
          </div>
          <button
            type="button"
            className="ghost-button deck-editor-collapse-button"
            onClick={handleToggleDeckPane}
          >
            {isDeckPaneCollapsed ? 'Mostrar mazo' : 'Minimizar'}
          </button>
        </div>

        {!isDeckPaneCollapsed && (
          <div className="deck-editor-sidebar-body">
            {deckSections.map((section) => {
              const isCollapsed = Boolean(collapsedSections[section.key]);
              const sectionTotal = getSectionTotal(section.cards);

              return (
                <section key={section.key} className="deck-editor-section">
                  <button
                    type="button"
                    className="deck-editor-section-toggle"
                    onClick={() => toggleSection(section.key)}
                  >
                    <div>
                      <strong>{section.title}</strong>
                      <span>{section.cards.length} cartas distintas | {sectionTotal} copias</span>
                    </div>
                    <span>{isCollapsed ? 'Expandir' : 'Ocultar'}</span>
                  </button>

                  {!isCollapsed && (
                    <div className="deck-editor-section-body">
                      <p className="deck-editor-section-copy">{section.description}</p>

                      {section.cards.length > 0 ? (
                        <div className="deck-editor-deck-list">
                          {section.cards.map((card) => {
                            const isBusy = section.key === 'considering'
                              ? updatingConsideringCardId === card.id || movingConsideringCardId === card.id
                              : updatingDeckCardId === card.id || movingConsideringCardId === card.id;

                            return (
                              <DeckAdvancedEditorDeckRow
                                key={`${section.key}-${card.id}`}
                                card={card}
                                sectionKey={section.key}
                                isBusy={isBusy}
                                activeTcgSlug={activeTcgSlug}
                                onAdjustQuantity={(cardId, delta) => (
                                  section.key === 'considering'
                                    ? onAdjustConsideringQuantity(selectedDeck.id, cardId, delta)
                                    : onAdjustDeckQuantity(selectedDeck.id, cardId, delta)
                                )}
                                onMoveToConsidering={(cardId) => onMoveDeckCardToConsidering(selectedDeck.id, cardId, 1)}
                                onMoveToMainDeck={(cardId) => onMoveConsideringCardToDeck(selectedDeck.id, cardId, 1)}
                                onOpenCard={onOpenCard}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-state subtle-empty">
                          <p>Esta seccion todavia esta vacia.</p>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </aside>

      <section className="deck-editor-source panel">
        <div className="deck-editor-source-header">
          <div>
            <span className="eyebrow">Fuente de cartas</span>
            <h3>Buscar o usar tu coleccion</h3>
            <p>
              Mete cartas legales segun las normas de {activeGame?.shortName}, revisa si te faltan copias y abre cualquier carta para verla en detalle.
            </p>
          </div>
          <div className="deck-editor-source-header-actions">
            {isDeckPaneCollapsed && (
              <button
                type="button"
                className="ghost-button deck-editor-collapse-button"
                onClick={handleToggleDeckPane}
              >
                Mostrar mazo
              </button>
            )}
            <div className="view-toggle deck-view-toggle" role="tablist" aria-label="Fuente del editor">
              <button
                type="button"
                className={sourceMode === 'search' ? 'is-active' : ''}
                onClick={() => setSourceMode('search')}
              >
                Buscar cartas
              </button>
              <button
                type="button"
                className={sourceMode === 'collection' ? 'is-active' : ''}
                onClick={() => setSourceMode('collection')}
              >
                Mi coleccion
              </button>
            </div>
          </div>
        </div>

        {sourceMode === 'search' ? (
          <>
            <div className="deck-editor-filter-grid">
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={`Buscar cartas de ${activeGame?.shortName}`}
              />
              <select
                value={searchFilters.type}
                onChange={(event) => handleSearchFilterChange('type', event.target.value)}
              >
                <option value="">Todos los tipos</option>
                {typeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                value={searchFilters.color}
                onChange={(event) => handleSearchFilterChange('color', event.target.value)}
              >
                <option value="">Todos los colores</option>
                {colorOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                value={searchFilters.rarity}
                onChange={(event) => handleSearchFilterChange('rarity', event.target.value)}
              >
                <option value="">Todas las rarezas</option>
                {rarityOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                value={searchFilters.expansion}
                onChange={(event) => handleSearchFilterChange('expansion', event.target.value)}
              >
                <option value="">Todos los sets</option>
                {searchSetOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="deck-editor-source-toolbar">
              <span>
                {normalizedSearchResults.total > 0
                  ? `${normalizedSearchResults.total} cartas encontradas`
                  : 'Busca por nombre, codigo o set'}
              </span>
              <div className="deck-editor-pagination">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setSearchPage((current) => Math.max(1, current - 1))}
                  disabled={!normalizedSearchResults.has_previous}
                >
                  Anterior
                </button>
                <span>Pagina {normalizedSearchResults.page} / {Math.max(normalizedSearchResults.total_pages, 1)}</span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setSearchPage((current) => current + 1)}
                  disabled={!normalizedSearchResults.has_next}
                >
                  Siguiente
                </button>
              </div>
            </div>

            <div className="deck-editor-source-list">
              {searchQuery.isPending && searchCards.length === 0 ? (
                <div className="empty-state subtle-empty">
                  <p>Cargando cartas...</p>
                </div>
              ) : searchCards.length > 0 ? (
                searchCards.map((card) => {
                  const sourceKey = `search:${card.id}`;
                  const quantity = getSourceActionQuantity(sourceKey);
                  const optionState = buildOptionState(card, quantity, sourceKey);

                  return (
                    <DeckAdvancedEditorSourceRow
                      key={card.id}
                      card={card}
                      sourceMode="search"
                      activeTcgSlug={activeTcgSlug}
                      actionQuantity={quantity}
                      optionState={optionState}
                      isAdding={addingDeckCardId === card.id}
                      onActionQuantityChange={(value) => setSourceQuantityDraft(sourceKey, value)}
                      onActionQuantityBlur={() => commitSourceActionQuantity(sourceKey)}
                      onDecreaseActionQuantity={() => stepSourceActionQuantity(sourceKey, -1)}
                      onIncreaseActionQuantity={() => stepSourceActionQuantity(sourceKey, 1)}
                      onAddToDeck={() => handleAddCard(card, sourceKey)}
                      onOpenCard={onOpenCard}
                    />
                  );
                })
              ) : (
                <div className="empty-state subtle-empty">
                  <p>No se han encontrado cartas con esos filtros.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="deck-editor-filter-grid">
              <input
                type="search"
                value={collectionSearchTerm}
                onChange={(event) => setCollectionSearchTerm(event.target.value)}
                placeholder="Filtrar dentro de tu coleccion"
              />
              <select
                value={collectionFilters.type}
                onChange={(event) => handleCollectionFilterChange('type', event.target.value)}
              >
                <option value="">Todos los tipos</option>
                {collectionTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                value={collectionFilters.color}
                onChange={(event) => handleCollectionFilterChange('color', event.target.value)}
              >
                <option value="">Todos los colores</option>
                {collectionColorOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                value={collectionFilters.rarity}
                onChange={(event) => handleCollectionFilterChange('rarity', event.target.value)}
              >
                <option value="">Todas las rarezas</option>
                {collectionRarityOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                value={collectionFilters.expansion}
                onChange={(event) => handleCollectionFilterChange('expansion', event.target.value)}
              >
                <option value="">Todos los sets</option>
                {collectionSetOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="deck-editor-source-toolbar">
              <span>
                {filteredCollection.length > 0
                  ? `${filteredCollection.length} cartas de tu coleccion listas para usar`
                  : 'Filtra por nombre, codigo o set'}
              </span>
            </div>

            <div className="deck-editor-source-list">
              {collectionQuery.isPending && filteredCollection.length === 0 ? (
                <div className="empty-state subtle-empty">
                  <p>Cargando tu coleccion...</p>
                </div>
              ) : filteredCollection.length > 0 ? (
                filteredCollection.map((card) => {
                  const sourceKey = `collection:${card.id}`;
                  const quantity = getSourceActionQuantity(sourceKey);
                  const optionState = buildOptionState(card, quantity, sourceKey);

                  return (
                    <DeckAdvancedEditorSourceRow
                      key={`collection-${card.id}`}
                      card={card}
                      sourceMode="collection"
                      activeTcgSlug={activeTcgSlug}
                      actionQuantity={quantity}
                      optionState={optionState}
                      isAdding={addingDeckCardId === card.id}
                      onActionQuantityChange={(value) => setSourceQuantityDraft(sourceKey, value)}
                      onActionQuantityBlur={() => commitSourceActionQuantity(sourceKey)}
                      onDecreaseActionQuantity={() => stepSourceActionQuantity(sourceKey, -1)}
                      onIncreaseActionQuantity={() => stepSourceActionQuantity(sourceKey, 1)}
                      onAddToDeck={() => handleAddCard(card, sourceKey)}
                      onOpenCard={onOpenCard}
                    />
                  );
                })
              ) : (
                <div className="empty-state subtle-empty">
                  <p>No hay cartas de tu coleccion que encajen con esos filtros.</p>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </section>
  );
}

export default DeckAdvancedEditorPanel;
