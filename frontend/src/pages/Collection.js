import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import CollectionCardItem from '../components/collection/CollectionCardItem';
import CollectionControlsPanel from '../components/collection/CollectionControlsPanel';
import CardDetailModal from '../components/cards/CardDetailModal';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import useBrowserStorageState from '../hooks/useBrowserStorageState';
import useQueryErrorToast from '../hooks/useQueryErrorToast';
import queryKeys from '../queryKeys';
import { QUERY_STALE_TIMES } from '../queryConfig';
import { getGameConfig } from '../tcgConfig';
import { getApiErrorMessage } from '../utils/apiMessages';
import {
  buildSetFilterOptions,
  compareCollectionCodes,
  matchesCollectionCodeQuery,
  normalizeText,
} from '../utils/setFilters';
import { applyCollectionDeckUsageUpdate } from '../utils/collectionCache';
import { normalizeCollectionCardType } from '../utils/collectionView';
import { addCardToDeck, adjustCollectionCard, getCollection, getDeckOptions } from '../services/api';

const EMPTY_COLLECTION = [];
const EMPTY_DECKS = [];

const buildOrderedOptions = (values, preferredOrder = []) => {
  const available = [...new Set(values.filter(Boolean))];
  const preferred = preferredOrder.filter((value) => available.includes(value));
  const extra = available
    .filter((value) => !preferred.includes(value))
    .sort((a, b) => a.localeCompare(b));

  return [...preferred, ...extra];
};

const compareCollectionCards = (leftCard, rightCard, direction = 'asc') => {
  const directionMultiplier = direction === 'desc' ? -1 : 1;
  const versionDifference = compareCollectionCodes(
    leftCard?.version || leftCard?.set_name,
    rightCard?.version || rightCard?.set_name
  );

  if (versionDifference !== 0) {
    return versionDifference * directionMultiplier;
  }

  const sourceCodeDifference = compareCollectionCodes(
    leftCard?.source_card_id,
    rightCard?.source_card_id
  );

  if (sourceCodeDifference !== 0) {
    return sourceCodeDifference * directionMultiplier;
  }

  return normalizeText(leftCard?.name).localeCompare(normalizeText(rightCard?.name));
};

const isUnauthorizedError = (error) => error?.response?.status === 401;

function Collection({ activeTcgSlug, activeTgc }) {
  const activeGame = getGameConfig(activeTcgSlug);
  const collectionTitle = activeGame.collectionTitle || 'Mi Coleccion';
  const { profile } = useSession();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
  const [collectionView, setCollectionView] = useBrowserStorageState(
    'collectionViewMode',
    'detail',
    {
      validate: (value, fallback) => ['detail', 'grid', 'inventory'].includes(value) ? value : fallback,
    }
  );
  const [selectedCard, setSelectedCard] = useState(null);
  const deferredCollectionSearchTerm = useDeferredValue(collectionSearchTerm);
  const advancedMode = Boolean(profile?.advanced_mode);

  const collectionQuery = useQuery({
    queryKey: queryKeys.collection(activeTgc?.id),
    queryFn: ({ signal }) => getCollection(activeTgc.id, signal),
    enabled: Boolean(activeTgc?.id),
    staleTime: QUERY_STALE_TIMES.collection,
  });
  const decksQuery = useQuery({
    queryKey: queryKeys.deckOptions(activeTgc?.id),
    queryFn: ({ signal }) => getDeckOptions(activeTgc.id, signal),
    enabled: Boolean(activeTgc?.id),
    staleTime: QUERY_STALE_TIMES.deckOptions,
  });

  const collection = useMemo(
    () => collectionQuery.data || EMPTY_COLLECTION,
    [collectionQuery.data]
  );
  const decks = useMemo(
    () => decksQuery.data || EMPTY_DECKS,
    [decksQuery.data]
  );

  useEffect(() => {
    setCollectionSearchTerm('');
    setCollectionFilters({
      type: '',
      color: '',
      rarity: '',
      set: '',
    });
    setCollectionSort('name-asc');
    setSelectedCard(null);
  }, [activeTcgSlug, activeTgc?.id]);

  useEffect(() => {
    setQuantityInputs((current) => {
      const next = { ...current };
      collection.forEach((item) => {
        if (item?.card?.id && !next[item.card.id]) {
          next[item.card.id] = '1';
        }
      });
      return next;
    });
  }, [collection]);

  const collectionQueryErrors = useMemo(
    () => [collectionQuery.error, decksQuery.error],
    [collectionQuery.error, decksQuery.error]
  );

  useQueryErrorToast(collectionQueryErrors, showToast, 'No se pudo cargar la coleccion.');

  const updateCollectionQuery = useCallback((updater) => {
    if (!activeTgc?.id) {
      return;
    }

    queryClient.setQueryData(queryKeys.collection(activeTgc.id), (current) => {
      const currentItems = Array.isArray(current) ? current : [];
      return updater(currentItems);
    });
  }, [activeTgc?.id, queryClient]);

  const updateCollectionAfterDeckAdd = useCallback((
    deckId,
    cardId,
    quantity,
    assignedQuantity,
    deckSection = 'main'
  ) => {
    const deckName = decks.find((deck) => deck.id === deckId)?.name || 'Mazo';

    updateCollectionQuery((current) => applyCollectionDeckUsageUpdate(current, {
      cardId,
      deckId,
      deckName,
      deckSection,
      quantity,
      assignedQuantity,
      advancedMode,
    }));
  }, [advancedMode, decks, updateCollectionQuery]);

  const adjustCollectionMutation = useMutation({
    mutationFn: ({ cardId, delta }) => adjustCollectionCard(cardId, delta),
    onSuccess: (data, variables) => {
      const nextQuantity = Number(data?.quantity ?? 0);
      updateCollectionQuery((current) => current.flatMap((item) => {
        if (item?.card?.id !== variables.cardId) {
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
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo actualizar la cantidad en coleccion.'),
      });
    },
    onSettled: () => {
      setUpdatingCardId(null);
    },
  });

  const addCardToDeckMutation = useMutation({
    mutationFn: ({ deckId, cardId, quantity }) => addCardToDeck(deckId, { card_id: cardId, quantity }),
    onSuccess: (data, variables) => {
      updateCollectionAfterDeckAdd(
        variables.deckId,
        variables.cardId,
        data?.quantity ?? variables.quantity,
        data?.assigned_quantity,
        data?.deck_section || 'main'
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.searchDeckOptions(activeTgc?.id) });
      showToast({
        type: 'success',
        message: Number(variables.quantity) === 1
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

  const adjustCollectionQuantity = (cardId, delta) => {
    setUpdatingCardId(cardId);
    adjustCollectionMutation.mutate({ cardId, delta });
  };

  const applyManualCollectionChange = async (cardId, direction) => {
    const rawValue = quantityInputs[cardId] || '1';
    const parsedValue = Number(rawValue);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      showToast({ type: 'error', message: 'La cantidad debe ser un numero entero mayor que 0.' });
      return;
    }

    adjustCollectionQuantity(cardId, direction === 'add' ? parsedValue : -parsedValue);
  };

  const getCollectionActionQuantity = useCallback((cardId) => {
    const rawValue = quantityInputs[cardId] || '1';
    const parsedValue = Number(rawValue);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      return null;
    }

    return parsedValue;
  }, [quantityInputs]);

  const addCardToDeckFromCollection = (deckId, cardId) => {
    const quantity = getCollectionActionQuantity(cardId);

    if (!quantity) {
      showToast({ type: 'error', message: 'La cantidad a mover al mazo debe ser un numero entero mayor que 0.' });
      return;
    }

    addCardToDeckMutation.mutate({ deckId, cardId, quantity });
  };

  const openDeck = (deckId) => {
    navigate('/decks', { state: { openDeckId: deckId } });
  };

  const openCollectionCard = (card) => {
    setSelectedCard(card);
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
    () => buildSetFilterOptions(safeCollection.map((item) => ({
      value: item.card.set_name,
      label: item.card.set_name,
      version: item.card.version,
    }))),
    [safeCollection]
  );

  const visibleCollection = useMemo(() => {
    const normalizedSearch = normalizeText(deferredCollectionSearchTerm);
    const nextCollection = safeCollection.filter((item) => {
      const card = item.card;
      const normalizedCardType = normalizeCollectionCardType(card.card_type, activeTcgSlug);

      if (normalizedSearch) {
        const matchesSearch = [
          card.name,
          card.source_card_id,
          card.version,
          card.set_name,
          normalizedCardType,
        ].some((value) => normalizeText(value).includes(normalizedSearch));

        if (!matchesSearch && !matchesCollectionCodeQuery(normalizedSearch, card.version)) {
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
        case 'collection-asc':
          return compareCollectionCards(leftCard, rightCard, 'asc');
        case 'collection-desc':
          return compareCollectionCards(leftCard, rightCard, 'desc');
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
  }, [activeTcgSlug, collectionFilters, collectionSort, deferredCollectionSearchTerm, safeCollection]);

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

  if (collectionQuery.isPending && safeCollection.length === 0) {
    return (
      <div className="collection page-shell">
        <section className="page-hero collection-hero">
          <div>
            <span className="eyebrow">{activeGame.eyebrow}</span>
            <h1>{collectionTitle}</h1>
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
          <h1>{collectionTitle}</h1>
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

      <CollectionControlsPanel
        totalCards={safeCollection.length}
        visibleCards={visibleCollection.length}
        searchTerm={collectionSearchTerm}
        filters={collectionFilters}
        sortValue={collectionSort}
        typeOptions={availableTypeOptions}
        colorOptions={availableColorOptions}
        rarityOptions={availableRarityOptions}
        setOptions={availableSetOptions}
        hasFilters={hasCollectionFilters}
        onSearchTermChange={setCollectionSearchTerm}
        onFilterChange={(filterName, value) => setCollectionFilters((current) => ({ ...current, [filterName]: value }))}
        onSortChange={setCollectionSort}
        onClear={clearCollectionFilters}
      />

      <div className={`collection-list ${collectionView !== 'detail' ? 'is-grid' : ''}`}>
        {visibleCollection.map((item) => (
          <CollectionCardItem
            key={item.card.id}
            item={item}
            collectionView={collectionView}
            activeTcgSlug={activeTcgSlug}
            decks={decks}
            isUpdating={updatingCardId === item.card.id}
            requestedDeckQuantity={getCollectionActionQuantity(item.card.id) || 1}
            quantityInputValue={quantityInputs[item.card.id] || '1'}
            onOpenCard={openCollectionCard}
            onAdjustQuantity={adjustCollectionQuantity}
            onApplyManualChange={applyManualCollectionChange}
            onQuantityInputChange={(cardId, value) => setQuantityInputs((current) => ({
              ...current,
              [cardId]: value,
            }))}
            onOpenDeck={openDeck}
            onAddToDeck={addCardToDeckFromCollection}
          />
        ))}

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

      <CardDetailModal
        card={selectedCard}
        activeTcgSlug={activeTcgSlug}
        onClose={() => setSelectedCard(null)}
      />
    </div>
  );
}

export default Collection;
