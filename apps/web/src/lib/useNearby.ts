import { useCallback, useRef, useState } from "react";
import { haversine, type CategoryId, type LatLng, type Poi } from "@arah/core";
import { fetchNearby, snap } from "./nearby";

interface Data {
  center: LatLng | null;
  byCat: Partial<Record<CategoryId, Poi[]>>;
}

/** Which kinds of places are switched on, and what was found around which point. */
export function useNearby(onLoaded: (pois: Poi[], center: LatLng) => void) {
  const [active, setActive] = useState<CategoryId[]>([]);
  const [data, setData] = useState<Data>({ center: null, byCat: {} });
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const activeRef = useRef(active);
  const dataRef = useRef(data);
  const acRef = useRef<AbortController | null>(null);
  const loaded = useRef(onLoaded);
  loaded.current = onLoaded;
  activeRef.current = active;
  dataRef.current = data;

  const load = useCallback(async (cats: CategoryId[], center: LatLng, replace: boolean) => {
    acRef.current?.abort();
    if (cats.length === 0) {
      setStatus("idle");
      return;
    }
    const ac = new AbortController();
    acRef.current = ac;
    const c = snap(center);
    setStatus("loading");
    setError(null);
    if (replace) {
      dataRef.current = { center: c, byCat: {} };
      setData(dataRef.current);
    }
    try {
      const res = await fetchNearby(c, cats, ac.signal);
      if (ac.signal.aborted) return;
      const next: Data = { center: c, byCat: { ...(replace ? {} : dataRef.current.byCat), ...res } };
      dataRef.current = next;
      setData(next);
      setStatus("idle");
      loaded.current(
        activeRef.current.flatMap((id) => next.byCat[id] ?? []),
        c,
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setStatus("error");
      setError((e as Error).message || "Could not load places.");
    }
  }, []);

  /** Turn a kind of place on or off. `center` is where the person is looking. */
  const toggle = useCallback(
    (id: CategoryId, center: LatLng) => {
      const cur = activeRef.current;
      if (cur.includes(id)) {
        const next = cur.filter((c) => c !== id);
        activeRef.current = next;
        setActive(next);
        if (next.length === 0) {
          acRef.current?.abort();
          setStatus("idle");
        }
        return;
      }
      const next = [...cur, id];
      activeRef.current = next;
      setActive(next);
      const prev = dataRef.current.center;
      if (!prev || haversine(prev, center) > 300) void load(next, center, true);
      else void load(next.filter((c) => !dataRef.current.byCat[c]), prev, false);
    },
    [load],
  );

  const searchHere = useCallback((center: LatLng) => void load(activeRef.current, center, true), [load]);
  const retry = useCallback(() => {
    const c = dataRef.current.center;
    if (c) void load(activeRef.current.filter((id) => !dataRef.current.byCat[id]), c, false);
  }, [load]);
  const clear = useCallback(() => {
    acRef.current?.abort();
    activeRef.current = [];
    setActive([]);
    setStatus("idle");
  }, []);

  const pois = active.flatMap((id) => data.byCat[id] ?? []);
  return { active, pois, center: data.center, status, error, toggle, searchHere, retry, clear };
}
