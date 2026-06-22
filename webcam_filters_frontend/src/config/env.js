/**
 * Environment configuration helpers for the frontend.
 * All values come from REACT_APP_* variables (Create React App convention).
 */

/**
 * PUBLIC_INTERFACE
 * Get runtime configuration for API + WebSocket connectivity.
 */
export function getRuntimeConfig() {
  const apiBase =
    process.env.REACT_APP_API_BASE ||
    process.env.REACT_APP_BACKEND_URL ||
    "http://localhost:4000";

  // Prefer explicit WS URL, otherwise derive from API base.
  //
  // REACT_APP_WS_URL may be provided either as:
  //  - a base URL:      ws://host:port
  //  - a full endpoint: ws://host:port/ws
  //
  // Our WS client appends "/ws" elsewhere, so normalize to a base URL here.
  const wsUrl = normalizeWsBaseUrl(
    process.env.REACT_APP_WS_URL ||
      apiBase.replace(/^http/i, "ws").replace(/\/+$/, "")
  );

  const frontendUrl =
    process.env.REACT_APP_FRONTEND_URL || window.location.origin;

  const logLevel = process.env.REACT_APP_LOG_LEVEL || "info";

  // Optional JSON blobs for flags/experiments (safe parsing).
  const featureFlags = safeJsonParse(process.env.REACT_APP_FEATURE_FLAGS, {});
  const experimentsEnabled =
    (process.env.REACT_APP_EXPERIMENTS_ENABLED || "").toLowerCase() === "true";

  return {
    apiBase: apiBase.replace(/\/+$/, ""),
    wsUrl: String(wsUrl || "").replace(/\/+$/, ""),
    frontendUrl,
    logLevel,
    featureFlags,
    experimentsEnabled,
  };
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeWsBaseUrl(value) {
  if (!value) return value;
  const trimmed = String(value).replace(/\/+$/, "");
  // If caller supplied ".../ws", normalize back to base URL.
  if (trimmed.toLowerCase().endsWith("/ws")) {
    return trimmed.slice(0, -3);
  }
  return trimmed;
}
