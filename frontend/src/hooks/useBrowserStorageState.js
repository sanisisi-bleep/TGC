import { useEffect, useState } from 'react';

const resolveDefaultValue = (defaultValue) => (
  typeof defaultValue === 'function' ? defaultValue() : defaultValue
);

const getStorage = (storageType) => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (storageType === 'session') {
    return window.sessionStorage;
  }

  return window.localStorage;
};

export default function useBrowserStorageState(
  storageKey,
  defaultValue,
  {
    storage = 'local',
    validate = null,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
  } = {}
) {
  const [value, setValue] = useState(() => {
    const fallbackValue = resolveDefaultValue(defaultValue);
    const storageApi = getStorage(storage);

    if (!storageApi) {
      return fallbackValue;
    }

    try {
      const rawValue = storageApi.getItem(storageKey);
      if (rawValue == null) {
        return fallbackValue;
      }

      const parsedValue = deserialize(rawValue);
      if (typeof validate === 'function') {
        return validate(parsedValue, fallbackValue);
      }

      return parsedValue;
    } catch (_error) {
      return fallbackValue;
    }
  });

  useEffect(() => {
    const storageApi = getStorage(storage);
    if (!storageApi) {
      return;
    }

    try {
      storageApi.setItem(storageKey, serialize(value));
    } catch (_error) {
      // Ignore storage quota and serialization errors.
    }
  }, [serialize, storage, storageKey, value]);

  return [value, setValue];
}
