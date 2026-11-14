import { formatArrival, formatDistance, formatDuration, type Route } from "@arah/core";
import type { Place } from "../lib/geocode";

interface Props {
  dest: Place;
  routes: Route[];
  selected: number;
  onSelect: (i: number) => void;
  loading: boolean;
  error: string | null;
  avoidTolls: boolean;
  onToggleTolls: (v: boolean) => void;
  startsFromGps: boolean;
  onUseLocation: () => void;
  onStart: (simulate: boolean) => void;
  onCancel: () => void;
}

export function RoutePreview(p: Props) {
  const now = new Date();
  const best = p.routes[0]?.durationS ?? 0;

  return (
    <div className="sheet" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
      <div className="sheet-head">
        <div>
          <div className="sheet-title">{p.dest.name}</div>
          {p.dest.detail && <div className="sheet-sub">{p.dest.detail}</div>}
        </div>
        <button className="icon-btn" aria-label="Cancel" onClick={p.onCancel}>✕</button>
      </div>

      {!p.startsFromGps && (
        <div className="note">
          Starting from the middle of the map because your location is not available.{" "}
          <button className="link" onClick={p.onUseLocation}>Use my location</button>
        </div>
      )}

      {p.loading && <div className="note">Finding routes…</div>}
      {p.error && <div className="note error">{p.error}</div>}

      <div className="route-list">
        {p.routes.map((r, i) => {
          const extra = Math.round((r.durationS - best) / 60);
          return (
            <button
              key={i}
              className={`route-card${i === p.selected ? " selected" : ""}`}
              onClick={() => p.onSelect(i)}
              aria-pressed={i === p.selected}
            >
              <div className="route-main">
                <span className="route-time">{formatDuration(r.durationS)}</span>
                <span className="route-dist">{formatDistance(r.lengthM)}</span>
              </div>
              <div className="route-meta">
                <span>Arrive {formatArrival(now, r.durationS)}</span>
                {i === 0 ? <span className="tag">Recommended</span> : extra > 0 ? <span className="tag muted">+{extra} min</span> : null}
                {r.hasToll && <span className="tag toll">Toll road · price not available yet</span>}
              </div>
            </button>
          );
        })}
      </div>

      <label className="toggle">
        <input type="checkbox" checked={p.avoidTolls} onChange={(e) => p.onToggleTolls(e.target.checked)} />
        <span>Avoid toll roads where possible</span>
      </label>

      <div className="foot-note">Times use typical road speeds, not live traffic.</div>

      <div className="actions">
        <button className="btn primary" disabled={p.routes.length === 0} onClick={() => p.onStart(false)}>
          Start
        </button>
        <button className="btn ghost" disabled={p.routes.length === 0} onClick={() => p.onStart(true)}>
          Simulate drive
        </button>
      </div>
    </div>
  );
}
