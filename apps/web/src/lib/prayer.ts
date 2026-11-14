import { CalculationMethod, Coordinates, Madhab, PrayerTimes, Qibla } from "adhan";

/**
 * Prayer times worked out on the phone from position and date. No internet, nothing sent.
 * Method: the Singapore setting in adhan (Fajr 20°, Isha 18°), the closest built-in match for
 * Malaysia. It can differ from JAKIM e-Solat by a few minutes.
 */
export type PrayerId = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";

export interface DayTimes {
  date: Date;
  times: Record<PrayerId, Date>;
}

const ORDER: PrayerId[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

export function prayerTimes(lat: number, lng: number, date: Date): DayTimes {
  const params = CalculationMethod.Singapore();
  params.madhab = Madhab.Shafi;
  const pt = new PrayerTimes(new Coordinates(lat, lng), date, params);
  return {
    date,
    times: { fajr: pt.fajr, sunrise: pt.sunrise, dhuhr: pt.dhuhr, asr: pt.asr, maghrib: pt.maghrib, isha: pt.isha },
  };
}

/** The next prayer after `now` (skipping sunrise, which is not a prayer). Rolls over to tomorrow's Subuh. */
export function nextPrayer(lat: number, lng: number, now: Date): { id: PrayerId; at: Date; tomorrow: boolean } {
  const today = prayerTimes(lat, lng, now);
  for (const id of ORDER) {
    if (id === "sunrise") continue;
    if (today.times[id].getTime() > now.getTime()) return { id, at: today.times[id], tomorrow: false };
  }
  const next = new Date(now.getTime() + 24 * 3600 * 1000);
  const tmr = prayerTimes(lat, lng, next);
  return { id: "fajr", at: tmr.times.fajr, tomorrow: true };
}

export const PRAYER_ORDER = ORDER;

/** Direction of the Kaaba, degrees clockwise from true north. */
export const qiblaBearing = (lat: number, lng: number) => Qibla(new Coordinates(lat, lng));

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export const compassPoint = (deg: number) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export const hhmm = (d: Date) =>
  d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
