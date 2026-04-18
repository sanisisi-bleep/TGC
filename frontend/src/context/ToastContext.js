import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import FloatingToast from '../components/FloatingToast';

const ToastContext = createContext(null);

const DEFAULT_DURATION = {
  success: 2600,
  info: 3400,
  error: 5200,
};

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const showToast = useCallback((nextToast) => {
    if (!nextToast) {
      return;
    }

    const payload = typeof nextToast === 'string'
      ? { message: nextToast }
      : nextToast;

    const type = payload.type || 'info';

    setToast({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title: payload.title || '',
      message: payload.message || '',
      duration: payload.duration || DEFAULT_DURATION[type] || DEFAULT_DURATION.info,
    });
  }, []);

  useEffect(() => {
    if (!toast?.id) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, toast.duration);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const value = useMemo(
    () => ({
      toast,
      showToast,
      dismissToast,
    }),
    [dismissToast, showToast, toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <FloatingToast toast={toast} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
}
