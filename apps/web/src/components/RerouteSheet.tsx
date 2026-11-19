import { formatDistance, type LatLng, type Route } from "@arah/core";
import type { RerouteOption } from "../lib/routing";
import { fmtDuration, t, useT } from "../lib/i18n";
import { TrafficLinks } from "./TrafficSheet";
import { CloseIcon } from "./icons";

export type RerouteState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; options: RerouteOption[] };

interface Props {
  state: RerouteState;
  /** Time left on the current route at normal speeds (s). */
  currentLeftS: number;
  /** Length of road avoided by the "avoid" option (km). */
  avoidKm: number;
  at: LatLng;
  onUse: (r: Route) => void;
  onClose: () => void;
}

export function RerouteSheet({ state, currentLeftS, avoidKm, at, onUse, onClose }: Props) {
  useT();
  const diff = (r: Route) => {
    const mins = Math.round((r.durationS - currentLeftS) / 60);
    if (Math.abs(mins) < 1) return t("reroute.same");
    return mins > 0 ? t("reroute.more", { n: mins }) : t("reroute.less", { n: -mins });
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t("reroute.title")} onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{t("reroute.title")}</div>
            <div className="sheet-sub">{t("reroute.sub")}</div>
          </div>
          <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}><CloseIcon size={20} /></button>
        </div>

        {state.status === "loading" && (
          <div className="skeleton-list" aria-busy="true" aria-label={t("reroute.loading")}>
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="note">{t("reroute.loading")}</div>
          </div>
        )}
        {state.status === "error" && <div className="note error">{state.message}</div>}

        {state.status === "ready" && (
          <div className="route-list">
            {state.options.length === 0 && <div className="note">{t("reroute.none")}</div>}
            {state.options.map((o, i) => (
              <div className="route-card reroute-opt" key={i}>
                <div className="route-main">
                  <span className="route-time">{fmtDuration(o.route.durationS)}</span>
                  <span className="route-dist">{formatDistance(o.route.lengthM)}</span>
                </div>
                <div className="route-meta">
                  <span>{diff(o.route)}</span>
                  <span className={`tag${o.kind === "avoid" ? "" : " muted"}`}>
                    {o.kind === "avoid" ? t("reroute.avoid", { km: avoidKm.toFixed(1) }) : t("reroute.alt")}
                  </span>
                </div>
                <button className="btn primary full" onClick={() => onUse(o.route)}>{t("reroute.use")}</button>
              </div>
            ))}
          </div>
        )}

        <button className="btn ghost full stay" onClick={onClose}>
          {t("reroute.current")} · {t("reroute.left", { t: fmtDuration(currentLeftS) })}
        </button>
        <div className="foot-note">{t("reroute.honest")}</div>
        <TrafficLinks at={at} />
      </div>
    </div>
  );
}
