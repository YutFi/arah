import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@arah/core";
import { searchPlaces, type Place } from "../lib/geocode";

interface Props {
  near: LatLng | null;
  onPick: (p: Place) => void;
  onAbout: () => void;
}

export function SearchPanel({ near, onPick, onAbout }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const nearRef = useRef(near);
  nearRef.current = near;

  useEffect(() => {
    if (q.trim().length < 2) {
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
  }, [q]);

  const showList = focused || q.length > 0;

  return (
    <div className="search" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
      <div className="search-box">
        <span className="search-icon" aria-hidden>⌕</span>
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder="Where to?"
          aria-label="Search for a place"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          autoComplete="off"
        />
        <button className="icon-btn" aria-label="About, data and privacy" onClick={onAbout}>ⓘ</button>
      </div>

      {showList && (busy || error || results.length > 0 || q.trim().length >= 2) && (
        <ul className="results" role="listbox">
          {busy && <li className="result-note">Searching…</li>}
          {error && <li className="result-note error">{error}</li>}
          {!busy && !error && q.trim().length >= 2 && results.length === 0 && (
            <li className="result-note">No places found in Malaysia.</li>
          )}
          {results.map((p) => (
            <li key={p.id}>
              <button
                className="result"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQ("");
                  setResults([]);
                  onPick(p);
                }}
              >
                <span className="result-name">{p.name}</span>
                {p.detail && <span className="result-detail">{p.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="chips">
        <span className="chip warn">Live traffic: not available</span>
      </div>
    </div>
  );
}
