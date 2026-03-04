import axios from 'axios';

const BASE = import.meta.env.VITE_REACT_APP_API_BASE_URL || ''; 

export const api = axios.create({
  baseURL: BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- AUTHORIZATION INTERCEPTOR ---
// Add ds_token to every request EXCEPT login/signup
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("ds_token");

    // Define routes that should NOT include the token
    const skipAuth =
      config.url?.includes("/api/auth/login") ||
      config.url?.includes("/api/auth/signup");

    if (!skipAuth && token) {
      config.headers["Authorization"] = `Bearer ${token}`;
      // OR if your backend expects ds_token:
      // config.headers["ds_token"] = token;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
