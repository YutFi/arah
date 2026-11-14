import { formatArrival, formatDistance, formatDuration, mpsToKph, type CameraAlert, type Maneuver, type NavUpdate } from "@arah/core";

interface Props {
  nav: NavUpdate | null;
  maneuver: Maneuver | null;
  speedMps: number | null | undefined;
  simulating: boolean;
  simSpeedKph: number;
  onSimSpeed: () => void;
  alert: CameraAlert | null;
  rerouting: boolean;
  gpsWeak: boolean;
  voiceOn: boolean;
  onVoice: () => void;
  showRecenter: boolean;
  onRecenter: () => void;
  onStop: () => void;
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

const CAMERA_LABEL = { fixed: "Speed camera", "red-light": "Red-light camera", "average-speed": "Average-speed camera" } as const;

export function NavHud(p: Props) {
  const { nav, maneuver } = p;
  const arrived = nav?.status === "arrived";
  const kph = p.simulating ? p.simSpeedKph : p.speedMps != null ? mpsToKph(p.speedMps) : null;

  return (
    <>
      <div className="hud-top" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
        <div className="banner">
          {arrived ? (
            <>
              <div className="banner-icon">⚑</div>
              <div className="banner-text">
                <div className="banner-dist">You have arrived</div>
              </div>
            </>
          ) : maneuver ? (
            <>
              <div className="banner-icon" aria-hidden>{icon(maneuver.type)}</div>
              <div className="banner-text">
                <div className="banner-dist">{nav?.distanceToNextM != null ? formatDistance(nav.distanceToNextM) : ""}</div>
                <div className="banner-instr">{maneuver.instruction}</div>
              </div>
            </>
          ) : (
            <div className="banner-text">
              <div className="banner-instr">Getting your position…</div>
            </div>
          )}
        </div>

        {p.alert && (
          <div className="alert" role="alert">
            <strong>{CAMERA_LABEL[p.alert.camera.type]} ahead</strong>
            <span>
              {formatDistance(Math.max(0, p.alert.distanceAheadM))}
              {p.alert.camera.speedLimitKph ? ` · limit ${p.alert.camera.speedLimitKph} km/h` : ""}
            </span>
          </div>
        )}
        {p.rerouting && <div className="status">Rerouting…</div>}
        {p.gpsWeak && !p.simulating && <div className="status warn">GPS signal is weak</div>}
        {p.simulating && (
          <button className="status sim" onClick={p.onSimSpeed}>
            Simulated drive · {p.simSpeedKph} km/h · tap to change
          </button>
        )}
      </div>

      <div className="hud-side">
        <button className={`round${p.voiceOn ? "" : " off"}`} aria-label={p.voiceOn ? "Mute voice" : "Unmute voice"} onClick={p.onVoice}>
          {p.voiceOn ? "🔊" : "🔇"}
        </button>
        {p.showRecenter && (
          <button className="round" aria-label="Re-centre on my position" onClick={p.onRecenter}>◎</button>
        )}
      </div>

      <div className="hud-bottom" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="speed" aria-label="Current speed">
          <span className="speed-num">{kph ?? "–"}</span>
          <span className="speed-unit">km/h</span>
        </div>
        <div className="bar">
          {nav && !arrived ? (
            <div className="bar-stats">
              <div><b>{formatArrival(new Date(), nav.remainingS)}</b><small>arrive</small></div>
              <div><b>{formatDuration(nav.remainingS)}</b><small>left</small></div>
              <div><b>{formatDistance(nav.remainingM)}</b><small>distance</small></div>
            </div>
          ) : (
            <div className="bar-stats" />
          )}
          <button className="btn stop" onClick={p.onStop}>{arrived ? "Done" : "End"}</button>
        </div>
      </div>
    </>
  );
}
