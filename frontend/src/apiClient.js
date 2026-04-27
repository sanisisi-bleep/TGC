import axios from 'axios';
import API_BASE from './apiBase';

const DEFAULT_API_TIMEOUT_MS = 15000;
const configuredTimeoutMs = Number(process.env.REACT_APP_API_TIMEOUT_MS || DEFAULT_API_TIMEOUT_MS);
const API_TIMEOUT_MS = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
  ? configuredTimeoutMs
  : DEFAULT_API_TIMEOUT_MS;

const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: API_TIMEOUT_MS,
  headers: {
    Accept: 'application/json',
  },
});

export default apiClient;
