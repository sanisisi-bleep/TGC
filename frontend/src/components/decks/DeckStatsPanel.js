import React, { useEffect, useMemo, useState } from 'react';
import { getDeckColorPresentation } from '../../utils/deckTools';

const CURVE_DISPLAY_STORAGE_KEY = 'deckCurveDisplayMode';

const readStoredCurveDisplayMode = () => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 'chart';
  }

  const storedValue = window.localStorage.getItem(CURVE_DISPLAY_STORAGE_KEY);
  return storedValue === 'values' ? 'values' : 'chart';
};

function DeckCurveChart({ entries }) {
  const maxValue = useMemo(
    () => Math.max(...entries.map((entry) => entry.total), 1),
    [entries]
  );

  if (entries.length === 0) {
    return <p className="collection-empty-text">Todavia no hay datos de coste para esta curva.</p>;
  }

  return (
    <div className="deck-curve-chart">
      {entries.map((entry) => {
        const rowWidth = `${Math.max((entry.total / maxValue) * 100, 8)}%`;

        return (
          <article key={entry.label} className="deck-curve-row">
            <span className="deck-curve-cost">{entry.label}</span>

            <div className="deck-curve-track" aria-label={`Coste ${entry.label}: ${entry.total} cartas`}>
              <div className="deck-curve-fill" style={{ width: rowWidth }}>
                {entry.segments.map((segment) => {
                  const presentation = getDeckColorPresentation(segment.label);
                  return (
                    <span
                      key={`${entry.label}-${segment.label}`}
                      className="deck-curve-segment"
                      style={{
                        ...presentation.style,
                        width: `${segment.share * 100}%`,
                      }}
                      title={`${segment.label}: ${segment.value}`}
                    />
                  );
                })}
              </div>
            </div>
            <strong className="deck-curve-total">{entry.total}</strong>
          </article>
        );
      })}
    </div>
  );
}

function DeckStatsPanel({ stats }) {
  const [curveDisplayMode, setCurveDisplayMode] = useState(readStoredCurveDisplayMode);
  const curveLegendEntries = useMemo(() => {
    const legendMap = new Map();

    (stats?.curveChartEntries || []).forEach((entry) => {
      entry.segments.forEach((segment) => {
        legendMap.set(segment.label, (legendMap.get(segment.label) || 0) + segment.value);
      });
    });

    return [...legendMap.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => {
        if (right.value !== left.value) {
          return right.value - left.value;
        }

        return left.label.localeCompare(right.label);
      });
  }, [stats?.curveChartEntries]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }

    window.localStorage.setItem(CURVE_DISPLAY_STORAGE_KEY, curveDisplayMode);
  }, [curveDisplayMode]);

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
        <div className="deck-stat-block is-curve">
          <div className="deck-curve-header">
            <div>
              <h3>Curva de coste</h3>
              <p className="deck-curve-copy">Consulta la curva como valores rapidos o en grafica con el color de cada tramo.</p>
            </div>
            <div className="view-toggle deck-curve-toggle" role="tablist" aria-label="Vista de curva del mazo">
              <button
                type="button"
                className={curveDisplayMode === 'chart' ? 'is-active' : ''}
                onClick={() => setCurveDisplayMode('chart')}
              >
                Grafica
              </button>
              <button
                type="button"
                className={curveDisplayMode === 'values' ? 'is-active' : ''}
                onClick={() => setCurveDisplayMode('values')}
              >
                Valores
              </button>
            </div>
          </div>

          {curveDisplayMode === 'chart' ? (
            <>
              <DeckCurveChart entries={stats.curveChartEntries || []} />
              {curveLegendEntries.length > 0 && (
                <div className="deck-curve-legend deck-curve-legend-global">
                  {curveLegendEntries.map((entry) => {
                    const presentation = getDeckColorPresentation(entry.label);
                    return (
                      <span
                        key={`curve-legend-${entry.label}`}
                        className="deck-curve-legend-chip"
                        style={presentation.style}
                      >
                        {entry.label} x{entry.value}
                      </span>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="deck-stat-chip-list">
              {stats.curveEntries.map(([label, value]) => (
                <span key={label} className="deck-stat-chip">
                  {label}: {value}
                </span>
              ))}
            </div>
          )}
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
