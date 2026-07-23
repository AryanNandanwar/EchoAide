import axios from 'axios';
import { clearAuth, ensureValidAccessToken, refreshAccessToken } from './auth.ts';

const BASE = import.meta.env?.VITE_REACT_APP_API_BASE_URL || '';

export const api = axios.create({
  baseURL: BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

function isAuthRoute(url?: string): boolean {
  return Boolean(
    url?.includes('/api/auth/login') ||
      url?.includes('/api/auth/signup') ||
      url?.includes('/api/auth/refresh'),
  );
}

api.interceptors.request.use(
  async (config) => {
    if (!isAuthRoute(config.url)) {
      const token = await ensureValidAccessToken();
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

    if (
      !originalRequest ||
      originalRequest._retry ||
      error.response?.status !== 401 ||
      isAuthRoute(originalRequest.url)
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    const newToken = await refreshAccessToken();
    if (newToken) {
      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
      return api(originalRequest);
    }

    clearAuth();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }

    return Promise.reject(error);
  },
);

export default api;
