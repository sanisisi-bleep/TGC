import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import CardDetailModal from '../components/cards/CardDetailModal';
import DeckAdvancedEditorPage from '../components/decks/DeckAdvancedEditorPage';
import DeckComparePickerModal from '../components/decks/DeckComparePickerModal';
import DeckCompareResultModal from '../components/decks/DeckCompareResultModal';
import DeckDetailModal from '../components/decks/DeckDetailModal';
import DeckHistoryModal from '../components/decks/DeckHistoryModal';
import DeckImportPanel from '../components/decks/DeckImportPanel';
import DeckListPreviewModal from '../components/decks/DeckListPreviewModal';
import DeckSummaryCard from '../components/decks/DeckSummaryCard';
import GuestDemoBanner from '../components/guest/GuestDemoBanner';
import { isUnauthorizedError, useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { getGuestDemoDecks } from '../demo/guestDemoData';
import useBrowserStorageState from '../hooks/useBrowserStorageState';
import usePositiveIntegerDraftMap from '../hooks/usePositiveIntegerDraftMap';
import useQueryErrorToast from '../hooks/useQueryErrorToast';
import queryKeys from '../queryKeys';
import { QUERY_STALE_TIMES } from '../queryConfig';
import { getGameConfig } from '../tcgConfig';
import { getApiErrorMessage } from '../utils/apiMessages';
import { applyCollectionDeckUsageUpdate, renameDeckInCollection } from '../utils/collectionCache';
import {
  applyDeckAssignmentMutation,
  applyDeckQuantityMutation,
  buildDeckExportPayload,
  buildDeckListText,
  buildDeckStats,
  copyTextToClipboard,
  downloadJson,
  downloadText,
  getDeckEggCardCount,
  mergeDeckOverviewInList,
  parseDeckListText,
  parseImportedDeckFile,
  safeDeckFilename,
} from '../utils/deckTools';
import { formatDeckComparisonTargetLabel } from '../utils/deckCompare';
import {
  adjustDeckAssignment,
  adjustConsideringCard,
  addCardToDeck,
  adjustDeckCard,
  moveConsideringCardToDeck,
  moveDeckCardToConsidering,
  cloneDeck,
  createDeckCheckpoint,
  createDeck,
  deleteDeck,
  getDeckDetail,
  getDeckHistory,
  getDeckHistoryVersion,
  getDecks,
  importDeck,
  renameDeck,
  setDeckChosenChampion,
  shareDeck,
} from '../services/api';

const OPEN_DECK_ROUTE_STATE_KEY = 'openDeckId';
const EDITOR_ROUTE_ACCESS_KEY = 'deckEditorAccess';

const buildOpenDeckRouteState = (deckId) => ({
  [OPEN_DECK_ROUTE_STATE_KEY]: deckId,
});

const buildDeckEditorRouteState = (deckId) => ({
  [EDITOR_ROUTE_ACCESS_KEY]: true,
  deckId,
});

function Decks({ activeTcgSlug, activeTgc, isGuestDemo = false }) {
  const activeGame = getGameConfig(activeTcgSlug);
  const { showToast } = useToast();
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const [newDeckName, setNewDeckName] = useState('');
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [draftDeckName, setDraftDeckName] = useState('');
  const [deckCardView, setDeckCardView] = useBrowserStorageState(
    'deckCardViewMode',
    'detail',
    {
      validate: (value, fallback) => ['detail', 'compact', 'inventory'].includes(value) ? value : fallback,
    }
  );
  const [selectedCard, setSelectedCard] = useState(null);
  const [editingAssignmentCardId, setEditingAssignmentCardId] = useState(null);
  const [deletingDeckId, setDeletingDeckId] = useState(null);
  const [cloningDeckId, setCloningDeckId] = useState(null);
  const [sharingDeckId, setSharingDeckId] = useState(null);
  const [renamingDeckId, setRenamingDeckId] = useState(null);
  const [importingDeck, setImportingDeck] = useState(false);
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [importDeckName, setImportDeckName] = useState('');
  const [importDeckText, setImportDeckText] = useState('');
  const [addingDeckCardId, setAddingDeckCardId] = useState(null);
  const [updatingDeckCardId, setUpdatingDeckCardId] = useState(null);
  const [updatingAssignmentCardId, setUpdatingAssignmentCardId] = useState(null);
  const [updatingConsideringCardId, setUpdatingConsideringCardId] = useState(null);
  const [movingConsideringCardId, setMovingConsideringCardId] = useState(null);
  const [deckListPreview, setDeckListPreview] = useState(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isComparePickerOpen, setIsComparePickerOpen] = useState(false);
  const [compareDeckTargetId, setCompareDeckTargetId] = useState('');
  const [compareHistoryVersionId, setCompareHistoryVersionId] = useState(null);
  const { deckId: editorRouteDeckId = null } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isEditorRoute = Boolean(editorRouteDeckId);
  const hasEditorRouteAccess = !isGuestDemo
    && isEditorRoute
    && location.state?.[EDITOR_ROUTE_ACCESS_KEY] === true
    && String(location.state?.deckId) === String(editorRouteDeckId);
  const detailDeckId = isEditorRoute ? editorRouteDeckId : selectedDeckId;

  const deckListQuery = useQuery({
    queryKey: queryKeys.decks(activeTgc?.id),
    queryFn: ({ signal }) => getDecks(activeTgc.id, signal),
    enabled: Boolean(activeTgc?.id && !isGuestDemo && !isEditorRoute),
    staleTime: QUERY_STALE_TIMES.decks,
  });
  const selectedDeckQuery = useQuery({
    queryKey: queryKeys.deckDetail(detailDeckId),
    queryFn: ({ signal }) => getDeckDetail(detailDeckId, signal),
    enabled: Boolean(detailDeckId && !isGuestDemo),
    staleTime: QUERY_STALE_TIMES.deckDetail,
  });
  const deckHistoryQuery = useQuery({
    queryKey: queryKeys.deckHistory(detailDeckId),
    queryFn: ({ signal }) => getDeckHistory(detailDeckId, signal),
    enabled: Boolean(detailDeckId && !isGuestDemo && isHistoryModalOpen),
    staleTime: QUERY_STALE_TIMES.deckDetail,
  });
  const compareHistoryVersionQuery = useQuery({
    queryKey: queryKeys.deckHistoryVersion(detailDeckId, compareHistoryVersionId),
    queryFn: ({ signal }) => getDeckHistoryVersion(detailDeckId, compareHistoryVersionId, signal),
    enabled: Boolean(detailDeckId && compareHistoryVersionId && !isGuestDemo),
    staleTime: QUERY_STALE_TIMES.deckDetail,
  });
  const compareDeckDetailQuery = useQuery({
    queryKey: queryKeys.deckDetail(compareDeckTargetId),
    queryFn: ({ signal }) => getDeckDetail(compareDeckTargetId, signal),
    enabled: Boolean(compareDeckTargetId && !isGuestDemo),
    staleTime: QUERY_STALE_TIMES.deckDetail,
  });

  const demoDecks = useMemo(
    () => getGuestDemoDecks(activeTcgSlug),
    [activeTcgSlug]
  );
  const decks = useMemo(
    () => (isGuestDemo ? demoDecks : (deckListQuery.data || [])),
    [deckListQuery.data, demoDecks, isGuestDemo]
  );
  const selectedDeck = isGuestDemo
    ? decks.find((deck) => String(deck.id) === String(detailDeckId)) || null
    : (selectedDeckQuery.data || null);
  const advancedMode = Boolean(profile?.advanced_mode);
  const advancedDeckControlsEnabled = !isGuestDemo && Boolean(
    selectedDeck?.advanced_mode !== undefined ? selectedDeck.advanced_mode : advancedMode
  );
  const deckStats = useMemo(() => buildDeckStats(selectedDeck), [selectedDeck]);
  const selectedDeckIsOnePiece = selectedDeck?.composition?.format_mode === 'one-piece';
  const selectedDeckIsDigimon = selectedDeck?.composition?.format_mode === 'digimon';
  const selectedDeckIsRiftbound = selectedDeck?.composition?.format_mode === 'riftbound';
  const selectedDeckEggCount = selectedDeckIsDigimon ? getDeckEggCardCount(selectedDeck) : 0;
  const selectedDeckConsideringTotal = Number(selectedDeck?.considering_total_cards) || 0;
  const selectedDeckDistinctCards = selectedDeckIsDigimon
    ? (selectedDeck?.cards?.length || 0) + (selectedDeck?.egg_cards?.length || 0)
    : selectedDeckIsRiftbound
      ? (selectedDeck?.cards?.length || 0)
        + (selectedDeck?.legend_cards_data?.length || 0)
        + (selectedDeck?.rune_cards_data?.length || 0)
        + (selectedDeck?.battlefield_cards_data?.length || 0)
        + (selectedDeck?.sideboard_cards_data?.length || 0)
    : (selectedDeck?.cards?.length || 0);
  const selectedDeckSummary = selectedDeckIsOnePiece
    ? `Leader ${selectedDeck?.leader_cards || 0}/${selectedDeck?.required_leader_cards || 1} | Main ${selectedDeck?.main_deck_cards || 0}/${selectedDeck?.required_main_deck_cards || 50} | DON ${selectedDeck?.don_cards || 0}/${selectedDeck?.recommended_don_cards || 10}`
    : selectedDeckIsDigimon
      ? `Main ${selectedDeck?.main_deck_cards || 0}/${selectedDeck?.required_main_deck_cards || 50} | Eggs ${selectedDeckEggCount}/${selectedDeck?.max_egg_cards || 5}`
      : selectedDeckIsRiftbound
        ? `Legend ${selectedDeck?.legend_cards || 0}/${selectedDeck?.required_legend_cards || 1} | Main ${selectedDeck?.main_deck_cards || 0}/${selectedDeck?.required_main_deck_cards || 40} | Runes ${selectedDeck?.rune_cards || 0}/${selectedDeck?.required_rune_cards || 12} | Fields ${selectedDeck?.battlefield_cards || 0}/${selectedDeck?.required_battlefield_cards || 3}`
    : `${selectedDeck?.total_cards || 0} cartas en total`;
  const comparisonDeckCandidates = useMemo(
    () => decks.filter((deck) => String(deck.id) !== String(selectedDeck?.id)),
    [decks, selectedDeck?.id]
  );
  const {
    setDraft: setDeckActionQuantityDraft,
    getQuantity: getDeckActionQuantity,
    commitQuantity: commitDeckActionQuantity,
    resetDrafts: resetDeckActionQuantityDrafts,
  } = usePositiveIntegerDraftMap({
    defaultQuantity: 1,
    maxDigits: 3,
    allowEmpty: false,
  });

  useEffect(() => {
    if (selectedDeck?.name) {
      setDraftDeckName(selectedDeck.name);
    }
  }, [selectedDeck?.name]);

  useEffect(() => {
    if (!selectedDeckId && !isEditorRoute) {
      resetDeckActionQuantityDrafts();
    }
  }, [isEditorRoute, resetDeckActionQuantityDrafts, selectedDeckId]);

  useEffect(() => {
    setIsHistoryModalOpen(false);
    setIsComparePickerOpen(false);
    setCompareDeckTargetId('');
    setCompareHistoryVersionId(null);
  }, [selectedDeckId]);

  useEffect(() => {
    const deckId = location.state?.[OPEN_DECK_ROUTE_STATE_KEY];
    if (!deckId) {
      return;
    }

    setSelectedDeckId(deckId);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!isEditorRoute) {
      return;
    }

    if (hasEditorRouteAccess) {
      return;
    }

    setSelectedCard(null);
    setSelectedDeckId(null);
    navigate('/decks', { replace: true });
  }, [hasEditorRouteAccess, isEditorRoute, navigate]);

  const deckQueryErrors = useMemo(
    () => [
      deckListQuery.error,
      selectedDeckQuery.error,
      deckHistoryQuery.error,
      compareHistoryVersionQuery.error,
      compareDeckDetailQuery.error,
    ],
    [
      deckListQuery.error,
      selectedDeckQuery.error,
      deckHistoryQuery.error,
      compareHistoryVersionQuery.error,
      compareDeckDetailQuery.error,
    ]
  );

  useQueryErrorToast(deckQueryErrors, showToast, 'No se pudieron cargar los datos de mazos.');

  const invalidateCollectionQuery = useCallback(() => {
    if (!activeTgc?.id) {
      return Promise.resolve();
    }

    return queryClient.invalidateQueries({ queryKey: queryKeys.collection(activeTgc.id) });
  }, [activeTgc?.id, queryClient]);

  const invalidateDeckOptionsQuery = useCallback(() => {
    if (!activeTgc?.id) {
      return Promise.resolve();
    }

    return queryClient.invalidateQueries({ queryKey: queryKeys.deckOptions(activeTgc.id) });
  }, [activeTgc?.id, queryClient]);

  const invalidateSearchDeckOptionsQuery = useCallback(() => {
    if (!activeTgc?.id) {
      return Promise.resolve();
    }

    return queryClient.invalidateQueries({ queryKey: queryKeys.searchDeckOptions(activeTgc.id) });
  }, [activeTgc?.id, queryClient]);

  const invalidateDeckHistoryQuery = useCallback((deckId) => {
    if (!deckId) {
      return Promise.resolve();
    }

    return queryClient.invalidateQueries({ queryKey: queryKeys.deckHistory(deckId) });
  }, [queryClient]);

  const syncCollectionDeckUsage = useCallback(({
    cardId,
    quantity,
    assignedQuantity,
    deckSection = 'main',
  }) => {
    if (!activeTgc?.id || !selectedDeck?.id) {
      return;
    }

    queryClient.setQueryData(queryKeys.collection(activeTgc.id), (current) => (
      applyCollectionDeckUsageUpdate(current, {
        cardId,
        deckId: selectedDeck.id,
        deckName: selectedDeck.name,
        deckSection,
        quantity,
        assignedQuantity,
        advancedMode: advancedDeckControlsEnabled,
      })
    ));
  }, [
    activeTgc?.id,
    advancedDeckControlsEnabled,
    queryClient,
    selectedDeck?.id,
    selectedDeck?.name,
  ]);

  const createDeckMutation = useMutation({
    mutationFn: createDeck,
    onSuccess: (createdDeck) => {
      queryClient.setQueryData(queryKeys.decks(activeTgc?.id), (current) => (
        Array.isArray(current) ? [createdDeck, ...current] : [createdDeck]
      ));
      queryClient.setQueryData(queryKeys.deckOptions(activeTgc?.id), (current) => {
        if (!Array.isArray(current)) {
          return current;
        }

        return [
          {
            id: createdDeck.id,
            name: createdDeck.name,
            tgc_id: createdDeck.tgc_id,
          },
          ...current,
        ];
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.searchDeckOptions(activeTgc?.id) });
      invalidateDeckHistoryQuery(createdDeck?.id);
      setNewDeckName('');
      showToast({ type: 'success', message: 'Mazo creado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo crear el mazo.'),
      });
    },
  });

  const deleteDeckMutation = useMutation({
    mutationFn: deleteDeck,
    onSuccess: async (_data, deckId) => {
      queryClient.setQueryData(queryKeys.decks(activeTgc?.id), (current) => (
        Array.isArray(current) ? current.filter((deck) => deck.id !== deckId) : current
      ));
      queryClient.setQueryData(queryKeys.deckOptions(activeTgc?.id), (current) => (
        Array.isArray(current) ? current.filter((deck) => deck.id !== deckId) : current
      ));
      queryClient.invalidateQueries({ queryKey: queryKeys.searchDeckOptions(activeTgc?.id) });
      queryClient.removeQueries({ queryKey: queryKeys.deckDetail(deckId) });
      if (selectedDeckId === deckId) {
        setSelectedDeckId(null);
      }
      await invalidateCollectionQuery();
      showToast({ type: 'success', message: 'Mazo borrado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo borrar el mazo.'),
      });
    },
    onSettled: () => {
      setDeletingDeckId(null);
    },
  });

  const cloneDeckMutation = useMutation({
    mutationFn: cloneDeck,
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) }),
        invalidateDeckOptionsQuery(),
        invalidateSearchDeckOptionsQuery(),
        invalidateCollectionQuery(),
        invalidateDeckHistoryQuery(response?.deck_id),
      ]);
      if (response?.deck_id) {
        setSelectedDeckId(response.deck_id);
      }
      showToast({ type: 'success', message: 'Mazo clonado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo clonar el mazo.'),
      });
    },
    onSettled: () => {
      setCloningDeckId(null);
    },
  });

  const renameDeckMutation = useMutation({
    mutationFn: ({ deckId, name }) => renameDeck(deckId, { name }),
    onSuccess: async (response, variables) => {
      const nextName = response?.name || variables.name;
      setDraftDeckName(nextName);
      queryClient.setQueryData(queryKeys.deckDetail(variables.deckId), (current) => (
        current ? { ...current, name: nextName } : current
      ));
      queryClient.setQueryData(queryKeys.decks(activeTgc?.id), (current) => (
        Array.isArray(current)
          ? current.map((deck) => (deck.id === variables.deckId ? { ...deck, name: nextName } : deck))
          : current
      ));
      queryClient.setQueryData(queryKeys.deckOptions(activeTgc?.id), (current) => (
        Array.isArray(current)
          ? current.map((deck) => (deck.id === variables.deckId ? { ...deck, name: nextName } : deck))
          : current
      ));
      queryClient.invalidateQueries({ queryKey: queryKeys.searchDeckOptions(activeTgc?.id) });
      queryClient.setQueryData(queryKeys.collection(activeTgc?.id), (current) => (
        renameDeckInCollection(current, variables.deckId, nextName)
      ));
      await Promise.all([
        invalidateCollectionQuery(),
        invalidateDeckHistoryQuery(variables.deckId),
      ]);
      showToast({ type: 'success', message: 'Nombre del mazo actualizado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo cambiar el nombre del mazo.'),
      });
    },
    onSettled: () => {
      setRenamingDeckId(null);
    },
  });

  const addDeckCardMutation = useMutation({
    mutationFn: ({ deckId, cardId, quantity }) => addCardToDeck(deckId, {
      card_id: cardId,
      quantity,
    }),
    onSuccess: async (payload, variables) => {
      syncCollectionDeckUsage({
        cardId: variables.cardId,
        quantity: payload?.quantity ?? variables.quantity,
        assignedQuantity: payload?.assigned_quantity,
        deckSection: payload?.deck_section || 'main',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deckDetail(variables.deckId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) }),
        invalidateSearchDeckOptionsQuery(),
        invalidateCollectionQuery(),
        invalidateDeckHistoryQuery(variables.deckId),
      ]);
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
        message: getApiErrorMessage(error, 'No se pudo anadir la carta al mazo.'),
      });
    },
    onSettled: () => {
      setAddingDeckCardId(null);
    },
  });

  const adjustDeckCardMutation = useMutation({
    mutationFn: ({ deckId, cardId, delta }) => adjustDeckCard(deckId, cardId, delta),
    onSuccess: async (payload, variables) => {
      queryClient.setQueryData(queryKeys.deckDetail(variables.deckId), (current) => (
        applyDeckQuantityMutation(current, variables.cardId, payload || {})
      ));
      syncCollectionDeckUsage({
        cardId: variables.cardId,
        quantity: payload?.quantity ?? 0,
        assignedQuantity: payload?.assigned_quantity,
        deckSection: payload?.deck_section || 'main',
      });
      if (payload?.deck) {
        queryClient.setQueryData(queryKeys.decks(activeTgc?.id), (current) => (
          mergeDeckOverviewInList(Array.isArray(current) ? current : [], payload.deck)
        ));
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deckDetail(variables.deckId) }),
        invalidateCollectionQuery(),
        invalidateDeckHistoryQuery(variables.deckId),
      ]);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo actualizar la cantidad en el mazo.'),
      });
    },
    onSettled: () => {
      setUpdatingDeckCardId(null);
    },
  });

  const adjustAssignmentMutation = useMutation({
    mutationFn: ({ deckId, cardId, delta }) => adjustDeckAssignment(deckId, cardId, delta),
    onSuccess: async (payload, variables) => {
      queryClient.setQueryData(queryKeys.deckDetail(variables.deckId), (current) => (
        applyDeckAssignmentMutation(current, variables.cardId, payload || {})
      ));
      syncCollectionDeckUsage({
        cardId: variables.cardId,
        quantity: payload?.quantity ?? 0,
        assignedQuantity: payload?.assigned_quantity,
        deckSection: payload?.deck_section || 'main',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deckDetail(variables.deckId) }),
        invalidateCollectionQuery(),
      ]);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo ajustar la cobertura del mazo.'),
      });
    },
    onSettled: () => {
      setUpdatingAssignmentCardId(null);
    },
  });

  const setChosenChampionMutation = useMutation({
    mutationFn: ({ deckId, cardId }) => setDeckChosenChampion(deckId, cardId),
    onSuccess: async (_payload, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deckDetail(variables.deckId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) }),
        invalidateSearchDeckOptionsQuery(),
        invalidateDeckHistoryQuery(variables.deckId),
      ]);
      showToast({ type: 'success', message: 'Chosen Champion actualizado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo actualizar el Chosen Champion.'),
      });
    },
  });

  const adjustConsideringMutation = useMutation({
    mutationFn: ({ deckId, cardId, delta }) => adjustConsideringCard(deckId, cardId, delta),
    onSuccess: async (_payload, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deckDetail(variables.deckId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) }),
        invalidateDeckHistoryQuery(variables.deckId),
      ]);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo actualizar considering.'),
      });
    },
    onSettled: () => {
      setUpdatingConsideringCardId(null);
    },
  });

  const moveToConsideringMutation = useMutation({
    mutationFn: ({ deckId, cardId, quantity }) => moveDeckCardToConsidering(deckId, cardId, quantity),
    onSuccess: async (payload, variables) => {
      syncCollectionDeckUsage({
        cardId: variables.cardId,
        quantity: payload?.quantity ?? 0,
        assignedQuantity: payload?.assigned_quantity,
        deckSection: payload?.deck_section || 'main',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deckDetail(variables.deckId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) }),
        invalidateSearchDeckOptionsQuery(),
        invalidateCollectionQuery(),
        invalidateDeckHistoryQuery(variables.deckId),
      ]);
      showToast({ type: 'success', message: 'Carta movida a considering.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo mover la carta a considering.'),
      });
    },
    onSettled: () => {
      setMovingConsideringCardId(null);
      setUpdatingDeckCardId(null);
    },
  });

  const moveFromConsideringMutation = useMutation({
    mutationFn: ({ deckId, cardId, quantity }) => moveConsideringCardToDeck(deckId, cardId, quantity),
    onSuccess: async (payload, variables) => {
      syncCollectionDeckUsage({
        cardId: variables.cardId,
        quantity: payload?.quantity ?? 0,
        assignedQuantity: payload?.assigned_quantity,
        deckSection: payload?.deck_section || 'main',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deckDetail(variables.deckId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) }),
        invalidateSearchDeckOptionsQuery(),
        invalidateCollectionQuery(),
        invalidateDeckHistoryQuery(variables.deckId),
      ]);
      showToast({ type: 'success', message: 'Carta devuelta al mazo principal.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo pasar la carta al mazo principal.'),
      });
    },
    onSettled: () => {
      setMovingConsideringCardId(null);
    },
  });

  const importDeckMutation = useMutation({
    mutationFn: importDeck,
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) }),
        invalidateDeckOptionsQuery(),
        invalidateSearchDeckOptionsQuery(),
        invalidateCollectionQuery(),
        invalidateDeckHistoryQuery(response?.deck_id),
      ]);
      if (response?.deck_id) {
        setSelectedDeckId(response.deck_id);
      }
      setIsImportPanelOpen(false);
      setImportDeckName('');
      setImportDeckText('');
      showToast({ type: 'success', message: 'Mazo importado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo importar el mazo.'),
      });
    },
  });

  const shareDeckMutation = useMutation({
    mutationFn: shareDeck,
  });

  const createDeckCheckpointMutation = useMutation({
    mutationFn: ({ deckId, label }) => createDeckCheckpoint(deckId, { label }),
    onSuccess: async (_response, variables) => {
      await invalidateDeckHistoryQuery(variables.deckId);
      showToast({ type: 'success', message: 'Checkpoint guardado.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        return;
      }

      showToast({
        type: 'error',
        message: getApiErrorMessage(error, 'No se pudo guardar el checkpoint.'),
      });
    },
  });

  const historyEntries = deckHistoryQuery.data || [];
  const compareTargetDeck = compareDeckDetailQuery.data || null;
  const compareHistoryVersion = compareHistoryVersionQuery.data || null;
  const compareTargetDeckPayload = compareTargetDeck || compareHistoryVersion?.snapshot || null;
  const compareTargetTitle = compareHistoryVersion
    ? `${selectedDeck?.name || 'Mazo actual'} vs ${formatDeckComparisonTargetLabel({
      type: 'version',
      versionNumber: compareHistoryVersion.version_number,
      label: compareHistoryVersion.label,
    })}`
    : compareTargetDeck
      ? `${selectedDeck?.name || 'Mazo actual'} vs ${compareTargetDeck.name}`
      : 'Comparacion de mazos';

  const closeDeckListPreview = () => {
    setDeckListPreview(null);
  };

  const copyDeckList = async (deckName, listText) => {
    try {
      await copyTextToClipboard(listText);
      showToast({ type: 'success', message: `Lista de ${deckName} copiada al portapapeles.` });
    } catch (_error) {
      showToast({
        type: 'info',
        message: 'No se pudo copiar automaticamente. Te dejo la lista abierta para copiarla manualmente.',
      });
    }
  };

  const openDeckListPreview = async (deck) => {
    if (!deck) {
      return;
    }

    const listText = buildDeckListText(deck);
    if (!listText) {
      showToast({ type: 'error', message: 'Este mazo no tiene cartas para exportar.' });
      return;
    }

    setDeckListPreview({
      name: deck.name,
      filename: `${safeDeckFilename(deck.name)}.txt`,
      text: listText,
    });

    await copyDeckList(deck.name, listText);
  };

  const buildImportDeckPayload = useCallback((rawContent, fallbackTgcId, nameOverride = '') => {
    let payload;

    try {
      const parsedContent = JSON.parse(rawContent);
      payload = parseImportedDeckFile(parsedContent, fallbackTgcId);
    } catch (_jsonError) {
      payload = parseDeckListText(rawContent, fallbackTgcId);
    }

    const trimmedName = nameOverride.trim();
    if (trimmedName) {
      payload.name = trimmedName;
    }

    return payload;
  }, []);

  const runDeckImport = useCallback(async ({
    rawContent,
    emptyContentMessage,
    genericErrorMessage,
    nameOverride = importDeckName,
  }) => {
    setImportingDeck(true);

    try {
      const payload = buildImportDeckPayload(rawContent, activeTgc?.id, nameOverride);

      if (
        !payload.cards.length
        && !(payload.egg_cards || []).length
        && !(payload.legend_cards || []).length
        && !(payload.rune_cards || []).length
        && !(payload.battlefield_cards || []).length
        && !(payload.sideboard_cards || []).length
      ) {
        throw new Error(emptyContentMessage);
      }

      try {
        await importDeckMutation.mutateAsync(payload);
      } catch (_error) {
        // Backend errors are already handled by the shared mutation error flow.
      }
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        showToast({
          type: 'error',
          message: getApiErrorMessage(error, genericErrorMessage),
        });
      }
    } finally {
      setImportingDeck(false);
    }
  }, [
    activeTgc?.id,
    buildImportDeckPayload,
    importDeckMutation,
    importDeckName,
    showToast,
  ]);

  const handleDeckImportFile = useCallback(async (file) => {
    const rawContent = await file.text();

    await runDeckImport({
      rawContent,
      emptyContentMessage: 'El archivo no contiene cartas importables.',
      genericErrorMessage: 'No se pudo importar el mazo.',
    });
  }, [runDeckImport]);

  const submitDeckListImport = async () => {
    const trimmedContent = importDeckText.trim();
    if (!trimmedContent) {
      showToast({
        type: 'error',
        message: 'Pega una lista de cartas antes de importar el mazo.',
      });
      return;
    }

    await runDeckImport({
      rawContent: trimmedContent,
      emptyContentMessage: 'La lista no contiene cartas importables.',
      genericErrorMessage: 'No se pudo importar la lista del mazo.',
    });
  };

  const createDeckHandler = (e) => {
    e.preventDefault();
    createDeckMutation.mutate({ name: newDeckName, tgc_id: activeTgc.id });
  };

  const deleteDeckHandler = (deckId, deckName) => {
    const confirmed = window.confirm(`Se borrara el mazo "${deckName}". Esta accion no se puede deshacer.`);
    if (!confirmed) {
      return;
    }

    setDeletingDeckId(deckId);
    deleteDeckMutation.mutate(deckId);
  };

  const viewDeckDetails = (deckId) => {
    setSelectedDeckId(deckId);
  };

  const cloneDeckHandler = (deckId) => {
    setCloningDeckId(deckId);
    cloneDeckMutation.mutate(deckId);
  };

  const shareDeckHandler = async (deck) => {
    if (!deck) {
      return;
    }

    setSharingDeckId(deck.id);

    try {
      const response = await shareDeckMutation.mutateAsync(deck.id);
      const shareUrl = `${window.location.origin}/shared-deck/${response.share_token}`;

      if (navigator.share) {
        await navigator.share({
          title: deck.name,
          text: `Consulta este mazo compartido de ${deck.tgc_name || activeGame.shortName}`,
          url: shareUrl,
        });
        showToast({ type: 'success', message: 'Enlace del mazo listo para compartir.' });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showToast({ type: 'success', message: 'Enlace del mazo copiado al portapapeles.' });
      } else {
        window.prompt('Copia este enlace del mazo:', shareUrl);
      }
    } catch (error) {
      if (error?.name !== 'AbortError' && !isUnauthorizedError(error)) {
        showToast({
          type: 'error',
          message: getApiErrorMessage(error, 'No se pudo compartir el mazo.'),
        });
      }
    } finally {
      setSharingDeckId(null);
    }
  };

  const exportDeckHandler = (deck) => {
    if (!deck) {
      return;
    }

    const payload = buildDeckExportPayload(deck);
    downloadJson(`${safeDeckFilename(deck.name)}.json`, payload);
  };

  const renameDeckHandler = () => {
    if (!selectedDeck) {
      return;
    }

    const trimmedName = draftDeckName.trim();
    if (!trimmedName) {
      showToast({ type: 'error', message: 'El nombre del mazo no puede estar vacio.' });
      return;
    }

    setRenamingDeckId(selectedDeck.id);
    renameDeckMutation.mutate({ deckId: selectedDeck.id, name: trimmedName });
  };

  const adjustDeckCardQuantity = (deckId, cardId, delta) => {
    setUpdatingDeckCardId(cardId);
    adjustDeckCardMutation.mutate({ deckId, cardId, delta });
  };

  const adjustDeckCardQuantityBatch = (deckId, cardId, storageKey, direction) => {
    const quantity = commitDeckActionQuantity(storageKey);
    adjustDeckCardQuantity(deckId, cardId, direction < 0 ? -quantity : quantity);
  };

  const adjustConsideringQuantity = (deckId, cardId, delta) => {
    setUpdatingConsideringCardId(cardId);
    adjustConsideringMutation.mutate({ deckId, cardId, delta });
  };

  const adjustConsideringQuantityBatch = (deckId, cardId, storageKey, direction) => {
    const quantity = commitDeckActionQuantity(storageKey);
    adjustConsideringQuantity(deckId, cardId, direction < 0 ? -quantity : quantity);
  };

  const moveDeckCardToConsideringHandler = (deckId, cardId, quantity = 1) => {
    setUpdatingDeckCardId(cardId);
    setMovingConsideringCardId(cardId);
    moveToConsideringMutation.mutate({ deckId, cardId, quantity });
  };

  const moveConsideringCardToDeckHandler = (deckId, cardId, quantity = 1) => {
    setMovingConsideringCardId(cardId);
    moveFromConsideringMutation.mutate({ deckId, cardId, quantity });
  };

  const adjustDeckCoverage = (cardId, delta) => {
    if (!selectedDeck?.id) {
      return;
    }

    setUpdatingAssignmentCardId(cardId);
    adjustAssignmentMutation.mutate({ deckId: selectedDeck.id, cardId, delta });
  };

  const setChosenChampionHandler = (deckId, cardId) => {
    setChosenChampionMutation.mutate({ deckId, cardId });
  };

  const toggleAssignmentEditor = (cardId) => {
    setEditingAssignmentCardId((current) => (current === cardId ? null : cardId));
  };

  const closeDeckDetails = () => {
    setSelectedCard(null);
    setSelectedDeckId(null);
    setIsHistoryModalOpen(false);
    setIsComparePickerOpen(false);
    setCompareDeckTargetId('');
    setCompareHistoryVersionId(null);
  };

  const openHistoryModal = () => {
    if (!selectedDeck?.id) {
      return;
    }

    setIsHistoryModalOpen(true);
  };

  const closeHistoryModal = () => {
    setIsHistoryModalOpen(false);
  };

  const openComparePicker = () => {
    if (!selectedDeck?.id) {
      return;
    }

    setCompareHistoryVersionId(null);
    setCompareDeckTargetId('');
    setIsComparePickerOpen(true);
  };

  const closeComparePicker = () => {
    setIsComparePickerOpen(false);
    setCompareDeckTargetId('');
  };

  const closeCompareResult = () => {
    setCompareDeckTargetId('');
    setCompareHistoryVersionId(null);
  };

  const confirmDeckComparison = () => {
    if (!compareDeckTargetId) {
      return;
    }

    setIsComparePickerOpen(false);
  };

  const compareWithHistoryVersion = (historyEntry) => {
    setCompareDeckTargetId('');
    setCompareHistoryVersionId(historyEntry?.id || null);
    setIsHistoryModalOpen(false);
  };

  const createCheckpointHandler = () => {
    if (!selectedDeck?.id) {
      return;
    }

    createDeckCheckpointMutation.mutate({ deckId: selectedDeck.id });
  };

  const openAdvancedEditor = () => {
    if (!selectedDeck?.id) {
      return;
    }

    navigate(`/decks/${selectedDeck.id}/editor`, {
      state: buildDeckEditorRouteState(selectedDeck.id),
    });
  };

  const closeAdvancedEditorToDetail = () => {
    if (!selectedDeck?.id) {
      navigate('/decks');
      return;
    }

    navigate('/decks', {
      state: buildOpenDeckRouteState(selectedDeck.id),
    });
  };

  const closeAdvancedEditor = () => {
    setSelectedCard(null);
    setSelectedDeckId(null);
    navigate('/decks');
  };

  const addDeckCardFromEditor = (cardId, quantity) => {
    if (!selectedDeck?.id) {
      return;
    }

    setAddingDeckCardId(cardId);
    addDeckCardMutation.mutate({
      deckId: selectedDeck.id,
      cardId,
      quantity,
    });
  };

  if (!isGuestDemo && deckListQuery.isPending && decks.length === 0) {
    return (
      <div className="decks page-shell">
        <section className="page-hero decks-hero">
          <div>
            <span className="eyebrow">{activeGame.eyebrow}</span>
            <h1>{activeGame.decksTitle}</h1>
            <p>Cargando tus mazos de {activeGame.shortName}...</p>
          </div>
        </section>
      </div>
    );
  }

  if (isEditorRoute) {
    if (!hasEditorRouteAccess) {
      return null;
    }

    if (!selectedDeck && selectedDeckQuery.isPending) {
      return (
        <div className="decks page-shell">
          <section className="page-hero decks-hero deck-editor-hero">
            <div>
              <span className="eyebrow">Editor avanzado</span>
              <h1>Cargando mazo...</h1>
              <p>Preparando el editor de {activeGame.shortName} con tus cartas y reglas actuales.</p>
            </div>
          </section>
        </div>
      );
    }

    return (
      <>
        <DeckAdvancedEditorPage
          selectedDeck={selectedDeck}
          selectedDeckDistinctCards={selectedDeckDistinctCards}
          selectedDeckSummary={selectedDeckSummary}
          selectedDeckConsideringTotal={selectedDeckConsideringTotal}
          selectedDeckEggCount={selectedDeckEggCount}
          selectedDeckIsDigimon={selectedDeckIsDigimon}
          activeGame={activeGame}
          activeTgc={activeTgc}
          deckStats={deckStats}
          addingDeckCardId={addingDeckCardId}
          onAddCardToDeck={addDeckCardFromEditor}
          updatingDeckCardId={updatingDeckCardId}
          updatingConsideringCardId={updatingConsideringCardId}
          movingConsideringCardId={movingConsideringCardId}
          onAdjustDeckQuantity={adjustDeckCardQuantity}
          onAdjustConsideringQuantity={adjustConsideringQuantity}
          onMoveDeckCardToConsidering={moveDeckCardToConsideringHandler}
          onMoveConsideringCardToDeck={moveConsideringCardToDeckHandler}
          onOpenCard={setSelectedCard}
          onBackToDetail={closeAdvancedEditorToDetail}
          onClose={closeAdvancedEditor}
        />

        <CardDetailModal
          card={selectedCard}
          activeTcgSlug={activeTcgSlug}
          onClose={() => setSelectedCard(null)}
        />
      </>
    );
  }

  return (
    <div className="decks page-shell">
      <section className="page-hero decks-hero">
        <div>
          <span className="eyebrow">{activeGame.eyebrow}</span>
          <h1>{activeGame.decksTitle}</h1>
          <p>
            {isGuestDemo
              ? `Aqui ves mazos de ejemplo de ${activeGame.shortName} con curva, mano inicial y secciones reales para que entiendas la herramienta antes de registrarte.`
              : `Organiza tus listas de ${activeGame.shortName}, revisa cantidades reales y ajusta cada carta del mazo sin salir del panel de detalle.`}
          </p>
        </div>

        <div className="hero-stat">
          <span>Total de mazos</span>
          <strong>{decks.length}</strong>
        </div>
      </section>

      {isGuestDemo && (
        <GuestDemoBanner
          title={`Mazos demo de ${activeGame.shortName}`}
          description="Puedes abrir mazos de ejemplo, ver su estructura, revisar la curva y entender como se reparten las copias. Para crear, importar o editar necesitas una cuenta."
        />
      )}

      {!isGuestDemo && (
        <section className="panel create-deck-panel">
          <form onSubmit={createDeckHandler} className="create-deck-form">
            <input
              type="text"
              placeholder={`Nombre del mazo de ${activeGame.shortName}`}
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
              required
            />
            <button type="submit" disabled={createDeckMutation.isPending}>
              {createDeckMutation.isPending ? 'Creando...' : 'Crear Mazo'}
            </button>
          </form>
          <DeckImportPanel
            isOpen={isImportPanelOpen}
            importingDeck={importingDeck}
            importDeckName={importDeckName}
            importDeckText={importDeckText}
            activeTcgSlug={activeTcgSlug}
            onToggle={() => setIsImportPanelOpen((current) => !current)}
            onImportDeckNameChange={setImportDeckName}
            onImportDeckTextChange={setImportDeckText}
            onSubmitListImport={submitDeckListImport}
            onImportFile={handleDeckImportFile}
          />
        </section>
      )}

      <section className="decks-list">
        {decks.map((deck) => (
          <DeckSummaryCard
            key={deck.id}
            deck={deck}
            isGuestDemo={isGuestDemo}
            onOpen={() => viewDeckDetails(deck.id)}
            onClone={() => cloneDeckHandler(deck.id)}
            onShare={() => shareDeckHandler(deck)}
            onDelete={() => deleteDeckHandler(deck.id, deck.name)}
            isCloning={cloningDeckId === deck.id}
            isSharing={sharingDeckId === deck.id}
            isDeleting={deletingDeckId === deck.id}
          />
        ))}

        {decks.length === 0 && (
          <div className="empty-state panel">
            <h3>
              {isGuestDemo
                ? `No hay mazos demo cargados para ${activeGame.shortName}`
                : `Aun no tienes mazos de ${activeGame.shortName}`}
            </h3>
            <p>
              {isGuestDemo
                ? 'Prueba otra seccion demo o cambia de juego para seguir explorando.'
                : 'Crea el primero para empezar a organizar tu coleccion.'}
            </p>
          </div>
        )}
      </section>

      <DeckDetailModal
        isOpen={Boolean(selectedDeckId)}
        isLoading={!isGuestDemo && selectedDeckQuery.isPending}
        isGuestDemo={isGuestDemo}
        selectedDeck={selectedDeck}
        selectedDeckDistinctCards={selectedDeckDistinctCards}
        selectedDeckSummary={selectedDeckSummary}
        selectedDeckConsideringTotal={selectedDeckConsideringTotal}
        selectedDeckEggCount={selectedDeckEggCount}
        selectedDeckIsOnePiece={selectedDeckIsOnePiece}
        selectedDeckIsDigimon={selectedDeckIsDigimon}
        selectedDeckIsRiftbound={selectedDeckIsRiftbound}
        deckCardView={deckCardView}
        onDeckCardViewChange={setDeckCardView}
        deckStats={deckStats}
        draftDeckName={draftDeckName}
        onDraftDeckNameChange={setDraftDeckName}
        renamingDeckId={renamingDeckId}
        onRenameDeck={renameDeckHandler}
        sharingDeckId={sharingDeckId}
        cloningDeckId={cloningDeckId}
        deletingDeckId={deletingDeckId}
        onOpenAdvancedEditor={openAdvancedEditor}
        onShareDeck={shareDeckHandler}
        onCloneDeck={cloneDeckHandler}
        onDeleteDeck={deleteDeckHandler}
        onClose={closeDeckDetails}
        onOpenDeckList={openDeckListPreview}
        onExportDeck={exportDeckHandler}
        onOpenHistory={openHistoryModal}
        onOpenCompare={openComparePicker}
        advancedDeckControlsEnabled={advancedDeckControlsEnabled}
        editingAssignmentCardId={editingAssignmentCardId}
        updatingAssignmentCardId={updatingAssignmentCardId}
        updatingDeckCardId={updatingDeckCardId}
        movingConsideringCardId={movingConsideringCardId}
        updatingConsideringCardId={updatingConsideringCardId}
        getDeckActionQuantity={getDeckActionQuantity}
        onDeckActionQuantityChange={setDeckActionQuantityDraft}
        commitDeckActionQuantity={commitDeckActionQuantity}
        onToggleAssignmentEditor={toggleAssignmentEditor}
        onAdjustCoverage={adjustDeckCoverage}
        onApplyDeckBatchQuantity={adjustDeckCardQuantityBatch}
        onAdjustDeckQuantity={adjustDeckCardQuantity}
        onMoveDeckCardToConsidering={moveDeckCardToConsideringHandler}
        onSetChosenChampion={setChosenChampionHandler}
        onApplyConsideringBatchQuantity={adjustConsideringQuantityBatch}
        onAdjustConsideringQuantity={adjustConsideringQuantity}
        onMoveConsideringCardToDeck={moveConsideringCardToDeckHandler}
        onOpenCard={setSelectedCard}
      />

      <CardDetailModal
        card={selectedCard}
        activeTcgSlug={activeTcgSlug}
        onClose={() => setSelectedCard(null)}
      />

      <DeckListPreviewModal
        preview={deckListPreview}
        onClose={closeDeckListPreview}
        onCopy={() => copyDeckList(deckListPreview.name, deckListPreview.text)}
        onDownload={() => downloadText(deckListPreview.filename, deckListPreview.text)}
      />

      <DeckHistoryModal
        isOpen={isHistoryModalOpen}
        deckName={selectedDeck?.name}
        history={historyEntries}
        isLoading={deckHistoryQuery.isPending}
        isSavingCheckpoint={createDeckCheckpointMutation.isPending}
        onCreateCheckpoint={createCheckpointHandler}
        onCompareVersion={compareWithHistoryVersion}
        onClose={closeHistoryModal}
      />

      <DeckComparePickerModal
        isOpen={isComparePickerOpen}
        deckName={selectedDeck?.name}
        decks={comparisonDeckCandidates}
        selectedDeckId={compareDeckTargetId}
        onSelectDeckId={setCompareDeckTargetId}
        onConfirm={confirmDeckComparison}
        onClose={closeComparePicker}
        isLoading={compareDeckDetailQuery.isPending}
      />

      <DeckCompareResultModal
        isOpen={Boolean((compareDeckTargetId && !isComparePickerOpen) || compareHistoryVersionId)}
        title={compareTargetTitle}
        baseDeck={selectedDeck}
        targetDeck={compareTargetDeckPayload}
        isLoading={compareDeckDetailQuery.isPending || compareHistoryVersionQuery.isPending}
        onClose={closeCompareResult}
      />
    </div>
  );
}

export default Decks;
