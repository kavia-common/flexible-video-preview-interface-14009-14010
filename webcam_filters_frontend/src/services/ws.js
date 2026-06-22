import { getRuntimeConfig } from "../config/env";

/**
 * PUBLIC_INTERFACE
 * Create a best-effort WebSocket connection for realtime sync.
 * Caller provides callbacks; connection failures are swallowed (app still works without WS).
 */
export function connectWebSocket({ onOpen, onClose, onError, onMessage } = {}) {
  const { wsUrl } = getRuntimeConfig();

  let ws;
  try {
    ws = new WebSocket(`${wsUrl}/ws`);
  } catch (e) {
    onError?.(e);
    return { close: () => {}, sendJson: () => false, isConnected: () => false };
  }

  ws.addEventListener("open", () => onOpen?.());
  ws.addEventListener("close", () => onClose?.());
  ws.addEventListener("error", (evt) => onError?.(evt));
  ws.addEventListener("message", (evt) => {
    let data = evt.data;
    try {
      data = JSON.parse(evt.data);
    } catch {
      // allow non-json messages
    }
    onMessage?.(data);
  });

  return {
    close: () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    },
    sendJson: (obj) => {
      try {
        if (ws.readyState !== WebSocket.OPEN) return false;
        ws.send(JSON.stringify(obj));
        return true;
      } catch {
        return false;
      }
    },
    isConnected: () => ws.readyState === WebSocket.OPEN,
  };
}
