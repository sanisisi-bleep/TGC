const PROFILE_CACHE_KEY = 'tgc-session-profile-cache-v1';
const TGC_CACHE_KEY = 'tgc-catalog-cache-v1';
const PROFILE_CACHE_TTL_MS = 2 * 60 * 1000;
const TGC_CACHE_TTL_MS = 30 * 60 * 1000;

const memoryCache = {
  profile: null,
  tgcs: null,
};

const pendingRequests = {
  profile: null,
  tgcs: null,
};

const getStorage = (storageType) => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    if (storageType === 'local') {
      return window.localStorage;
    }
    return window.sessionStorage;
  } catch (_error) {
    return null;
  }
};

const readStoredEntry = (storageKey, storageType) => {
  const storage = getStorage(storageType);
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== 'object') {
      return null;
    }

    return parsedValue;
  } catch (_error) {
    return null;
  }
};

const writeStoredEntry = (storageKey, storageType, value) => {
  const storage = getStorage(storageType);
  if (!storage) {
    return;
  }

  try {
    storage.setItem(storageKey, JSON.stringify(value));
  } catch (_error) {
    // Ignore storage quota and serialization issues.
  }
};

const removeStoredEntry = (storageKey, storageType) => {
  const storage = getStorage(storageType);
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(storageKey);
  } catch (_error) {
    // Ignore storage access issues.
  }
};

const readFreshEntry = (memoryKey, storageKey, storageType) => {
  const now = Date.now();
  const memoryEntry = memoryCache[memoryKey];

  if (memoryEntry && memoryEntry.expiresAt > now) {
    return memoryEntry.value;
  }

  const storedEntry = readStoredEntry(storageKey, storageType);
  if (!storedEntry || storedEntry.expiresAt <= now) {
    return null;
  }

  memoryCache[memoryKey] = storedEntry;
  return storedEntry.value;
};

const writeFreshEntry = (memoryKey, storageKey, storageType, value, ttlMs) => {
  const nextEntry = {
    value,
    expiresAt: Date.now() + ttlMs,
  };

  memoryCache[memoryKey] = nextEntry;
  writeStoredEntry(storageKey, storageType, nextEntry);
  return value;
};

const clearEntry = (memoryKey, storageKey, storageType) => {
  memoryCache[memoryKey] = null;
  pendingRequests[memoryKey] = null;
  removeStoredEntry(storageKey, storageType);
};

const loadWithCache = async ({
  memoryKey,
  storageKey,
  storageType,
  ttlMs,
  forceRefresh = false,
  loader,
}) => {
  if (!forceRefresh) {
    const cachedValue = readFreshEntry(memoryKey, storageKey, storageType);
    if (cachedValue !== null) {
      return cachedValue;
    }
  }

  if (pendingRequests[memoryKey]) {
    return pendingRequests[memoryKey];
  }

  const request = Promise.resolve()
    .then(loader)
    .then((value) => writeFreshEntry(memoryKey, storageKey, storageType, value, ttlMs))
    .finally(() => {
      pendingRequests[memoryKey] = null;
    });

  pendingRequests[memoryKey] = request;
  return request;
};

export const fetchSessionProfile = (loader, options = {}) => loadWithCache({
  memoryKey: 'profile',
  storageKey: PROFILE_CACHE_KEY,
  storageType: 'session',
  ttlMs: PROFILE_CACHE_TTL_MS,
  loader,
  forceRefresh: Boolean(options.forceRefresh),
});

export const setSessionProfileCache = (profile) => (
  writeFreshEntry('profile', PROFILE_CACHE_KEY, 'session', profile, PROFILE_CACHE_TTL_MS)
);

export const clearSessionProfileCache = () => {
  clearEntry('profile', PROFILE_CACHE_KEY, 'session');
};

export const fetchTgcCatalog = (loader, options = {}) => loadWithCache({
  memoryKey: 'tgcs',
  storageKey: TGC_CACHE_KEY,
  storageType: 'local',
  ttlMs: TGC_CACHE_TTL_MS,
  loader,
  forceRefresh: Boolean(options.forceRefresh),
});

export const setTgcCatalogCache = (tgcs) => (
  writeFreshEntry('tgcs', TGC_CACHE_KEY, 'local', tgcs, TGC_CACHE_TTL_MS)
);

export const clearTgcCatalogCache = () => {
  clearEntry('tgcs', TGC_CACHE_KEY, 'local');
};
