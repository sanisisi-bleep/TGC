export const queryKeys = {
  sessionProfile: () => ['session', 'profile'],
  tgcCatalog: () => ['catalog', 'tgcs'],
  cardsSearch: (params) => ['cards', 'search', params],
  cardDetail: (cardId) => ['cards', 'detail', cardId],
  cardFacets: (tgcId) => ['cards', 'facets', tgcId],
  collection: (tgcId) => ['collection', tgcId],
  decks: (tgcId) => ['decks', tgcId],
  deckOptions: (tgcId) => ['decks', 'options', tgcId],
  searchDeckOptions: (tgcId) => ['decks', 'search-options', tgcId],
  deckDetail: (deckId) => ['decks', 'detail', deckId],
  deckHistory: (deckId) => ['decks', 'history', deckId],
  deckHistoryVersion: (deckId, versionId) => ['decks', 'history', deckId, versionId],
  sharedDeck: (shareToken) => ['decks', 'shared', shareToken],
  adminUsers: () => ['settings', 'users'],
};

export default queryKeys;
