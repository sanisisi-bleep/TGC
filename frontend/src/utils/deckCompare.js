const SECTION_CONFIG = [
  { key: 'cards', section: 'main', label: 'Main Deck' },
  { key: 'egg_cards', section: 'egg', label: 'Digi-Egg Deck' },
  { key: 'legend_cards_data', section: 'legend', label: 'Legend' },
  { key: 'rune_cards_data', section: 'rune', label: 'Rune Deck' },
  { key: 'battlefield_cards_data', section: 'battlefield', label: 'Battlefields' },
  { key: 'sideboard_cards_data', section: 'sideboard', label: 'Sideboard' },
  { key: 'resource_cards_data', section: 'resource', label: 'Resource Deck' },
  { key: 'considering_cards', section: 'considering', label: 'Considering' },
];

const SECTION_LABELS = SECTION_CONFIG.reduce((acc, item) => {
  acc[item.section] = item.label;
  return acc;
}, {});

const normalizeQuantity = (value) => Math.max(Number(value) || 0, 0);

const buildCardCompareKey = (card, fallbackSection) => {
  const section = card?.deck_section || fallbackSection || 'main';
  const id = card?.id ?? card?.source_card_id ?? card?.deck_key ?? card?.name ?? 'card';
  return `${section}:${id}`;
};

export const getDeckCompareEntries = (deck) => {
  if (!deck) {
    return [];
  }

  return SECTION_CONFIG.flatMap(({ key, section, label }) => (
    (Array.isArray(deck[key]) ? deck[key] : [])
      .map((card) => ({
        key: buildCardCompareKey(card, section),
        id: card.id,
        section,
        sectionLabel: SECTION_LABELS[section] || label,
        quantity: normalizeQuantity(card.quantity),
        name: card.name || card.source_card_id || 'Carta',
        sourceCardId: card.source_card_id || '',
        deckKey: card.deck_key || card.source_card_id || '',
        cardType: card.card_type || '',
        color: card.color || '',
        cost: card.cost,
        version: card.version || '',
        imageUrl: card.image_url || '',
      }))
  ));
};

const compareEntrySorter = (left, right) => (
  (left.sectionLabel || '').localeCompare(right.sectionLabel || '')
  || (left.name || '').localeCompare(right.name || '')
  || (left.sourceCardId || '').localeCompare(right.sourceCardId || '')
);

export const buildDeckComparison = (baseDeck, targetDeck) => {
  const baseEntries = getDeckCompareEntries(baseDeck);
  const targetEntries = getDeckCompareEntries(targetDeck);
  const baseMap = new Map(baseEntries.map((entry) => [entry.key, entry]));
  const targetMap = new Map(targetEntries.map((entry) => [entry.key, entry]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, baseEntry] of baseMap.entries()) {
    const targetEntry = targetMap.get(key);
    if (!targetEntry) {
      added.push({
        ...baseEntry,
        quantityDelta: baseEntry.quantity,
      });
      continue;
    }

    if (baseEntry.quantity !== targetEntry.quantity) {
      changed.push({
        ...baseEntry,
        previousQuantity: targetEntry.quantity,
        quantityDelta: baseEntry.quantity - targetEntry.quantity,
      });
    }
  }

  for (const [key, targetEntry] of targetMap.entries()) {
    if (baseMap.has(key)) {
      continue;
    }

    removed.push({
      ...targetEntry,
      previousQuantity: targetEntry.quantity,
      quantityDelta: -targetEntry.quantity,
    });
  }

  added.sort(compareEntrySorter);
  removed.sort(compareEntrySorter);
  changed.sort(compareEntrySorter);

  return {
    added,
    removed,
    changed,
    summary: {
      addedCards: added.length,
      removedCards: removed.length,
      changedCards: changed.length,
      totalDelta: added.reduce((total, item) => total + item.quantity, 0)
        - removed.reduce((total, item) => total + item.previousQuantity, 0)
        + changed.reduce((total, item) => total + item.quantityDelta, 0),
    },
  };
};

export const formatDeckComparisonTargetLabel = (target) => {
  if (!target) {
    return '';
  }

  if (target.type === 'version') {
    const versionLabel = target.versionNumber ? `v${target.versionNumber}` : 'version';
    const label = target.label ? ` - ${target.label}` : '';
    return `${versionLabel}${label}`;
  }

  return target.name || 'Otro mazo';
};
