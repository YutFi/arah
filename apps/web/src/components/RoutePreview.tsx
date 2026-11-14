import { estimateTolls, formatArrival, TOLL_DATA_CHECKED_ON, formatDistance, type Route } from "@arah/core";
import { fmtDuration, tn, useT } from "../lib/i18n";
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
  /** Set when this is one stop of a multi-stop trip. */
  trip: {
    index: number;
    total: number;
    later: string[];
    /** Whole trip from here: undefined while asking, null when the server could not tell. */
    totals: { lengthM: number; durationS: number } | null | undefined;
    onEdit: () => void;
  } | null;
}

export function RoutePreview(p: Props) {
  const { t } = useT();
  const now = new Date();
  const best = p.routes[0]?.durationS ?? 0;

  return (
    <div className="sheet" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))", maxHeight: "52dvh" }}>
      <div className="sheet-head">
        <div>
          {p.trip && <div className="trip-step">{t("trip.stopOf", { i: p.trip.index + 1, n: p.trip.total })}</div>}
          <div className="sheet-title">{p.dest.name}</div>
          {p.dest.detail && <div className="sheet-sub">{p.dest.detail}</div>}
        </div>
        <button className="icon-btn" aria-label={t("route.cancel")} onClick={p.onCancel}>✕</button>
      </div>

      {p.trip && (
        <div className="trip-info">
          {p.trip.later.length > 0 && <div>{t("trip.then", { names: p.trip.later.join(" → ") })}</div>}
          {p.trip.totals && (
            <div>
              <b>{t("trip.total", { n: p.trip.total - p.trip.index, d: formatDistance(p.trip.totals.lengthM), t: fmtDuration(p.trip.totals.durationS) })}</b>
              <small>{t("trip.totalNote")}</small>
            </div>
          )}
          <button className="link" onClick={p.trip.onEdit}>{t("trip.edit")}</button>
        </div>
      )}

      {!p.startsFromGps && (
        <div className="note">
          {t("route.startMid")}{" "}
          <button className="link" onClick={p.onUseLocation}>{t("route.useLoc")}</button>
        </div>
      )}

      {p.loading && <div className="note">{t("route.finding")}</div>}
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
                <span className="route-time">{fmtDuration(r.durationS)}</span>
                <span className="route-dist">{formatDistance(r.lengthM)}</span>
              </div>
              <div className="route-meta">
                <span>{t("route.arrive", { t: formatArrival(now, r.durationS) })}</span>
                {i === 0 ? <span className="tag">{t("route.recommended")}</span> : extra > 0 ? <span className="tag muted">{t("route.plus", { n: extra })}</span> : null}
              </div>
              <RouteFacts route={r} stats={p.stats} index={i} awas={p.awasCounts?.[i] ?? null} />
            </button>
          );
        })}
      </div>

      <RouteDetails stats={p.stats} index={p.selected} awas={p.awasCounts?.[p.selected] ?? 0} />

      <label className="toggle">
        <input type="checkbox" checked={p.avoidTolls} onChange={(e) => p.onToggleTolls(e.target.checked)} />
        <span>{t("route.avoidTolls")}</span>
      </label>

      <div className="foot-note">{t("route.note")}</div>

      <div className="actions">
        <button className="btn primary" disabled={p.routes.length === 0} onClick={() => p.onStart(false)}>
          {t("route.start")}
        </button>
        <button className="btn ghost" disabled={p.routes.length === 0} onClick={() => p.onStart(true)}>
          {t("route.simulate")}
        </button>
      </div>
    </div>
  );
}

function RouteFacts({ route, stats, index, awas }: { route: Route; stats: StatsState; index: number; awas: number | null }) {
  const f = stats.status === "loaded" ? stats.list[index] : null;
  const wait = stats.status === "loading";
  const none = stats.status === "error" || (stats.status === "loaded" && !f);
  const { t } = useT();
  const tolls = f?.tolls ?? [];
  const est = estimateTolls(tolls);
  return (
    <div className="facts">
      <span className="fact" title={t("route.legend.light")}>
        <span aria-hidden>🚦</span>{" "}
        {f ? tn("route.light", f.signals.length) : wait ? t("route.countingLights") : none ? t("route.noLights") : ""}
      </span>
      <span className="fact" title={t("route.legend.cam")}>
        <span aria-hidden>📷</span>{" "}
        {f ? tn("route.cam", f.cameras.length) : wait ? t("route.countingCams") : none ? t("route.noCams") : ""}
        {awas != null && awas > 0 ? t("route.awas", { n: awas }) : ""}
      </span>
      {(route.hasToll || tolls.length > 0) && (
        <span className="fact toll">
          <span aria-hidden>🛣️</span> {t("route.toll")}
          {tolls.length === 0
            ? t("route.tollNoCount")
            : est.priced.length > 0
              ? t("route.tollAbout", { rm: est.totalRm.toFixed(2) }) + (est.complete ? "" : t("route.tollUnpriced", { p: tn("route.plaza", est.unpriced.length) }))
              : t("route.tollNoPrice", { p: tn("route.plaza", tolls.length) })}
        </span>
      )}
    </div>
  );
}

/** Legend for the map symbols, and the toll breakdown, for the chosen route. */
function RouteDetails({ stats, index, awas }: { stats: StatsState; index: number; awas: number }) {
  const { t } = useT();
  const f = stats.status === "loaded" ? stats.list[index] : null;
  if (!f) return null;
  const est = estimateTolls(f.tolls);
  return (
    <>
      <div className="legend" aria-label={t("route.legend")}>
        <span><i className="l-signal" />{t("route.legend.light")}</span>
        <span><i className="l-camera" />{t("route.legend.cam")}</span>
        {awas > 0 && <span><i className="l-awas" />{t("route.legend.awas")}</span>}
        <span><i className="l-toll" />{t("route.legend.toll")}</span>
      </div>
      {f.tolls.length > 0 && (
        <details className="toll-box">
          <summary>
            <b>{t("route.tollBox")}</b>
            {est.priced.length > 0 ? (est.complete ? t("route.tollTotal", { rm: est.totalRm.toFixed(2) }) : t("route.tollSoFar", { rm: est.totalRm.toFixed(2) })) : t("route.tollNone")}
          </summary>
          <ul>
            {est.priced.map((x) => (
              <li key={x.name}>
                <span>{x.name} <span className="na">· {x.highway}</span></span>
                <span>RM {x.rm.toFixed(2)}</span>
              </li>
            ))}
            {est.unpriced.map((n, i) => (
              <li key={`${n}-${i}`}>
                <span>{n}</span>
                <span className="na">{t("route.priceNA")}</span>
              </li>
            ))}
          </ul>
          <div className="why">{t("route.tollWhy", { d: TOLL_DATA_CHECKED_ON })}</div>
        </details>
      )}
    </>
  );
}
