export const queryKeys = {
  sessionProfile: () => ['session', 'profile'],
  tgcCatalog: () => ['catalog', 'tgcs'],
  cardsSearch: (params) => ['cards', 'search', params],
  cardResolve: (tgcId, query) => ['cards', 'resolve', tgcId, query],
  cardDetail: (cardId) => ['cards', 'detail', cardId],
  publicCard: (tgcSlug, sourceCardId) => ['public', 'card', tgcSlug, sourceCardId],
  publicSet: (tgcSlug, setCode) => ['public', 'set', tgcSlug, setCode],
  cardFacets: (tgcId) => ['cards', 'facets', tgcId],
  collection: (tgcId) => ['collection', tgcId],
  decks: (tgcId) => ['decks', tgcId],
  deckFolders: (tgcId) => ['decks', 'folders', tgcId],
  deckOptions: (tgcId) => ['decks', 'options', tgcId],
  searchDeckOptions: (tgcId) => ['decks', 'search-options', tgcId],
  deckDetail: (deckId) => ['decks', 'detail', deckId],
  deckHistory: (deckId) => ['decks', 'history', deckId],
  deckHistoryVersion: (deckId, versionId) => ['decks', 'history', deckId, versionId],
  sharedDeck: (shareToken) => ['decks', 'shared', shareToken],
  adminUsers: () => ['settings', 'users'],
};

export default queryKeys;
