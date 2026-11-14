import { useEffect, useRef, useState } from "react";
import { CATEGORIES, parseCoordinates, type CategoryId, type LatLng } from "@arah/core";
import { searchPlaces, type Place } from "../lib/geocode";
import { CatIcon, CATEGORY_UI } from "../lib/categories";

interface Props {
  near: LatLng | null;
  onPick: (p: Place) => void;
  onAbout: () => void;
  active: CategoryId[];
  onToggleCategory: (id: CategoryId) => void;
}

const NOT_FOUND =
  "Could not find that. Try the road or area name (for example “Kota Kemuning, Shah Alam”), paste coordinates like 3.0366, 101.5416, or long-press the map to drop a pin.";

function pinFor(c: LatLng): Place {
  return {
    id: `pin-${c.lat}-${c.lng}`,
    name: "Pinned location",
    detail: "",
    lat: c.lat,
    lng: c.lng,
    kind: "pin",
  };
}

export function SearchPanel({ near, onPick, onAbout, active, onToggleCategory }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [focused, setFocused] = useState(false);
  const nearRef = useRef(near);
  nearRef.current = near;
  const inputRef = useRef<HTMLInputElement>(null);
  const submitAc = useRef<AbortController | null>(null);

  const coord = parseCoordinates(q);

  useEffect(() => {
    setNotFound(false);
    if (q.trim().length < 2 || coord) {
      setResults([]);
      setError(null);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        setResults(await searchPlaces(q, nearRef.current, ac.signal));
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Search is unavailable right now.");
      } finally {
        if (!ac.signal.aborted) setBusy(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const choose = (p: Place) => {
    setQ("");
    setResults([]);
    setNotFound(false);
    inputRef.current?.blur();
    onPick(p);
  };

  // Enter / "go": go straight to the best match, like other map apps do.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    if (coord) return choose(pinFor(coord));
    const first = results[0];
    if (first && !first.approximate) return choose(first);
    submitAc.current?.abort();
    const ac = new AbortController();
    submitAc.current = ac;
    setBusy(true);
    setError(null);
    try {
      const found = await searchPlaces(q, nearRef.current, ac.signal, { deep: true });
      if (ac.signal.aborted) return;
      setResults(found);
      if (found[0]) choose(found[0]);
      else setNotFound(true);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError("Search is unavailable right now.");
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  };

  const showList = focused || q.length > 0;
  const typed = q.trim().length >= 2;

  return (
    <div className="search" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
      <form className="search-box" onSubmit={submit}>
        <span className="search-icon" aria-hidden>⌕</span>
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="go"
          placeholder="Where to? Place or address"
          aria-label="Search for a place, address or coordinates"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          autoComplete="off"
        />
        <button type="button" className="icon-btn" aria-label="About, data and privacy" onClick={onAbout}>ⓘ</button>
      </form>

      {showList && (coord || busy || error || notFound || results.length > 0 || typed) && (
        <ul className="results" role="listbox">
          {coord && (
            <li>
              <button className="result" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(pinFor(coord))}>
                <span className="result-name">Go to coordinates</span>
                <span className="result-detail">{coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}</span>
              </button>
            </li>
          )}
          {busy && <li className="result-note">Searching…</li>}
          {error && <li className="result-note error">{error}</li>}
          {!coord && !busy && !error && typed && results.length === 0 && (
            <li className="result-note">{notFound ? NOT_FOUND : "No exact match yet. Press go to search more widely."}</li>
          )}
          {results.map((p) => (
            <li key={p.id}>
              <button className="result" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
                <span className="result-name">
                  {p.name}
                  {p.approximate && <span className="tag toll approx">closest match</span>}
                </span>
                {p.detail && <span className="result-detail">{p.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="cats" role="group" aria-label="Show places nearby">
        {CATEGORIES.map((c) => {
          const on = active.includes(c.id);
          return (
            <button
              key={c.id}
              className={`cat${on ? " on" : ""}`}
              aria-pressed={on}
              onClick={() => onToggleCategory(c.id)}
              style={{ ["--cat" as string]: CATEGORY_UI[c.id].color }}
            >
              <span className="cat-dot"><CatIcon id={c.id} size={15} /></span>
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="chips">
        <span className="chip warn">Live traffic: not available</span>
      </div>
    </div>
  );
}
