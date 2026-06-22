/**
 * Filter model:
 * - id: stable identifier
 * - label: for UI
 * - unit: appended in CSS function, if applicable
 * - min/max/step/defaultValue: slider configuration
 */
export const FILTERS = [
  { id: "grayscale", label: "Grayscale", cssFn: "grayscale", unit: "%", min: 0, max: 100, step: 1, defaultValue: 0 },
  { id: "sepia", label: "Sepia", cssFn: "sepia", unit: "%", min: 0, max: 100, step: 1, defaultValue: 0 },
  { id: "invert", label: "Invert", cssFn: "invert", unit: "%", min: 0, max: 100, step: 1, defaultValue: 0 },
  { id: "blur", label: "Blur", cssFn: "blur", unit: "px", min: 0, max: 16, step: 0.5, defaultValue: 0 },
  { id: "brightness", label: "Brightness", cssFn: "brightness", unit: "%", min: 50, max: 150, step: 1, defaultValue: 100 },
  { id: "contrast", label: "Contrast", cssFn: "contrast", unit: "%", min: 50, max: 150, step: 1, defaultValue: 100 },
  { id: "saturate", label: "Saturation", cssFn: "saturate", unit: "%", min: 0, max: 200, step: 1, defaultValue: 100 },
  { id: "hueRotate", label: "Hue", cssFn: "hue-rotate", unit: "deg", min: 0, max: 360, step: 1, defaultValue: 0 },
];

/**
 * PUBLIC_INTERFACE
 * Create initial filter state object.
 */
export function createDefaultFilterState() {
  const state = {};
  for (const f of FILTERS) state[f.id] = f.defaultValue;
  return state;
}

/**
 * PUBLIC_INTERFACE
 * Convert filter state to CSS filter string.
 */
export function filterStateToCss(state) {
  return FILTERS.map((f) => `${f.cssFn}(${state[f.id]}${f.unit})`).join(" ");
}

/**
 * PUBLIC_INTERFACE
 * Convert filter state to a portable preset payload.
 */
export function filterStateToPreset(state) {
  return { ...state };
}

/**
 * PUBLIC_INTERFACE
 * Restore filter state from preset payload.
 */
export function presetToFilterState(preset) {
  const base = createDefaultFilterState();
  if (!preset || typeof preset !== "object") return base;

  for (const f of FILTERS) {
    const v = preset[f.id];
    if (typeof v === "number" && Number.isFinite(v)) base[f.id] = v;
  }
  return base;
}
