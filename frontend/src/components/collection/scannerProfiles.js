export const SCANNER_TEXT_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/ ';

export const DEFAULT_CARD_FRAME_RATIO = 744 / 1039;

const DEFAULT_CARD_BOUND_TEMPLATES = [
  { widthRatio: 0.56, centerX: 0.5, centerY: 0.5 },
  { widthRatio: 0.48, centerX: 0.5, centerY: 0.5 },
  { widthRatio: 0.42, centerX: 0.5, centerY: 0.5 },
  { widthRatio: 0.64, centerX: 0.5, centerY: 0.5 },
  { widthRatio: 0.50, centerX: 0.5, centerY: 0.44 },
  { widthRatio: 0.50, centerX: 0.5, centerY: 0.56 },
  { widthRatio: 0.44, centerX: 0.46, centerY: 0.5 },
  { widthRatio: 0.44, centerX: 0.54, centerY: 0.5 },
  { widthRatio: 0.72, centerX: 0.5, centerY: 0.5 },
];

const GUNDAM_CARD_BOUND_TEMPLATES = [
  { widthRatio: 0.50, centerX: 0.5, centerY: 0.5 },
  { widthRatio: 0.46, centerX: 0.5, centerY: 0.52 },
  { widthRatio: 0.56, centerX: 0.5, centerY: 0.5 },
  { widthRatio: 0.42, centerX: 0.5, centerY: 0.53 },
  { widthRatio: 0.38, centerX: 0.5, centerY: 0.54 },
  { widthRatio: 0.34, centerX: 0.5, centerY: 0.54 },
  { widthRatio: 0.42, centerX: 0.46, centerY: 0.53 },
  { widthRatio: 0.42, centerX: 0.54, centerY: 0.53 },
  { widthRatio: 0.48, centerX: 0.48, centerY: 0.54 },
  { widthRatio: 0.48, centerX: 0.52, centerY: 0.54 },
  { widthRatio: 0.62, centerX: 0.5, centerY: 0.5 },
];

const DEFAULT_IGNORED_NAME_FRAGMENTS = [
  'activate',
  'during',
  'once per turn',
  'when',
  'counter',
  'main',
  'reaction',
  'predict',
  'cost',
  'unit',
  'leader',
  'spell',
  'space',
  'earth',
  'link',
  'made in japan',
  'bandai',
];

export const DEFAULT_SCANNER_PROFILE = {
  slug: 'default',
  examples: 'Escribe el codigo o nombre de la carta',
  guide: 'Centra la carta',
  cardFrameRatio: DEFAULT_CARD_FRAME_RATIO,
  cardBoundTemplates: DEFAULT_CARD_BOUND_TEMPLATES,
  maxCodeRegions: 14,
  maxNameRegions: 8,
  maxCardBoundsForRegions: 5,
  ignoredNameFragments: DEFAULT_IGNORED_NAME_FRAGMENTS,
  codePatterns: [],
  fullFrameRegions: [
    { label: 'zona superior completa', x: 0.04, y: 0.02, width: 0.92, height: 0.22, scale: 2 },
    { label: 'zona inferior completa', x: 0.04, y: 0.72, width: 0.92, height: 0.24, scale: 2 },
  ],
  regions: [
    { label: 'codigo inferior', x: 0.03, y: 0.76, width: 0.94, height: 0.2, scale: 3.6 },
    { label: 'nombre superior', x: 0.04, y: 0.05, width: 0.92, height: 0.16, scale: 3, mode: 'name' },
  ],
};

export const SCANNER_PROFILES = {
  gundam: {
    slug: 'gundam',
    examples: 'GD04-018, GD02-002, GD01-001-P1, EXB-001, R-001',
    guide: 'Gundam: prioriza esquina superior derecha o nombre central',
    cardFrameRatio: DEFAULT_CARD_FRAME_RATIO,
    cardBoundTemplates: GUNDAM_CARD_BOUND_TEMPLATES,
    maxCodeRegions: 18,
    maxNameRegions: 8,
    maxCardBoundsForRegions: 5,
    ignoredNameFragments: [
      ...DEFAULT_IGNORED_NAME_FRAGMENTS,
      'breach',
      'resource',
      'shield',
      'damage',
      'academy',
      'zechs',
    ],
    codePatterns: [
      /\b(?:GD|6D|G0|GO|ST)[0-9OILSB]{2}\s*[-_ ]?\s*[0-9OILSB]{3}(?:\s*[-_ ]?\s*P[0-9OILSB]{1,2})?/i,
      /\b(?:EXB|EXR|R)\s*[-_ ]?\s*[0-9OILSB]{3}(?:\s*[-_ ]?\s*P[0-9OILSB]{1,2})?/i,
    ],
    fullFrameRegions: [
      { label: 'imagen tercio superior derecho', x: 0.48, y: 0.14, width: 0.44, height: 0.24, scale: 2.3 },
      { label: 'imagen superior central derecha', x: 0.34, y: 0.18, width: 0.50, height: 0.20, scale: 2.2 },
      { label: 'imagen superior derecha', x: 0.42, y: 0.02, width: 0.56, height: 0.18, scale: 2.2 },
      { label: 'imagen superior completa', x: 0.08, y: 0.02, width: 0.90, height: 0.20, scale: 1.8 },
      { label: 'imagen centro superior derecha', x: 0.44, y: 0.10, width: 0.54, height: 0.24, scale: 2 },
      { label: 'imagen banda media nombre', x: 0.14, y: 0.38, width: 0.72, height: 0.20, scale: 1.8, mode: 'name' },
      { label: 'imagen inferior completa', x: 0.06, y: 0.72, width: 0.90, height: 0.24, scale: 1.8 },
    ],
    regions: [
      { label: 'codigo superior derecho fino', x: 0.52, y: 0.00, width: 0.47, height: 0.105, scale: 5.2 },
      { label: 'codigo superior derecho amplio', x: 0.46, y: 0.00, width: 0.53, height: 0.14, scale: 4.6 },
      { label: 'codigo superior derecho completo', x: 0.38, y: 0.00, width: 0.60, height: 0.18, scale: 4.2 },
      { label: 'cabecera completa', x: 0.03, y: 0.00, width: 0.96, height: 0.16, scale: 3.5 },
      { label: 'cabecera alta', x: 0.00, y: 0.00, width: 1.00, height: 0.22, scale: 3.1 },
      { label: 'codigo lateral derecho', x: 0.82, y: 0.08, width: 0.17, height: 0.62, scale: 3.8 },
      { label: 'codigo inferior completo', x: 0.03, y: 0.76, width: 0.94, height: 0.2, scale: 3.8 },
      { label: 'codigo inferior izquierdo', x: 0.02, y: 0.78, width: 0.5, height: 0.18, scale: 4.2 },
      { label: 'codigo inferior derecho', x: 0.48, y: 0.78, width: 0.5, height: 0.18, scale: 4.2 },
      { label: 'nombre central', x: 0.08, y: 0.50, width: 0.84, height: 0.13, scale: 3.6, mode: 'name' },
      { label: 'nombre inferior', x: 0.08, y: 0.57, width: 0.84, height: 0.12, scale: 3.6, mode: 'name' },
    ],
  },
  'one-piece': {
    slug: 'one-piece',
    examples: 'OP16-001, ST21-001, EB02-001, P-001, DON-101',
    guide: 'One Piece: codigo inferior derecho',
    cardFrameRatio: DEFAULT_CARD_FRAME_RATIO,
    cardBoundTemplates: DEFAULT_CARD_BOUND_TEMPLATES,
    maxCodeRegions: 14,
    maxNameRegions: 8,
    ignoredNameFragments: DEFAULT_IGNORED_NAME_FRAGMENTS,
    codePatterns: [
      /\b(?:OP|0P|ST|EB|PRB)[0-9OILSB]{2}\s*[-_ ]?\s*[0-9OILSB]{3}(?:\s*[-_ ]?\s*P[0-9OILSB]{1,2})?\b/i,
      /\bP\s*[-_ ]?\s*[0-9OILSB]{3}\b/i,
      /\b(?:DON|D0N)\s*[-_ ]?\s*[0-9OILSB]{1,3}\b/i,
    ],
    regions: [
      { label: 'codigo inferior derecho', x: 0.54, y: 0.82, width: 0.44, height: 0.14, scale: 4.4 },
      { label: 'codigo inferior completo', x: 0.38, y: 0.82, width: 0.6, height: 0.14, scale: 4.1 },
      { label: 'codigo bajo imagen', x: 0.03, y: 0.46, width: 0.94, height: 0.16, scale: 3.8 },
      { label: 'codigo inferior', x: 0.03, y: 0.76, width: 0.94, height: 0.2, scale: 3.8 },
      { label: 'nombre inferior', x: 0.08, y: 0.68, width: 0.84, height: 0.13, scale: 3.4, mode: 'name' },
      { label: 'nombre superior', x: 0.04, y: 0.06, width: 0.92, height: 0.14, scale: 3, mode: 'name' },
    ],
  },
  digimon: {
    slug: 'digimon',
    examples: 'BT12-002, BT12-002-P0, ST2-13-P2',
    guide: 'Digimon: codigo inferior derecho',
    cardFrameRatio: DEFAULT_CARD_FRAME_RATIO,
    cardBoundTemplates: DEFAULT_CARD_BOUND_TEMPLATES,
    maxCodeRegions: 14,
    maxNameRegions: 8,
    ignoredNameFragments: DEFAULT_IGNORED_NAME_FRAGMENTS,
    codePatterns: [
      /\b(?:BT|EX|ST|LM|RB|AD)[0-9OILSB]{1,2}\s*[-_ ]?\s*[0-9OILSB]{2,3}(?:\s*[-_ ]?\s*P[0-9OILSB]{1,2})?\b/i,
      /\bP\s*[-_ ]?\s*[0-9OILSB]{3}\b/i,
    ],
    regions: [
      { label: 'codigo inferior derecho', x: 0.55, y: 0.82, width: 0.43, height: 0.13, scale: 4.6 },
      { label: 'codigo inferior completo', x: 0.03, y: 0.78, width: 0.94, height: 0.18, scale: 3.8 },
      { label: 'codigo inferior izquierdo', x: 0.02, y: 0.78, width: 0.5, height: 0.18, scale: 4 },
      { label: 'nombre inferior', x: 0.16, y: 0.83, width: 0.56, height: 0.11, scale: 3.6, mode: 'name' },
      { label: 'nombre superior', x: 0.04, y: 0.05, width: 0.92, height: 0.14, scale: 3, mode: 'name' },
    ],
  },
  riftbound: {
    slug: 'riftbound',
    examples: 'UNL-131/219, OGN-001/298, OGN-007A/298',
    guide: 'Riftbound: set y numero inferior',
    cardFrameRatio: DEFAULT_CARD_FRAME_RATIO,
    cardBoundTemplates: DEFAULT_CARD_BOUND_TEMPLATES,
    maxCodeRegions: 14,
    maxNameRegions: 8,
    ignoredNameFragments: DEFAULT_IGNORED_NAME_FRAGMENTS,
    codePatterns: [
      /\b[A-Z]{3}\s*[^A-Z0-9]{0,4}\s*[0-9OILSB]{1,3}[A-Z]?(?:\s*\/\s*[0-9OILSB]{1,3})?\b/i,
      /\b[A-Z]{3}[0-9OILSB]{1,3}[A-Z]?\s*\/\s*[0-9OILSB]{1,3}\b/i,
    ],
    regions: [
      { label: 'collector inferior izquierdo', x: 0.03, y: 0.89, width: 0.42, height: 0.08, scale: 5 },
      { label: 'collector inferior', x: 0.03, y: 0.76, width: 0.94, height: 0.2, scale: 3.8 },
      { label: 'collector inferior derecho', x: 0.42, y: 0.78, width: 0.56, height: 0.18, scale: 4 },
      { label: 'nombre medio', x: 0.08, y: 0.38, width: 0.84, height: 0.14, scale: 3.4, mode: 'name' },
      { label: 'nombre superior', x: 0.04, y: 0.05, width: 0.92, height: 0.16, scale: 3, mode: 'name' },
    ],
  },
};

export const getScannerProfile = (activeTcgSlug) => ({
  ...DEFAULT_SCANNER_PROFILE,
  ...(SCANNER_PROFILES[activeTcgSlug] || {}),
});
