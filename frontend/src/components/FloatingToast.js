import React from 'react';

function FloatingToast({ toast, onDismiss }) {
  if (!toast?.message) {
    return null;
  }

  const toneClass = toast.type === 'error'
    ? 'is-error'
    : toast.type === 'success'
      ? 'is-success'
      : 'is-info';

  return (
    <div
      className={`floating-toast ${toneClass}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="floating-toast-copy">
        {toast.title && <strong>{toast.title}</strong>}
        <span>{toast.message}</span>
      </div>
      <button
        type="button"
        className="floating-toast-close"
        aria-label="Cerrar aviso"
        onClick={onDismiss}
      >
        Cerrar
      </button>
    </div>
  );
}

export default FloatingToast;
