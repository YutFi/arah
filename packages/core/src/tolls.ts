/**
 * Toll price ESTIMATE for the plazas a route passes through.
 *
 * There is no free, official, machine-readable toll price list for Malaysia.
 * So this file only holds prices that were read from a public rate list AND
 * checked against a second, independent source. Every record says where it
 * came from and when it was checked. If a plaza is not here, the app says
 * "price not available" for it. It never guesses.
 *
 * What is covered: Class 1 (ordinary car) at OPEN-system plazas, where the
 * price is one flat amount per plaza. Class 2 and 3 (lorries) are priced only at the
 * few plazas where two sources agree on those too. Motorcycles pay no highway toll.
 * What is NOT covered exactly: CLOSED systems (PLUS North-South, ECE/LPT, Second
 * Link trunk, ...). Those charge by how far you drive between the plaza you enter
 * and the one you leave. Only ONE of them has a rate we can source: the
 * North-South Expressway (PLUS), charged per kilometre (see NSE_RM_PER_KM). For that
 * one the app gives an ESTIMATE (distance driven on it x the per-km rate) and says
 * so. All other closed systems are left out rather than guessed.
 *
 * Rates change (they were also postponed several times). Treat as a guide and
 * confirm at the operator or at the Touch 'n Go / LLM toll calculator.
 */

import type { TollClass } from "./vehicle";

export interface TollRate {
  /** Name as people say it, without "Plaza Tol". */
  plaza: string;
  highway: string;
  /** Class 1 (car), flat per plaza, in RM. */
  rm: number;
  /** Where the number was read. */
  sourceUrl: string;
  /** A second source that agrees. */
  checkedWith: string;
  /** Date (YYYY-MM-DD) the numbers were read and compared. */
  verifiedOn: string;
  /**
   * Lorry prices at the same plaza (Class 2 = two axles with 5 or 6 wheels, Class 3 = three or more
   * axles). Only present when two sources agree on them, so a missing entry means "not priced".
   */
  lorry?: { class2: number; class3: number; checkedWith: string };
}

const MOTORIST = "https://www.motorist.my/article/2829/list-of-malaysia-highway-toll-rates-plus-klk-lpt-and-others";
const TOLLGURU = "https://tollguru.mapup.ai/malaysia-toll";
const CARSOME = "https://www.carsome.my/news/?p=19937";
const CARZ = "https://www.carz.com.my/2025/07/toll-hike-delay-spares-private-car-users-up-to-83-in-fare-increase-nanta?amp=1";
const MALAYMAIL = "https://www.malaymail.com/news/malaysia/2022/12/31/lower-besraya-lekas-toll-charges-starting-tomorrow-says-works-minister/47830";
const MALAYMAIL_2015 = "https://malaymail.com/news/malaysia/2015/10/12/toll-rates-up-for-9-major-highways-in-klang-valley-from-thursday/985939";
const MEX_SITE = "https://www.mex.com.my/features-and-facilities/toll-operations";
const DAY = "2026-11-14";
/** Latest date any price here was checked (shown to the person). */
export const TOLL_DATA_CHECKED_ON = DAY;

const rate = (
  plaza: string,
  highway: string,
  rm: number,
  sourceUrl: string,
  checkedWith: string,
  lorry?: TollRate["lorry"],
): TollRate => ({
  plaza,
  highway,
  rm,
  sourceUrl,
  checkedWith,
  verifiedOn: DAY,
  ...(lorry ? { lorry } : {}),
});

/**
 * Plazas whose name is shared with another highway's plaza (for example
 * "Damansara", "Petaling Jaya", "Pantai", "Batu") are left out on purpose:
 * matching by name could attach the wrong price.
 */
export const TOLL_RATES: readonly TollRate[] = [
  // KL-Karak Expressway: two open-system plazas
  rate("Gombak", "KL-Karak Expressway", 6.0, MOTORIST, CARSOME, { class2: 12, class3: 18, checkedWith: MALAYMAIL_2015 }),
  rate("Bentong", "KL-Karak Expressway", 3.5, MOTORIST, CARSOME, { class2: 7, class3: 10.5, checkedWith: MALAYMAIL_2015 }),
  // MEX
  rate("Putrajaya", "Maju Expressway (MEX)", 3.5, MOTORIST, CARZ),
  rate("Salak Selatan", "Maju Expressway (MEX)", 2.0, MOTORIST, TOLLGURU, { class2: 4, class3: 6, checkedWith: MEX_SITE }),
  // LDP
  rate("Penchala", "Damansara-Puchong Expressway (LDP)", 2.1, MOTORIST, TOLLGURU),
  rate("Puchong Jaya", "Damansara-Puchong Expressway (LDP)", 2.1, MOTORIST, TOLLGURU),
  rate("Puchong Selatan", "Damansara-Puchong Expressway (LDP)", 2.1, MOTORIST, TOLLGURU),
  // DUKE
  rate("Ayer Panas", "Duta-Ulu Klang Expressway (DUKE)", 2.5, MOTORIST, TOLLGURU, { class2: 3.8, class3: 5, checkedWith: MALAYMAIL_2015 }),
  rate("Segambut", "Duta-Ulu Klang Expressway (DUKE)", 2.5, MOTORIST, TOLLGURU),
  rate("Sentul Pasar", "Duta-Ulu Klang Expressway (DUKE)", 2.5, MOTORIST, TOLLGURU, { class2: 3.8, class3: 5, checkedWith: MALAYMAIL_2015 }),
  // KESAS
  rate("Kemuning", "Shah Alam Expressway (KESAS)", 2.0, MOTORIST, TOLLGURU),
  rate("Sunway", "Shah Alam Expressway (KESAS)", 2.0, MOTORIST, TOLLGURU),
  // Besraya
  rate("Loke Yew", "Sungai Besi Expressway (BESRAYA)", 1.85, MOTORIST, MALAYMAIL),
  rate("Mines", "Sungai Besi Expressway (BESRAYA)", 1.85, MOTORIST, MALAYMAIL),
];

/** Words that decorate a plaza name but do not identify it. */
const NOISE = /\b(plaza|tol|toll|plazas|lebuhraya|lebuh|raya|expressway|highway|north|south|utara|selatan|east|west|timur|barat)\b/g;

/** Lower-case, no punctuation, no "Plaza Tol". Keeps direction words only for the whole-name check. */
export function normalizePlaza(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stripNoise = (s: string) => s.replace(NOISE, " ").replace(/\s+/g, " ").trim();

/**
 * Find the price for one plaza name from the map. Matches only when the
 * plaza's identifying words appear as whole words; returns null when nothing
 * matches or when more than one rate matches (ambiguous).
 */
export function findTollRate(osmName: string): TollRate | null {
  const full = normalizePlaza(osmName);
  if (!full) return null;
  const hits = TOLL_RATES.filter((r) => {
    const key = normalizePlaza(r.plaza);
    return new RegExp(`(^| )${key}( |$)`).test(full);
  });
  if (hits.length !== 1) return null;
  const hit = hits[0] as TollRate;
  // Anything left over besides "Plaza Tol" and a side (north/south/east/west) means a
  // different place that merely contains the name, e.g. "Penchala Link": no price.
  const rest = stripNoise(full.replace(new RegExp(`(^| )${normalizePlaza(hit.plaza)}( |$)`), " "));
  return rest === "" ? hit : null;
}

/**
 * North-South Expressway (PLUS), Class 1 car, RM per km driven.
 * Source: the 18% cut from 13.6 to 11.15 sen/km from 1 Feb 2020, frozen to 2058
 * (Bernama, 31 Jan 2020). PLUS says the fare is "cent/km x distance travelled",
 * measured from its limit of maintenance responsibilities, not from the plazas
 * (https://www.plus.com.my/FAQ.html). So distance on the road x this rate is close
 * but NOT the same as the fare charged. Sanity check only: published fares such as
 * Sungai Besi to Skudai RM33.21 work out to about 298 km at this rate, which is
 * about the road distance. Checked on 2026-11-15.
 */
export const NSE_RM_PER_KM = 0.1115;
/**
 * Lorry fares on the North-South Expressway as a multiple of the car fare. Not a published
 * per-km rate: worked out from two published full-journey fares on the same rate list
 * (Damansara to Juru RM35.26 / 64.60 / 86.10 and Sungai Besi to Skudai RM33.21 / 60.70 / 80.90, Class 1 / 2 / 3),
 * where the ratios come to 1.83 and 2.44 on both. Checked on 2026-11-19. Used for an estimate only.
 */
export const NSE_CLASS_FACTOR: Record<TollClass, number> = { 1: 1, 2: 1.83, 3: 2.44 };
export const NSE_CLASS_SOURCE = MOTORIST;
export const NSE_RATE_SOURCE = "https://www.bernama.com/en/news.php?id=1810647";

export interface TollEstimate {
  /** Sum of the plazas that have a price (RM). */
  totalRm: number;
  priced: { name: string; highway: string; rm: number }[];
  /** Plazas on the route with no price in our list. */
  unpriced: string[];
  /** True when every plaza on the route has a price. */
  complete: boolean;
}

/** The flat price at a plaza for a toll class, or null when we have none for that class. */
export function rateFor(r: TollRate, cls: TollClass): number | null {
  if (cls === 1) return r.rm;
  if (!r.lorry) return null;
  return cls === 2 ? r.lorry.class2 : r.lorry.class3;
}

/** Add up what we can price. Never fills in a number for the rest. */
export function estimateTolls(plazas: readonly { name: string }[], cls: TollClass = 1): TollEstimate {
  const priced: TollEstimate["priced"] = [];
  const unpriced: string[] = [];
  for (const p of plazas) {
    const r = findTollRate(p.name);
    const rm = r ? rateFor(r, cls) : null;
    if (r && rm !== null) priced.push({ name: r.plaza, highway: r.highway, rm });
    else unpriced.push(p.name);
  }
  const totalRm = Math.round(priced.reduce((a, b) => a + b.rm, 0) * 100) / 100;
  return { totalRm, priced, unpriced, complete: plazas.length > 0 && unpriced.length === 0 };
}

/** Names OpenStreetMap uses for the North-South Expressway. */
const NSE_NAME = /(^|\b)(lebuhraya utara.?selatan|north.?south expressway)(\b|$)|^e[12]$/i;

export interface RouteTollEstimate extends TollEstimate {
  /** Which toll class this is for. */
  tollClass: TollClass;
  /** Part of totalRm that comes from a published flat price (RM). */
  exactRm: number;
  /** Part of totalRm that is distance x rate on the North-South Expressway (RM, unrounded). */
  estimatedRm: number;
  /** Kilometres driven on the North-South Expressway, or 0. */
  nseKm: number;
}

/**
 * Toll for a whole route: flat prices for the open plazas we can price, plus a
 * distance-based estimate for the PLUS North-South Expressway. Plazas on the
 * expressway itself are covered by that estimate, so they are not "unpriced".
 * Anything else we cannot price stays in `unpriced`; nothing is invented.
 */
export function estimateRouteToll(
  route: { maneuvers: readonly { streetNames: readonly string[]; toll: boolean; distanceFromStartM: number; lengthM: number }[] },
  plazas: readonly { name: string; distanceAlongM: number }[],
  cls: TollClass = 1,
): RouteTollEstimate {
  const spans = route.maneuvers
    .filter((m) => m.toll && m.streetNames.some((n) => NSE_NAME.test(n.trim())))
    .map((m) => ({ from: m.distanceFromStartM, to: m.distanceFromStartM + m.lengthM }));
  const nseM = spans.reduce((a, s) => a + (s.to - s.from), 0);
  const MARGIN_M = 1500; // the entry and exit plazas sit on the ramps just outside the expressway section
  const onNse = (d: number) => spans.some((s) => d >= s.from - MARGIN_M && d <= s.to + MARGIN_M);

  const priced: TollEstimate["priced"] = [];
  const unpriced: string[] = [];
  for (const p of plazas) {
    const r = findTollRate(p.name);
    const rm = r ? rateFor(r, cls) : null;
    if (r && rm !== null) priced.push({ name: r.plaza, highway: r.highway, rm });
    else if (!onNse(p.distanceAlongM)) unpriced.push(p.name);
  }
  const exactRm = Math.round(priced.reduce((a, b) => a + b.rm, 0) * 100) / 100;
  const nseKm = nseM / 1000;
  const estimatedRm = nseKm * NSE_RM_PER_KM * NSE_CLASS_FACTOR[cls];
  return {
    tollClass: cls,
    totalRm: Math.round((exactRm + estimatedRm) * 100) / 100,
    exactRm,
    estimatedRm,
    nseKm,
    priced,
    unpriced,
    complete: unpriced.length === 0 && (plazas.length > 0 || nseKm > 0),
  };
}

/** The shown amount for an estimate: rounded to 50 sen, because it is not exact. */
export function roundEstimateRm(rm: number): number {
  return Math.round(rm * 2) / 2;
}
