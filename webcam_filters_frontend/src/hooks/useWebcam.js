import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * PUBLIC_INTERFACE
 * Hook for webcam access with device enumeration and switching.
 */
export function useWebcam() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState("idle"); // idle | requesting | ready | error
  const [error, setError] = useState(null);

  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const [facingMode, setFacingMode] = useState("user"); // used when deviceId not chosen

  const canToggleFacingMode = useMemo(() => true, []);

  const stop = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
    }
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === "videoinput");
      setDevices(cams);

      // Preserve selection if still present, otherwise select first.
      if (cams.length > 0) {
        setSelectedDeviceId((prev) => {
          if (prev && cams.some((c) => c.deviceId === prev)) return prev;
          return cams[0].deviceId;
        });
      } else {
        setSelectedDeviceId("");
      }
    } catch (e) {
      // enumerateDevices can fail without permission in some browsers
      setDevices([]);
    }
  }, []);

  const start = useCallback(
    async (opts = {}) => {
      const deviceId = opts.deviceId ?? selectedDeviceId;
      const nextFacingMode = opts.facingMode ?? facingMode;

      setStatus("requesting");
      setError(null);

      // Always stop existing stream first.
      stop();

      try {
        const constraints = {
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: nextFacingMode } },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // iOS Safari needs explicit play() after assigning srcObject.
          await videoRef.current.play().catch(() => {});
        }

        setStatus("ready");

        // Now that we have permission, labels become available.
        await refreshDevices();
      } catch (e) {
        setStatus("error");
        setError(e);
      }
    },
    [facingMode, refreshDevices, selectedDeviceId, stop]
  );

  const toggleCamera = useCallback(async () => {
    // If multiple devices are available, cycle through them.
    if (devices.length >= 2 && selectedDeviceId) {
      const idx = devices.findIndex((d) => d.deviceId === selectedDeviceId);
      const next = devices[(idx + 1) % devices.length];
      setSelectedDeviceId(next.deviceId);
      await start({ deviceId: next.deviceId });
      return;
    }

    // Otherwise toggle facingMode as a best-effort fallback.
    const nextFacing = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextFacing);
    await start({ deviceId: "", facingMode: nextFacing });
  }, [devices, facingMode, selectedDeviceId, start]);

  useEffect(() => {
    // Keep devices list updated when hardware changes.
    if (!navigator.mediaDevices?.addEventListener) return;
    const handler = () => refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [refreshDevices]);

  useEffect(() => {
    // initial enumerate (may be unlabeled until permission granted)
    refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    videoRef,
    status,
    error,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    start,
    stop,
    toggleCamera,
    canToggleFacingMode,
  };
}
