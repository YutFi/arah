import { useMemo } from "react";
import { compassPoint, hhmm, nextPrayer, PRAYER_ORDER, prayerTimes, qiblaBearing } from "../lib/prayer";
import { t, useT, type Key } from "../lib/i18n";

interface Props {
  lat: number;
  lng: number;
  /** True when the position is the phone's, false when it is the map centre. */
  fromYou: boolean;
  onClose: () => void;
}

/** Today's prayer times and the Qibla direction, worked out on the phone. */
export function PrayerSheet({ lat, lng, fromYou, onClose }: Props) {
  const { t: tt } = useT();
  const now = new Date();
  const day = useMemo(() => prayerTimes(lat, lng, now), [lat, lng, now.toDateString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = nextPrayer(lat, lng, now);
  const bearing = qiblaBearing(lat, lng);
  const dir = compassPoint(bearing);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={tt("prayer.title")}>
      <div className="modal-card" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{tt("prayer.title")}</div>
            <div className="sheet-sub">{tt("prayer.for", { place: fromYou ? tt("prayer.here") : tt("prayer.centre") })}</div>
          </div>
          <button className="icon-btn" aria-label={tt("prayer.close")} onClick={onClose}>✕</button>
        </div>

        <ul className="prayer-list">
          {PRAYER_ORDER.map((id) => (
            <li key={id} className={`${id === next.id && !next.tomorrow ? "next" : ""}${id === "sunrise" ? " minor" : ""}`}>
              <span>{tt(`prayer.${id}` as Key)}</span>
              <span>{hhmm(day.times[id])}</span>
            </li>
          ))}
        </ul>
        {next.tomorrow && (
          <div className="foot-note">
            {t("prayer.fajr")} {t("prayer.tomorrow")}: {hhmm(next.at)}
          </div>
        )}

        <div className="qibla-note">
          <b>{tt("prayer.qiblaTitle")}</b>
          <p>{tt("prayer.qiblaSteps", { deg: Math.round(bearing), dir: tt(`dir.${dir}` as Key) })}</p>
        </div>

        <div className="foot-note">{tt("prayer.note")}</div>
      </div>
    </div>
  );
}
