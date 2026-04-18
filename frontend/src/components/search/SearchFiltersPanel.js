import React from 'react';

function SearchFiltersPanel({
  searchTerm,
  filters,
  availableTypeOptions,
  availableColorOptions,
  availableRarityOptions,
  uniqueExpansions,
  onSearchChange,
  onFilterChange,
}) {
  return (
    <div className="search-controls">
      <input
        type="text"
        placeholder="Buscar por nombre o codigo..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <select
        value={filters.type}
        onChange={(e) => onFilterChange('type', e.target.value)}
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
        onChange={(e) => onFilterChange('color', e.target.value)}
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
        onChange={(e) => onFilterChange('rarity', e.target.value)}
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
        onChange={(e) => onFilterChange('expansion', e.target.value)}
      >
        <option value="">Todas las expansiones</option>
        {uniqueExpansions.map((expansion) => (
          <option key={expansion} value={expansion}>
            {expansion}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SearchFiltersPanel;
