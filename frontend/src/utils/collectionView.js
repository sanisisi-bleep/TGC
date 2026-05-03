export const normalizeCollectionCardType = (cardType, tcgSlug) => {
  const normalizedType = (cardType || '').toString().trim();
  if (!normalizedType) {
    return '';
  }

  if (tcgSlug === 'one-piece' && normalizedType.toUpperCase().includes('DON')) {
    return 'DON!!';
  }

  return normalizedType;
};

export const buildCollectionMeta = (card, tcgSlug) => (
  [
    normalizeCollectionCardType(card?.card_type, tcgSlug) || 'Sin tipo',
    card?.color || 'Sin color',
    card?.rarity || 'Sin rareza',
  ].join(' | ')
);

export const getCollectionDeckSectionLabel = (section) => {
  if (section === 'egg') {
    return 'Egg';
  }

  if (section === 'don') {
    return 'DON';
  }

  return 'Main';
};
