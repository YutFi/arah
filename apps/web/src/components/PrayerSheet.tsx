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

        <div className="qibla">
          <svg className="qibla-dial" viewBox="0 0 80 80" role="img" aria-label={tt("prayer.qibla", { deg: Math.round(bearing), dir: tt(`dir.${dir}` as Key) })}>
            <circle cx="40" cy="40" r="36" fill="none" stroke="#c9d3e3" strokeWidth="2" />
            <text x="40" y="12" textAnchor="middle" fontSize="9" fill="#5b6575">N</text>
            <g transform={`rotate(${bearing} 40 40)`}>
              <path d="M40 14 L46 42 H34 Z" fill="#0d9488" />
              <circle cx="40" cy="44" r="3" fill="#0f172a" />
            </g>
          </svg>
          <div>
            <b>{tt("prayer.qibla", { deg: Math.round(bearing), dir: tt(`dir.${dir}` as Key) })}</b>
            <div className="foot-note">{tt("prayer.qiblaHelp")}</div>
          </div>
        </div>

        <div className="foot-note">{tt("prayer.note")}</div>
      </div>
    </div>
  );
}
