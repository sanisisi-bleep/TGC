export const DEFAULT_TCG_SLUG = 'gundam';

export const GAME_CONFIGS = {
  gundam: {
    slug: 'gundam',
    name: 'Gundam Card Game',
    shortName: 'Gundam',
    searchTitle: 'Buscar Cartas de Gundam',
    collectionTitle: 'Hangar de Gundam',
    decksTitle: 'Mazos de Gundam',
    eyebrow: 'Hangar',
    accentClass: 'game-card-active',
    available: true,
    description: 'Coleccion, buscador y mazos listos para el frente de combate Gundam.',
    palette: 'theme-gundam',
    filters: {
      types: ['UNIT', 'PILOT', 'COMMAND', 'BASE', 'RESOURCE', 'EX BASE', 'EX RESOURCE', 'UNIT TOKEN'],
      colors: ['Blue', 'Green', 'Red', 'Purple', 'White'],
    },
  },
  'one-piece': {
    slug: 'one-piece',
    name: 'One Piece Card Game',
    shortName: 'One Piece',
    searchTitle: 'Buscar Cartas de One Piece',
    collectionTitle: 'Mi Coleccion',
    decksTitle: 'Mazos de One Piece',
    eyebrow: 'Tripulacion',
    accentClass: 'game-card-onepiece',
    available: true,
    description: 'Navega tu coleccion, gestiona mazos y prepara la cubierta para cada partida de OP.',
    palette: 'theme-one-piece',
    filters: {
      types: ['LEADER', 'CHARACTER', 'EVENT', 'STAGE', 'DON!!'],
      colors: ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'],
    },
  },
  digimon: {
    slug: 'digimon',
    name: 'Digimon Card Game',
    shortName: 'Digimon',
    searchTitle: 'Buscar Cartas de Digimon',
    collectionTitle: 'Archivo Digimon',
    decksTitle: 'Mazos de Digimon',
    eyebrow: 'Digivice',
    accentClass: 'game-card-digimon',
    available: true,
    description: 'Controla tu archivo digital, ajusta Digi-Eggs y afina listas de Digimon sin salir del mismo panel.',
    palette: 'theme-digimon',
    filters: {
      types: ['Digimon', 'Digi-Egg', 'Tamer', 'Option'],
      colors: ['Red', 'Blue', 'Yellow', 'Green', 'White', 'Black', 'Purple'],
    },
  },
  magic: {
    slug: 'magic',
    name: 'Magic: The Gathering',
    shortName: 'Magic',
    searchTitle: 'Buscar Cartas de Magic',
    collectionTitle: 'Archivo de Magic',
    decksTitle: 'Mazos de Magic',
    eyebrow: 'Multiverso',
    accentClass: 'game-card-magic',
    available: false,
    description: 'Base preparada para formatos, colecciones y listas multiverso.',
    palette: 'theme-magic',
    filters: {
      types: [],
      colors: [],
    },
  },
};

export function getGameConfig(slug) {
  return GAME_CONFIGS[slug] || GAME_CONFIGS[DEFAULT_TCG_SLUG];
}

export function resolveTcgSlug(name = '') {
  const normalized = name.trim().toLowerCase();

  if (normalized.includes('one piece')) {
    return 'one-piece';
  }

  if (normalized.includes('digimon')) {
    return 'digimon';
  }

  if (normalized.includes('magic')) {
    return 'magic';
  }

  return 'gundam';
}

export function buildTcgMap(tgcList = []) {
  return tgcList.reduce((acc, item) => {
    const slug = resolveTcgSlug(item.name);
    acc[slug] = item;
    return acc;
  }, {});
}
