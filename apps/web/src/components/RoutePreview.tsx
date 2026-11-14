import { estimateTolls, formatArrival, TOLL_DATA_CHECKED_ON, formatDistance, formatDuration, type Route } from "@arah/core";
import type { Place } from "../lib/geocode";
import type { StatsState } from "../lib/routeStats";

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
  /** Lights, cameras and toll plazas along each route (from OpenStreetMap). */
  stats: StatsState;
  /** Verified AWAS records on each route; null while no verified list is loaded. */
  awasCounts: number[] | null;
}

export function RoutePreview(p: Props) {
  const now = new Date();
  const best = p.routes[0]?.durationS ?? 0;

  return (
    <div className="sheet" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))", maxHeight: "52dvh" }}>
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
              </div>
              <RouteFacts route={r} stats={p.stats} index={i} awas={p.awasCounts?.[i] ?? null} />
            </button>
          );
        })}
      </div>

      <RouteDetails stats={p.stats} index={p.selected} />

      <label className="toggle">
        <input type="checkbox" checked={p.avoidTolls} onChange={(e) => p.onToggleTolls(e.target.checked)} />
        <span>Avoid toll roads where possible</span>
      </label>

      <div className="foot-note">
        Times use typical road speeds, not live traffic. Lights, cameras and toll plazas are counted from OpenStreetMap
        volunteers, so real numbers can be higher. The camera count is not the official AWAS list.
      </div>

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

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function RouteFacts({ route, stats, index, awas }: { route: Route; stats: StatsState; index: number; awas: number | null }) {
  const f = stats.status === "loaded" ? stats.list[index] : null;
  const wait = stats.status === "loading";
  const none = stats.status === "error" || (stats.status === "loaded" && !f);
  const tolls = f?.tolls ?? [];
  const est = estimateTolls(tolls);
  return (
    <div className="facts">
      <span className="fact" title="Traffic lights mapped on OpenStreetMap along this route">
        <span aria-hidden>🚦</span>{" "}
        {f ? plural(f.signals.length, "traffic light", "traffic lights") : wait ? "Counting lights…" : none ? "Lights: not counted" : ""}
      </span>
      <span className="fact" title="Speed cameras mapped on OpenStreetMap along this route">
        <span aria-hidden>📷</span>{" "}
        {f ? plural(f.cameras.length, "mapped speed camera", "mapped speed cameras") : wait ? "Counting cameras…" : none ? "Cameras: not counted" : ""}
        {awas != null && awas > 0 ? ` · ${awas} verified AWAS` : ""}
      </span>
      {(route.hasToll || tolls.length > 0) && (
        <span className="fact toll">
          <span aria-hidden>🛣️</span> Toll
          {tolls.length === 0
            ? " road · plazas not counted"
            : est.priced.length > 0
              ? `: about RM ${est.totalRm.toFixed(2)}${est.complete ? "" : ` + ${plural(est.unpriced.length, "plaza", "plazas")} unpriced`}`
              : `: ${plural(tolls.length, "plaza", "plazas")} · price not available`}
        </span>
      )}
    </div>
  );
}

/** Legend for the map symbols, and the toll breakdown, for the chosen route. */
function RouteDetails({ stats, index }: { stats: StatsState; index: number }) {
  const f = stats.status === "loaded" ? stats.list[index] : null;
  if (!f) return null;
  const est = estimateTolls(f.tolls);
  return (
    <>
      <div className="legend" aria-label="Map symbols">
        <span><i className="l-signal" />Traffic light</span>
        <span><i className="l-camera" />Speed camera (OpenStreetMap)</span>
        <span><i className="l-toll" />Toll plaza</span>
      </div>
      {f.tolls.length > 0 && (
        <details className="toll-box">
          <summary>
            <b>Toll estimate, car (Class 1)</b>
            {est.priced.length > 0 ? ` · about RM ${est.totalRm.toFixed(2)}${est.complete ? "" : " so far"}` : " · no price available"}
          </summary>
          <ul>
            {est.priced.map((t) => (
              <li key={t.name}>
                <span>{t.name} <span className="na">· {t.highway}</span></span>
                <span>RM {t.rm.toFixed(2)}</span>
              </li>
            ))}
            {est.unpriced.map((n, i) => (
              <li key={`${n}-${i}`}>
                <span>{n}</span>
                <span className="na">price not available</span>
              </li>
            ))}
          </ul>
          <div className="why">
            Prices come from public rate lists that agree with each other, checked on {TOLL_DATA_CHECKED_ON}, and may be out of date.
            Highways that charge by distance (such as PLUS) are not priced here; check the exact fare with the operator or the LLM toll calculator.
          </div>
        </details>
      )}
    </>
  );
}
