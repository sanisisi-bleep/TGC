import React from 'react';
import FilterAutocomplete from '../filters/FilterAutocomplete';

function CollectionControlsPanel({
  totalCards,
  visibleCards,
  searchTerm,
  filters,
  sortValue,
  typeOptions,
  colorOptions,
  rarityOptions,
  setOptions,
  hasFilters,
  onSearchTermChange,
  onFilterChange,
  onSortChange,
  onClear,
}) {
  return (
    <section className="panel collection-controls-panel">
      <div className="collection-controls-copy">
        <strong>Filtra tu coleccion</strong>
        <span>
          Mostrando {visibleCards} de {totalCards} cartas registradas.
        </span>
      </div>

      <div className="collection-controls">
        <input
          type="text"
          placeholder="Buscar por nombre, codigo, version o set..."
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
        />

        <select
          value={filters.type}
          onChange={(event) => onFilterChange('type', event.target.value)}
        >
          <option value="">Todos los tipos</option>
          {typeOptions.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>

        <select
          value={filters.color}
          onChange={(event) => onFilterChange('color', event.target.value)}
        >
          <option value="">Todos los colores</option>
          {colorOptions.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>

        <select
          value={filters.rarity}
          onChange={(event) => onFilterChange('rarity', event.target.value)}
        >
          <option value="">Todas las rarezas</option>
          {rarityOptions.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>

        <FilterAutocomplete
          value={filters.set}
          options={setOptions}
          allLabel="Todos los sets"
          placeholder="Escribe un set o codigo..."
          onChange={(value) => onFilterChange('set', value)}
        />

        <select
          value={sortValue}
          onChange={(event) => onSortChange(event.target.value)}
        >
          <option value="name-asc">Orden: Nombre</option>
          <option value="collection-asc">Orden: Codigo ascendente</option>
          <option value="collection-desc">Orden: Codigo descendente</option>
          <option value="rarity-asc">Orden: Rareza</option>
          <option value="quantity-desc">Orden: Total copias</option>
          <option value="available-desc">Orden: Disponibles</option>
        </select>

        <button
          type="button"
          className="ghost-button collection-clear-button"
          onClick={onClear}
          disabled={!hasFilters}
        >
          Limpiar
        </button>
      </div>
    </section>
  );
}

export default CollectionControlsPanel;
