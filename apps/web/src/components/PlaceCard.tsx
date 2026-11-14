import { useState } from "react";
import { formatDistance } from "@arah/core";
import type { Place } from "../lib/geocode";
import { CatIcon, CATEGORY_UI } from "../lib/categories";

interface Props {
  place: Place;
  distanceM: number | null;
  /** True while we are still looking up a name for a dropped pin. */
  naming: boolean;
  onDirections: () => void;
  onClose: () => void;
}

export function PlaceCard({ place, distanceM, naming, onDirections, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const coords = `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
  const color = place.category ? CATEGORY_UI[place.category].color : "#e5484d";
  const sub = [place.sub, distanceM != null ? `${formatDistance(distanceM)} away` : null].filter(Boolean).join(" · ");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coords);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; the numbers are still on screen */
    }
  };

  return (
    <div className="sheet place-card" role="region" aria-label="Selected place" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
      <div className="sheet-head">
        <div className="place-head">
          <span className="cat-badge" style={{ background: color }}>
            {place.category ? <CatIcon id={place.category} size={20} /> : <span aria-hidden>📍</span>}
          </span>
          <div>
            <div className="sheet-title">{place.name}</div>
            {sub && <div className="sheet-sub">{sub}</div>}
            {place.detail && <div className="sheet-sub">{place.detail}</div>}
            {naming && <div className="sheet-sub">Looking up the address…</div>}
          </div>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
      </div>

      {place.approximate && place.note && <div className="note warn">{place.note}</div>}
      {place.hours && (
        <div className="foot-note">
          Hours (as mapped on OpenStreetMap, may be out of date): {place.hours}
        </div>
      )}
      <div className="coords">
        <span>{coords}</span>
        <button className="link" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>

      <div className="actions">
        <button className="btn primary" onClick={onDirections}>Directions</button>
        {place.phone && <a className="btn ghost call" href={`tel:${place.phone.replace(/[^+\d]/g, "")}`}>Call</a>}
      </div>
    </div>
  );
}
