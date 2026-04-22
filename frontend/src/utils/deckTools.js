export const MAX_COPIES_PER_CARD = 4;
export const GUNDAM_COLORS = ['Blue', 'Green', 'Red', 'Purple', 'White'];
export const ONE_PIECE_COLORS = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'];
const DEFAULT_DECK_RULES = {
  deckMinCards: 0,
  deckMaxCards: 999,
  maxCopiesPerCard: 999,
  requiredLeaderCards: 0,
  requiredMainDeckCards: 0,
  maxMainDeckCards: 999,
  maxDonCards: 0,
  allowOptionalDonDeck: false,
  enforceColorIdentity: false,
  maxDeckColors: 0,
};
export const TCG_DECK_RULES = {
  gundam: {
    deckMinCards: 50,
    deckMaxCards: 50,
    maxCopiesPerCard: 4,
    requiredLeaderCards: 0,
    requiredMainDeckCards: 50,
    maxMainDeckCards: 50,
    maxDonCards: 0,
    allowOptionalDonDeck: false,
    enforceColorIdentity: true,
    maxDeckColors: 2,
  },
  'one-piece': {
    deckMinCards: 50,
    deckMaxCards: 50,
    maxCopiesPerCard: 4,
    requiredLeaderCards: 1,
    requiredMainDeckCards: 50,
    maxMainDeckCards: 50,
    maxDonCards: 10,
    allowOptionalDonDeck: true,
    enforceColorIdentity: true,
    maxDeckColors: 0,
  },
  magic: {
    deckMinCards: 60,
    deckMaxCards: 999,
    maxCopiesPerCard: 4,
    requiredLeaderCards: 0,
    requiredMainDeckCards: 60,
    maxMainDeckCards: 999,
    maxDonCards: 0,
    allowOptionalDonDeck: false,
    enforceColorIdentity: false,
    maxDeckColors: 0,
  },
};
const DECK_ROLE_ORDER = { leader: 0, main: 1, don: 2 };
const DECK_COLOR_TONES = {
  Blue: { solid: '#2d6cdf', border: '#17479c', text: '#ffffff' },
  Green: { solid: '#2f8f5b', border: '#1d6440', text: '#ffffff' },
  Red: { solid: '#d24b4b', border: '#982c2c', text: '#ffffff' },
  Purple: { solid: '#7a58c7', border: '#543892', text: '#ffffff' },
  Black: { solid: '#2d3644', border: '#151b24', text: '#ffffff' },
  Yellow: { solid: '#f1c94b', border: '#b38614', text: '#3d2d00' },
  White: { solid: '#f1f5fb', border: '#b6c4d8', text: '#213247' },
};
const DEFAULT_DECK_COLOR_TONE = {
  solid: '#7c8aa0',
  border: '#556273',
  text: '#ffffff',
};

const buildQuantityLabel = (quantity) => (
  quantity === 1 ? '1 copia' : `${quantity} copias`
);

const normalizeSearchDeckQuantity = (quantity) => {
  const parsedQuantity = Number(quantity);
  if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor(parsedQuantity));
};

const formatDeckColorList = (colorLabels = []) => (
  colorLabels.filter(Boolean).join(' / ')
);

export const getDeckRules = (activeTcgSlug) => (
  TCG_DECK_RULES[activeTcgSlug] || DEFAULT_DECK_RULES
);

export const getOnePieceDeckRole = (cardType) => {
  const normalizedCardType = (cardType || '').trim().toLowerCase();
  if (normalizedCardType.includes('don')) {
    return 'don';
  }
  if (normalizedCardType === 'leader') {
    return 'leader';
  }
  return 'main';
};

export const getOnePieceColorLabels = (rawColor) => {
  const normalizedColor = (rawColor || '').trim();
  if (!normalizedColor) {
    return [];
  }

  return ONE_PIECE_COLORS.filter((color) => (
    new RegExp(`\\b${color}\\b`, 'i').test(normalizedColor)
  ));
};

export const getDeckCardRole = (activeTcgSlug, cardType) => {
  if (activeTcgSlug === 'one-piece') {
    return getOnePieceDeckRole(cardType);
  }

  return 'main';
};

export const getDeckCardColorLabels = (activeTcgSlug, rawColor) => {
  if (activeTcgSlug === 'one-piece') {
    return getOnePieceColorLabels(rawColor);
  }

  if (activeTcgSlug === 'gundam') {
    return GUNDAM_COLORS.filter((color) => (
      new RegExp(`\\b${color}\\b`, 'i').test((rawColor || '').trim())
    ));
  }

  return getDeckColorLabels(rawColor);
};

export const getDeckRuleSummary = (activeTcgSlug) => {
  if (activeTcgSlug === 'one-piece') {
    return 'Regla rapida de One Piece: 1 Leader, 50 cartas del mismo color y un mazo DON!! opcional de 10.';
  }

  if (activeTcgSlug === 'gundam') {
    return 'Regla rapida de Gundam: 50 cartas, hasta 4 copias por numero y un maximo de 2 colores por mazo.';
  }

  return '';
};

const buildOnePieceSearchDeckSummary = (deck, rules) => {
  const leaderCards = Number(deck?.leader_cards) || 0;
  const mainDeckCards = Number(deck?.main_deck_cards) || 0;
  const donCards = Number(deck?.don_cards) || 0;
  const requiredLeaderCards = Number(deck?.required_leader_cards) || rules.requiredLeaderCards || 1;
  const requiredMainDeckCards = Number(deck?.required_main_deck_cards) || rules.requiredMainDeckCards || 50;
  const recommendedDonCards = Number(deck?.recommended_don_cards) || rules.maxDonCards || 10;

  return `Leader ${leaderCards}/${requiredLeaderCards} | Main ${mainDeckCards}/${requiredMainDeckCards} | DON ${donCards}/${recommendedDonCards}`;
};

const buildGundamSearchDeckSummary = (deck, rules) => {
  const totalCards = Number(deck?.main_deck_cards ?? deck?.total_cards) || 0;
  const requiredMainDeckCards = Number(deck?.required_main_deck_cards) || rules.requiredMainDeckCards || 50;
  const deckColorLabels = Array.isArray(deck?.deck_color_labels) ? deck.deck_color_labels : [];
  const colorSummary = formatDeckColorList(deckColorLabels) || 'sin fijar';

  return `Main ${totalCards}/${requiredMainDeckCards} | Colores ${colorSummary}`;
};

const buildGenericSearchDeckSummary = (deck, rules) => {
  const totalCards = Number(deck?.total_cards) || 0;
  const maxCards = Number(deck?.max_cards) || rules.deckMaxCards || 999;

  return `${totalCards}/${maxCards} cartas`;
};

export const getNewDeckCreationPlan = (activeTcgSlug, card, quantity) => {
  const rules = getDeckRules(activeTcgSlug);
  const normalizedQuantity = normalizeSearchDeckQuantity(quantity);
  const cardRole = getDeckCardRole(activeTcgSlug, card?.card_type);
  const cardColors = getDeckCardColorLabels(activeTcgSlug, card?.color);
  const quantityLabel = buildQuantityLabel(normalizedQuantity);

  if (activeTcgSlug === 'one-piece') {
    if (cardRole === 'leader') {
      if (normalizedQuantity > rules.requiredLeaderCards) {
        return {
          canCreate: false,
          shouldAddCardAfterCreate: false,
          buttonLabel: 'Crear y anadir',
          helper: 'En un mazo nuevo de One Piece solo puedes empezar con 1 Leader.',
        };
      }

      if (cardColors.length === 0) {
        return {
          canCreate: false,
          shouldAddCardAfterCreate: false,
          buttonLabel: 'Crear y anadir',
          helper: 'No se han podido detectar los colores de ese Leader.',
        };
      }

      return {
        canCreate: true,
        shouldAddCardAfterCreate: true,
        buttonLabel: 'Crear y anadir',
        helper: `Empezaras el mazo con su Leader ${formatDeckColorList(cardColors)}.`,
      };
    }

    if (cardRole === 'don') {
      if (normalizedQuantity > rules.maxDonCards) {
        return {
          canCreate: false,
          shouldAddCardAfterCreate: false,
          buttonLabel: 'Crear y anadir',
          helper: `En un mazo nuevo de One Piece el mazo DON!! admite hasta ${rules.maxDonCards} cartas.`,
        };
      }

      return {
        canCreate: true,
        shouldAddCardAfterCreate: true,
        buttonLabel: 'Crear y anadir',
        helper: `Se creara el mazo y se anadiran ${quantityLabel} al bloque DON!! opcional.`,
      };
    }

    return {
      canCreate: true,
      shouldAddCardAfterCreate: false,
      buttonLabel: 'Crear mazo',
      helper: 'En One Piece primero hay que fijar 1 Leader. La carta no se anadira todavia.',
      postCreateMessage: 'Mazo creado. En One Piece anade primero 1 Leader antes de meter cartas del mazo principal.',
    };
  }

  if (normalizedQuantity > rules.maxCopiesPerCard) {
    return {
      canCreate: false,
      shouldAddCardAfterCreate: false,
      buttonLabel: 'Crear y anadir',
      helper: `No puedes empezar un mazo con mas de ${rules.maxCopiesPerCard} copias de la misma carta.`,
    };
  }

  if (rules.maxDeckColors > 0 && cardColors.length > rules.maxDeckColors) {
    return {
      canCreate: false,
      shouldAddCardAfterCreate: false,
      buttonLabel: 'Crear y anadir',
      helper: `Esta carta supera el maximo de ${rules.maxDeckColors} colores permitidos para ese mazo.`,
    };
  }

  if (activeTcgSlug === 'gundam') {
    return {
      canCreate: true,
      shouldAddCardAfterCreate: true,
      buttonLabel: 'Crear y anadir',
      helper: cardColors.length > 0
        ? `El mazo arrancara con los colores ${formatDeckColorList(cardColors)}.`
        : 'El mazo se creara y podras completarlo hasta 50 cartas.',
    };
  }

  return {
    canCreate: true,
    shouldAddCardAfterCreate: true,
    buttonLabel: 'Crear y anadir',
    helper: '',
  };
};

export const getSearchDeckOptionState = ({ activeTcgSlug, deck, card, quantity }) => {
  const rules = getDeckRules(activeTcgSlug);
  const normalizedQuantity = normalizeSearchDeckQuantity(quantity);
  const quantityLabel = buildQuantityLabel(normalizedQuantity);
  const cardRole = getDeckCardRole(activeTcgSlug, card?.card_type);
  const cardColors = getDeckCardColorLabels(activeTcgSlug, card?.color);

  if (activeTcgSlug === 'one-piece') {
    const leaderCards = Number(deck?.leader_cards) || 0;
    const requiredLeaderCards = Number(deck?.required_leader_cards) || rules.requiredLeaderCards || 1;
    const mainDeckCards = Number(deck?.main_deck_cards) || 0;
    const requiredMainDeckCards = Number(deck?.required_main_deck_cards) || rules.requiredMainDeckCards || 50;
    const donCards = Number(deck?.don_cards) || 0;
    const recommendedDonCards = Number(deck?.recommended_don_cards) || rules.maxDonCards || 10;
    const leaderColors = Array.isArray(deck?.leader_color_labels) ? deck.leader_color_labels : [];
    const sharesLeaderColor = leaderColors.length > 0 && cardColors.some((color) => leaderColors.includes(color));
    const summary = buildOnePieceSearchDeckSummary(deck, rules);

    if (cardRole === 'leader' && leaderCards + normalizedQuantity > requiredLeaderCards) {
      return {
        disabled: true,
        summary,
        helper: 'Ese mazo ya no admite mas Leaders.',
      };
    }

    if (cardRole === 'leader' && cardColors.length === 0) {
      return {
        disabled: true,
        summary,
        helper: 'No se han podido detectar los colores de ese Leader.',
      };
    }

    if (cardRole === 'main' && leaderCards === 0) {
      return {
        disabled: true,
        summary,
        helper: 'Anade primero el Leader para poder meter cartas del mazo principal.',
      };
    }

    if (cardRole === 'main' && leaderCards > 0 && leaderColors.length === 0) {
      return {
        disabled: true,
        summary,
        helper: 'Ese mazo tiene un Leader sin colores detectables. Revisa el Leader antes de anadir mas cartas.',
      };
    }

    if (cardRole === 'main' && leaderColors.length > 0 && cardColors.length > 0 && !sharesLeaderColor) {
      return {
        disabled: true,
        summary,
        helper: `No coincide con el color del Leader (${leaderColors.join(' / ')}).`,
      };
    }

    if (cardRole === 'main' && mainDeckCards + normalizedQuantity > requiredMainDeckCards) {
      return {
        disabled: true,
        summary,
        helper: `Con ${quantityLabel} superarias las 50 cartas del mazo principal.`,
      };
    }

    if (cardRole === 'don' && donCards + normalizedQuantity > recommendedDonCards) {
      return {
        disabled: true,
        summary,
        helper: `Con ${quantityLabel} superarias el limite de 10 DON!!.`,
      };
    }

    return {
      disabled: false,
      summary,
      helper: cardRole === 'main'
        ? `Encaja con el Leader ${leaderColors.join(' / ') || 'del mazo'}.`
        : `Anadir ${quantityLabel} a este mazo`,
    };
  }

  if (activeTcgSlug === 'gundam') {
    const mainDeckCards = Number(deck?.main_deck_cards ?? deck?.total_cards) || 0;
    const maxMainDeckCards = Number(deck?.max_cards) || rules.maxMainDeckCards || 50;
    const deckColorLabels = Array.isArray(deck?.deck_color_labels) ? deck.deck_color_labels : [];
    const maxDeckColors = Number(deck?.max_deck_colors) || rules.maxDeckColors || 2;
    const nextDeckColors = [...new Set([...deckColorLabels, ...cardColors])];
    const summary = buildGundamSearchDeckSummary(deck, rules);

    if (mainDeckCards + normalizedQuantity > maxMainDeckCards) {
      return {
        disabled: true,
        summary,
        helper: `Con ${quantityLabel} superarias las ${maxMainDeckCards} cartas del mazo.`,
      };
    }

    if (maxDeckColors > 0 && nextDeckColors.length > maxDeckColors) {
      const currentColorsLabel = formatDeckColorList(deckColorLabels);
      const incomingColorsLabel = formatDeckColorList(cardColors) || 'esta carta';
      return {
        disabled: true,
        summary,
        helper: currentColorsLabel
          ? `Ese mazo ya usa ${currentColorsLabel} y ${incomingColorsLabel} haria que pasara de ${maxDeckColors} colores.`
          : `Esta carta supera el maximo de ${maxDeckColors} colores permitidos para el mazo.`,
      };
    }

    return {
      disabled: false,
      summary,
      helper: deckColorLabels.length > 0
        ? (
          nextDeckColors.length === deckColorLabels.length
            ? `Encaja con los colores ${formatDeckColorList(deckColorLabels)} del mazo.`
            : `Encaja y dejara el mazo en ${formatDeckColorList(nextDeckColors)}.`
        )
        : (
          cardColors.length > 0
            ? `Anadir ${quantityLabel} fijara los colores ${formatDeckColorList(cardColors)} para arrancar el mazo.`
            : `Anadir ${quantityLabel} a este mazo`
        ),
    };
  }

  return {
    disabled: false,
    summary: buildGenericSearchDeckSummary(deck, rules),
    helper: `Anadir ${quantityLabel} a este mazo`,
  };
};

export const getDeckColorLabels = (rawColor) => {
  const normalizedColor = (rawColor || '').trim();
  if (!normalizedColor) {
    return [];
  }

  return Object.keys(DECK_COLOR_TONES).filter((color) => (
    new RegExp(`\\b${color}\\b`, 'i').test(normalizedColor)
  ));
};

export const getDeckColorPresentation = (rawColor) => {
  const colorLabels = getDeckColorLabels(rawColor);
  const normalizedLabel = (rawColor || '').trim();
  const label = colorLabels.length > 0
    ? colorLabels.join(' / ')
    : (normalizedLabel || 'Sin color');

  if (colorLabels.length === 0) {
    return {
      label,
      colorLabels,
      style: {
        '--deck-color-swatch': DEFAULT_DECK_COLOR_TONE.solid,
        '--deck-color-border': DEFAULT_DECK_COLOR_TONE.border,
        '--deck-color-text': DEFAULT_DECK_COLOR_TONE.text,
      },
    };
  }

  if (colorLabels.length === 1) {
    const tone = DECK_COLOR_TONES[colorLabels[0]] || DEFAULT_DECK_COLOR_TONE;
    return {
      label,
      colorLabels,
      style: {
        '--deck-color-swatch': tone.solid,
        '--deck-color-border': tone.border,
        '--deck-color-text': tone.text,
      },
    };
  }

  const gradient = `linear-gradient(135deg, ${colorLabels
    .map((color, index) => {
      const tone = DECK_COLOR_TONES[color] || DEFAULT_DECK_COLOR_TONE;
      const start = Math.round((index / colorLabels.length) * 100);
      const end = Math.round(((index + 1) / colorLabels.length) * 100);
      return `${tone.solid} ${start}%, ${tone.solid} ${end}%`;
    })
    .join(', ')})`;

  return {
    label,
    colorLabels,
    style: {
      '--deck-color-swatch': gradient,
      '--deck-color-border': (DECK_COLOR_TONES[colorLabels[0]] || DEFAULT_DECK_COLOR_TONE).border,
      '--deck-color-text': '#ffffff',
    },
  };
};

export const getDeckColorToneStops = (rawColor) => {
  const presentation = getDeckColorPresentation(rawColor);

  if (presentation.colorLabels.length === 0) {
    return [DEFAULT_DECK_COLOR_TONE.solid];
  }

  return presentation.colorLabels.map(
    (label) => (DECK_COLOR_TONES[label] || DEFAULT_DECK_COLOR_TONE).solid
  );
};

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
    .slice()
    .sort((left, right) => {
      const leftOrder = DECK_ROLE_ORDER[left.deck_role] ?? 9;
      const rightOrder = DECK_ROLE_ORDER[right.deck_role] ?? 9;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return (left.source_card_id || '').localeCompare(right.source_card_id || '');
    })
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
  if (!deck) {
    return null;
  }

  const typeMap = new Map();
  const colorMap = new Map();
  const rarityMap = new Map();
  const setMap = new Map();
  const curveMap = new Map();
  const curveColorMap = new Map();
  let curveWeightedTotal = 0;
  let curveWeightedCards = 0;
  let coveredCopies = 0;
  let missingCopies = 0;
  const composition = deck.composition || null;

  const addToMap = (map, key, amount) => {
    map.set(key, (map.get(key) || 0) + amount);
  };

  const addToNestedMap = (outerMap, outerKey, innerKey, amount) => {
    const nextInnerMap = outerMap.get(outerKey) || new Map();
    addToMap(nextInnerMap, innerKey, amount);
    outerMap.set(outerKey, nextInnerMap);
  };

  const toSortedEntries = (map) => (
    [...map.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
  );

  (deck.cards || []).forEach((card) => {
    const quantity = Number(card.quantity) || 0;
    if (quantity <= 0) {
      return;
    }

    addToMap(typeMap, card.card_type || 'Sin tipo', quantity);
    addToMap(colorMap, card.color || 'Sin color', quantity);
    addToMap(rarityMap, card.rarity || 'Sin rareza', quantity);
    addToMap(setMap, card.set_name || 'Sin set', quantity);

    if (card.deck_role !== 'leader' && card.deck_role !== 'don') {
      const rawCurveValue = Number.isFinite(card.cost) ? card.cost : card.lv;
      const normalizedCurveValue = Number.isFinite(rawCurveValue)
        ? rawCurveValue
        : Number(rawCurveValue);

      if (Number.isFinite(normalizedCurveValue)) {
        curveWeightedTotal += normalizedCurveValue * quantity;
        curveWeightedCards += quantity;
      }

      const curveKey = Number.isFinite(normalizedCurveValue)
        ? (normalizedCurveValue >= 6 ? '6+' : String(normalizedCurveValue))
        : '?';
      addToMap(curveMap, curveKey, quantity);
      addToNestedMap(
        curveColorMap,
        curveKey,
        getDeckColorPresentation(card.color).label,
        quantity
      );
    }

    coveredCopies += Number(card.fulfilled_quantity) || 0;
    missingCopies += Number(card.missing_quantity) || 0;
  });

  const curveOrder = ['0', '1', '2', '3', '4', '5', '6+', '?'];
  const curveEntries = curveOrder
    .map((key) => [key, curveMap.get(key) || 0])
    .filter(([, value]) => value > 0);
  const curveChartEntries = curveOrder
    .filter((key) => key !== '?' || (curveMap.get(key) || 0) > 0)
    .map((key) => {
      const total = curveMap.get(key) || 0;
      const segmentEntries = [...(curveColorMap.get(key)?.entries() || [])]
        .map(([label, value]) => ({
          label,
          value,
          share: total > 0 ? value / total : 0,
        }))
        .sort((left, right) => {
          if (right.value !== left.value) {
            return right.value - left.value;
          }

          return left.label.localeCompare(right.label);
        });

      return {
        label: key,
        total,
        segments: segmentEntries,
      };
    });

  return {
    formatMode: composition?.format_mode || 'standard',
    uniqueCards: deck.cards?.length || 0,
    totalCards: deck.total_cards || 0,
    coveredCopies,
    missingCopies,
    composition,
    leaderCards: composition?.leader_cards || 0,
    requiredLeaderCards: composition?.required_leader_cards || 0,
    mainDeckCards: composition?.main_deck_cards ?? (deck.total_cards || 0),
    requiredMainDeckCards: composition?.required_main_deck_cards || deck.max_cards || 0,
    donCards: composition?.don_cards || 0,
    recommendedDonCards: composition?.recommended_don_cards || 0,
    donIsOptional: Boolean(composition?.don_is_optional),
    leaderColorLabels: composition?.leader_color_labels || [],
    offColorCards: composition?.off_color_cards || [],
    copyLimitExceededCards: composition?.copy_limit_exceeded_cards || [],
    typeEntries: toSortedEntries(typeMap),
    colorEntries: toSortedEntries(colorMap),
    rarityEntries: toSortedEntries(rarityMap),
    setEntries: toSortedEntries(setMap),
    curveEntries,
    curveChartEntries,
    averageCurveCost: curveWeightedCards > 0 ? curveWeightedTotal / curveWeightedCards : null,
  };
};

const normalizeDeckNumber = (value, fallback = 0) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const buildDeckCardCoverage = (card, quantity, assignedQuantity, advancedMode) => {
  const safeQuantity = Math.max(normalizeDeckNumber(quantity, 0), 0);
  const ownedQuantity = Math.max(normalizeDeckNumber(card?.owned_quantity, 0), 0);
  const hasManualAssignment = Boolean(
    advancedMode && assignedQuantity !== null && assignedQuantity !== undefined
  );
  const normalizedAssignedQuantity = hasManualAssignment
    ? Math.max(Math.min(normalizeDeckNumber(assignedQuantity, 0), safeQuantity), 0)
    : null;
  const fulfilledQuantity = hasManualAssignment
    ? Math.min(normalizedAssignedQuantity, safeQuantity, ownedQuantity)
    : Math.min(safeQuantity, ownedQuantity);

  return {
    assignedQuantity: normalizedAssignedQuantity,
    fulfilledQuantity,
    missingQuantity: Math.max(safeQuantity - fulfilledQuantity, 0),
    manualAssignmentActive: hasManualAssignment,
  };
};

export const sortDeckCards = (cards = []) => (
  [...cards].sort((left, right) => {
    const leftOrder = DECK_ROLE_ORDER[left.deck_role] ?? 9;
    const rightOrder = DECK_ROLE_ORDER[right.deck_role] ?? 9;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    const leftCost = Number.isFinite(left.cost) ? left.cost : normalizeDeckNumber(left.cost, 999);
    const rightCost = Number.isFinite(right.cost) ? right.cost : normalizeDeckNumber(right.cost, 999);
    if (leftCost !== rightCost) {
      return leftCost - rightCost;
    }

    const leftName = (left.name || '').toLowerCase();
    const rightName = (right.name || '').toLowerCase();
    if (leftName !== rightName) {
      return leftName.localeCompare(rightName);
    }

    return (left.source_card_id || '').localeCompare(right.source_card_id || '');
  })
);

const sumMissingCopies = (cards = []) => (
  cards.reduce((total, card) => total + Math.max(normalizeDeckNumber(card.missing_quantity, 0), 0), 0)
);

export const mergeDeckOverviewInList = (decks, deckOverview) => {
  if (!deckOverview?.id) {
    return decks;
  }

  return decks.map((deck) => (
    deck.id === deckOverview.id
      ? { ...deck, ...deckOverview }
      : deck
  ));
};

export const applyDeckQuantityMutation = (deck, cardId, payload) => {
  if (!deck) {
    return deck;
  }

  const nextQuantity = Math.max(normalizeDeckNumber(payload?.quantity, 0), 0);
  const nextAssignedQuantity = payload?.assigned_quantity ?? null;
  const advancedMode = Boolean(deck.advanced_mode);

  const nextCards = (deck.cards || []).flatMap((card) => {
    if (card.id !== cardId) {
      return [card];
    }

    if (nextQuantity <= 0) {
      return [];
    }

    const coverage = buildDeckCardCoverage(card, nextQuantity, nextAssignedQuantity, advancedMode);
    return [{
      ...card,
      quantity: nextQuantity,
      assigned_quantity: coverage.assignedQuantity,
      fulfilled_quantity: coverage.fulfilledQuantity,
      missing_quantity: coverage.missingQuantity,
      manual_assignment_active: coverage.manualAssignmentActive,
    }];
  });

  const sortedCards = sortDeckCards(nextCards);
  const mergedDeck = {
    ...deck,
    ...(payload?.deck || {}),
    cards: sortedCards,
  };

  return {
    ...mergedDeck,
    missing_copies: sumMissingCopies(sortedCards),
  };
};

export const applyDeckAssignmentMutation = (deck, cardId, payload) => {
  if (!deck) {
    return deck;
  }

  const advancedMode = Boolean(deck.advanced_mode);
  const sortedCards = sortDeckCards((deck.cards || []).map((card) => {
    if (card.id !== cardId) {
      return card;
    }

    const nextQuantity = Math.max(normalizeDeckNumber(payload?.quantity, card.quantity), 0);
    const nextAssignedQuantity = payload?.assigned_quantity ?? null;
    const coverage = buildDeckCardCoverage(card, nextQuantity, nextAssignedQuantity, advancedMode);

    return {
      ...card,
      quantity: nextQuantity,
      assigned_quantity: coverage.assignedQuantity,
      fulfilled_quantity: coverage.fulfilledQuantity,
      missing_quantity: coverage.missingQuantity,
      manual_assignment_active: coverage.manualAssignmentActive,
    };
  }));

  return {
    ...deck,
    cards: sortedCards,
    missing_copies: sumMissingCopies(sortedCards),
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
