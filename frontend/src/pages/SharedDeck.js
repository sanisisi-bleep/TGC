import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import API_BASE from '../apiBase';

function SharedDeck() {
  const { shareToken } = useParams();
  const navigate = useNavigate();
  const [deck, setDeck] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSharedDeck = async () => {
      try {
        const response = await axios.get(`${API_BASE}/decks/shared/${shareToken}`);
        setDeck(response.data);
      } catch (error) {
        console.error('Error al cargar el mazo compartido:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSharedDeck();
  }, [shareToken]);

  if (loading) {
    return (
      <div className="page-shell">
        <section className="page-hero">
          <div>
            <span className="eyebrow">Compartido</span>
            <h1>Cargando mazo...</h1>
          </div>
        </section>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="page-shell">
        <section className="page-hero">
          <div>
            <span className="eyebrow">Compartido</span>
            <h1>Mazo no encontrado</h1>
            <p>El enlace no existe o ya no esta disponible.</p>
          </div>
          <button type="button" className="ghost-button" onClick={() => navigate('/')}>
            Volver al inicio
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div>
          <span className="eyebrow">Mazo compartido</span>
          <h1>{deck.name}</h1>
          <p>
            {deck.tgc_name} · {deck.cards?.length || 0} cartas distintas · {deck.total_cards || 0} cartas en total
          </p>
        </div>

        <div className="hero-stat">
          <span>Progreso</span>
          <strong>{deck.total_cards || 0}/{deck.max_cards || 50}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="deck-status-row">
          <span className={`deck-status-chip ${deck.is_complete ? 'is-complete' : 'is-incomplete'}`}>
            {deck.is_complete ? 'Mazo completo' : 'Mazo incompleto'}
          </span>
        </div>

        <div className="deck-detail-grid">
          {(deck.cards || []).map((card) => (
            <article key={`${card.id}-${card.quantity}`} className="deck-card-row">
              <img src={card.image_url} alt={card.name} />
              <div className="deck-card-copy">
                <h4>{card.name}</h4>
                <p>{[card.card_type || 'Sin tipo', card.color || 'Sin color', card.rarity || 'Sin rareza'].join(' · ')}</p>
                <span>{card.set_name || 'Set desconocido'}</span>
              </div>
              <div className="deck-card-controls">
                <div className="deck-card-qty">x{card.quantity}</div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default SharedDeck;
