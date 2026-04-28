const normalizeDeckSection = (section) => {
  if (section === 'egg') {
    return 'egg';
  }

  if (section === 'don') {
    return 'don';
  }

  return 'main';
};

const getDeckUsageQuantity = (deckEntry, advancedMode = false) => {
  const quantity = Number(deckEntry?.quantity) || 0;
  const assignedQuantity = deckEntry?.assigned_quantity;

  if (advancedMode && assignedQuantity !== null && assignedQuantity !== undefined) {
    return Math.max(Number(assignedQuantity) || 0, 0);
  }

  return quantity;
};

const recalculateAvailableQuantity = (collectionEntry, advancedMode = false) => {
  const totalQuantity = Number(collectionEntry?.total_quantity) || 0;
  const usedInDecks = (Array.isArray(collectionEntry?.decks) ? collectionEntry.decks : []).reduce(
    (total, deckEntry) => total + getDeckUsageQuantity(deckEntry, advancedMode),
    0
  );

  return Math.max(totalQuantity - usedInDecks, 0);
};

export const applyCollectionDeckUsageUpdate = (
  currentCollection,
  {
    cardId,
    deckId,
    deckName,
    deckSection = 'main',
    quantity,
    assignedQuantity,
    advancedMode = false,
  }
) => {
  if (!Array.isArray(currentCollection)) {
    return currentCollection;
  }

  const normalizedSection = normalizeDeckSection(deckSection);
  const normalizedQuantity = Math.max(Number(quantity) || 0, 0);
  let hasChanges = false;

  const nextCollection = currentCollection.map((collectionEntry) => {
    if (collectionEntry?.card?.id !== cardId) {
      return collectionEntry;
    }

    const currentDecks = Array.isArray(collectionEntry.decks) ? collectionEntry.decks : [];
    const nextDecks = [];
    let entryHandled = false;

    currentDecks.forEach((deckEntry) => {
      const matchesDeckEntry = deckEntry?.id === deckId
        && normalizeDeckSection(deckEntry?.section) === normalizedSection;

      if (!matchesDeckEntry) {
        nextDecks.push(deckEntry);
        return;
      }

      entryHandled = true;
      hasChanges = true;

      if (normalizedQuantity <= 0) {
        return;
      }

      nextDecks.push({
        ...deckEntry,
        id: deckId,
        name: deckName || deckEntry?.name || 'Mazo',
        section: normalizedSection,
        quantity: normalizedQuantity,
        assigned_quantity: assignedQuantity,
      });
    });

    if (!entryHandled && normalizedQuantity > 0) {
      hasChanges = true;
      nextDecks.push({
        id: deckId,
        name: deckName || 'Mazo',
        section: normalizedSection,
        quantity: normalizedQuantity,
        assigned_quantity: assignedQuantity,
      });
    }

    return {
      ...collectionEntry,
      decks: nextDecks,
      available_quantity: recalculateAvailableQuantity(
        {
          ...collectionEntry,
          decks: nextDecks,
        },
        advancedMode
      ),
    };
  });

  return hasChanges ? nextCollection : currentCollection;
};

export const renameDeckInCollection = (currentCollection, deckId, deckName) => {
  if (!Array.isArray(currentCollection)) {
    return currentCollection;
  }

  let hasChanges = false;
  const nextCollection = currentCollection.map((collectionEntry) => {
    if (!Array.isArray(collectionEntry?.decks) || collectionEntry.decks.length === 0) {
      return collectionEntry;
    }

    let entryChanged = false;
    const nextDecks = collectionEntry.decks.map((deckEntry) => {
      if (deckEntry?.id !== deckId) {
        return deckEntry;
      }

      hasChanges = true;
      entryChanged = true;
      return {
        ...deckEntry,
        name: deckName,
      };
    });

    return entryChanged
      ? {
        ...collectionEntry,
        decks: nextDecks,
      }
      : collectionEntry;
  });

  return hasChanges ? nextCollection : currentCollection;
};
