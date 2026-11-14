import { useCallback, useEffect, useRef, useState } from "react";
import { bearing, haversine, type Fix } from "@arah/core";

export type GeoStatus = "idle" | "asking" | "active" | "denied" | "unavailable";

/**
 * Live GPS position, kept in memory only. Nothing is stored or sent anywhere.
 * Browsers only deliver GPS while the page is on screen: this is a limit of
 * web apps (see the README, "What does not work yet"), not a bug.
 */
export function useGeolocation() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const watchId = useRef<number | null>(null);
  const prev = useRef<Fix | null>(null);
  const precise = useRef(false);

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const start = useCallback(
    (highAccuracy: boolean) => {
      if (!("geolocation" in navigator)) {
        setStatus("unavailable");
        return;
      }
      if (watchId.current !== null && precise.current === highAccuracy) return;
      stop();
      precise.current = highAccuracy;
      setStatus((s) => (s === "active" ? s : "asking"));
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const c = pos.coords;
          const next: Fix = {
            lat: c.latitude,
            lng: c.longitude,
            accuracyM: c.accuracy,
            speedMps: c.speed,
            heading: c.heading,
            timestamp: pos.timestamp,
          };
          // Some phones omit speed or heading: work them out from the last fix.
          const p = prev.current;
          if (p && haversine(p, next) > 3) {
            const dt = (next.timestamp - p.timestamp) / 1000;
            if (next.speedMps == null && dt > 0) next.speedMps = haversine(p, next) / dt;
            if (next.heading == null || Number.isNaN(next.heading)) next.heading = bearing(p, next);
          }
          if (!p || haversine(p, next) > 3) prev.current = next;
          setFix(next);
          setStatus("active");
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            stop(); // lets "Try again" start a fresh request later
            setStatus("denied");
          } else setStatus("unavailable");
        },
        { enableHighAccuracy: highAccuracy, maximumAge: 1000, timeout: 20000 },
      );
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { fix, status, start, stop };
}
