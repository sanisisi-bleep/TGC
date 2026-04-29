import { useCallback, useRef, useState } from 'react';

export function usePositiveIntegerDraftMap({
  defaultQuantity = 1,
  maxValue = null,
  maxDigits = null,
  allowEmpty = true,
} = {}) {
  const [drafts, setDrafts] = useState({});
  const draftsRef = useRef({});

  const parseQuantity = useCallback((value) => {
    const parsedValue = Number.parseInt(String(value ?? ''), 10);

    if (!Number.isFinite(parsedValue) || parsedValue < defaultQuantity) {
      return defaultQuantity;
    }

    if (Number.isFinite(maxValue)) {
      return Math.min(parsedValue, maxValue);
    }

    return parsedValue;
  }, [defaultQuantity, maxValue]);

  const normalizeDraftValue = useCallback((value) => {
    const digitsOnly = String(value ?? '').replace(/[^\d]/g, '');

    if (!digitsOnly) {
      return allowEmpty ? '' : String(defaultQuantity);
    }

    const trimmedDigits = Number.isFinite(maxDigits)
      ? digitsOnly.slice(0, maxDigits)
      : digitsOnly;

    const normalizedQuantity = parseQuantity(trimmedDigits);
    return String(normalizedQuantity);
  }, [allowEmpty, defaultQuantity, maxDigits, parseQuantity]);

  const setDraft = useCallback((key, value) => {
    if (!key) {
      return;
    }

    const normalizedValue = normalizeDraftValue(value);
    draftsRef.current = {
      ...draftsRef.current,
      [key]: normalizedValue,
    };
    setDrafts((current) => ({
      ...current,
      [key]: normalizedValue,
    }));
  }, [normalizeDraftValue]);

  const getQuantity = useCallback((key) => {
    const draftValue = draftsRef.current[key] ?? drafts[key];
    return parseQuantity(draftValue);
  }, [drafts, parseQuantity]);

  const commitQuantity = useCallback((key) => {
    if (!key) {
      return defaultQuantity;
    }

    const quantity = getQuantity(key);
    draftsRef.current = {
      ...draftsRef.current,
      [key]: String(quantity),
    };
    setDrafts((current) => ({
      ...current,
      [key]: String(quantity),
    }));
    return quantity;
  }, [defaultQuantity, getQuantity]);

  const stepQuantity = useCallback((key, delta) => {
    if (!key) {
      return;
    }

    const currentQuantity = getQuantity(key);
    const nextQuantity = parseQuantity(Math.max(defaultQuantity, currentQuantity + delta));
    draftsRef.current = {
      ...draftsRef.current,
      [key]: String(nextQuantity),
    };
    setDrafts((current) => ({
      ...current,
      [key]: String(nextQuantity),
    }));
  }, [defaultQuantity, getQuantity, parseQuantity]);

  const resetDrafts = useCallback(() => {
    draftsRef.current = {};
    setDrafts({});
  }, []);

  return {
    drafts,
    setDraft,
    getQuantity,
    commitQuantity,
    stepQuantity,
    resetDrafts,
  };
}

export default usePositiveIntegerDraftMap;
