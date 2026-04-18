export const MAX_COPIES_PER_CARD = 4;

export const safeDeckFilename = (value) => (
  (value || 'mazo')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'mazo'
);

export const buildDeckExportPayload = (deck) => ({
  format: 'tgc-deck-v1',
  exported_at: new Date().toISOString(),
  deck: {
    name: deck.name,
    tgc_id: deck.tgc_id,
    tgc_name: deck.tgc_name,
    total_cards: deck.total_cards,
    cards: (deck.cards || []).map((card) => ({
      card_id: card.id,
      source_card_id: card.source_card_id,
      version: card.version,
      name: card.name,
      set_name: card.set_name,
      quantity: card.quantity,
    })),
  },
});

export const buildDeckListText = (deck) => (
  (deck?.cards || [])
    .filter((card) => (Number(card.quantity) || 0) > 0)
    .map((card) => `${Number(card.quantity)}x${card.source_card_id || `CARD-${card.id}`}`)
    .join('\n')
);

export const downloadJson = (filename, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
};

export const downloadText = (filename, text) => {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
};

export const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  const wasCopied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!wasCopied) {
    throw new Error('No se pudo copiar la lista.');
  }
};

export const buildDeckStats = (deck) => {
  if (!deck?.cards?.length) {
    return null;
  }

  const typeMap = new Map();
  const colorMap = new Map();
  const rarityMap = new Map();
  const setMap = new Map();
  const curveMap = new Map();
  let coveredCopies = 0;
  let missingCopies = 0;

  const addToMap = (map, key, amount) => {
    map.set(key, (map.get(key) || 0) + amount);
  };

  const toSortedEntries = (map) => (
    [...map.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
  );

  deck.cards.forEach((card) => {
    const quantity = Number(card.quantity) || 0;
    if (quantity <= 0) {
      return;
    }

    addToMap(typeMap, card.card_type || 'Sin tipo', quantity);
    addToMap(colorMap, card.color || 'Sin color', quantity);
    addToMap(rarityMap, card.rarity || 'Sin rareza', quantity);
    addToMap(setMap, card.set_name || 'Sin set', quantity);

    const rawCurveValue = Number.isFinite(card.cost) ? card.cost : card.lv;
    const normalizedCurveValue = Number.isFinite(rawCurveValue)
      ? rawCurveValue
      : Number(rawCurveValue);
    const curveKey = Number.isFinite(normalizedCurveValue)
      ? (normalizedCurveValue >= 6 ? '6+' : String(normalizedCurveValue))
      : '?';
    addToMap(curveMap, curveKey, quantity);

    coveredCopies += Number(card.fulfilled_quantity) || 0;
    missingCopies += Number(card.missing_quantity) || 0;
  });

  const curveOrder = ['0', '1', '2', '3', '4', '5', '6+', '?'];
  const curveEntries = curveOrder
    .map((key) => [key, curveMap.get(key) || 0])
    .filter(([, value]) => value > 0);

  return {
    uniqueCards: deck.cards.length,
    totalCards: deck.total_cards || 0,
    coveredCopies,
    missingCopies,
    typeEntries: toSortedEntries(typeMap),
    colorEntries: toSortedEntries(colorMap),
    rarityEntries: toSortedEntries(rarityMap),
    setEntries: toSortedEntries(setMap),
    curveEntries,
  };
};

export const parseImportedDeckFile = (payload, fallbackTgcId) => {
  const deckPayload = payload?.deck || payload;
  const cards = Array.isArray(deckPayload?.cards) ? deckPayload.cards : [];

  return {
    name: deckPayload?.name || 'Mazo importado',
    tgc_id: deckPayload?.tgc_id || fallbackTgcId || null,
    cards: cards.map((card) => ({
      card_id: card.card_id ?? null,
      source_card_id: card.source_card_id ?? null,
      version: card.version ?? null,
      quantity: Number(card.quantity) || 0,
    })),
  };
};

export const parseDeckListText = (rawContent, fallbackTgcId) => {
  const lines = rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('El archivo no contiene cartas importables.');
  }

  const cards = lines.map((line, index) => {
    const match = line.match(/^(\d+)\s*x\s*([A-Za-z0-9._-]+)$/i);

    if (!match) {
      throw new Error(`Linea ${index + 1} invalida: ${line}`);
    }

    return {
      card_id: null,
      source_card_id: match[2],
      version: null,
      quantity: Number(match[1]),
    };
  });

  return {
    name: 'Mazo importado',
    tgc_id: fallbackTgcId || null,
    cards,
  };
};
