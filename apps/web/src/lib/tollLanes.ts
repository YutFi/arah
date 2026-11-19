import { summarizeBooths, readTollBooths, tollBoothQuery, type LatLng, type TollPaymentSummary } from "@arah/core";
import { askOverpass } from "./nearby";

const cache = new Map<string, Promise<TollPaymentSummary | null>>();

/**
 * Which booths at this plaza are tagged for Touch 'n Go, SmartTAG or RFID on OpenStreetMap.
 * One small question to the same free Overpass servers the app already uses; cached per plaza.
 * Resolves to null when the server cannot be reached (the screen then just says to read the signs).
 */
export function fetchTollPayment(plaza: LatLng, signal: AbortSignal): Promise<TollPaymentSummary | null> {
  const key = `${plaza.lat.toFixed(3)},${plaza.lng.toFixed(3)}`;
  let p = cache.get(key);
  if (!p) {
    p = askOverpass(tollBoothQuery(plaza), signal, 8000)
      .then((json) => summarizeBooths(readTollBooths(json)))
      .catch(() => null);
    cache.set(key, p);
    void p.then((r) => {
      if (r === null) cache.delete(key);
    });
  }
  return p;
}
