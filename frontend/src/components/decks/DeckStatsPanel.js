import React, { useEffect, useMemo, useState } from 'react';
import { getDeckColorPresentation, getDeckColorToneStops } from '../../utils/deckTools';

const CURVE_DISPLAY_STORAGE_KEY = 'deckCurveDisplayMode';
const CURVE_CHART_WIDTH = 720;
const CURVE_CHART_HEIGHT = 300;
const CURVE_CHART_MARGIN = {
  top: 24,
  right: 18,
  bottom: 40,
  left: 42,
};

const readStoredCurveDisplayMode = () => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 'chart';
  }

  const storedValue = window.localStorage.getItem(CURVE_DISPLAY_STORAGE_KEY);
  return storedValue === 'values' ? 'values' : 'chart';
};

const getCurveChartScaleMax = (...values) => {
  const maxValue = Math.max(...values.filter((value) => Number.isFinite(value)), 1);

  if (maxValue <= 5) {
    return 5;
  }

  if (maxValue <= 10) {
    return 10;
  }

  return Math.ceil(maxValue / 5) * 5;
};

function DeckCurveChart({ entries, averageCost, legendEntries }) {
  const chartEntries = useMemo(
    () => entries.filter((entry) => entry.label !== '?' || entry.total > 0),
    [entries]
  );
  const hasData = useMemo(
    () => chartEntries.some((entry) => entry.total > 0),
    [chartEntries]
  );
  const scaleMax = useMemo(
    () => getCurveChartScaleMax(...chartEntries.map((entry) => entry.total)),
    [chartEntries]
  );
  const gradientEntries = useMemo(() => {
    const gradients = new Map();

    chartEntries.forEach((entry) => {
      entry.segments.forEach((segment) => {
        const toneStops = getDeckColorToneStops(segment.label);
        if (toneStops.length < 2) {
          return;
        }

        if (!gradients.has(segment.label)) {
          gradients.set(segment.label, {
            label: segment.label,
            id: `deck-curve-gradient-${segment.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
            stops: toneStops,
          });
        }
      });
    });

    return [...gradients.values()];
  }, [chartEntries]);

  if (!hasData) {
    return <p className="collection-empty-text">Todavia no hay datos de coste para esta curva.</p>;
  }

  const plotWidth = CURVE_CHART_WIDTH - CURVE_CHART_MARGIN.left - CURVE_CHART_MARGIN.right;
  const plotHeight = CURVE_CHART_HEIGHT - CURVE_CHART_MARGIN.top - CURVE_CHART_MARGIN.bottom;
  const slotWidth = plotWidth / Math.max(chartEntries.length, 1);
  const barWidth = Math.min(40, Math.max(18, slotWidth * 0.42));
  const tickValues = Array.from({ length: 5 }, (_, index) => (scaleMax / 4) * index);

  return (
    <div className="deck-curve-chart-shell">
      <div className="deck-curve-chart-meta">
        <span className="deck-curve-axis-label">Cartas por coste</span>
        <div className="deck-curve-meta-values">
          {Number.isFinite(averageCost) && (
            <span className="deck-curve-average-copy">
              Coste medio {averageCost.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {legendEntries.length > 0 && (
        <div className="deck-curve-legend deck-curve-legend-inline">
          {legendEntries.map((entry) => {
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

      <div className="deck-curve-chart">
        <svg
          className="deck-curve-svg"
          viewBox={`0 0 ${CURVE_CHART_WIDTH} ${CURVE_CHART_HEIGHT}`}
          role="img"
          aria-label="Curva de coste del mazo"
        >
          <defs>
            {gradientEntries.map((gradient) => (
              <linearGradient
                key={gradient.id}
                id={gradient.id}
                x1="0%"
                y1="100%"
                x2="0%"
                y2="0%"
              >
                {gradient.stops.map((stopColor, index) => {
                  const offset = gradient.stops.length === 1
                    ? '100%'
                    : `${(index / (gradient.stops.length - 1)) * 100}%`;

                  return (
                    <stop
                      key={`${gradient.id}-${stopColor}-${offset}`}
                      offset={offset}
                      stopColor={stopColor}
                    />
                  );
                })}
              </linearGradient>
            ))}
          </defs>

          {tickValues.map((tickValue) => {
            const y = CURVE_CHART_MARGIN.top + plotHeight - ((tickValue / scaleMax) * plotHeight);
            return (
              <g key={`curve-tick-${tickValue}`}>
                <line
                  x1={CURVE_CHART_MARGIN.left}
                  y1={y}
                  x2={CURVE_CHART_WIDTH - CURVE_CHART_MARGIN.right}
                  y2={y}
                  className="deck-curve-grid-line"
                />
                <text
                  x={CURVE_CHART_MARGIN.left - 12}
                  y={y + 4}
                  className="deck-curve-grid-label"
                >
                  {Math.round(tickValue)}
                </text>
              </g>
            );
          })}

          <line
            x1={CURVE_CHART_MARGIN.left}
            y1={CURVE_CHART_HEIGHT - CURVE_CHART_MARGIN.bottom}
            x2={CURVE_CHART_WIDTH - CURVE_CHART_MARGIN.right}
            y2={CURVE_CHART_HEIGHT - CURVE_CHART_MARGIN.bottom}
            className="deck-curve-axis-line"
          />

          {chartEntries.map((entry, index) => {
            const totalHeight = (entry.total / scaleMax) * plotHeight;
            const x = CURVE_CHART_MARGIN.left + (index * slotWidth) + ((slotWidth - barWidth) / 2);
            const baseY = CURVE_CHART_HEIGHT - CURVE_CHART_MARGIN.bottom;
            let currentY = baseY;

            return (
              <g key={entry.label}>
                {entry.total > 0 && (
                  <text
                    x={x + (barWidth / 2)}
                    y={Math.max(CURVE_CHART_MARGIN.top - 2, baseY - totalHeight - 10)}
                    textAnchor="middle"
                    className="deck-curve-total-label"
                  >
                    {entry.total}
                  </text>
                )}

                {entry.segments.map((segment) => {
                  const segmentHeight = (segment.value / scaleMax) * plotHeight;
                  currentY -= segmentHeight;
                  const toneStops = getDeckColorToneStops(segment.label);
                  const fill = toneStops.length > 1
                    ? `url(#deck-curve-gradient-${segment.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()})`
                    : toneStops[0];

                  return (
                    <rect
                      key={`${entry.label}-${segment.label}`}
                      x={x}
                      y={currentY}
                      width={barWidth}
                      height={segmentHeight}
                      rx={4}
                      ry={4}
                      fill={fill}
                    >
                      <title>{`${entry.label} - ${segment.label}: ${segment.value}`}</title>
                    </rect>
                  );
                })}

                {entry.total > 0 && (
                  <rect
                    x={x}
                    y={baseY - totalHeight}
                    width={barWidth}
                    height={totalHeight}
                    rx={4}
                    ry={4}
                    className="deck-curve-bar-outline"
                  />
                )}

                <text
                  x={x + (barWidth / 2)}
                  y={CURVE_CHART_HEIGHT - 12}
                  textAnchor="middle"
                  className={`deck-curve-cost-label ${entry.total > 0 ? 'has-data' : 'is-empty'}`.trim()}
                >
                  {entry.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
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
              <p className="deck-curve-copy">Consulta la curva como valores rapidos o en una grafica vertical con el color de cada tramo, una linea de media por coste y el coste medio del mazo.</p>
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
              <DeckCurveChart
                entries={stats.curveChartEntries || []}
                averageCost={stats.averageCurveCost}
                legendEntries={curveLegendEntries}
              />
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
