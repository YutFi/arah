import { formatArrival, formatDistance, mpsToKph, type CameraAlert, type LaneStatus, type Maneuver, type NavUpdate, type TollPaymentSummary } from "@arah/core";
import { fmtDuration, maneuverText, useT, type Key } from "../lib/i18n";
import { FlagIcon, ForkIcon, LaneIcon, LocateIcon, SpeakerIcon } from "./icons";

interface Props {
  nav: NavUpdate | null;
  maneuver: Maneuver | null;
  speedMps: number | null | undefined;
  simulating: boolean;
  simSpeedKph: number;
  onSimSpeed: () => void;
  alert: CameraAlert | null;
  /** The position is off the route (a wrong turn). */
  offRoute: boolean;
  /** Asking for a new route (busy), or the last ask failed and it is trying again (retry). */
  rerouteStatus: "idle" | "busy" | "retry";
  /** Motorcycle lane on this stretch, or coming up. Null for other vehicles. */
  lane: LaneStatus | null;
  /** Simulated drive only: leave the route to try the wrong-turn reroute. */
  onWrongTurn: () => void;
  /** Slow-traffic prompt: how far you moved in how long, or null when not stuck. */
  jam: { movedM: number; spanS: number } | null;
  onJamFind: () => void;
  onJamStay: () => void;
  onReroute: () => void;
  gpsWeak: boolean;
  voiceOn: boolean;
  onVoice: () => void;
  showRecenter: boolean;
  onRecenter: () => void;
  onStop: () => void;
  /** Mapped traffic lights still ahead on this route; null when not known. */
  lights: { nextM: number | null; left: number } | null;
  /** Next toll plaza within 3 km: what OpenStreetMap says about its booths (pay null = nothing tagged). */
  toll: { name: string; distM: number; pay: TollPaymentSummary | null } | null;
  /** Multi-stop trip: which stop this is. Null on an ordinary trip. */
  tripPill: { i: number; n: number; name: string } | null;
  onTrip: () => void;
}

/** Valhalla manoeuvre type -> a simple arrow. */
function icon(type: number): string {
  switch (type) {
    case 4:
    case 5:
    case 6:
      return "⚑";
    case 9:
    case 17:
    case 23:
    case 36:
      return "↗";
    case 10:
    case 2:
    case 18:
    case 20:
      return "→";
    case 11:
      return "↘";
    case 12:
      return "↷";
    case 13:
      return "↶";
    case 14:
      return "↙";
    case 15:
    case 3:
    case 19:
    case 21:
      return "←";
    case 16:
    case 24:
    case 37:
      return "↖";
    case 26:
    case 27:
      return "⟳";
    default:
      return "↑";
  }
}

const CAMERA_KEY: Record<CameraAlert["camera"]["type"], Key> = { fixed: "nav.cam.fixed", "red-light": "nav.cam.red-light", "average-speed": "nav.cam.average-speed" };

/** Small traffic light: dark housing with red, amber and green lamps. */
export function TrafficLightIcon({ h = 22 }: { h?: number }) {
  return (
    <svg viewBox="0 0 16 26" width={(h * 16) / 26} height={h} aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="14" height="24" rx="5" fill="#1f2937" stroke="#fff" strokeWidth="1.6" />
      <circle cx="8" cy="7" r="3" fill="#ef4444" />
      <circle cx="8" cy="13" r="3" fill="#fbbf24" />
      <circle cx="8" cy="19" r="3" fill="#22c55e" />
    </svg>
  );
}

export function NavHud(p: Props) {
  const { t } = useT();
  const { nav, maneuver } = p;
  const arrived = nav?.status === "arrived";
  const booths = (n: number) => (n === 1 ? t("nav.toll.booth1") : t("nav.toll.booths", { n }));
  const kph = p.simulating ? p.simSpeedKph : p.speedMps != null ? mpsToKph(p.speedMps) : null;

  return (
    <>
      <div className="hud-top" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
        <div className={`banner${p.offRoute && !arrived ? " off" : ""}`}>
          {arrived ? (
            <>
              <div className="banner-icon">⚑</div>
              <div className="banner-text">
                <div className="banner-dist">{t("nav.arrived")}</div>
              </div>
            </>
          ) : p.offRoute ? (
            <>
              <div className="banner-icon spin" aria-hidden><ForkIcon size={34} /></div>
              <div className="banner-text" role="status">
                <div className="banner-dist off">{t("nav.off.title")}</div>
                <div className="banner-instr">{p.rerouteStatus === "retry" ? t("nav.off.retry") : t("nav.off.sub")}</div>
              </div>
            </>
          ) : maneuver ? (
            <>
              <div className="banner-icon" key={maneuver.beginShapeIndex} aria-hidden>{icon(maneuver.type)}</div>
              <div className="banner-text">
                <div className="banner-dist">{nav?.distanceToNextM != null ? formatDistance(nav.distanceToNextM) : ""}</div>
                <div className="banner-instr">{maneuverText(maneuver)}</div>
              </div>
            </>
          ) : (
            <div className="banner-text">
              <div className="banner-instr">{t("nav.getting")}</div>
            </div>
          )}
        </div>

        {p.tripPill && (
          <button className="status stop-pill" onClick={p.onTrip}>
            <FlagIcon size={16} /> {t("trip.pill", { i: p.tripPill.i, n: p.tripPill.n, name: p.tripPill.name })}
          </button>
        )}
        {p.lights && !arrived && (
          <div className="status lights" role="status" aria-label={t("nav.light.aria")}>
            <TrafficLightIcon />
            {p.lights.nextM === null ? (
              <span>{t("nav.light.none")}</span>
            ) : (
              <span>
                <b>{t("nav.light.next", { d: formatDistance(Math.round(p.lights.nextM / 10) * 10) })}</b>
                <small> · {t(`nav.light.left.${p.lights.left === 1 ? "one" : "other"}` as Key, { n: p.lights.left })}</small>
              </span>
            )}
          </div>
        )}

        {p.toll && !arrived && (
          <div className="status toll-pill" role="status">
            <div className="toll-head">
              <b>{t("nav.toll.ahead")}</b>
              <span>{p.toll.name ? `${p.toll.name} · ` : ""}{formatDistance(Math.round(p.toll.distM / 10) * 10)}</span>
            </div>
            {p.toll.pay ? (
              <>
                <div className="toll-methods" aria-label={t("nav.toll.tagged")}>
                  {p.toll.pay.tng > 0 && <span className="pay tng">{t("nav.toll.tng")} <i>{booths(p.toll.pay.tng)}</i></span>}
                  {p.toll.pay.smarttag > 0 && <span className="pay smart">{t("nav.toll.smarttag")} <i>{booths(p.toll.pay.smarttag)}</i></span>}
                  {p.toll.pay.rfid > 0 && <span className="pay rfid">{t("nav.toll.rfid")} <i>{booths(p.toll.pay.rfid)}</i></span>}
                </div>
                <small>{t("nav.toll.tagged")}. {t("nav.toll.partial")}</small>
              </>
            ) : (
              <small>{t("nav.toll.none")}</small>
            )}
          </div>
        )}

        {p.alert && (
          <div className="alert" role="alert">
            <strong>{t("nav.camAhead", { c: t(CAMERA_KEY[p.alert.camera.type]) })}</strong>
            <span>
              {formatDistance(Math.max(0, p.alert.distanceAheadM))}
              {p.alert.camera.speedLimitKph ? t("nav.limit", { n: p.alert.camera.speedLimitKph }) : ""}
              {p.alert.camera.approximate ? t("nav.camApprox") : ""}
            </span>
          </div>
        )}
        {p.jam && (
          <div className="alert jam" role="alertdialog" aria-label={t("jam.title")}>
            <strong>{t("jam.title")}</strong>
            <span className="jam-body">{t("jam.body", { m: formatDistance(Math.round(p.jam.movedM / 10) * 10), min: Math.max(1, Math.round(p.jam.spanS / 60)) })}</span>
            <div className="jam-actions">
              <button className="btn primary" onClick={p.onJamFind}>{t("jam.find")}</button>
              <button className="btn ghost" onClick={p.onJamStay}>{t("jam.stay")}</button>
            </div>
          </div>
        )}
        {p.lane && (p.lane.inside || p.lane.next) && !arrived && (
          <div className="status lane" role="status">
            <LaneIcon size={16} />
            <span>
              {p.lane.inside
                ? t("nav.lane.on", { name: p.lane.inside.name })
                : t("nav.lane.next", { d: formatDistance(Math.round((p.lane.next?.distanceM ?? 0) / 50) * 50), name: p.lane.next?.span.name ?? "" })}
            </span>
          </div>
        )}
        {p.gpsWeak && !p.simulating && <div className="status warn">{t("nav.gpsWeak")}</div>}
        {p.simulating && (
          <div className="sim-row">
            <button className="status sim" onClick={p.onSimSpeed}>
              {t("nav.sim", { n: p.simSpeedKph })}
            </button>
            <button className="status sim" onClick={p.onWrongTurn} disabled={p.offRoute}>
              {t("nav.sim.wrong")}
            </button>
          </div>
        )}
      </div>

      <div className="hud-side">
        <button className={`round${p.voiceOn ? "" : " off"}`} aria-label={p.voiceOn ? t("nav.mute") : t("nav.unmute")} onClick={p.onVoice}>
          <SpeakerIcon off={!p.voiceOn} size={24} />
        </button>
        <button className="round" aria-label={t("reroute.btn")} onClick={p.onReroute}><ForkIcon size={24} /></button>
        {p.showRecenter && (
          <button className="round" aria-label={t("nav.recenter")} onClick={p.onRecenter}><LocateIcon size={24} /></button>
        )}
      </div>

      <div className="hud-bottom" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="speed" aria-label={t("nav.speed")}>
          <span className="speed-num">{kph ?? "–"}</span>
          <span className="speed-unit">{t("nav.kmh")}</span>
        </div>
        <div className="bar">
          {nav && !arrived ? (
            <div className="bar-stats">
              <div><b>{formatArrival(new Date(), nav.remainingS)}</b><small>{t("nav.arrive")}</small></div>
              <div><b>{fmtDuration(nav.remainingS)}</b><small>{t("nav.left")}</small></div>
              <div><b>{formatDistance(nav.remainingM)}</b><small>{t("nav.distance")}</small></div>
            </div>
          ) : (
            <div className="bar-stats" />
          )}
          <button className="btn stop" onClick={p.onStop}>{arrived ? t("nav.done") : t("nav.end")}</button>
        </div>
      </div>
    </>
  );
}
