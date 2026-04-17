import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { getGameConfig } from '../tcgConfig';
import API_BASE from '../apiBase';

const normalize = (value) => (value || '').trim().toLowerCase();

const buildOrderedOptions = (values, preferredOrder = []) => {
  const available = [...new Set(values.filter(Boolean))];
  const preferred = preferredOrder.filter((value) => available.includes(value));
  const extra = available
    .filter((value) => !preferred.includes(value))
    .sort((a, b) => a.localeCompare(b));

  return [...preferred, ...extra].map((value) => ({ value, label: value }));
};

function Search({ activeTcgSlug, activeTgc }) {
  const activeGame = getGameConfig(activeTcgSlug);
  const [cards, setCards] = useState([]);
  const [decks, setDecks] = useState([]);
  const [filteredCards, setFilteredCards] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    type: '',
    color: '',
    rarity: '',
    expansion: '',
  });
  const [selectedCard, setSelectedCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [deckPickerCard, setDeckPickerCard] = useState(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [submittingDeckAction, setSubmittingDeckAction] = useState(false);

  useEffect(() => {
    const fetchCards = async () => {
      if (!activeTgc?.id) {
        return;
      }

      setLoading(true);

      try {
        const res = await axios.get(`${API_BASE}/cards`, {
          params: { tgc_id: activeTgc.id },
          headers: {
            Accept: 'application/json',
          },
        });

        setCards(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        console.error('Error al cargar cartas:', error);
        console.error('Respuesta backend:', error.response?.data);
      } finally {
        setLoading(false);
      }
    };

    fetchCards();
  }, [activeTcgSlug, activeTgc]);

  useEffect(() => {
    const fetchDecks = async () => {
      if (!activeTgc?.id) {
        return;
      }

      try {
        const res = await axios.get(`${API_BASE}/decks`, {
          params: { tgc_id: activeTgc.id },
        });
        const deckList = Array.isArray(res.data) ? res.data : [];
        setDecks(deckList);
      } catch (error) {
        console.error('Error al cargar mazos para el buscador:', error);
      }
    };

    fetchDecks();
  }, [activeTcgSlug, activeTgc]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 2400);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    let filtered = cards.filter((card) =>
      normalize(card.name).includes(normalize(searchTerm))
    );

    if (filters.type) {
      filtered = filtered.filter((card) => normalize(card.card_type) === normalize(filters.type));
    }

    if (filters.color) {
      filtered = filtered.filter((card) => normalize(card.color) === normalize(filters.color));
    }

    if (filters.rarity) {
      filtered = filtered.filter((card) => normalize(card.rarity) === normalize(filters.rarity));
    }

    if (filters.expansion) {
      filtered = filtered.filter((card) => normalize(card.set_name) === normalize(filters.expansion));
    }

    setFilteredCards(filtered);
  }, [cards, searchTerm, filters]);

  const handleAddToCollection = async (cardId) => {
    try {
      const token = localStorage.getItem('token');

      if (!token) {
        setToast({ type: 'error', message: 'Debes iniciar sesion para agregar cartas a tu coleccion' });
        return;
      }

      const parsedCardId = Number(cardId);

      if (!Number.isInteger(parsedCardId) || parsedCardId <= 0) {
        setToast({ type: 'error', message: 'Error: ID de carta invalido' });
        return;
      }

      const requestData = {
        card_id: parsedCardId,
        quantity: 1,
      };

      const response = await axios.post(
        `${API_BASE}/collection`,
        requestData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );

      console.log('Respuesta backend:', response.data);
      setToast({ type: 'success', message: 'Carta agregada a la coleccion' });
    } catch (error) {
      console.error('Error al agregar a la coleccion:', error);
      console.error('Status:', error.response?.status);
      console.error('Respuesta backend:', error.response?.data);

      if (error.response?.status === 401) {
        setToast({ type: 'error', message: 'Sesion expirada. Por favor, inicia sesion de nuevo.' });
        localStorage.removeItem('token');
        return;
      }

      if (error.response?.status === 422) {
        const detail = error.response?.data?.detail;

        if (Array.isArray(detail)) {
          const errorMsg = detail
            .map((d) => {
              const campo = d.loc ? d.loc.join(' -> ') : 'desconocido';
              return `${campo}: ${d.msg}`;
            })
            .join('\n');

          setToast({ type: 'error', message: `Error de validacion: ${errorMsg}` });
          return;
        }
      }

      let errorMsg = 'No se pudo agregar la carta a la coleccion';

      if (error.response?.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
          errorMsg = error.response.data.detail;
        } else {
          errorMsg = JSON.stringify(error.response.data.detail);
        }
      }

      setToast({ type: 'error', message: errorMsg });
    }
  };

  const handleAddToDeck = async (cardId) => {
    const card = cards.find((item) => item.id === cardId) || null;
    setDeckPickerCard(card);
    setNewDeckName(card ? `${card.name} Test` : '');
  };

  const addCardToExistingDeck = async (deckId) => {
    if (!deckPickerCard) {
      return;
    }

    setSubmittingDeckAction(true);

    try {
      await axios.post(`${API_BASE}/decks/${deckId}/cards`, {
        card_id: deckPickerCard.id,
        quantity: 1,
      });
      setToast({ type: 'success', message: 'Carta agregada al mazo' });
      setDeckPickerCard(null);
    } catch (error) {
      setToast({
        type: 'error',
        message: error.response?.data?.detail || 'No se pudo agregar la carta al mazo',
      });
    } finally {
      setSubmittingDeckAction(false);
    }
  };

  const createDeckAndAddCard = async () => {
    if (!deckPickerCard) {
      return;
    }

    const trimmedDeckName = newDeckName.trim();
    if (!trimmedDeckName) {
      setToast({ type: 'error', message: 'Pon un nombre al mazo nuevo' });
      return;
    }

    setSubmittingDeckAction(true);

    try {
      const createResponse = await axios.post(`${API_BASE}/decks`, {
        name: trimmedDeckName,
        tgc_id: activeTgc.id,
      });

      const deckId = createResponse.data?.id;
      if (!deckId) {
        throw new Error('Deck creation did not return an id');
      }

      await axios.post(`${API_BASE}/decks/${deckId}/cards`, {
        card_id: deckPickerCard.id,
        quantity: 1,
      });

      const res = await axios.get(`${API_BASE}/decks`, {
        params: { tgc_id: activeTgc.id },
      });
      setDecks(Array.isArray(res.data) ? res.data : []);
      setToast({ type: 'success', message: 'Mazo creado y carta agregada' });
      setDeckPickerCard(null);
      setNewDeckName('');
    } catch (error) {
      setToast({
        type: 'error',
        message: error.response?.data?.detail || 'No se pudo crear el mazo y agregar la carta',
      });
    } finally {
      setSubmittingDeckAction(false);
    }
  };

  const handleFilterChange = (filterName, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterName]: value,
    }));
  };

  const handleSearchChange = (value) => {
    setSearchTerm(value);
  };

  const uniqueExpansions = useMemo(() => {
    return [...new Set(cards.map((card) => card.set_name).filter(Boolean))];
  }, [cards]);

  const availableTypeOptions = useMemo(
    () => buildOrderedOptions(cards.map((card) => card.card_type), activeGame.filters.types),
    [activeGame.filters.types, cards]
  );

  const availableColorOptions = useMemo(
    () => buildOrderedOptions(cards.map((card) => card.color), activeGame.filters.colors),
    [activeGame.filters.colors, cards]
  );

  const availableRarityOptions = useMemo(() => {
    return [...new Set(cards.map((card) => card.rarity).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [cards]);

  if (loading) {
    return (
      <div className="search page-shell">
        <section className="page-hero">
          <div>
            <span className="eyebrow">{activeGame.eyebrow}</span>
            <h1>{activeGame.searchTitle}</h1>
            <p>Preparando el catalogo de {activeGame.shortName}...</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="search page-shell">
      {toast && (
        <div className={`floating-toast ${toast.type === 'error' ? 'is-error' : 'is-success'}`}>
          {toast.message}
        </div>
      )}

      <section className="page-hero search-hero">
        <div>
          <span className="eyebrow">{activeGame.eyebrow}</span>
          <h1>{activeGame.searchTitle}</h1>
          <p>
            Filtra el catalogo de {activeGame.shortName} por tipo, color, rareza y set
            para mover cartas directo a tu coleccion.
          </p>
        </div>

        <div className="hero-stat">
          <span>Cartas visibles</span>
          <strong>{filteredCards.length}</strong>
        </div>
      </section>

      <div className="search-controls">
        <input
          type="text"
          placeholder="Buscar por nombre..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
        />

        <select
          value={filters.type}
          onChange={(e) => handleFilterChange('type', e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {availableTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={filters.color}
          onChange={(e) => handleFilterChange('color', e.target.value)}
        >
          <option value="">Todos los colores</option>
          {availableColorOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={filters.rarity}
          onChange={(e) => handleFilterChange('rarity', e.target.value)}
        >
          <option value="">Todas las rarezas</option>
          {availableRarityOptions.map((rarity) => (
            <option key={rarity} value={rarity}>
              {rarity}
            </option>
          ))}
        </select>

        <select
          value={filters.expansion}
          onChange={(e) => handleFilterChange('expansion', e.target.value)}
        >
          <option value="">Todas las expansiones</option>
          {uniqueExpansions.map((exp) => (
            <option key={exp} value={exp}>
            {exp}
          </option>
        ))}
      </select>

      </div>

      <div className="cards-grid">
        {filteredCards.length > 0 ? (
          filteredCards.map((card) => (
            <div
              key={card.id}
              className="card-item"
              onClick={() => setSelectedCard(card)}
              style={{ cursor: 'pointer' }}
            >
              <img src={card.image_url} alt={card.name} />
              <h3>{card.name}</h3>
              <p>Tipo: {card.card_type || 'Sin tipo'}</p>
              <p>Rareza: {card.rarity || 'Sin rareza'}</p>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddToCollection(card.id);
                }}
              >
                Agregar a Coleccion
              </button>
              <button
                type="button"
                className="ghost-button card-secondary-action"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddToDeck(card.id);
                }}
              >
                Agregar al Mazo
              </button>
            </div>
          ))
        ) : (
          <p>No se encontraron cartas</p>
        )}
      </div>

      {selectedCard && (
        <div
          className="card-modal"
          onClick={() => setSelectedCard(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="card-detail"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              padding: '30px',
              borderRadius: '10px',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <img
              src={selectedCard.image_url}
              alt={selectedCard.name}
              className="large-image"
              style={{ width: '100%', marginBottom: '20px' }}
            />

            <h2>{selectedCard.name}</h2>
            <p><strong>Tipo:</strong> {selectedCard.card_type}</p>
            <p><strong>Color:</strong> {selectedCard.color}</p>
            <p><strong>Rareza:</strong> {selectedCard.rarity}</p>
            <p><strong>Set:</strong> {selectedCard.set_name}</p>
            {selectedCard.lv && <p><strong>Nivel:</strong> {selectedCard.lv}</p>}
            {selectedCard.cost && <p><strong>Costo:</strong> {selectedCard.cost}</p>}
            {selectedCard.ap && (
              <p>
                <strong>{activeTcgSlug === 'one-piece' ? 'Poder' : 'AP'}:</strong> {selectedCard.ap}
              </p>
            )}
            {selectedCard.hp && <p><strong>HP:</strong> {selectedCard.hp}</p>}
            {selectedCard.abilities && (
              <p><strong>{activeTcgSlug === 'one-piece' ? 'Texto' : 'Habilidades'}:</strong> {selectedCard.abilities}</p>
            )}
            {selectedCard.description && (
              <p><strong>Descripcion:</strong> {selectedCard.description}</p>
            )}

            <button
              type="button"
              className="ghost-button"
              onClick={() => handleAddToCollection(selectedCard.id)}
              style={{ marginTop: '20px', marginRight: '10px', padding: '10px 20px' }}
            >
              Agregar a Coleccion
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => handleAddToDeck(selectedCard.id)}
              style={{ marginTop: '20px', marginRight: '10px', padding: '10px 20px' }}
            >
              Agregar al Mazo
            </button>
            <button
              type="button"
              onClick={() => setSelectedCard(null)}
              style={{ marginTop: '20px', padding: '10px 20px' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {deckPickerCard && (
        <div className="card-modal" onClick={() => !submittingDeckAction && setDeckPickerCard(null)}>
          <div className="deck-picker-modal panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-panel-header">
              <h2>Anadir a mazo</h2>
              <p>Elige un mazo existente o crea uno nuevo para {deckPickerCard.name}.</p>
            </div>

            <div className="deck-picker-section">
              <span className="collection-panel-label">Mazos existentes</span>
              <div className="deck-picker-list">
                {decks.length > 0 ? (
                  decks.map((deck) => (
                    <button
                      key={deck.id}
                      type="button"
                      className="deck-picker-option"
                      onClick={() => addCardToExistingDeck(deck.id)}
                      disabled={submittingDeckAction}
                    >
                      <strong>{deck.name}</strong>
                      <span>Anadir 1 copia a este mazo</span>
                    </button>
                  ))
                ) : (
                  <p className="collection-empty-text">Todavia no tienes mazos de {activeGame.shortName}.</p>
                )}
              </div>
            </div>

            <div className="deck-picker-section">
              <span className="collection-panel-label">Crear mazo nuevo</span>
              <div className="deck-picker-create">
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder={`Nuevo mazo de ${activeGame.shortName}`}
                  maxLength={100}
                  disabled={submittingDeckAction}
                />
                <button type="button" onClick={createDeckAndAddCard} disabled={submittingDeckAction}>
                  {submittingDeckAction ? 'Procesando...' : 'Crear y anadir'}
                </button>
              </div>
            </div>

            <div className="settings-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDeckPickerCard(null)}
                disabled={submittingDeckAction}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Search;
