/** Share links and "open in another app". Nothing here talks to a server of ours. */

export interface Spot {
  lat: number;
  lng: number;
  name?: string;
}

const r5 = (n: number) => n.toFixed(5);

/** A link back to this app that opens straight at a place. */
export function shareLink(s: Spot): string {
  const base = new URL(import.meta.env.BASE_URL || "/", window.location.origin).toString();
  const name = s.name ? `&n=${encodeURIComponent(s.name.slice(0, 80))}` : "";
  return `${base}?to=${r5(s.lat)},${r5(s.lng)}${name}`;
}

/** Reads a share link from the address bar. Returns null if there is none or it is invalid. */
export function readShared(search: string): Spot | null {
  const q = new URLSearchParams(search);
  const to = q.get("to");
  if (!to) return null;
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(to);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const name = q.get("n")?.slice(0, 80) || undefined;
  return { lat, lng, name };
}

export const wazeUrl = (s: Spot) => `https://waze.com/ul?ll=${r5(s.lat)},${r5(s.lng)}&navigate=yes`;
export const googleMapsUrl = (s: Spot) => `https://www.google.com/maps/dir/?api=1&destination=${r5(s.lat)},${r5(s.lng)}`;
export const appleMapsUrl = (s: Spot) => `https://maps.apple.com/?daddr=${r5(s.lat)},${r5(s.lng)}`;

export const isApple = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;

/** Uses the phone's share sheet if there is one, otherwise copies the link. Returns what happened. */
export async function shareSpot(s: Spot, title: string): Promise<"shared" | "copied" | "failed"> {
  const url = shareLink(s);
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title, url });
      return "shared";
    }
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return "failed";
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
