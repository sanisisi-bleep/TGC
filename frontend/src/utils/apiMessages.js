const FIELD_LABELS = {
  username: 'Usuario',
  email: 'Email',
  password: 'Contrasena',
  old_password: 'Contrasena actual',
  new_password: 'Nueva contrasena',
  display_name: 'Nombre visible',
  bio: 'Bio',
};

const formatDetailEntry = (entry) => {
  if (!entry) {
    return '';
  }

  if (typeof entry === 'string') {
    return entry;
  }

  const message = entry.msg || entry.message || 'Dato no valido';
  const fieldName = Array.isArray(entry.loc) ? entry.loc[entry.loc.length - 1] : '';
  const label = FIELD_LABELS[fieldName] || fieldName;

  return label ? `${label}: ${message}` : message;
};

export const getApiErrorMessage = (error, fallback = 'Ha ocurrido un error inesperado.') => {
  const detail = error?.response?.data?.detail;
  const requestId = error?.response?.data?.request_id || error?.response?.headers?.['x-request-id'];

  let message = fallback;

  if (Array.isArray(detail) && detail.length > 0) {
    const formatted = detail
      .map(formatDetailEntry)
      .filter(Boolean)
      .join(' ');

    if (formatted) {
      message = formatted;
    }
  } else if (typeof detail === 'string' && detail.trim()) {
    message = detail.trim();
  } else if (error?.message && error.message !== 'Network Error') {
    message = error.message;
  }

  if (requestId) {
    return `${message} Ref: ${requestId}`;
  }

  return message;
};
