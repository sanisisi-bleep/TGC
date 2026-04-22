export const normalizeText = (value) => (value || '').toString().trim().toLowerCase();

export const normalizeCollectionCode = (value) => (
  (value || '')
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
);

export const buildCollectionCodeAliases = (value) => {
  const normalizedCode = normalizeCollectionCode(value);
  if (!normalizedCode) {
    return [];
  }

  const aliases = new Set([normalizedCode]);
  const match = normalizedCode.match(/^([A-Z]+)0*(\d+)$/);

  if (match) {
    const [, prefix, rawDigits] = match;
    const numericValue = Number.parseInt(rawDigits, 10);

    if (Number.isFinite(numericValue)) {
      aliases.add(`${prefix}${numericValue}`);
      aliases.add(`${prefix}${String(numericValue).padStart(2, '0')}`);
    }
  }

  return [...aliases];
};

export const matchesCollectionCodeQuery = (query, value) => {
  const normalizedQuery = normalizeCollectionCode(query);
  if (!normalizedQuery) {
    return false;
  }

  return buildCollectionCodeAliases(value).some((alias) => alias === normalizedQuery);
};

const toNaturalTokens = (value) => {
  const normalizedCode = normalizeCollectionCode(value);
  const normalizedValue = normalizedCode || (value || '').toString().trim().toUpperCase();

  if (!normalizedValue) {
    return [];
  }

  return normalizedValue.match(/[A-Z]+|\d+/g) || [normalizedValue];
};

export const compareCollectionCodes = (leftValue, rightValue) => {
  const leftTokens = toNaturalTokens(leftValue);
  const rightTokens = toNaturalTokens(rightValue);
  const maxLength = Math.max(leftTokens.length, rightTokens.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftToken = leftTokens[index];
    const rightToken = rightTokens[index];

    if (leftToken === undefined) {
      return -1;
    }
    if (rightToken === undefined) {
      return 1;
    }

    const leftNumber = /^\d+$/.test(leftToken);
    const rightNumber = /^\d+$/.test(rightToken);

    if (leftNumber && rightNumber) {
      const numericDifference = Number(leftToken) - Number(rightToken);
      if (numericDifference !== 0) {
        return numericDifference;
      }
      continue;
    }

    if (leftNumber !== rightNumber) {
      return leftNumber ? 1 : -1;
    }

    const tokenDifference = leftToken.localeCompare(rightToken);
    if (tokenDifference !== 0) {
      return tokenDifference;
    }
  }

  return 0;
};

const toVersionList = (entry) => {
  if (!entry || typeof entry === 'string') {
    return [];
  }

  if (Array.isArray(entry.versions)) {
    return entry.versions.filter(Boolean);
  }

  return entry.version ? [entry.version] : [];
};

const sortVersions = (versions) => [...versions].sort((left, right) => (
  compareCollectionCodes(left, right) || left.localeCompare(right)
));

export const buildSetFilterOptions = (entries = []) => {
  const groupedOptions = new Map();

  entries.forEach((entry) => {
    const rawValue = typeof entry === 'string'
      ? entry
      : entry?.value || entry?.label || entry?.set_name || '';
    const label = typeof entry === 'string'
      ? entry
      : entry?.label || entry?.value || entry?.set_name || '';

    if (!rawValue || !label) {
      return;
    }

    const optionKey = normalizeText(rawValue);
    if (!optionKey) {
      return;
    }

    if (!groupedOptions.has(optionKey)) {
      groupedOptions.set(optionKey, {
        value: rawValue,
        label,
        aliases: new Set(),
        versions: new Set(),
      });
    }

    const option = groupedOptions.get(optionKey);
    toVersionList(entry).forEach((version) => {
      const normalizedVersion = normalizeCollectionCode(version);
      if (!normalizedVersion) {
        return;
      }

      option.versions.add(normalizedVersion);
      buildCollectionCodeAliases(normalizedVersion).forEach((alias) => option.aliases.add(alias));
    });
  });

  return [...groupedOptions.values()]
    .map((option) => {
      const versions = sortVersions([...option.versions]);
      return {
        value: option.value,
        label: option.label,
        versions,
        aliases: [...option.aliases],
        searchTokens: [option.label, ...versions, ...option.aliases],
      };
    })
    .sort((left, right) => {
      const leftKey = left.versions[0] || left.label;
      const rightKey = right.versions[0] || right.label;

      return compareCollectionCodes(leftKey, rightKey) || left.label.localeCompare(right.label);
    });
};
