// client/src/api/client.js
// Axios instance with JWT interceptor and error handling

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ds16_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const isLoginRequest = error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/login');
      if (!isLoginRequest && !window.location.pathname.includes('/login')) {
        localStorage.removeItem('ds16_token');
        localStorage.removeItem('ds16_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
