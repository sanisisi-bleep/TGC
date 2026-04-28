export const queryKeys = {
  sessionProfile: () => ['session', 'profile'],
  tgcCatalog: () => ['catalog', 'tgcs'],
  cardsSearch: (params) => ['cards', 'search', params],
  cardDetail: (cardId) => ['cards', 'detail', cardId],
  cardFacets: (tgcId) => ['cards', 'facets', tgcId],
  collection: (tgcId) => ['collection', tgcId],
  decks: (tgcId) => ['decks', tgcId],
  deckDetail: (deckId) => ['decks', 'detail', deckId],
  sharedDeck: (shareToken) => ['decks', 'shared', shareToken],
  adminUsers: () => ['settings', 'users'],
};

export default queryKeys;
