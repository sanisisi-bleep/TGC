const canUseSessionStorage = () => (
  typeof window !== 'undefined'
  && typeof window.sessionStorage !== 'undefined'
);

const isWrappedCacheEntry = (value) => (
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.prototype.hasOwnProperty.call(value, 'data')
  && Object.prototype.hasOwnProperty.call(value, 'expiresAt')
);

const readJsonFromSessionStorage = (storageKey) => {
  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch (_error) {
    return null;
  }
};

const writeJsonToSessionStorage = (storageKey, value) => {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch (_error) {
    // Ignore sessionStorage quota and parsing issues.
  }
};

export const readCacheMap = (storageKey) => {
  const payload = readJsonFromSessionStorage(storageKey);

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return new Map();
  }

  const now = Date.now();
  const entries = Object.entries(payload).flatMap(([key, value]) => {
    if (isWrappedCacheEntry(value)) {
      if (typeof value.expiresAt === 'number' && value.expiresAt < now) {
        return [];
      }
      return [[key, value.data]];
    }

    return [[key, value]];
  });

  return new Map(entries);
};

export const writeCacheMap = (storageKey, cacheMap) => {
  writeJsonToSessionStorage(storageKey, Object.fromEntries(cacheMap));
};

export const setLimitedCacheEntry = (cacheMap, key, value, limit = 24, ttlMs = null) => {
  if (cacheMap.has(key)) {
    cacheMap.delete(key);
  }

  cacheMap.set(
    key,
    ttlMs
      ? {
          data: value,
          expiresAt: Date.now() + ttlMs,
        }
      : value
  );

  while (cacheMap.size > limit) {
    const oldestKey = cacheMap.keys().next().value;
    cacheMap.delete(oldestKey);
  }
};

export const readStoredEnumValue = (storageKey, allowedValues, fallbackValue) => {
  const rawValue = readJsonFromSessionStorage(storageKey);
  return allowedValues.includes(rawValue) ? rawValue : fallbackValue;
};

export const writeStoredValue = (storageKey, value) => {
  writeJsonToSessionStorage(storageKey, value);
};
