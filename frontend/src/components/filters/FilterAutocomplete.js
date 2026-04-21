import React, { useEffect, useMemo, useRef, useState } from 'react';

const normalizeText = (value) => (value || '').toString().trim().toLowerCase();

function FilterAutocomplete({
  value,
  options,
  allLabel,
  placeholder,
  onChange,
  noResultsLabel = 'No hay coincidencias',
}) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const panelIdRef = useRef(`filter-autocomplete-${Math.random().toString(36).slice(2, 10)}`);
  const [query, setQuery] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const availableOptions = useMemo(
    () => [...new Set((options || []).filter(Boolean))],
    [options]
  );
  const normalizedQuery = normalizeText(query);
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return availableOptions;
    }

    return availableOptions.filter((option) => normalizeText(option).includes(normalizedQuery));
  }, [availableOptions, normalizedQuery]);
  const exactMatch = useMemo(
    () => availableOptions.find((option) => normalizeText(option) === normalizedQuery) || null,
    [availableOptions, normalizedQuery]
  );

  const commitValue = (nextValue) => {
    onChange(nextValue);
    setQuery(nextValue);
    setIsOpen(false);
  };

  const resetToSelection = () => {
    setQuery(value || '');
    setIsOpen(false);
  };

  const handleInputChange = (event) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setIsOpen(true);

    if (!normalizeText(nextQuery)) {
      onChange('');
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleInputKeyDown = (event) => {
    if (event.key === 'Escape') {
      resetToSelection();
      inputRef.current?.blur();
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();

    if (exactMatch) {
      commitValue(exactMatch);
      return;
    }

    if (filteredOptions.length === 1) {
      commitValue(filteredOptions[0]);
      return;
    }

    if (!normalizedQuery) {
      onChange('');
      setIsOpen(false);
      return;
    }

    resetToSelection();
  };

  const handleInputBlur = () => {
    window.setTimeout(() => {
      if (rootRef.current?.contains(document.activeElement)) {
        return;
      }

      if (!normalizedQuery) {
        onChange('');
        setQuery('');
        setIsOpen(false);
        return;
      }

      if (exactMatch) {
        commitValue(exactMatch);
        return;
      }

      resetToSelection();
    }, 0);
  };

  return (
    <div className={`filter-autocomplete ${isOpen ? 'is-open' : ''}`} ref={rootRef}>
      <input
        ref={inputRef}
        type="text"
        className="filter-autocomplete-input"
        value={query}
        placeholder={placeholder || allLabel}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        role="combobox"
        aria-controls={panelIdRef.current}
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-label={allLabel}
      />

      {isOpen && (
        <div
          id={panelIdRef.current}
          className="filter-autocomplete-panel"
          role="listbox"
        >
          <button
            type="button"
            className={`filter-autocomplete-option ${!value ? 'is-active' : ''}`.trim()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commitValue('')}
            role="option"
            aria-selected={!value}
          >
            {allLabel}
          </button>

          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={`filter-autocomplete-option ${value === option ? 'is-active' : ''}`.trim()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitValue(option)}
                role="option"
                aria-selected={value === option}
              >
                {option}
              </button>
            ))
          ) : (
            <div className="filter-autocomplete-empty">{noResultsLabel}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default FilterAutocomplete;
