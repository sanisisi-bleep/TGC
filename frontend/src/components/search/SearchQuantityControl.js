import React from 'react';

function SearchQuantityControl({
  value,
  onChange,
  onBlur,
  onDecrease,
  onIncrease,
  disabled = false,
  label = 'Copias',
  hint = '',
  compact = false,
}) {
  return (
    <div
      className={`search-quantity-panel ${compact ? 'is-compact' : ''}`}
      onClick={(event) => event.stopPropagation()}
    >
      {!compact && (
        <div className="search-quantity-header">
          <span className="collection-panel-label">{label}</span>
          {hint ? <span className="search-quantity-hint">{hint}</span> : null}
        </div>
      )}

      {compact && (
        <div className="search-quantity-inline-label">
          <span className="collection-panel-label">{label}</span>
        </div>
      )}

      <div className="search-quantity-stepper">
        <button
          type="button"
          className="ghost-button"
          onClick={onDecrease}
          disabled={disabled}
          aria-label="Restar una copia"
        >
          -
        </button>

        <input
          type="number"
          min="1"
          max="99"
          step="1"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          className="search-quantity-input"
          aria-label={label}
        />

        <button
          type="button"
          className="ghost-button"
          onClick={onIncrease}
          disabled={disabled}
          aria-label="Sumar una copia"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default SearchQuantityControl;
