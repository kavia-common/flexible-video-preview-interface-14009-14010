import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { useWebcam } from "./hooks/useWebcam";
import {
  FILTERS,
  createDefaultFilterState,
  filterStateToCss,
  filterStateToPreset,
  presetToFilterState,
} from "./filters/filters";
import {
  createPreset,
  deletePreset,
  listPresets,
  recordSnapshot,
  updatePreset,
} from "./services/api";
import { connectWebSocket } from "./services/ws";
import { getRuntimeConfig } from "./config/env";

function formatDeviceLabel(device, idx) {
  if (!device) return "";
  return device.label || `Camera ${idx + 1}`;
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// PUBLIC_INTERFACE
function App() {
  const runtime = useMemo(() => getRuntimeConfig(), []);

  const {
    videoRef,
    status: camStatus,
    error: camError,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    start,
    toggleCamera,
  } = useWebcam();

  const canvasRef = useRef(null);

  const [filterState, setFilterState] = useState(() =>
    createDefaultFilterState()
  );
  const filterCss = useMemo(() => filterStateToCss(filterState), [filterState]);

  const [snapshots, setSnapshots] = useState([]); // local session snapshots (dataUrl + metadata)
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");

  const [presetName, setPresetName] = useState("");
  const [busy, setBusy] = useState({ loadingPresets: false, saving: false });

  const [toast, setToast] = useState(null);
  const pushToast = (t) => {
    setToast(t);
    window.clearTimeout(pushToast._t);
    pushToast._t = window.setTimeout(() => setToast(null), 2800);
  };

  // Initial camera start on mount.
  useEffect(() => {
    start().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load presets from backend on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy((b) => ({ ...b, loadingPresets: true }));
      try {
        const data = await listPresets();
        if (cancelled) return;
        setPresets(Array.isArray(data) ? data : data?.items || []);
      } catch (e) {
        // Backend might not be up during step 1; keep UI usable.
        pushToast(`Presets unavailable: ${e.message}`);
      } finally {
        if (!cancelled) setBusy((b) => ({ ...b, loadingPresets: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional WS wiring: listen for preset updates broadcast by backend.
  useEffect(() => {
    const ws = connectWebSocket({
      onError: () => {
        // silent; WS is optional
      },
      onMessage: (msg) => {
        if (!msg || typeof msg !== "object") return;

        if (msg.type === "presets.updated" && Array.isArray(msg.presets)) {
          setPresets(msg.presets);
          pushToast("Presets updated (realtime)");
        }
      },
    });

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChangeDevice = async (e) => {
    const id = e.target.value;
    setSelectedDeviceId(id);
    await start({ deviceId: id });
  };

  const setFilterValue = (id, value) => {
    setFilterState((s) => ({ ...s, [id]: value }));
  };

  const resetFilters = () => {
    setFilterState(createDefaultFilterState());
    pushToast("Filters reset");
  };

  const applyPreset = (preset) => {
    setFilterState(presetToFilterState(preset?.filters));
    pushToast(`Applied preset: ${preset?.name || "Unnamed"}`);
  };

  const takeSnapshot = async () => {
    const video = videoRef.current;
    if (!video) return;

    // Ensure metadata loaded for dimensions.
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Apply same CSS filters to canvas render.
    ctx.filter = filterCss;
    ctx.drawImage(video, 0, 0, w, h);
    ctx.filter = "none";

    const dataUrl = canvas.toDataURL("image/png");
    const ts = new Date();
    const item = {
      id: `${ts.getTime()}`,
      createdAt: ts.toISOString(),
      width: w,
      height: h,
      filterState: { ...filterState },
      dataUrl,
    };

    setSnapshots((prev) => [item, ...prev].slice(0, 12));
    pushToast("Snapshot captured");

    // Best-effort metadata persistence to backend.
    try {
      await recordSnapshot({
        createdAt: item.createdAt,
        width: item.width,
        height: item.height,
        filters: filterStateToPreset(filterState),
      });
    } catch {
      // ignore if backend not available
    }
  };

  const downloadSnapshot = (s) => {
    const safeTs = (s.createdAt || new Date().toISOString()).replace(/[:.]/g, "-");
    downloadDataUrl(s.dataUrl, `snapshot-${safeTs}.png`);
  };

  const savePreset = async () => {
    const name = presetName.trim();
    if (!name) {
      pushToast("Enter a preset name");
      return;
    }

    setBusy((b) => ({ ...b, saving: true }));
    try {
      const payload = {
        name,
        filters: filterStateToPreset(filterState),
      };

      const created = await createPreset(payload);
      // optimistic local merge (in case backend returns created object)
      setPresets((prev) => {
        const next = [created || payload, ...prev];
        // remove dupes by id if possible
        const seen = new Set();
        return next.filter((p) => {
          const key = p._id || p.id || `${p.name}-${JSON.stringify(p.filters || {})}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });
      setPresetName("");
      pushToast("Preset saved");
    } catch (e) {
      pushToast(`Save failed: ${e.message}`);
    } finally {
      setBusy((b) => ({ ...b, saving: false }));
    }
  };

  const updateSelectedPreset = async () => {
    const id = selectedPresetId;
    if (!id) {
      pushToast("Choose a preset to update");
      return;
    }

    setBusy((b) => ({ ...b, saving: true }));
    try {
      const updated = await updatePreset(id, {
        filters: filterStateToPreset(filterState),
      });

      setPresets((prev) =>
        prev.map((p) => {
          const pid = p._id || p.id;
          if (pid !== id) return p;
          return updated || { ...p, filters: filterStateToPreset(filterState) };
        })
      );
      pushToast("Preset updated");
    } catch (e) {
      pushToast(`Update failed: ${e.message}`);
    } finally {
      setBusy((b) => ({ ...b, saving: false }));
    }
  };

  const removeSelectedPreset = async () => {
    const id = selectedPresetId;
    if (!id) {
      pushToast("Choose a preset to delete");
      return;
    }

    setBusy((b) => ({ ...b, saving: true }));
    try {
      await deletePreset(id);
      setPresets((prev) =>
        prev.filter((p) => (p._id || p.id) !== id)
      );
      setSelectedPresetId("");
      pushToast("Preset deleted");
    } catch (e) {
      pushToast(`Delete failed: ${e.message}`);
    } finally {
      setBusy((b) => ({ ...b, saving: false }));
    }
  };

  const selectedPreset = useMemo(() => {
    return presets.find((p) => (p._id || p.id) === selectedPresetId) || null;
  }, [presets, selectedPresetId]);

  const cameraHelp = useMemo(() => {
    if (camStatus === "requesting") return "Requesting camera permission…";
    if (camStatus === "ready") return "Camera ready";
    if (camStatus === "error") return "Camera error";
    return "Camera idle";
  }, [camStatus]);

  return (
    <div className="wf-app">
      <header className="wf-topbar">
        <div className="wf-brand">
          <div className="wf-logo" aria-hidden="true" />
          <div className="wf-brandText">
            <div className="wf-title">Webcam Filters</div>
            <div className="wf-subtitle">
              Live preview • Real-time effects • Snapshots
            </div>
          </div>
        </div>

        <div className="wf-conn">
          <div className="wf-pill" title="API base URL">
            API: <span className="wf-mono">{runtime.apiBase}</span>
          </div>
          <div className="wf-pill" title="WebSocket URL (optional)">
            WS: <span className="wf-mono">{runtime.wsUrl}</span>
          </div>
        </div>
      </header>

      <main className="wf-main">
        <section className="wf-previewCard" aria-label="Webcam preview">
          <div className="wf-previewHeader">
            <div className="wf-sectionTitle">Preview</div>

            <div className="wf-previewActions">
              <label className="wf-selectLabel">
                Camera
                <select
                  className="wf-select"
                  value={selectedDeviceId}
                  onChange={onChangeDevice}
                  aria-label="Select camera"
                >
                  {devices.length === 0 ? (
                    <option value="">Default</option>
                  ) : (
                    devices.map((d, idx) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {formatDeviceLabel(d, idx)}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <button className="wf-btn wf-btnSecondary" onClick={toggleCamera}>
                Toggle camera
              </button>

              <button
                className="wf-btn wf-btnPrimary"
                onClick={takeSnapshot}
                disabled={camStatus !== "ready"}
              >
                Take snapshot
              </button>
            </div>
          </div>

          <div className="wf-previewStage">
            <div className="wf-videoFrame">
              <video
                ref={videoRef}
                className="wf-video"
                style={{ filter: filterCss }}
                playsInline
                muted
                autoPlay
              />
              <div className="wf-overlay">
                <div className="wf-overlayRow">
                  <span className="wf-statusDot" data-status={camStatus} />
                  <span className="wf-overlayText">{cameraHelp}</span>
                </div>
                {camError ? (
                  <div className="wf-overlayError">
                    {camError.message || "Unable to access camera."}
                    <div className="wf-overlayHint">
                      Check permissions and ensure HTTPS (or localhost).
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <canvas ref={canvasRef} className="wf-hiddenCanvas" />
          </div>
        </section>

        <section className="wf-controlsCard" aria-label="Filter controls">
          <div className="wf-controlsHeader">
            <div className="wf-sectionTitle">Filters</div>
            <div className="wf-controlsRight">
              <div className="wf-chip">
                CSS: <span className="wf-mono wf-ellipsis">{filterCss}</span>
              </div>
              <button className="wf-btn wf-btnGhost" onClick={resetFilters}>
                Reset
              </button>
            </div>
          </div>

          <div className="wf-filtersGrid">
            {FILTERS.map((f) => (
              <div className="wf-filterRow" key={f.id}>
                <div className="wf-filterMeta">
                  <div className="wf-filterLabel">{f.label}</div>
                  <div className="wf-filterValue wf-mono">
                    {filterState[f.id]}
                    {f.unit}
                  </div>
                </div>
                <input
                  className="wf-slider"
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={filterState[f.id]}
                  onChange={(e) => setFilterValue(f.id, Number(e.target.value))}
                  aria-label={`${f.label} intensity`}
                />
              </div>
            ))}
          </div>

          <div className="wf-presets">
            <div className="wf-presetsHeader">
              <div className="wf-sectionTitle">Presets</div>
              <div className="wf-presetsHint">
                Load/save filters via backend (optional during this step).
              </div>
            </div>

            <div className="wf-presetsRow">
              <select
                className="wf-select"
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                aria-label="Select preset"
                disabled={busy.loadingPresets}
              >
                <option value="">
                  {busy.loadingPresets ? "Loading…" : "Choose a preset"}
                </option>
                {presets.map((p) => {
                  const id = p._id || p.id || "";
                  return (
                    <option key={id || p.name} value={id}>
                      {p.name || "Unnamed preset"}
                    </option>
                  );
                })}
              </select>

              <button
                className="wf-btn wf-btnSecondary"
                onClick={() => applyPreset(selectedPreset)}
                disabled={!selectedPreset}
              >
                Apply
              </button>

              <button
                className="wf-btn wf-btnGhost"
                onClick={updateSelectedPreset}
                disabled={!selectedPresetId || busy.saving}
                title="Overwrite selected preset with current filter settings"
              >
                Update
              </button>

              <button
                className="wf-btn wf-btnDanger"
                onClick={removeSelectedPreset}
                disabled={!selectedPresetId || busy.saving}
              >
                Delete
              </button>
            </div>

            <div className="wf-presetsRow">
              <input
                className="wf-input"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="New preset name…"
                aria-label="New preset name"
              />
              <button
                className="wf-btn wf-btnPrimary"
                onClick={savePreset}
                disabled={busy.saving}
              >
                Save preset
              </button>
            </div>
          </div>
        </section>

        <section className="wf-snapshotsCard" aria-label="Snapshots">
          <div className="wf-controlsHeader">
            <div className="wf-sectionTitle">Snapshots</div>
            <div className="wf-snapshotsHint">
              Stored locally for this session; downloads are PNG.
            </div>
          </div>

          {snapshots.length === 0 ? (
            <div className="wf-empty">
              No snapshots yet. Click <strong>Take snapshot</strong>.
            </div>
          ) : (
            <div className="wf-snapshotsGrid">
              {snapshots.map((s) => (
                <div className="wf-shot" key={s.id}>
                  <img
                    className="wf-shotImg"
                    src={s.dataUrl}
                    alt={`Snapshot taken at ${s.createdAt}`}
                  />
                  <div className="wf-shotMeta">
                    <div className="wf-shotTime wf-mono">
                      {new Date(s.createdAt).toLocaleString()}
                    </div>
                    <div className="wf-shotActions">
                      <button
                        className="wf-btn wf-btnGhost wf-btnSmall"
                        onClick={() => downloadSnapshot(s)}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {toast ? <div className="wf-toast" role="status">{toast}</div> : null}

      <footer className="wf-footer">
        <div className="wf-footerText">
          Tip: For best results, use Chrome/Edge and allow camera permissions.
        </div>
      </footer>
    </div>
  );
}

export default App;
