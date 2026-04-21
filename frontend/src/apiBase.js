const resolveDefaultApiBase = () => {
  if (process.env.NODE_ENV === 'production') {
    return '/api';
  }

  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8000';
  }

  const hostname = window.location.hostname || '127.0.0.1';
  return `http://${hostname}:8000`;
};

const API_BASE = (process.env.REACT_APP_API_URL || resolveDefaultApiBase())
  .trim()
  .replace(/\/+$/, '');

export default API_BASE;
