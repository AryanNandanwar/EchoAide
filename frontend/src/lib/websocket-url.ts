/** Socket.IO server URL (same origin when behind nginx in Docker/production). */
export function getWebSocketUrl(): string {
  const fromEnv = import.meta.env.VITE_REACT_APP_WEBSOCKET_URL;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}
