import { useEffect, useState } from "react";
import type { Manifest } from "@arah/core";
import type { AwasState } from "../lib/awasData";
import { getManifest } from "../lib/osmData";
import { config } from "../lib/config";

interface Props {
  awas: AwasState;
  onClose: () => void;
}

function host(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function AboutSheet({ awas, onClose }: Props) {
  const [snap, setSnap] = useState<Manifest | null | undefined>(undefined);
  useEffect(() => {
    void getManifest().then(setSnap);
  }, []);
  const snapText =
    snap === undefined
      ? "Checking…"
      : snap
        ? `Places, traffic lights, cameras and toll plazas come from an OpenStreetMap snapshot built on ${new Date(snap.builtAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })} (${snap.counts.places.toLocaleString()} places, ${snap.counts.signals.toLocaleString()} traffic lights, ${snap.counts.cameras.toLocaleString()} cameras, ${snap.counts.tolls.toLocaleString()} toll booths). It refreshes weekly.`
        : "The pre-built OpenStreetMap snapshot is not available, so places and counts use a slower live server.";

  const awasText =
    awas.status === "loaded"
      ? `${awas.cameras.length} verified camera record(s) loaded${awas.skipped ? `, ${awas.skipped} skipped (failed checks)` : ""}.`
      : awas.status === "empty"
        ? "Not loaded: no verified camera records exist yet, so no alerts will appear."
        : awas.status === "loading"
          ? "Loading…"
          : "Could not load the camera data file.";

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="About Arah">
      <div className="modal-card" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="sheet-head">
          <div className="sheet-title">Arah · early preview</div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <h3>What works now</h3>
        <p>Search by place name, street address or coordinates, a pin you can drop with a long press, nearby petrol, food, entertainment, hotspots and attractions, routes with alternatives, turn-by-turn directions with voice, current speed, rerouting, and a simulated drive for testing.</p>
        <p>Route cards count traffic lights, mapped speed cameras and toll plazas from OpenStreetMap, and the chosen route shows them on the map. Volunteers map these, so the real numbers can be higher.</p>

        <h3>Map data</h3>
        <p>{snapText}</p>

        <h3>What does not exist yet</h3>
        <ul>
          <li><b>Live traffic:</b> not available. Travel times assume typical road speeds.</li>
          <li><b>Toll prices:</b> a partial estimate. Only a small hand-checked list of flat-rate plazas (ordinary car) is priced, each from two public rate lists that agree, with the check date shown. Highways that charge by distance (such as PLUS) are not priced, and any plaza not on the list says "price not available".</li>
          <li><b>Speed cameras (AWAS):</b> {awasText} The camera count on a route card comes from OpenStreetMap, not from the official AWAS list, and there are no spoken camera alerts from it.</li>
          <li><b>Speed limits:</b> not shown yet.</li>
        </ul>

        <h3>Privacy</h3>
        <ul>
          <li>No account, no login, no saved trips. Your position lives in memory only and is gone when you close the app.</li>
          <li>Starting a route sends the start and end points to the routing server ({host(config.routingUrl)}). Typing in search sends your text, and a nearby point, to the search server ({host(config.geocoderUrl)}). Searching a full address can also ask {host(config.addressUrl)}. Showing places nearby, and counting lights and cameras on a route, send the area or route outline to {config.poiUrls.map(host).join(" or ")}. Map tiles come from {host(config.styleUrl)}.</li>
          <li>Those are public demo servers run by others. They see your network address like any website does.</li>
        </ul>

        <h3>Limits of a web app</h3>
        <p>Keep the screen on and the app in front. Phones stop web apps from reading GPS in the background, and the screen may dim on some iPhones. Do not interact with the phone while driving.</p>

        <h3>Credits</h3>
        <p>Map data © OpenStreetMap contributors. Basemap by OpenFreeMap. Routing by Valhalla (FOSSGIS e.V. demo server). Search by Photon (komoot) and Nominatim. Places, lights, cameras and toll plazas via the Overpass API.</p>
      </div>
    </div>
  );
}
