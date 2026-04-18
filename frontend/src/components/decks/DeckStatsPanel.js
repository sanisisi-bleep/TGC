import React from 'react';

function DeckStatsPanel({ stats }) {
  if (!stats) {
    return null;
  }

  const isOnePieceDeck = stats.formatMode === 'one-piece';
  const leaderReady = stats.leaderCards === stats.requiredLeaderCards;
  const mainDeckReady = stats.mainDeckCards === stats.requiredMainDeckCards;
  const donReady = stats.donCards === 0 || stats.donCards === stats.recommendedDonCards;
  const colorReady = stats.offColorCards.length === 0 && stats.leaderColorLabels.length > 0;

  return (
    <section className="deck-stats-panel">
      <div className="deck-stats-summary">
        {isOnePieceDeck ? (
          <>
            <article className={`deck-stat-card ${leaderReady ? 'is-valid' : 'is-warning'}`}>
              <span>Leader</span>
              <strong>{stats.leaderCards}/{stats.requiredLeaderCards}</strong>
            </article>
            <article className={`deck-stat-card ${mainDeckReady ? 'is-valid' : 'is-warning'}`}>
              <span>Main Deck</span>
              <strong>{stats.mainDeckCards}/{stats.requiredMainDeckCards}</strong>
            </article>
            <article className={`deck-stat-card ${donReady ? 'is-valid' : 'is-warning'}`}>
              <span>DON!! opcional</span>
              <strong>{stats.donCards}/{stats.recommendedDonCards}</strong>
            </article>
            <article className={`deck-stat-card ${colorReady ? 'is-valid' : 'is-warning'}`}>
              <span>Color del Leader</span>
              <strong>{colorReady ? 'OK' : 'Revisar'}</strong>
            </article>
          </>
        ) : (
          <>
            <article className="deck-stat-card">
              <span>Cartas distintas</span>
              <strong>{stats.uniqueCards}</strong>
            </article>
            <article className="deck-stat-card">
              <span>Total en mazo</span>
              <strong>{stats.totalCards}</strong>
            </article>
            <article className="deck-stat-card">
              <span>Copias cubiertas</span>
              <strong>{stats.coveredCopies}</strong>
            </article>
            <article className="deck-stat-card">
              <span>Copias faltantes</span>
              <strong>{stats.missingCopies}</strong>
            </article>
          </>
        )}
      </div>

      {isOnePieceDeck && (
        <div className="deck-rules-panel">
          <div className="deck-rule-meter">
            <span className="deck-rule-label">Colores permitidos</span>
            <div className="deck-stat-chip-list">
              {stats.leaderColorLabels.length > 0 ? (
                stats.leaderColorLabels.map((label) => (
                  <span key={label} className="deck-stat-chip">
                    {label}
                  </span>
                ))
              ) : (
                <span className="deck-stat-chip is-warning">Selecciona 1 Leader</span>
              )}
            </div>
          </div>

          <div className="deck-rule-meter">
            <span className="deck-rule-label">Estado de construccion</span>
            <div className="deck-stat-chip-list">
              <span className={`deck-stat-chip ${leaderReady ? 'is-ok' : 'is-warning'}`}>
                Leader {stats.leaderCards}/{stats.requiredLeaderCards}
              </span>
              <span className={`deck-stat-chip ${mainDeckReady ? 'is-ok' : 'is-warning'}`}>
                Main {stats.mainDeckCards}/{stats.requiredMainDeckCards}
              </span>
              <span className={`deck-stat-chip ${donReady ? 'is-ok' : 'is-warning'}`}>
                DON {stats.donCards}/{stats.recommendedDonCards}
              </span>
            </div>
          </div>

          {stats.offColorCards.length > 0 && (
            <div className="deck-rule-meter is-danger">
              <span className="deck-rule-label">Cartas fuera de color</span>
              <div className="deck-stat-chip-list">
                {stats.offColorCards.slice(0, 6).map((card) => (
                  <span key={`${card.id}-${card.name}`} className="deck-stat-chip is-danger">
                    {card.name} x{card.quantity}
                  </span>
                ))}
              </div>
            </div>
          )}

          {stats.copyLimitExceededCards.length > 0 && (
            <div className="deck-rule-meter is-danger">
              <span className="deck-rule-label">Copias por encima del limite</span>
              <div className="deck-stat-chip-list">
                {stats.copyLimitExceededCards.slice(0, 6).map((card) => (
                  <span key={card.source_card_id} className="deck-stat-chip is-danger">
                    {card.source_card_id} x{card.quantity}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="deck-stats-grid">
        <div className="deck-stat-block">
          <h3>Curva</h3>
          <div className="deck-stat-chip-list">
            {stats.curveEntries.map(([label, value]) => (
              <span key={label} className="deck-stat-chip">
                {label}: {value}
              </span>
            ))}
          </div>
        </div>

        <div className="deck-stat-block">
          <h3>Tipos</h3>
          <div className="deck-stat-chip-list">
            {stats.typeEntries.slice(0, 6).map(([label, value]) => (
              <span key={label} className="deck-stat-chip">
                {label}: {value}
              </span>
            ))}
          </div>
        </div>

        <div className="deck-stat-block">
          <h3>Colores</h3>
          <div className="deck-stat-chip-list">
            {stats.colorEntries.slice(0, 6).map(([label, value]) => (
              <span key={label} className="deck-stat-chip">
                {label}: {value}
              </span>
            ))}
          </div>
        </div>

        <div className="deck-stat-block">
          <h3>Sets</h3>
          <div className="deck-stat-chip-list">
            {stats.setEntries.slice(0, 6).map(([label, value]) => (
              <span key={label} className="deck-stat-chip">
                {label}: {value}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default DeckStatsPanel;
