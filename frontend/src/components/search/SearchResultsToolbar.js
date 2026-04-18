import React from 'react';

function SearchResultsToolbar({
  visibleStart,
  visibleEnd,
  pagination,
  loadingCards,
  pageSize,
  pageSizeOptions,
  visiblePageNumbers,
  cardViewMode,
  onPageSizeChange,
  onPageChange,
  onPreviousPage,
  onNextPage,
  onCardViewModeChange,
}) {
  return (
    <section className="panel search-results-toolbar">
      <div className="search-results-copy">
        <strong>
          Mostrando {visibleStart}-{visibleEnd} de {pagination.total}
        </strong>
        <span>
          {loadingCards
            ? 'Actualizando resultados...'
            : `Pagina ${pagination.page} de ${pagination.total_pages || 1} con ${pagination.limit} cartas por carga.`}
        </span>
      </div>

      <div className="search-results-actions">
        <label className="page-size-control">
          <span>Por pagina</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(e.target.value)}
            disabled={loadingCards}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="mobile-view-control" aria-label="Vista del buscador en movil">
          <span>Vista movil</span>
          <div className="view-toggle view-toggle-compact" role="tablist" aria-label="Vista de cartas">
            <button
              type="button"
              className={cardViewMode === 'detail' ? 'is-active' : ''}
              onClick={() => onCardViewModeChange('detail')}
            >
              Detalle
            </button>
            <button
              type="button"
              className={cardViewMode === 'compact' ? 'is-active' : ''}
              onClick={() => onCardViewModeChange('compact')}
            >
              Compacta
            </button>
          </div>
        </div>

        <div className="pagination-controls" aria-label="Paginacion del buscador">
          <button
            type="button"
            className="pagination-button"
            onClick={onPreviousPage}
            disabled={!pagination.has_previous || loadingCards}
          >
            Anterior
          </button>

          <div className="pagination-page-list">
            {visiblePageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={`pagination-button ${pageNumber === pagination.page ? 'is-active' : ''}`}
                onClick={() => onPageChange(pageNumber)}
                disabled={loadingCards}
              >
                {pageNumber}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="pagination-button"
            onClick={onNextPage}
            disabled={!pagination.has_next || loadingCards}
          >
            Siguiente
          </button>
        </div>
      </div>
    </section>
  );
}

export default SearchResultsToolbar;
