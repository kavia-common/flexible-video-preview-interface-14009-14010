import { getRuntimeConfig } from "../config/env";

async function request(path, options = {}) {
  const { apiBase } = getRuntimeConfig();
  const url = `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message =
      (body && body.message) ||
      (typeof body === "string" && body) ||
      `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

/**
 * PUBLIC_INTERFACE
 * Fetch all saved filter presets from backend.
 */
export async function listPresets() {
  return request("/api/presets", { method: "GET" });
}

/**
 * PUBLIC_INTERFACE
 * Create a new preset in backend.
 */
export async function createPreset(preset) {
  return request("/api/presets", {
    method: "POST",
    body: JSON.stringify(preset),
  });
}

/**
 * PUBLIC_INTERFACE
 * Update an existing preset in backend.
 */
export async function updatePreset(id, preset) {
  return request(`/api/presets/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(preset),
  });
}

/**
 * PUBLIC_INTERFACE
 * Delete a preset by id in backend.
 */
export async function deletePreset(id) {
  return request(`/api/presets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/**
 * PUBLIC_INTERFACE
 * Record snapshot metadata in backend (MVP: metadata only).
 */
export async function recordSnapshot(snapshot) {
  return request("/api/snapshots", {
    method: "POST",
    body: JSON.stringify(snapshot),
  });
}
