const TGC_NAMES = {
  gundam: 'Gundam Card Game',
  'one-piece': 'One Piece Card Game',
  digimon: 'Digimon Card Game',
};

const DEMO_IMAGE_TONES = {
  gundam: ['#0f3b7a', '#35a4ff'],
  'one-piece': ['#7a1f11', '#ff9a4a'],
  digimon: ['#123c8f', '#5ad0ff'],
};

const buildDemoImageUrl = (slug, code, name) => {
  const [primary, secondary] = DEMO_IMAGE_TONES[slug] || ['#49566a', '#7a8aa0'];
  const safeCode = (code || 'CARD').replace(/&/g, '&amp;');
  const safeName = (name || 'Carta').replace(/&/g, '&amp;');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560">
      <defs>
        <linearGradient id="demo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${primary}" />
          <stop offset="100%" stop-color="${secondary}" />
        </linearGradient>
      </defs>
      <rect width="400" height="560" rx="24" fill="url(#demo-gradient)" />
      <rect x="20" y="20" width="360" height="520" rx="18" fill="rgba(8, 15, 25, 0.28)" stroke="rgba(255,255,255,0.16)" />
      <text x="200" y="110" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#ffffff" font-weight="700">${safeCode}</text>
      <text x="200" y="285" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#ffffff" font-weight="700">${safeName}</text>
      <text x="200" y="490" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.88)">Vista demo</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const buildDemoCard = ({
  slug,
  id,
  sourceCardId,
  deckKey = sourceCardId,
  name,
  cardType,
  color,
  rarity,
  setName,
  version,
  quantity,
  deckRole = 'main',
  deckSection = 'main',
  cost = null,
  lv = null,
  abilities = '',
  description = '',
  traits = '',
  typeLine = '',
  power = null,
  dp = null,
  trigger = '',
  counter = '',
  attributeName = '',
  attribute = '',
  form = '',
  ownedQuantity = quantity,
  fulfilledQuantity = quantity,
  assignedQuantity = null,
}) => ({
  id,
  source_card_id: sourceCardId,
  deck_key: deckKey,
  name,
  image_url: buildDemoImageUrl(slug, sourceCardId, name),
  thumbnail_url: buildDemoImageUrl(slug, sourceCardId, name),
  card_type: cardType,
  lv,
  cost,
  color,
  rarity,
  set_name: setName,
  version,
  quantity,
  deck_role: deckRole,
  deck_section: deckSection,
  max_quantity_allowed: 4,
  color_matches_leader: true,
  color_warning_text: '',
  assigned_quantity: assignedQuantity,
  owned_quantity: ownedQuantity,
  fulfilled_quantity: fulfilledQuantity,
  missing_quantity: Math.max(quantity - fulfilledQuantity, 0),
  manual_assignment_active: false,
  abilities,
  description,
  traits,
  type_line: typeLine,
  ap: power,
  dp,
  trigger,
  counter,
  attribute_name: attributeName,
  attribute,
  form,
});

const buildDemoDeck = ({
  id,
  slug,
  name,
  createdAt,
  cards,
  eggCards = [],
  consideringCards = [],
  leaderColorLabels = [],
  deckColorLabels = [],
}) => {
  const mainDeckCards = cards
    .filter((card) => card.deck_role === 'main')
    .reduce((total, card) => total + (Number(card.quantity) || 0), 0);
  const leaderCards = cards
    .filter((card) => card.deck_role === 'leader')
    .reduce((total, card) => total + (Number(card.quantity) || 0), 0);
  const donCards = cards
    .filter((card) => card.deck_role === 'don')
    .reduce((total, card) => total + (Number(card.quantity) || 0), 0);
  const eggTotalCards = eggCards.reduce((total, card) => total + (Number(card.quantity) || 0), 0);
  const totalCards = cards.reduce((total, card) => total + (Number(card.quantity) || 0), 0) + eggTotalCards;
  const requiredMainDeckCards = slug === 'digimon' ? 50 : slug === 'one-piece' ? 50 : 50;
  const maxCards = slug === 'digimon' ? 55 : 50;
  const maxEggCards = slug === 'digimon' ? 5 : 0;
  const recommendedDonCards = slug === 'one-piece' ? 10 : 0;
  const isComplete = slug === 'one-piece'
    ? leaderCards === 1 && mainDeckCards === 50 && donCards === 10
    : slug === 'digimon'
      ? mainDeckCards === 50 && eggTotalCards <= 5
      : totalCards === 50;

  return {
    id,
    name,
    tgc_id: null,
    tgc_name: TGC_NAMES[slug],
    created_at: createdAt,
    total_cards: totalCards,
    min_cards: slug === 'digimon' ? 50 : 50,
    max_cards: maxCards,
    max_copies_per_card: 4,
    remaining_cards: 0,
    is_complete: isComplete,
    composition: {
      format_mode: slug,
      is_valid: isComplete,
      leader_cards: leaderCards,
      required_leader_cards: slug === 'one-piece' ? 1 : 0,
      main_deck_cards: mainDeckCards,
      required_main_deck_cards: requiredMainDeckCards,
      don_cards: donCards,
      recommended_don_cards: recommendedDonCards,
      don_is_optional: slug === 'one-piece',
      egg_cards: eggTotalCards,
      required_egg_cards: 0,
      max_egg_cards: maxEggCards,
      leader_color_labels: leaderColorLabels,
      deck_color_labels: deckColorLabels,
      max_deck_colors: slug === 'gundam' ? 2 : 0,
      off_color_cards: [],
      copy_violations: [],
    },
    leader_cards: leaderCards,
    required_leader_cards: slug === 'one-piece' ? 1 : 0,
    main_deck_cards: mainDeckCards,
    required_main_deck_cards: requiredMainDeckCards,
    don_cards: donCards,
    recommended_don_cards: recommendedDonCards,
    don_is_optional: slug === 'one-piece',
    egg_cards: eggCards,
    required_egg_cards: 0,
    max_egg_cards: maxEggCards,
    leader_color_labels: leaderColorLabels,
    deck_color_labels: deckColorLabels,
    max_deck_colors: slug === 'gundam' ? 2 : 0,
    off_color_cards: [],
    egg_total_cards: eggTotalCards,
    egg_unique_cards: eggCards.length,
    considering_cards: consideringCards,
    considering_total_cards: consideringCards.reduce((total, card) => total + (Number(card.quantity) || 0), 0),
    considering_unique_cards: consideringCards.length,
    missing_copies: 0,
    advanced_mode: false,
    cards,
  };
};

const buildCollectionItem = (card, totalQuantity, availableQuantity, decks = []) => ({
  total_quantity: totalQuantity,
  available_quantity: availableQuantity,
  decks,
  card: {
    ...card,
    quantity: undefined,
    owned_quantity: undefined,
    fulfilled_quantity: undefined,
    missing_quantity: undefined,
    assigned_quantity: undefined,
  },
});

const gundamDemoDecks = (() => {
  const demoOneCards = [
    buildDemoCard({ slug: 'gundam', id: 10101, sourceCardId: 'GD01-001', name: 'Amuro Ray', cardType: 'Pilot', color: 'Blue', rarity: 'R', setName: 'Newtype Rising', version: 'GD01', quantity: 4, cost: 1, traits: 'Earth Federation', abilities: 'Busca una unidad azul y afina la salida.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10102, sourceCardId: 'GD01-005', name: 'White Base Crew', cardType: 'Command', color: 'White', rarity: 'U', setName: 'Newtype Rising', version: 'GD01', quantity: 4, cost: 2, traits: 'White Base', abilities: 'Refuerza la curva media con ventaja incremental.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10103, sourceCardId: 'GD01-012', name: 'Gundam Aerial', cardType: 'Unit', color: 'Blue', rarity: 'SR', setName: 'Newtype Rising', version: 'GD01', quantity: 4, cost: 4, traits: 'Gundam', abilities: 'Presion principal del mazo demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10104, sourceCardId: 'GD01-018', name: 'Shield Formation', cardType: 'Command', color: 'White', rarity: 'C', setName: 'Newtype Rising', version: 'GD01', quantity: 4, cost: 2, traits: 'Tactics', abilities: 'Ayuda a estabilizar las primeras mesas.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10105, sourceCardId: 'GD01-024', name: 'Beam Saber Strike', cardType: 'Command', color: 'Blue', rarity: 'U', setName: 'Newtype Rising', version: 'GD01', quantity: 4, cost: 3, traits: 'Weapon', abilities: 'Respuesta puntual para cerrar intercambios.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10106, sourceCardId: 'GD01-028', name: 'Londo Bell Patrol', cardType: 'Unit', color: 'Blue', rarity: 'C', setName: 'Newtype Rising', version: 'GD01', quantity: 4, cost: 2, traits: 'Londo Bell', abilities: 'Mantiene la mesa ocupada en early.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10107, sourceCardId: 'GD01-033', name: 'Emergency Launch', cardType: 'Command', color: 'White', rarity: 'R', setName: 'Newtype Rising', version: 'GD01', quantity: 4, cost: 1, traits: 'Operation', abilities: 'Sostiene manos iniciales consistentes.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10108, sourceCardId: 'GD01-039', name: 'Nu Gundam Support', cardType: 'Unit', color: 'Blue', rarity: 'R', setName: 'Newtype Rising', version: 'GD01', quantity: 4, cost: 5, traits: 'Gundam', abilities: 'Amenaza de mid/late para la demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10109, sourceCardId: 'GD01-043', name: 'Colony Supply Line', cardType: 'Command', color: 'White', rarity: 'C', setName: 'Newtype Rising', version: 'GD01', quantity: 4, cost: 2, traits: 'Support', abilities: 'Recicla recursos y gana tempo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10110, sourceCardId: 'GD01-047', name: 'Funnel Barrage', cardType: 'Command', color: 'Blue', rarity: 'SR', setName: 'Newtype Rising', version: 'GD01', quantity: 4, cost: 5, traits: 'Newtype', abilities: 'Explosividad de cierre en turnos largos.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10111, sourceCardId: 'GD01-052', name: 'Recovery Dock', cardType: 'Command', color: 'White', rarity: 'C', setName: 'Newtype Rising', version: 'GD01', quantity: 4, cost: 1, traits: 'Base', abilities: 'Suaviza la curva y protege la mesa.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10112, sourceCardId: 'GD01-056', name: 'Aerial Escort', cardType: 'Unit', color: 'Blue', rarity: 'U', setName: 'Newtype Rising', version: 'GD01', quantity: 4, cost: 3, traits: 'Gundam', abilities: 'Pieza flexible para empujar dano.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10113, sourceCardId: 'GD01-060', name: 'Final Sortie', cardType: 'Command', color: 'White', rarity: 'R', setName: 'Newtype Rising', version: 'GD01', quantity: 2, cost: 4, traits: 'Operation', abilities: 'Ultimo empujon para cerrar partida.', description: 'Carta de ejemplo para la demo.' }),
  ];

  const demoTwoCards = [
    buildDemoCard({ slug: 'gundam', id: 10201, sourceCardId: 'GD02-003', name: 'Char Aznable', cardType: 'Pilot', color: 'Red', rarity: 'R', setName: 'Crimson Skies', version: 'GD02', quantity: 4, cost: 1, traits: 'Zeon', abilities: 'Acelera la presion desde turno uno.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10202, sourceCardId: 'GD02-009', name: 'Zaku Vanguard', cardType: 'Unit', color: 'Red', rarity: 'C', setName: 'Crimson Skies', version: 'GD02', quantity: 4, cost: 2, traits: 'Zeon', abilities: 'Cuerpo de early con presion constante.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10203, sourceCardId: 'GD02-014', name: 'Dom Trooper', cardType: 'Unit', color: 'Green', rarity: 'U', setName: 'Crimson Skies', version: 'GD02', quantity: 4, cost: 3, traits: 'Ground', abilities: 'Mantiene la curva media estable.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10204, sourceCardId: 'GD02-018', name: 'Supply Raid', cardType: 'Command', color: 'Red', rarity: 'C', setName: 'Crimson Skies', version: 'GD02', quantity: 4, cost: 1, traits: 'Operation', abilities: 'Gira la carrera a tu favor.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10205, sourceCardId: 'GD02-021', name: 'Forest Outpost', cardType: 'Command', color: 'Green', rarity: 'C', setName: 'Crimson Skies', version: 'GD02', quantity: 4, cost: 2, traits: 'Terrain', abilities: 'Alarga recursos en partidas medias.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10206, sourceCardId: 'GD02-026', name: 'Gelgoog Charge', cardType: 'Unit', color: 'Red', rarity: 'R', setName: 'Crimson Skies', version: 'GD02', quantity: 4, cost: 4, traits: 'Zeon', abilities: 'Remate de media partida.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10207, sourceCardId: 'GD02-029', name: 'Recon Flight', cardType: 'Command', color: 'Green', rarity: 'U', setName: 'Crimson Skies', version: 'GD02', quantity: 4, cost: 2, traits: 'Scout', abilities: 'Ordena la mano y mejora el mulligan.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10208, sourceCardId: 'GD02-034', name: 'Mobile Armor Drop', cardType: 'Command', color: 'Red', rarity: 'SR', setName: 'Crimson Skies', version: 'GD02', quantity: 4, cost: 5, traits: 'Assault', abilities: 'Amenaza principal del final de partida.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10209, sourceCardId: 'GD02-039', name: 'Frontline Mechanics', cardType: 'Unit', color: 'Green', rarity: 'C', setName: 'Crimson Skies', version: 'GD02', quantity: 4, cost: 2, traits: 'Support', abilities: 'Sostiene el plan de mesa.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10210, sourceCardId: 'GD02-042', name: 'Crimson Bombardment', cardType: 'Command', color: 'Red', rarity: 'R', setName: 'Crimson Skies', version: 'GD02', quantity: 4, cost: 4, traits: 'Weapon', abilities: 'Presion extra cuando vas por delante.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10211, sourceCardId: 'GD02-047', name: 'Strategic Withdrawal', cardType: 'Command', color: 'Green', rarity: 'U', setName: 'Crimson Skies', version: 'GD02', quantity: 4, cost: 1, traits: 'Tactics', abilities: 'Recicla amenazas clave.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10212, sourceCardId: 'GD02-051', name: 'Heavy Skirmisher', cardType: 'Unit', color: 'Red', rarity: 'U', setName: 'Crimson Skies', version: 'GD02', quantity: 4, cost: 3, traits: 'Zeon', abilities: 'Mantiene la presion de media curva.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'gundam', id: 10213, sourceCardId: 'GD02-057', name: 'Final Resupply', cardType: 'Command', color: 'Green', rarity: 'C', setName: 'Crimson Skies', version: 'GD02', quantity: 2, cost: 4, traits: 'Support', abilities: 'Recupera el ultimo empujon.', description: 'Carta de ejemplo para la demo.' }),
  ];

  return [
    buildDemoDeck({
      id: 9101,
      slug: 'gundam',
      name: 'Blue White Tempo Demo',
      createdAt: '2026-04-21T19:00:00Z',
      cards: demoOneCards,
      deckColorLabels: ['Blue', 'White'],
    }),
    buildDemoDeck({
      id: 9102,
      slug: 'gundam',
      name: 'Red Green Midrange Demo',
      createdAt: '2026-04-26T19:00:00Z',
      cards: demoTwoCards,
      deckColorLabels: ['Red', 'Green'],
    }),
  ];
})();

const onePieceDemoDecks = (() => {
  const leaderCard = buildDemoCard({ slug: 'one-piece', id: 20100, sourceCardId: 'OP09-001', name: 'Monkey D. Luffy', cardType: 'Leader', color: 'Red / Yellow', rarity: 'L', setName: 'Emperors in the New World', version: 'OP09', quantity: 1, deckRole: 'leader', cost: 5, power: 5000, attributeName: 'Strike', abilities: 'Leader demo para enseñar la identidad del mazo.', description: 'Carta de ejemplo para la demo.' });
  const donCards = [
    buildDemoCard({ slug: 'one-piece', id: 20190, sourceCardId: 'DON-001', name: 'DON!! Card A', cardType: 'DON!!', color: 'Black', rarity: 'Common', setName: 'Base DON!!', version: 'DON', quantity: 5, deckRole: 'don', cost: 0, abilities: 'Recurso de ejemplo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20191, sourceCardId: 'DON-002', name: 'DON!! Card B', cardType: 'DON!!', color: 'Black', rarity: 'Common', setName: 'Base DON!!', version: 'DON', quantity: 5, deckRole: 'don', cost: 0, abilities: 'Recurso de ejemplo.', description: 'Carta de ejemplo para la demo.' }),
  ];
  const mainCards = [
    buildDemoCard({ slug: 'one-piece', id: 20101, sourceCardId: 'OP09-015', name: 'Roronoa Zoro', cardType: 'Character', color: 'Red', rarity: 'SR', setName: 'Emperors in the New World', version: 'OP09', quantity: 4, cost: 3, power: 5000, counter: '1000', attributeName: 'Slash', abilities: 'Presiona la mesa desde los primeros turnos.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20102, sourceCardId: 'OP09-021', name: 'Nami', cardType: 'Character', color: 'Yellow', rarity: 'R', setName: 'Emperors in the New World', version: 'OP09', quantity: 4, cost: 2, power: 3000, counter: '1000', attributeName: 'Special', abilities: 'Genera ventaja y ordena recursos.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20103, sourceCardId: 'OP09-028', name: 'Sanji', cardType: 'Character', color: 'Red', rarity: 'U', setName: 'Emperors in the New World', version: 'OP09', quantity: 4, cost: 4, power: 6000, counter: '1000', attributeName: 'Strike', abilities: 'Amenaza de curva media.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20104, sourceCardId: 'OP09-034', name: 'Tony Tony Chopper', cardType: 'Character', color: 'Yellow', rarity: 'C', setName: 'Emperors in the New World', version: 'OP09', quantity: 4, cost: 1, power: 2000, counter: '1000', attributeName: 'Wisdom', abilities: 'Sostiene manos rapidas.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20105, sourceCardId: 'OP09-041', name: 'Jinbe', cardType: 'Character', color: 'Blue', rarity: 'R', setName: 'Emperors in the New World', version: 'OP09', quantity: 4, cost: 4, power: 5000, counter: '1000', attributeName: 'Strike', abilities: 'Pivote para estabilizar midgame.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20106, sourceCardId: 'OP09-047', name: 'Usopp', cardType: 'Character', color: 'Red', rarity: 'C', setName: 'Emperors in the New World', version: 'OP09', quantity: 4, cost: 1, power: 3000, counter: '2000', attributeName: 'Ranged', abilities: 'Defensa flexible para la demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20107, sourceCardId: 'OP09-054', name: 'Brook', cardType: 'Character', color: 'Yellow', rarity: 'U', setName: 'Emperors in the New World', version: 'OP09', quantity: 4, cost: 3, power: 4000, counter: '1000', attributeName: 'Slash', abilities: 'Complementa la curva media.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20108, sourceCardId: 'OP09-062', name: 'Red Roc', cardType: 'Event', color: 'Red', rarity: 'R', setName: 'Emperors in the New World', version: 'OP09', quantity: 4, cost: 6, trigger: 'KO a un personaje rival', abilities: 'Respuesta explosiva para amenazas grandes.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20109, sourceCardId: 'OP09-069', name: 'Thunderbolt', cardType: 'Event', color: 'Yellow', rarity: 'U', setName: 'Emperors in the New World', version: 'OP09', quantity: 4, cost: 4, trigger: 'Activa en trigger', abilities: 'Control puntual con valor de trigger.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20110, sourceCardId: 'OP09-074', name: 'Robin', cardType: 'Character', color: 'Red', rarity: 'R', setName: 'Emperors in the New World', version: 'OP09', quantity: 4, cost: 5, power: 7000, counter: '1000', attributeName: 'Special', abilities: 'Amenaza estable de late.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20111, sourceCardId: 'OP09-081', name: 'Sabo', cardType: 'Character', color: 'Yellow', rarity: 'SR', setName: 'Emperors in the New World', version: 'OP09', quantity: 4, cost: 5, power: 7000, counter: '1000', attributeName: 'Special', abilities: 'Carta de cierre para la demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20112, sourceCardId: 'OP09-087', name: 'Luffy Rush', cardType: 'Character', color: 'Red', rarity: 'SR', setName: 'Emperors in the New World', version: 'OP09', quantity: 4, cost: 7, power: 8000, attributeName: 'Strike', abilities: 'Remate principal del mazo demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20113, sourceCardId: 'OP09-094', name: 'Jet Pistol', cardType: 'Event', color: 'Red', rarity: 'C', setName: 'Emperors in the New World', version: 'OP09', quantity: 2, cost: 4, trigger: 'KO de amenaza pequena', abilities: 'Remueve piezas pequenas y limpia la curva.', description: 'Carta de ejemplo para la demo.' }),
  ];

  const controlDeckCards = [
    buildDemoCard({ slug: 'one-piece', id: 20200, sourceCardId: 'OP08-001', name: 'Portgas D. Ace', cardType: 'Leader', color: 'Blue / Black', rarity: 'L', setName: 'Two Legends', version: 'OP08', quantity: 1, deckRole: 'leader', cost: 5, power: 5000, attributeName: 'Special', abilities: 'Leader demo orientado a control.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20201, sourceCardId: 'OP08-015', name: 'Marco', cardType: 'Character', color: 'Blue', rarity: 'SR', setName: 'Two Legends', version: 'OP08', quantity: 4, cost: 4, power: 6000, counter: '1000', attributeName: 'Special', abilities: 'Reciclaje y tempo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20202, sourceCardId: 'OP08-021', name: 'Kuzan', cardType: 'Character', color: 'Black', rarity: 'R', setName: 'Two Legends', version: 'OP08', quantity: 4, cost: 4, power: 5000, counter: '1000', attributeName: 'Special', abilities: 'Control de mesa flexible.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20203, sourceCardId: 'OP08-032', name: 'Borsalino', cardType: 'Character', color: 'Black', rarity: 'U', setName: 'Two Legends', version: 'OP08', quantity: 4, cost: 3, power: 5000, counter: '1000', attributeName: 'Special', abilities: 'Cuerpo defensivo para estabilizar.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20204, sourceCardId: 'OP08-046', name: 'Blue Event', cardType: 'Event', color: 'Blue', rarity: 'C', setName: 'Two Legends', version: 'OP08', quantity: 4, cost: 2, abilities: 'Soporte de ejemplo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20205, sourceCardId: 'OP08-054', name: 'Black Event', cardType: 'Event', color: 'Black', rarity: 'C', setName: 'Two Legends', version: 'OP08', quantity: 4, cost: 3, abilities: 'Respuesta de ejemplo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20206, sourceCardId: 'OP08-060', name: 'Trafalgar Law', cardType: 'Character', color: 'Blue', rarity: 'R', setName: 'Two Legends', version: 'OP08', quantity: 4, cost: 5, power: 7000, counter: '1000', attributeName: 'Slash', abilities: 'Pieza de control de midgame.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20207, sourceCardId: 'OP08-067', name: 'Sakazuki', cardType: 'Character', color: 'Black', rarity: 'SR', setName: 'Two Legends', version: 'OP08', quantity: 4, cost: 6, power: 8000, attributeName: 'Strike', abilities: 'Cierre y control pesado.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20208, sourceCardId: 'OP08-072', name: 'Teach', cardType: 'Character', color: 'Black', rarity: 'R', setName: 'Two Legends', version: 'OP08', quantity: 4, cost: 5, power: 7000, counter: '1000', attributeName: 'Special', abilities: 'Valor incremental.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20209, sourceCardId: 'OP08-081', name: 'Boa Hancock', cardType: 'Character', color: 'Blue', rarity: 'R', setName: 'Two Legends', version: 'OP08', quantity: 4, cost: 4, power: 6000, counter: '1000', attributeName: 'Special', abilities: 'Presion lateral y robo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20210, sourceCardId: 'OP08-085', name: 'Control Trigger', cardType: 'Event', color: 'Blue', rarity: 'U', setName: 'Two Legends', version: 'OP08', quantity: 4, cost: 4, trigger: 'Controla el top del rival', abilities: 'Trigger de ejemplo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20211, sourceCardId: 'OP08-089', name: 'Removal Trigger', cardType: 'Event', color: 'Black', rarity: 'U', setName: 'Two Legends', version: 'OP08', quantity: 4, cost: 5, trigger: 'KO a una amenaza', abilities: 'Trigger de ejemplo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20212, sourceCardId: 'OP08-094', name: 'Ace Support', cardType: 'Character', color: 'Blue', rarity: 'C', setName: 'Two Legends', version: 'OP08', quantity: 2, cost: 2, power: 3000, counter: '2000', attributeName: 'Special', abilities: 'Soporte ligero para cuadrar las 50.', description: 'Carta de ejemplo para la demo.' }),
  ];

  const controlDonCards = [
    buildDemoCard({ slug: 'one-piece', id: 20290, sourceCardId: 'DON-003', name: 'DON!! Control A', cardType: 'DON!!', color: 'Black', rarity: 'Common', setName: 'Base DON!!', version: 'DON', quantity: 5, deckRole: 'don', cost: 0, abilities: 'Recurso de ejemplo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'one-piece', id: 20291, sourceCardId: 'DON-004', name: 'DON!! Control B', cardType: 'DON!!', color: 'Black', rarity: 'Common', setName: 'Base DON!!', version: 'DON', quantity: 5, deckRole: 'don', cost: 0, abilities: 'Recurso de ejemplo.', description: 'Carta de ejemplo para la demo.' }),
  ];

  return [
    buildDemoDeck({
      id: 9201,
      slug: 'one-piece',
      name: 'Luffy Midrange Demo',
      createdAt: '2026-04-22T19:00:00Z',
      cards: [leaderCard, ...mainCards, ...donCards],
      leaderColorLabels: ['Red', 'Yellow'],
    }),
    buildDemoDeck({
      id: 9202,
      slug: 'one-piece',
      name: 'Ace Control Demo',
      createdAt: '2026-04-28T19:00:00Z',
      cards: [...controlDeckCards, ...controlDonCards],
      leaderColorLabels: ['Blue', 'Black'],
    }),
  ];
})();

const digimonDemoDecks = (() => {
  const eggs = [
    buildDemoCard({ slug: 'digimon', id: 30101, sourceCardId: 'BT12-002-P0', deckKey: 'BT12-002', name: 'DemiVeemon', cardType: 'Digi-Egg', color: 'Blue', rarity: 'U', setName: 'Across Time', version: 'BT12', quantity: 1, deckRole: 'egg', deckSection: 'egg', lv: 2, dp: 0, form: 'In-Training', attribute: 'Free', typeLine: 'Lesser', abilities: 'Apoya la linea Imperialdramon en early.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30102, sourceCardId: 'BT12-003', deckKey: 'BT12-003', name: 'Minomon', cardType: 'Digi-Egg', color: 'Green', rarity: 'C', setName: 'Across Time', version: 'BT12', quantity: 1, deckRole: 'egg', deckSection: 'egg', lv: 2, dp: 0, form: 'In-Training', attribute: 'Free', typeLine: 'Lesser', abilities: 'Alternativa para abrir con mas consistencia.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30103, sourceCardId: 'BT12-004', deckKey: 'BT12-004', name: 'Tsunomon', cardType: 'Digi-Egg', color: 'Blue', rarity: 'C', setName: 'Across Time', version: 'BT12', quantity: 1, deckRole: 'egg', deckSection: 'egg', lv: 2, dp: 0, form: 'In-Training', attribute: 'Free', typeLine: 'Lesser', abilities: 'Huevos extra para la demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30104, sourceCardId: 'BT12-005', deckKey: 'BT12-005', name: 'Tanemon', cardType: 'Digi-Egg', color: 'Green', rarity: 'C', setName: 'Across Time', version: 'BT12', quantity: 1, deckRole: 'egg', deckSection: 'egg', lv: 2, dp: 0, form: 'In-Training', attribute: 'Free', typeLine: 'Lesser', abilities: 'Huevos extra para la demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30105, sourceCardId: 'BT12-006', deckKey: 'BT12-006', name: 'Xiaomon', cardType: 'Digi-Egg', color: 'Blue', rarity: 'C', setName: 'Across Time', version: 'BT12', quantity: 1, deckRole: 'egg', deckSection: 'egg', lv: 2, dp: 0, form: 'In-Training', attribute: 'Free', typeLine: 'Lesser', abilities: 'Huevos extra para la demo.', description: 'Carta de ejemplo para la demo.' }),
  ];

  const mainCards = [
    buildDemoCard({ slug: 'digimon', id: 30111, sourceCardId: 'BT12-021', deckKey: 'BT12-021', name: 'Veemon', cardType: 'Digimon', color: 'Blue', rarity: 'U', setName: 'Across Time', version: 'BT12', quantity: 4, lv: 3, cost: 3, dp: 2000, form: 'Rookie', attribute: 'Free', typeLine: 'Dragonkin', abilities: 'Busca la evolucion y afina la salida.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30112, sourceCardId: 'BT16-017', deckKey: 'BT16-017', name: 'Veemon', cardType: 'Digimon', color: 'Blue', rarity: 'R', setName: 'Begining Observer', version: 'BT16', quantity: 4, lv: 3, cost: 3, dp: 2000, form: 'Rookie', attribute: 'Free', typeLine: 'Dragonkin', abilities: 'Segunda linea de rookie para Imperialdramon.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30113, sourceCardId: 'BT12-047', deckKey: 'BT12-047', name: 'Wormmon', cardType: 'Digimon', color: 'Green', rarity: 'U', setName: 'Across Time', version: 'BT12', quantity: 4, lv: 3, cost: 3, dp: 2000, form: 'Rookie', attribute: 'Free', typeLine: 'Larva', abilities: 'Asegura la linea verde del mazo demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30114, sourceCardId: 'BT16-040', deckKey: 'BT16-040', name: 'Wormmon', cardType: 'Digimon', color: 'Green', rarity: 'R', setName: 'Begining Observer', version: 'BT16', quantity: 4, lv: 3, cost: 3, dp: 2000, form: 'Rookie', attribute: 'Free', typeLine: 'Larva', abilities: 'Complementa la consistencia del plan.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30115, sourceCardId: 'BT12-022-P1', deckKey: 'BT12-022', name: 'ExVeemon', cardType: 'Digimon', color: 'Blue', rarity: 'SR', setName: 'Across Time', version: 'BT12', quantity: 4, lv: 4, cost: 6, dp: 6000, form: 'Champion', attribute: 'Vaccine', typeLine: 'Mythical Dragon', abilities: 'Pieza central de agresion media.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30116, sourceCardId: 'BT12-050-P1', deckKey: 'BT12-050', name: 'Stingmon', cardType: 'Digimon', color: 'Green', rarity: 'SR', setName: 'Across Time', version: 'BT12', quantity: 4, lv: 4, cost: 6, dp: 6000, form: 'Champion', attribute: 'Free', typeLine: 'Insectoid', abilities: 'Companero ideal para la DNA.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30117, sourceCardId: 'AD1-011', deckKey: 'AD1-011', name: 'Paildramon', cardType: 'Digimon', color: 'Blue / Green', rarity: 'SR', setName: 'Adventure Box', version: 'AD1', quantity: 4, lv: 5, cost: 8, dp: 8000, form: 'Ultimate', attribute: 'Free', typeLine: 'Dragonkin / Insectoid', abilities: 'Evolucion DNA para pivotar la mesa.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30118, sourceCardId: 'BT16-025', deckKey: 'BT16-025', name: 'Paildramon', cardType: 'Digimon', color: 'Blue / Green', rarity: 'R', setName: 'Begining Observer', version: 'BT16', quantity: 4, lv: 5, cost: 8, dp: 8000, form: 'Ultimate', attribute: 'Free', typeLine: 'Dragonkin / Insectoid', abilities: 'Segunda linea de Ultimate para el demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30119, sourceCardId: 'ST9-06-P2', deckKey: 'ST9-06', name: 'Imperialdramon: Dragon Mode', cardType: 'Digimon', color: 'Blue / Green', rarity: 'SR', setName: 'Ultimate Ancient Dragon', version: 'ST9', quantity: 4, lv: 6, cost: 12, dp: 12000, form: 'Mega', attribute: 'Free', typeLine: 'Ancient Dragonkin', abilities: 'Finisher principal del mazo demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30120, sourceCardId: 'AD1-024-P1', deckKey: 'AD1-024', name: 'Imperialdramon: Fighter Mode', cardType: 'Digimon', color: 'Blue / Green', rarity: 'SR', setName: 'Adventure Box', version: 'AD1', quantity: 4, lv: 7, cost: 14, dp: 13000, form: 'Mega', attribute: 'Vaccine', typeLine: 'Ancient Dragonkin', abilities: 'Cierre del plan Imperialdramon.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30121, sourceCardId: 'BT16-085', deckKey: 'BT16-085', name: 'Davis Motomiya & Ken Ichijoji', cardType: 'Tamer', color: 'Blue / Green', rarity: 'R', setName: 'Begining Observer', version: 'BT16', quantity: 4, cost: 4, form: '', attribute: '', typeLine: '', abilities: 'Tamer para acelerar la linea DNA.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30122, sourceCardId: 'BT17-097-P1', deckKey: 'BT17-097', name: 'Return to the Primogenitor', cardType: 'Option', color: 'Blue / Green', rarity: 'U', setName: 'Secret Crisis', version: 'BT17', quantity: 4, cost: 4, abilities: 'Recupera piezas y alarga la partida.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30123, sourceCardId: 'BT03-103-P1', deckKey: 'BT03-103', name: 'Hidden Potential Discovered!', cardType: 'Option', color: 'Green', rarity: 'R', setName: 'Release Special Booster', version: 'BT03', quantity: 2, cost: 0, abilities: 'Acelerador final para jugadas explosivas.', description: 'Carta de ejemplo para la demo.' }),
  ];

  const supportCards = [
    buildDemoCard({ slug: 'digimon', id: 30211, sourceCardId: 'ST9-08', deckKey: 'ST9-08', name: 'Dinobeemon', cardType: 'Digimon', color: 'Blue / Green', rarity: 'U', setName: 'Ultimate Ancient Dragon', version: 'ST9', quantity: 4, lv: 5, cost: 8, dp: 7000, form: 'Ultimate', attribute: 'Free', typeLine: 'Mutant', abilities: 'Ruta secundaria de DNA para la demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30212, sourceCardId: 'ST9-10', deckKey: 'ST9-10', name: 'Imperialdramon: Fighter Mode', cardType: 'Digimon', color: 'Blue / Green', rarity: 'SR', setName: 'Ultimate Ancient Dragon', version: 'ST9', quantity: 4, lv: 7, cost: 14, dp: 13000, form: 'Mega', attribute: 'Vaccine', typeLine: 'Ancient Dragonkin', abilities: 'Segunda copia de finisher para el demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30213, sourceCardId: 'BT21-037', deckKey: 'BT21-037', name: 'Lighdramon', cardType: 'Digimon', color: 'Yellow / Blue', rarity: 'R', setName: 'World Convergence', version: 'BT21', quantity: 4, lv: 4, cost: 5, dp: 5000, form: 'Armor Form', attribute: 'Free', typeLine: 'Mythical Beast', abilities: 'Linea alternativa de presion.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30214, sourceCardId: 'BT03-093-P1', deckKey: 'BT03-093', name: 'Davis Motomiya', cardType: 'Tamer', color: 'Blue', rarity: 'R', setName: 'Release Special Booster', version: 'BT03', quantity: 4, cost: 3, abilities: 'Consistencia extra para encontrar piezas.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30215, sourceCardId: 'ST2-13-P2', deckKey: 'ST2-13', name: 'Hammer Spark', cardType: 'Option', color: 'Blue', rarity: 'C', setName: 'Cocytus Blue', version: 'ST2', quantity: 4, cost: 0, abilities: 'Acelera tempo en turnos clave.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30216, sourceCardId: 'BT12-021', deckKey: 'BT12-021', name: 'Veemon', cardType: 'Digimon', color: 'Blue', rarity: 'U', setName: 'Across Time', version: 'BT12', quantity: 4, lv: 3, cost: 3, dp: 2000, form: 'Rookie', attribute: 'Free', typeLine: 'Dragonkin', abilities: 'Base de la curva baja.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30217, sourceCardId: 'BT12-047', deckKey: 'BT12-047', name: 'Wormmon', cardType: 'Digimon', color: 'Green', rarity: 'U', setName: 'Across Time', version: 'BT12', quantity: 4, lv: 3, cost: 3, dp: 2000, form: 'Rookie', attribute: 'Free', typeLine: 'Larva', abilities: 'Base de la curva verde.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30218, sourceCardId: 'BT12-022-P1', deckKey: 'BT12-022', name: 'ExVeemon', cardType: 'Digimon', color: 'Blue', rarity: 'SR', setName: 'Across Time', version: 'BT12', quantity: 4, lv: 4, cost: 6, dp: 6000, form: 'Champion', attribute: 'Vaccine', typeLine: 'Mythical Dragon', abilities: 'Curva de champion consistente.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30219, sourceCardId: 'BT12-050-P1', deckKey: 'BT12-050', name: 'Stingmon', cardType: 'Digimon', color: 'Green', rarity: 'SR', setName: 'Across Time', version: 'BT12', quantity: 4, lv: 4, cost: 6, dp: 6000, form: 'Champion', attribute: 'Free', typeLine: 'Insectoid', abilities: 'Curva de champion consistente.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30220, sourceCardId: 'AD1-011', deckKey: 'AD1-011', name: 'Paildramon', cardType: 'Digimon', color: 'Blue / Green', rarity: 'SR', setName: 'Adventure Box', version: 'AD1', quantity: 4, lv: 5, cost: 8, dp: 8000, form: 'Ultimate', attribute: 'Free', typeLine: 'Dragonkin / Insectoid', abilities: 'Midgame para la demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30221, sourceCardId: 'BT16-025', deckKey: 'BT16-025', name: 'Paildramon', cardType: 'Digimon', color: 'Blue / Green', rarity: 'R', setName: 'Begining Observer', version: 'BT16', quantity: 4, lv: 5, cost: 8, dp: 8000, form: 'Ultimate', attribute: 'Free', typeLine: 'Dragonkin / Insectoid', abilities: 'Midgame secundario para la demo.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30222, sourceCardId: 'BT16-085', deckKey: 'BT16-085', name: 'Davis Motomiya & Ken Ichijoji', cardType: 'Tamer', color: 'Blue / Green', rarity: 'R', setName: 'Begining Observer', version: 'BT16', quantity: 4, cost: 4, abilities: 'Pieza de soporte del plan.', description: 'Carta de ejemplo para la demo.' }),
    buildDemoCard({ slug: 'digimon', id: 30223, sourceCardId: 'BT17-097-P1', deckKey: 'BT17-097', name: 'Return to the Primogenitor', cardType: 'Option', color: 'Blue / Green', rarity: 'U', setName: 'Secret Crisis', version: 'BT17', quantity: 2, cost: 4, abilities: 'Recuperacion para alargar recursos.', description: 'Carta de ejemplo para la demo.' }),
  ];

  return [
    buildDemoDeck({
      id: 9301,
      slug: 'digimon',
      name: 'Imperialdramon Demo',
      createdAt: '2026-04-23T19:00:00Z',
      cards: mainCards,
      eggCards: eggs,
    }),
    buildDemoDeck({
      id: 9302,
      slug: 'digimon',
      name: 'Imperialdramon Support Demo',
      createdAt: '2026-04-29T19:00:00Z',
      cards: supportCards,
      eggCards: eggs.map((card, index) => ({
        ...card,
        id: 30290 + index,
      })),
    }),
  ];
})();

const GUEST_DECKS = {
  gundam: gundamDemoDecks,
  'one-piece': onePieceDemoDecks,
  digimon: digimonDemoDecks,
};

const GUEST_COLLECTIONS = {
  gundam: [
    buildCollectionItem(gundamDemoDecks[0].cards[0], 6, 2, [{ id: 9101, name: gundamDemoDecks[0].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(gundamDemoDecks[0].cards[2], 5, 1, [{ id: 9101, name: gundamDemoDecks[0].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(gundamDemoDecks[0].cards[4], 4, 0, [{ id: 9101, name: gundamDemoDecks[0].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(gundamDemoDecks[0].cards[7], 7, 3, [{ id: 9101, name: gundamDemoDecks[0].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(gundamDemoDecks[1].cards[0], 6, 2, [{ id: 9102, name: gundamDemoDecks[1].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(gundamDemoDecks[1].cards[5], 5, 1, [{ id: 9102, name: gundamDemoDecks[1].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(gundamDemoDecks[1].cards[7], 4, 0, [{ id: 9102, name: gundamDemoDecks[1].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(gundamDemoDecks[1].cards[10], 6, 2, [{ id: 9102, name: gundamDemoDecks[1].name, section: 'main', quantity: 4 }]),
  ],
  'one-piece': [
    buildCollectionItem(onePieceDemoDecks[0].cards[0], 1, 0, [{ id: 9201, name: onePieceDemoDecks[0].name, section: 'leader', quantity: 1 }]),
    buildCollectionItem(onePieceDemoDecks[0].cards[1], 6, 2, [{ id: 9201, name: onePieceDemoDecks[0].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(onePieceDemoDecks[0].cards[8], 5, 1, [{ id: 9201, name: onePieceDemoDecks[0].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(onePieceDemoDecks[0].cards[13], 10, 5, [{ id: 9201, name: onePieceDemoDecks[0].name, section: 'don', quantity: 5 }]),
    buildCollectionItem(onePieceDemoDecks[1].cards[0], 1, 0, [{ id: 9202, name: onePieceDemoDecks[1].name, section: 'leader', quantity: 1 }]),
    buildCollectionItem(onePieceDemoDecks[1].cards[1], 5, 1, [{ id: 9202, name: onePieceDemoDecks[1].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(onePieceDemoDecks[1].cards[6], 4, 0, [{ id: 9202, name: onePieceDemoDecks[1].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(onePieceDemoDecks[1].cards[13], 10, 5, [{ id: 9202, name: onePieceDemoDecks[1].name, section: 'don', quantity: 5 }]),
  ],
  digimon: [
    buildCollectionItem(digimonDemoDecks[0].egg_cards[0], 3, 2, [{ id: 9301, name: digimonDemoDecks[0].name, section: 'egg', quantity: 1 }]),
    buildCollectionItem(digimonDemoDecks[0].cards[0], 6, 2, [{ id: 9301, name: digimonDemoDecks[0].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(digimonDemoDecks[0].cards[2], 5, 1, [{ id: 9301, name: digimonDemoDecks[0].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(digimonDemoDecks[0].cards[6], 4, 0, [{ id: 9301, name: digimonDemoDecks[0].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(digimonDemoDecks[0].cards[8], 5, 1, [{ id: 9301, name: digimonDemoDecks[0].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(digimonDemoDecks[1].cards[0], 6, 2, [{ id: 9302, name: digimonDemoDecks[1].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(digimonDemoDecks[1].cards[3], 5, 1, [{ id: 9302, name: digimonDemoDecks[1].name, section: 'main', quantity: 4 }]),
    buildCollectionItem(digimonDemoDecks[1].cards[10], 3, 1, [{ id: 9302, name: digimonDemoDecks[1].name, section: 'main', quantity: 2 }]),
  ],
};

export const getGuestDemoDecks = (activeTcgSlug) => GUEST_DECKS[activeTcgSlug] || [];

export const getGuestDemoDeckOptions = (activeTcgSlug) => (
  getGuestDemoDecks(activeTcgSlug).map((deck) => ({
    id: deck.id,
    name: deck.name,
    tgc_id: deck.tgc_id,
  }))
);

export const getGuestDemoCollection = (activeTcgSlug) => GUEST_COLLECTIONS[activeTcgSlug] || [];
