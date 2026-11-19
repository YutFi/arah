import type { LatLng } from "@arah/core";
import { t } from "../lib/i18n";
import { googleTrafficUrl, wazeTrafficUrl } from "../lib/share";
import { CloseIcon } from "./icons";

/** Where Arah stands on live traffic, and where to see it. Never shows made-up congestion. */
export function TrafficLinks({ at }: { at: LatLng }) {
  return (
    <>
      <div className="foot-note">{t("traffic.see")}</div>
      <div className="tools">
        <a className="chip-btn" href={googleTrafficUrl(at)} target="_blank" rel="noopener noreferrer">{t("traffic.google")} ↗</a>
        <a className="chip-btn" href={wazeTrafficUrl(at)} target="_blank" rel="noopener noreferrer">{t("traffic.waze")} ↗</a>
      </div>
      <div className="foot-note">{t("traffic.safety")}</div>
    </>
  );
}

export function TrafficSheet({ at, onClose }: { at: LatLng; onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t("traffic.title")} onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="sheet-head">
          <div className="sheet-title">{t("traffic.title")}</div>
          <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}><CloseIcon size={20} /></button>
        </div>
        <p>{t("traffic.body")}</p>
        <TrafficLinks at={at} />
      </div>
    </div>
  );
}
