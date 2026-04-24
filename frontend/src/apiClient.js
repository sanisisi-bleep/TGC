import axios from 'axios';
import API_BASE from './apiBase';

const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
});

export default apiClient;
