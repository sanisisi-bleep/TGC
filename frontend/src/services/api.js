import apiClient from '../apiClient';

export const getSessionProfile = async () => {
  const response = await apiClient.get('/auth/session');
  return response.data?.user || null;
};

export const getTgcCatalog = async () => {
  const response = await apiClient.get('/tgc');
  return Array.isArray(response.data) ? response.data : [];
};

export const registerUser = async (payload) => {
  const response = await apiClient.post('/auth/register', payload);
  return response.data || null;
};

export const loginUser = async (payload) => {
  const response = await apiClient.post('/auth/token', payload);
  return response.data || null;
};

export const logoutUser = async () => {
  const response = await apiClient.post('/auth/logout');
  return response.data || null;
};

export const getCards = async (params, signal) => {
  const response = await apiClient.get('/cards', { params, signal });
  return response.data || null;
};

export const getCardFacets = async (tgcId, signal) => {
  const response = await apiClient.get('/cards/facets', {
    params: { tgc_id: tgcId },
    signal,
  });
  return response.data || null;
};

export const getCollection = async (tgcId, signal) => {
  const response = await apiClient.get('/collection', {
    params: { tgc_id: tgcId },
    signal,
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const addCardToCollection = async (payload) => {
  const response = await apiClient.post('/collection', payload);
  return response.data || null;
};

export const adjustCollectionCard = async (cardId, delta) => {
  const response = await apiClient.post(`/collection/${cardId}/adjust`, { delta });
  return response.data || null;
};

export const getDecks = async (tgcId, signal) => {
  const response = await apiClient.get('/decks', {
    params: { tgc_id: tgcId },
    signal,
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const getDeckDetail = async (deckId, signal) => {
  const response = await apiClient.get(`/decks/${deckId}`, { signal });
  return response.data || null;
};

export const createDeck = async (payload) => {
  const response = await apiClient.post('/decks', payload);
  return response.data || null;
};

export const deleteDeck = async (deckId) => {
  const response = await apiClient.delete(`/decks/${deckId}`);
  return response.data || null;
};

export const cloneDeck = async (deckId) => {
  const response = await apiClient.post(`/decks/${deckId}/clone`);
  return response.data || null;
};

export const shareDeck = async (deckId) => {
  const response = await apiClient.post(`/decks/${deckId}/share`);
  return response.data || null;
};

export const importDeck = async (payload) => {
  const response = await apiClient.post('/decks/import', payload);
  return response.data || null;
};

export const renameDeck = async (deckId, payload) => {
  const response = await apiClient.patch(`/decks/${deckId}`, payload);
  return response.data || null;
};

export const addCardToDeck = async (deckId, payload) => {
  const response = await apiClient.post(`/decks/${deckId}/cards`, payload);
  return response.data || null;
};

export const adjustDeckCard = async (deckId, cardId, delta) => {
  const response = await apiClient.post(`/decks/${deckId}/cards/${cardId}/adjust`, { delta });
  return response.data || null;
};

export const adjustDeckAssignment = async (deckId, cardId, delta) => {
  const response = await apiClient.post(`/decks/${deckId}/cards/${cardId}/assignment`, { delta });
  return response.data || null;
};

export const getSharedDeck = async (shareToken, signal) => {
  const response = await apiClient.get(`/decks/shared/${shareToken}`, { signal });
  return response.data || null;
};

export const updateProfile = async (payload) => {
  const response = await apiClient.patch('/settings/me', payload);
  return response.data || null;
};

export const changePassword = async (payload) => {
  const response = await apiClient.post('/settings/password', payload);
  return response.data || null;
};

export const getAdminUsers = async () => {
  const response = await apiClient.get('/settings/users');
  return Array.isArray(response.data) ? response.data : [];
};

export const updateAdminUserRole = async (userId, role) => {
  const response = await apiClient.patch(`/settings/users/${userId}/role`, { role });
  return response.data || null;
};

export const deleteAccount = async (password) => {
  const response = await apiClient.delete('/settings/me', {
    data: { password },
  });
  return response.data || null;
};
