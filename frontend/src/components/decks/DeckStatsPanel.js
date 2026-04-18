import React from 'react';

function DeckStatsPanel({ stats }) {
  if (!stats) {
    return null;
  }

  return (
    <section className="deck-stats-panel">
      <div className="deck-stats-summary">
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
      </div>

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
