import { useEffect, useState } from "react";
import { DEFAULT_RADIUS_M, formatDistance, haversine, type LatLng, type Poi } from "@arah/core";
import { CatIcon, CATEGORY_UI } from "../lib/categories";
import { catLabel, subLabel, useT } from "../lib/i18n";
import { CloseIcon } from "./icons";

interface Props {
  pois: Poi[];
  from: LatLng;
  fromYou: boolean;
  status: "idle" | "loading" | "error";
  error: string | null;
  activeCount: number;
  onPick: (p: Poi) => void;
  onRetry: () => void;
  onClose: () => void;
}

export function NearbySheet({ pois, from, fromYou, status, error, activeCount, onPick, onRetry, onClose }: Props) {
  const { t } = useT();
  // Pre-built data answers instantly. If this takes a while we are waiting on a slow public server.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (status !== "loading") return;
    const t = setTimeout(() => setSlow(true), 3500);
    return () => clearTimeout(t);
  }, [status]);
  return (
    <div className="sheet nearby" role="region" aria-label={t("nearby.region")} style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
      <div className="sheet-head">
        <div>
          <div className="sheet-title">{fromYou ? t("nearby.you") : t("nearby.centre")}</div>
          <div className="sheet-sub">
            {t("nearby.sub", { km: DEFAULT_RADIUS_M / 1000 })}
          </div>
        </div>
        <button className="icon-btn" aria-label={t("nearby.hide")} onClick={onClose}><CloseIcon size={20} /></button>
      </div>

      {status === "loading" && (
        <div className="note">
          {t("nearby.loading")}
          {slow && t("nearby.slow")}
        </div>
      )}
      {status === "error" && (
        <div className="note error">
          {error} <button className="link" onClick={onRetry}>{t("nearby.retry")}</button>
        </div>
      )}
      {status === "idle" && activeCount > 0 && pois.length === 0 && (
        <div className="note">{t("nearby.none", { km: DEFAULT_RADIUS_M / 1000 })}</div>
      )}

      <ul className="poi-list">
        {pois.map((p) => (
          <li key={p.id}>
            <button className="poi" onClick={() => onPick(p)}>
              <span className="cat-badge sm" style={{ background: CATEGORY_UI[p.category].color }}>
                <CatIcon id={p.category} size={16} />
              </span>
              <span className="poi-text">
                <span className="poi-name">{p.name}</span>
                <span className="poi-sub">{subLabel(p.sub)} · {formatDistance(haversine(from, p))}</span>
              </span>
              <span className="poi-kind">{catLabel(p.category)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
