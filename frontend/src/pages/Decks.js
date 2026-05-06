import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import CardDetailModal from '../components/cards/CardDetailModal';
import DeckDetailModal from '../components/decks/DeckDetailModal';
import DeckImportPanel from '../components/decks/DeckImportPanel';
import DeckListPreviewModal from '../components/decks/DeckListPreviewModal';
import DeckSummaryCard from '../components/decks/DeckSummaryCard';
import { isUnauthorizedError, useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
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
import {
  adjustDeckAssignment,
  adjustConsideringCard,
  adjustDeckCard,
  moveConsideringCardToDeck,
  moveDeckCardToConsidering,
  cloneDeck,
  createDeck,
  deleteDeck,
  getDeckDetail,
  getDecks,
  importDeck,
  renameDeck,
  shareDeck,
} from '../services/api';

function Decks({ activeTcgSlug, activeTgc }) {
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
  const [updatingDeckCardId, setUpdatingDeckCardId] = useState(null);
  const [updatingAssignmentCardId, setUpdatingAssignmentCardId] = useState(null);
  const [updatingConsideringCardId, setUpdatingConsideringCardId] = useState(null);
  const [movingConsideringCardId, setMovingConsideringCardId] = useState(null);
  const [deckListPreview, setDeckListPreview] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  const deckListQuery = useQuery({
    queryKey: queryKeys.decks(activeTgc?.id),
    queryFn: ({ signal }) => getDecks(activeTgc.id, signal),
    enabled: Boolean(activeTgc?.id),
    staleTime: QUERY_STALE_TIMES.decks,
  });
  const selectedDeckQuery = useQuery({
    queryKey: queryKeys.deckDetail(selectedDeckId),
    queryFn: ({ signal }) => getDeckDetail(selectedDeckId, signal),
    enabled: Boolean(selectedDeckId),
    staleTime: QUERY_STALE_TIMES.deckDetail,
  });

  const decks = deckListQuery.data || [];
  const selectedDeck = selectedDeckQuery.data || null;
  const advancedMode = Boolean(profile?.advanced_mode);
  const advancedDeckControlsEnabled = Boolean(
    selectedDeck?.advanced_mode !== undefined ? selectedDeck.advanced_mode : advancedMode
  );
  const deckStats = useMemo(() => buildDeckStats(selectedDeck), [selectedDeck]);
  const selectedDeckIsOnePiece = selectedDeck?.composition?.format_mode === 'one-piece';
  const selectedDeckIsDigimon = selectedDeck?.composition?.format_mode === 'digimon';
  const selectedDeckEggCount = selectedDeckIsDigimon ? getDeckEggCardCount(selectedDeck) : 0;
  const selectedDeckConsideringTotal = Number(selectedDeck?.considering_total_cards) || 0;
  const selectedDeckDistinctCards = selectedDeckIsDigimon
    ? (selectedDeck?.cards?.length || 0) + (selectedDeck?.egg_cards?.length || 0)
    : (selectedDeck?.cards?.length || 0);
  const selectedDeckSummary = selectedDeckIsOnePiece
    ? `Leader ${selectedDeck?.leader_cards || 0}/${selectedDeck?.required_leader_cards || 1} | Main ${selectedDeck?.main_deck_cards || 0}/${selectedDeck?.required_main_deck_cards || 50} | DON ${selectedDeck?.don_cards || 0}/${selectedDeck?.recommended_don_cards || 10}`
    : selectedDeckIsDigimon
      ? `Main ${selectedDeck?.main_deck_cards || 0}/${selectedDeck?.required_main_deck_cards || 50} | Eggs ${selectedDeckEggCount}/${selectedDeck?.max_egg_cards || 5}`
    : `${selectedDeck?.total_cards || 0} cartas en total`;
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
    if (!selectedDeckId) {
      resetDeckActionQuantityDrafts();
    }
  }, [resetDeckActionQuantityDrafts, selectedDeckId]);

  useEffect(() => {
    const deckId = location.state?.openDeckId;
    if (!deckId) {
      return;
    }

    setSelectedDeckId(deckId);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  const deckQueryErrors = useMemo(
    () => [deckListQuery.error, selectedDeckQuery.error],
    [deckListQuery.error, selectedDeckQuery.error]
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
      await invalidateCollectionQuery();
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
      await invalidateCollectionQuery();
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
      await invalidateCollectionQuery();
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

  const adjustConsideringMutation = useMutation({
    mutationFn: ({ deckId, cardId, delta }) => adjustConsideringCard(deckId, cardId, delta),
    onSuccess: async (_payload, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deckDetail(variables.deckId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.decks(activeTgc?.id) }),
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

      if (!payload.cards.length && !(payload.egg_cards || []).length) {
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

  const toggleAssignmentEditor = (cardId) => {
    setEditingAssignmentCardId((current) => (current === cardId ? null : cardId));
  };

  const closeDeckDetails = () => {
    setSelectedCard(null);
    setSelectedDeckId(null);
  };

  if (deckListQuery.isPending && decks.length === 0) {
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

      <section className="decks-list">
        {decks.map((deck) => (
          <DeckSummaryCard
            key={deck.id}
            deck={deck}
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
            <h3>Aun no tienes mazos de {activeGame.shortName}</h3>
            <p>Crea el primero para empezar a organizar tu coleccion.</p>
          </div>
        )}
      </section>

      <DeckDetailModal
        isOpen={Boolean(selectedDeckId)}
        isLoading={selectedDeckQuery.isPending}
        selectedDeck={selectedDeck}
        selectedDeckDistinctCards={selectedDeckDistinctCards}
        selectedDeckSummary={selectedDeckSummary}
        selectedDeckConsideringTotal={selectedDeckConsideringTotal}
        selectedDeckEggCount={selectedDeckEggCount}
        selectedDeckIsOnePiece={selectedDeckIsOnePiece}
        selectedDeckIsDigimon={selectedDeckIsDigimon}
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
        onShareDeck={shareDeckHandler}
        onCloneDeck={cloneDeckHandler}
        onDeleteDeck={deleteDeckHandler}
        onClose={closeDeckDetails}
        onOpenDeckList={openDeckListPreview}
        onExportDeck={exportDeckHandler}
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
    </div>
  );
}

export default Decks;
