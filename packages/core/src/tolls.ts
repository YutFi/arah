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
 * price is one flat amount per plaza.
 * What is NOT covered: CLOSED systems (PLUS North-South, ECE/LPT, Second Link
 * trunk, ...). Those charge by how far you drive between the plaza you enter
 * and the one you leave, so the price needs both ends. They are left out
 * on purpose rather than approximated.
 *
 * Rates change (they were also postponed several times). Treat as a guide and
 * confirm at the operator or at the Touch 'n Go / LLM toll calculator.
 */

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
}

const MOTORIST = "https://www.motorist.my/article/2829/list-of-malaysia-highway-toll-rates-plus-klk-lpt-and-others";
const TOLLGURU = "https://tollguru.mapup.ai/malaysia-toll";
const CARSOME = "https://www.carsome.my/news/?p=19937";
const CARZ = "https://www.carz.com.my/2025/07/toll-hike-delay-spares-private-car-users-up-to-83-in-fare-increase-nanta?amp=1";
const MALAYMAIL = "https://www.malaymail.com/news/malaysia/2022/12/31/lower-besraya-lekas-toll-charges-starting-tomorrow-says-works-minister/47830";
const DAY = "2026-11-14";
/** Latest date any price here was checked (shown to the person). */
export const TOLL_DATA_CHECKED_ON = DAY;

const rate = (plaza: string, highway: string, rm: number, sourceUrl: string, checkedWith: string): TollRate => ({
  plaza,
  highway,
  rm,
  sourceUrl,
  checkedWith,
  verifiedOn: DAY,
});

/**
 * Plazas whose name is shared with another highway's plaza (for example
 * "Damansara", "Petaling Jaya", "Pantai", "Batu") are left out on purpose:
 * matching by name could attach the wrong price.
 */
export const TOLL_RATES: readonly TollRate[] = [
  // KL-Karak Expressway: two open-system plazas
  rate("Gombak", "KL-Karak Expressway", 6.0, MOTORIST, CARSOME),
  rate("Bentong", "KL-Karak Expressway", 3.5, MOTORIST, CARSOME),
  // MEX
  rate("Putrajaya", "Maju Expressway (MEX)", 3.5, MOTORIST, CARZ),
  rate("Salak Selatan", "Maju Expressway (MEX)", 2.0, MOTORIST, TOLLGURU),
  // LDP
  rate("Penchala", "Damansara-Puchong Expressway (LDP)", 2.1, MOTORIST, TOLLGURU),
  rate("Puchong Jaya", "Damansara-Puchong Expressway (LDP)", 2.1, MOTORIST, TOLLGURU),
  rate("Puchong Selatan", "Damansara-Puchong Expressway (LDP)", 2.1, MOTORIST, TOLLGURU),
  // DUKE
  rate("Ayer Panas", "Duta-Ulu Klang Expressway (DUKE)", 2.5, MOTORIST, TOLLGURU),
  rate("Segambut", "Duta-Ulu Klang Expressway (DUKE)", 2.5, MOTORIST, TOLLGURU),
  rate("Sentul Pasar", "Duta-Ulu Klang Expressway (DUKE)", 2.5, MOTORIST, TOLLGURU),
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

export interface TollEstimate {
  /** Sum of the plazas that have a price (RM). */
  totalRm: number;
  priced: { name: string; highway: string; rm: number }[];
  /** Plazas on the route with no price in our list. */
  unpriced: string[];
  /** True when every plaza on the route has a price. */
  complete: boolean;
}

/** Add up what we can price. Never fills in a number for the rest. */
export function estimateTolls(plazas: readonly { name: string }[]): TollEstimate {
  const priced: TollEstimate["priced"] = [];
  const unpriced: string[] = [];
  for (const p of plazas) {
    const r = findTollRate(p.name);
    if (r) priced.push({ name: r.plaza, highway: r.highway, rm: r.rm });
    else unpriced.push(p.name);
  }
  const totalRm = Math.round(priced.reduce((a, b) => a + b.rm, 0) * 100) / 100;
  return { totalRm, priced, unpriced, complete: plazas.length > 0 && unpriced.length === 0 };
}
