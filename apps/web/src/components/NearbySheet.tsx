import { CATEGORIES, formatDistance, haversine, type LatLng, type Poi } from "@arah/core";
import { CatIcon, CATEGORY_UI } from "../lib/categories";

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
  const label = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? "";
  return (
    <div className="sheet nearby" role="region" aria-label="Places nearby" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
      <div className="sheet-head">
        <div>
          <div className="sheet-title">{fromYou ? "Near you" : "Around the map centre"}</div>
          <div className="sheet-sub">
            Nearest first, within 2 km. From OpenStreetMap: no ratings or busy times.
          </div>
        </div>
        <button className="icon-btn" aria-label="Hide places" onClick={onClose}>✕</button>
      </div>

      {status === "loading" && <div className="note">Looking for places nearby…</div>}
      {status === "error" && (
        <div className="note error">
          {error} <button className="link" onClick={onRetry}>Try again</button>
        </div>
      )}
      {status === "idle" && activeCount > 0 && pois.length === 0 && (
        <div className="note">Nothing mapped within 2 km. Move the map and tap “Search this area”.</div>
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
                <span className="poi-sub">{p.sub} · {formatDistance(haversine(from, p))}</span>
              </span>
              <span className="poi-kind">{label(p.category)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
