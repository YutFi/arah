import { useState } from "react";
import { formatDistance } from "@arah/core";
import type { Place } from "../lib/geocode";
import { CatIcon, CATEGORY_UI } from "../lib/categories";
import { subLabel, useT } from "../lib/i18n";
import { removeSaved, savedAt, savePlace, useSaved, type SavedKind } from "../lib/saved";
import { appleMapsUrl, googleMapsUrl, isApple, shareSpot, wazeUrl } from "../lib/share";

interface Props {
  place: Place;
  distanceM: number | null;
  /** True while we are still looking up a name for a dropped pin. */
  naming: boolean;
  onDirections: () => void;
  onClose: () => void;
  /** Already one of the stops of the trip being built. */
  inTrip: boolean;
  onToggleTrip: () => void;
}

type Panel = null | "save" | "open";

export function PlaceCard({ place, distanceM, naming, onDirections, onClose, inTrip, onToggleTrip }: Props) {
  const { t } = useT();
  const saved = useSaved();
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const coords = `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
  const color = place.category ? CATEGORY_UI[place.category].color : "#e5484d";
  const sub = [subLabel(place.sub), distanceM != null ? t("place.away", { d: formatDistance(distanceM) }) : null].filter(Boolean).join(" · ");
  const here = savedAt(saved, place);
  const spot = { lat: place.lat, lng: place.lng, name: place.name };

  const flash = (set: (v: boolean) => void) => {
    set(true);
    setTimeout(() => set(false), 1600);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coords);
      flash(setCopied);
    } catch {
      /* clipboard may be blocked; the numbers are still on screen */
    }
  };

  const share = async () => {
    const r = await shareSpot(spot, place.name);
    if (r === "copied") flash(setShared);
  };

  const save = (kind: SavedKind) => {
    savePlace(kind, place.name, place.lat, place.lng);
    setPanel(null);
  };

  const kindLabel = (k: SavedKind) => (k === "home" ? t("place.home") : k === "work" ? t("place.work") : k === "parked" ? t("place.parked") : t("place.fav"));

  return (
    <div className="sheet place-card" role="region" aria-label={t("place.selected")} style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
      <div className="sheet-head">
        <div className="place-head">
          <span className="cat-badge" style={{ background: color }}>
            {place.category ? <CatIcon id={place.category} size={20} /> : <span aria-hidden>📍</span>}
          </span>
          <div>
            <div className="sheet-title">{place.name}</div>
            {sub && <div className="sheet-sub">{sub}</div>}
            {place.detail && <div className="sheet-sub">{place.detail}</div>}
            {naming && <div className="sheet-sub">{t("place.lookingUp")}</div>}
          </div>
        </div>
        <button className="icon-btn" aria-label={t("place.close")} onClick={onClose}>✕</button>
      </div>

      {place.approximate && place.approxFor && <div className="note warn">{t("place.note.approx", { q: place.approxFor })}</div>}
      {place.hours && <div className="foot-note">{t("place.hours", { h: place.hours })}</div>}
      <div className="coords">
        <span>{coords}</span>
        <button className="link" onClick={copy}>{copied ? t("place.copied") : t("place.copy")}</button>
      </div>

      <div className="tools" role="group">
        <button className={`chip-btn${here.length ? " on" : ""}`} aria-expanded={panel === "save"} onClick={() => setPanel(panel === "save" ? null : "save")}>
          {here.length ? "★ " + t("place.saved") : "☆ " + t("place.save")}
        </button>
        <button className="chip-btn" onClick={share}>{shared ? t("place.shared") : t("place.share")}</button>
        <button className="chip-btn" aria-expanded={panel === "open"} onClick={() => setPanel(panel === "open" ? null : "open")}>{t("place.openIn")}</button>
      </div>

      {panel === "save" && (
        <div className="tool-panel">
          <div className="tool-label">{t("place.saveAs")}</div>
          <div className="tools">
            <button className="chip-btn" onClick={() => save("home")}>{t("place.home")}</button>
            <button className="chip-btn" onClick={() => save("work")}>{t("place.work")}</button>
            <button className="chip-btn" onClick={() => save("fav")}>{t("place.fav")}</button>
          </div>
          {here.map((s) => (
            <div className="saved-row" key={s.id}>
              <span>★ {kindLabel(s.kind)}</span>
              <button className="link" onClick={() => removeSaved(s.id)}>{t("place.remove")}</button>
            </div>
          ))}
          <div className="foot-note">{t("saved.note")}</div>
        </div>
      )}

      {panel === "open" && (
        <div className="tool-panel">
          <div className="tools">
            <a className="chip-btn" href={wazeUrl(spot)} target="_blank" rel="noopener noreferrer">Waze</a>
            <a className="chip-btn" href={googleMapsUrl(spot)} target="_blank" rel="noopener noreferrer">Google Maps</a>
            {isApple() && <a className="chip-btn" href={appleMapsUrl(spot)} target="_blank" rel="noopener noreferrer">Apple Maps</a>}
          </div>
        </div>
      )}

      <div className="actions">
        <button className="btn primary" onClick={onDirections}>{t("place.directions")}</button>
        <button className={`btn ghost trip-add${inTrip ? " on" : ""}`} aria-pressed={inTrip} onClick={onToggleTrip}>
          {inTrip ? t("trip.in") : t("trip.add")}
        </button>
        {place.phone && <a className="btn ghost call" href={`tel:${place.phone.replace(/[^+\d]/g, "")}`}>{t("place.call")}</a>}
      </div>
    </div>
  );
}
