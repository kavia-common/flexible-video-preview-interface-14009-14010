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
  const wsUrl =
    process.env.REACT_APP_WS_URL ||
    apiBase.replace(/^http/i, "ws").replace(/\/+$/, "");

  const frontendUrl =
    process.env.REACT_APP_FRONTEND_URL || window.location.origin;

  const logLevel = process.env.REACT_APP_LOG_LEVEL || "info";

  // Optional JSON blobs for flags/experiments (safe parsing).
  const featureFlags = safeJsonParse(process.env.REACT_APP_FEATURE_FLAGS, {});
  const experimentsEnabled =
    (process.env.REACT_APP_EXPERIMENTS_ENABLED || "").toLowerCase() === "true";

  return {
    apiBase: apiBase.replace(/\/+$/, ""),
    wsUrl: wsUrl.replace(/\/+$/, ""),
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
