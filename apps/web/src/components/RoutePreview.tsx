import {
  estimateRouteToll,
  formatArrival,
  formatDistance,
  LANE_DATA_CHECKED_ON,
  motorcycleNotes,
  NSE_CLASS_FACTOR,
  NSE_RM_PER_KM,
  roundEstimateRm,
  TOLL_DATA_CHECKED_ON,
  tollClassFor,
  type Route,
  type TollClass,
  type Vehicle,
} from "@arah/core";
import { fmtDuration, tn, useT, type Key } from "../lib/i18n";
import type { Place } from "../lib/geocode";
import type { StatsState } from "../lib/routeStats";
import { CameraIcon, CloseIcon, LaneIcon, TollIcon, WarnIcon } from "./icons";
import { TrafficLightIcon } from "./NavHud";
import { VehiclePicker } from "./VehiclePicker";

interface Props {
  dest: Place;
  routes: Route[];
  selected: number;
  onSelect: (i: number) => void;
  loading: boolean;
  error: string | null;
  vehicle: Vehicle;
  onVehicle: (v: Vehicle) => void;
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

const VEHICLE_WORD: Record<Vehicle["type"], Key> = { car: "veh.carLower", motorcycle: "veh.motorcycleLower", truck: "veh.truckLower" };

export function RoutePreview(p: Props) {
  const { t } = useT();
  const now = new Date();
  const best = p.routes[0]?.durationS ?? 0;
  const shortest = Math.min(...p.routes.map((r) => r.lengthM));
  const moto = p.vehicle.type === "motorcycle";

  return (
    <div className="sheet" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))", maxHeight: "56dvh" }}>
      <div className="sheet-head">
        <div>
          {p.trip && <div className="trip-step">{t("trip.stopOf", { i: p.trip.index + 1, n: p.trip.total })}</div>}
          <div className="sheet-title">{p.dest.name}</div>
          {p.dest.detail && <div className="sheet-sub">{p.dest.detail}</div>}
        </div>
        <button className="icon-btn" aria-label={t("route.cancel")} onClick={p.onCancel}>
          <CloseIcon size={20} />
        </button>
      </div>

      <VehiclePicker vehicle={p.vehicle} onChange={p.onVehicle} />

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
      {!p.loading && !p.error && p.routes.length > 0 && p.routes.length < 3 && (
        <div className="note">{t("route.fewer", { n: p.routes.length })}</div>
      )}

      <div className="route-list">
        {p.routes.map((r, i) => {
          const extra = Math.round((r.durationS - best) / 60);
          return (
            <button
              key={i}
              style={{ ["--i" as string]: i }}
              className={`route-card${i === p.selected ? " selected" : ""}`}
              onClick={() => p.onSelect(i)}
              aria-pressed={i === p.selected}
            >
              <div className="route-main">
                <span className="route-time" key={`${p.vehicle.type}:${Math.round(r.durationS)}`}>{fmtDuration(r.durationS)}</span>
                <span className="route-dist">{formatDistance(r.lengthM)}</span>
              </div>
              <div className="route-meta">
                <span>{t("route.arrive", { t: formatArrival(now, r.durationS) })}</span>
                {i === 0 ? <span className="tag">{t("route.recommended")}</span> : null}
                {i > 0 && !moto && !r.hasToll && p.routes[0]?.hasToll ? <span className="tag green">{t("route.tag.noToll")}</span> : null}
                {i > 0 && r.lengthM <= shortest + 1 && p.routes.length > 1 ? <span className="tag blue">{t("route.tag.shortest")}</span> : null}
                {i > 0 && extra > 0 ? <span className="tag muted">{t("route.plus", { n: extra })}</span> : null}
              </div>
              <RouteFacts route={r} stats={p.stats} index={i} awas={p.awasCounts?.[i] ?? null} vehicle={p.vehicle} />
            </button>
          );
        })}
      </div>

      {p.routes[p.selected] ? (
        <RouteDetails route={p.routes[p.selected] as Route} stats={p.stats} index={p.selected} awas={p.awasCounts?.[p.selected] ?? 0} vehicle={p.vehicle} />
      ) : null}

      <label className="toggle">
        <input type="checkbox" checked={p.avoidTolls} onChange={(e) => p.onToggleTolls(e.target.checked)} />
        <span>{moto ? t("route.avoidExpress") : t("route.avoidTolls")}</span>
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

/** Toll price numbers for one route, in the shape the chips and the details both need. */
function useTollShown(route: Route, tolls: { name: string; distanceAlongM: number }[], cls: TollClass) {
  const { t } = useT();
  const est = estimateRouteToll(route, tolls, cls);
  const shown = est.estimatedRm > 0 ? roundEstimateRm(est.totalRm) : est.totalRm;
  const rm = t(est.estimatedRm > 0 ? "route.rmEst" : "route.rmExact", { n: shown.toFixed(2) });
  return { est, rm };
}

function RouteFacts({ route, stats, index, awas, vehicle }: { route: Route; stats: StatsState; index: number; awas: number | null; vehicle: Vehicle }) {
  const f = stats.status === "loaded" ? stats.list[index] : null;
  const wait = stats.status === "loading";
  const none = stats.status === "error" || (stats.status === "loaded" && !f);
  const { t } = useT();
  const tolls = f?.tolls ?? [];
  const cls = tollClassFor(vehicle);
  const { est, rm } = useTollShown(route, tolls, cls === "free" ? 1 : cls);
  const notes = vehicle.type === "motorcycle" ? motorcycleNotes(route) : null;
  const laneNames = notes ? [...new Set(notes.lanes.map((l) => l.name))].join(", ") : "";
  const noLaneNames = notes ? [...new Set(notes.expressways.map((x) => x.name || t("route.moto.noLaneName")))].join(", ") : "";
  return (
    <div className="facts">
      {notes && notes.lanes.length > 0 && (
        <span className="fact lane">
          <LaneIcon size={15} /> {t("route.moto.lane", { names: laneNames })}
        </span>
      )}
      {notes && notes.expressways.length > 0 && (
        <span className="fact danger">
          <WarnIcon size={15} /> {t("route.moto.noLane", { names: noLaneNames })}
        </span>
      )}
      <span className="fact" title={t("route.legend.light")}>
        <TrafficLightIcon h={16} />{" "}
        {f ? tn("route.light", f.signals.length) : wait ? t("route.countingLights") : none ? t("route.noLights") : ""}
      </span>
      <span className="fact" title={t("route.legend.cam")}>
        <CameraIcon size={15} />{" "}
        {f ? tn("route.cam", f.cameras.length) : wait ? t("route.countingCams") : none ? t("route.noCams") : ""}
        {awas != null && awas > 0 ? t("route.awas", { n: awas }) : ""}
      </span>
      {cls === "free" ? (
        <span className="fact free">
          <TollIcon size={15} /> {t("route.moto.free")}
        </span>
      ) : (
        (route.hasToll || tolls.length > 0 || est.nseKm > 0) && (
          <span className="fact toll">
            <TollIcon size={15} /> {t("route.toll")}
            {wait
              ? t("route.tollCounting")
              : est.priced.length > 0 || est.nseKm > 0
                ? t("route.tollAbout", { rm }) + (est.unpriced.length === 0 ? "" : t("route.tollUnpriced", { p: tn("route.plaza", est.unpriced.length) }))
                : tolls.length === 0
                  ? t("route.tollNoCount")
                  : t("route.tollNoPrice", { p: tn("route.plaza", tolls.length) })}
          </span>
        )
      )}
    </div>
  );
}

/** Legend for the map symbols, and the toll breakdown, for the chosen route. */
function RouteDetails({ route, stats, index, awas, vehicle }: { route: Route; stats: StatsState; index: number; awas: number; vehicle: Vehicle }) {
  const { t } = useT();
  const f = stats.status === "loaded" ? stats.list[index] : null;
  const cls = tollClassFor(vehicle);
  const { est, rm } = useTollShown(route, f?.tolls ?? [], cls === "free" ? 1 : cls);
  if (!f) return null;
  return (
    <>
      <div className="legend" aria-label={t("route.legend")}>
        <span><i className="l-signal" />{t("route.legend.light")}</span>
        <span><i className="l-camera" />{t("route.legend.cam")}</span>
        {awas > 0 && <span><i className="l-awas" />{t("route.legend.awas")}</span>}
        {cls !== "free" && <span><i className="l-toll" />{t("route.legend.toll")}</span>}
        {vehicle.type === "motorcycle" && <span><i className="l-lane" />{t("route.legend.lane")}</span>}
        {vehicle.type === "motorcycle" && <span><i className="l-shelter" />{t("route.legend.shelter")}</span>}
        {vehicle.type === "truck" && <span><i className="l-bridge" />{t("route.legend.bridge")}</span>}
      </div>
      {vehicle.type === "truck" && <div className="foot-note">{t("route.legend.truckNote")}</div>}
      {vehicle.type === "motorcycle" && <div className="foot-note">{t("route.legend.shelterNote")}</div>}
      {vehicle.type === "motorcycle" && <div className="foot-note">{t("route.moto.why", { d: LANE_DATA_CHECKED_ON })}</div>}
      {cls !== "free" && (f.tolls.length > 0 || est.nseKm > 0) && (
        <details className="toll-box">
          <summary>
            <b>{t("route.tollBox2", { v: t(VEHICLE_WORD[vehicle.type]), c: cls })}</b>
            {est.priced.length > 0 || est.nseKm > 0 ? (est.complete ? t("route.tollTotal", { rm }) : t("route.tollSoFar", { rm })) : t("route.tollNone")}
          </summary>
          <ul>
            {est.nseKm > 0 && (
              <li>
                <span>{t("route.nse")} <span className="na">· {t("route.nseCalc", { km: est.nseKm.toFixed(0), sen: (NSE_RM_PER_KM * NSE_CLASS_FACTOR[cls] * 100).toFixed(2) })}</span></span>
                <span>≈ RM {roundEstimateRm(est.estimatedRm).toFixed(2)}</span>
              </li>
            )}
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
          {cls !== 1 && <div className="why">{t("route.lorryNote")}</div>}
          {est.nseKm > 0 && <div className="why">{cls === 1 ? t("route.nseWhy") : t("route.nseWhyLorry", { f: NSE_CLASS_FACTOR[cls], c: cls })}</div>}
        </details>
      )}
    </>
  );
}
