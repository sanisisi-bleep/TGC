const defaultApiBase = process.env.NODE_ENV === 'production' ? '/api' : '';
const API_BASE = (process.env.REACT_APP_API_URL || defaultApiBase).trim().replace(/\/+$/, '');

export default API_BASE;
