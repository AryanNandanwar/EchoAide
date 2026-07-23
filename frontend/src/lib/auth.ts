import axios from "axios";

type StoredUser = {
  id?: string;
  role?: string;
  [key: string]: unknown;
};

export type { StoredUser };

type AuthSessionInput = {
  accessToken: string;
  refreshToken: string;
  user: StoredUser;
  remember: boolean;
};

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const API_BASE = import.meta.env?.VITE_REACT_APP_API_BASE_URL ?? "";

let refreshPromise: Promise<string | null> | null = null;

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json) as { exp?: number };
  } catch {
    return null;
  }
}

function getActiveStorage(): Storage {
  if (localStorage.getItem("ds_token") || localStorage.getItem("ds_user")) {
    return localStorage;
  }
  return sessionStorage;
}

export function getStoredToken(): string | null {
  return localStorage.getItem("ds_token") ?? sessionStorage.getItem("ds_token");
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem("ds_refresh_token") ?? sessionStorage.getItem("ds_refresh_token");
}

export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem("ds_user") ?? sessionStorage.getItem("ds_user");
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() >= payload.exp * 1000;
}

function isTokenExpiringSoon(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() >= payload.exp * 1000 - REFRESH_BUFFER_MS;
}

export function saveAuthSession({
  accessToken,
  refreshToken,
  user,
  remember,
}: AuthSessionInput): void {
  clearAuth();

  const storage = remember ? localStorage : sessionStorage;
  storage.setItem("ds_token", accessToken);
  storage.setItem("ds_refresh_token", refreshToken);
  storage.setItem("ds_user", JSON.stringify(user));
}

function updateStoredTokens(accessToken: string, refreshToken: string): void {
  const storage = getActiveStorage();
  storage.setItem("ds_token", accessToken);
  storage.setItem("ds_refresh_token", refreshToken);
}

export function clearAuth(): void {
  localStorage.removeItem("ds_token");
  localStorage.removeItem("ds_refresh_token");
  localStorage.removeItem("ds_user");
  sessionStorage.removeItem("ds_token");
  sessionStorage.removeItem("ds_refresh_token");
  sessionStorage.removeItem("ds_user");
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await axios.post(
        `${API_BASE}/api/auth/refresh`,
        { refreshToken },
        { headers: { "Content-Type": "application/json" } },
      );

      const accessToken = response.data?.accessToken as string | undefined;
      const newRefreshToken = response.data?.refreshToken as string | undefined;
      if (!accessToken || !newRefreshToken) return null;

      updateStoredTokens(accessToken, newRefreshToken);
      return accessToken;
    } catch {
      clearAuth();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function ensureValidAccessToken(): Promise<string | null> {
  const token = getStoredToken();
  if (token && !isTokenExpiringSoon(token)) {
    return token;
  }

  return refreshAccessToken();
}

export function hasValidSession(requiredRole?: string): boolean {
  const refreshToken = getStoredRefreshToken();
  const token = getStoredToken();
  if (!refreshToken && (!token || isTokenExpired(token))) return false;

  const user = getStoredUser();
  if (!user) return false;

  if (requiredRole && user.role !== requiredRole) return false;

  return true;
}

export async function logoutSession(): Promise<void> {
  const refreshToken = getStoredRefreshToken();
  if (refreshToken) {
    try {
      await axios.post(
        `${API_BASE}/api/auth/logout`,
        { refreshToken },
        { headers: { "Content-Type": "application/json" } },
      );
    } catch {
      // Clear local session even if revoke fails.
    }
  }

  clearAuth();
}
