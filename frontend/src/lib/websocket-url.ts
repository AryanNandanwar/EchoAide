export type WebSocketUrlOptions = {
  configuredUrl?: string;
  isDev?: boolean;
  apiBaseUrl?: string;
  windowOrigin?: string;
};

/** Pure resolver for Socket.IO server URL (testable without Vite env). */
export function resolveWebSocketUrl({
  configuredUrl,
  isDev = false,
  apiBaseUrl,
  windowOrigin,
}: WebSocketUrlOptions): string {
  if (configuredUrl?.trim()) {
    return configuredUrl.trim();
  }

  if (isDev) {
    if (apiBaseUrl?.trim()) {
      return apiBaseUrl.trim();
    }
    if (windowOrigin) {
      return windowOrigin;
    }
    return "http://localhost:3000";
  }

  if (windowOrigin) {
    return windowOrigin;
  }

  return "http://localhost:3000";
}

/** Socket.IO server URL (same origin when behind nginx in Docker/production). */
export function getWebSocketUrl(): string {
  return resolveWebSocketUrl({
    configuredUrl: import.meta.env.VITE_REACT_APP_WEBSOCKET_URL,
    isDev: import.meta.env.DEV,
    apiBaseUrl: import.meta.env.VITE_REACT_APP_API_BASE_URL,
    windowOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
  });
}
