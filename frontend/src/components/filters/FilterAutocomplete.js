import React, { useEffect, useMemo, useRef, useState } from 'react';

const normalizeText = (value) => (value || '').toString().trim().toLowerCase();
const normalizeOption = (option) => {
  if (typeof option === 'string') {
    return {
      value: option,
      label: option,
      searchTokens: [normalizeText(option)],
    };
  }

  const value = option?.value || option?.label || '';
  const label = option?.label || value;
  const rawSearchTokens = [
    label,
    value,
    ...(Array.isArray(option?.searchTokens) ? option.searchTokens : []),
    ...(Array.isArray(option?.aliases) ? option.aliases : []),
    ...(Array.isArray(option?.versions) ? option.versions : []),
  ];
  const searchTokens = [...new Set(
    rawSearchTokens
      .map((token) => normalizeText(token))
      .filter(Boolean)
  )];

  return {
    value,
    label,
    searchTokens,
  };
};

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
    () => {
      const uniqueOptions = new Map();

      (options || [])
        .filter(Boolean)
        .map(normalizeOption)
        .forEach((option) => {
          if (!option.value || uniqueOptions.has(option.value)) {
            return;
          }

          uniqueOptions.set(option.value, option);
        });

      return [...uniqueOptions.values()];
    },
    [options]
  );
  const normalizedQuery = normalizeText(query);
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return availableOptions;
    }

    return availableOptions.filter((option) => (
      option.searchTokens.some((token) => token.includes(normalizedQuery))
    ));
  }, [availableOptions, normalizedQuery]);
  const exactMatch = useMemo(
    () => availableOptions.find((option) => (
      option.searchTokens.some((token) => token === normalizedQuery)
    )) || null,
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
      commitValue(exactMatch.value);
      return;
    }

    if (filteredOptions.length === 1) {
      commitValue(filteredOptions[0].value);
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
        commitValue(exactMatch.value);
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
                key={option.value}
                type="button"
                className={`filter-autocomplete-option ${value === option.value ? 'is-active' : ''}`.trim()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitValue(option.value)}
                role="option"
                aria-selected={value === option.value}
              >
                {option.label}
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
