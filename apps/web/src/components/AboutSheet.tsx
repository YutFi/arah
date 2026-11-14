import type { AwasState } from "../lib/awasData";
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
        <p>Search, routes with alternatives, turn-by-turn directions with voice, current speed, rerouting, and a simulated drive for testing.</p>

        <h3>What does not exist yet</h3>
        <ul>
          <li><b>Live traffic:</b> not available. Travel times assume typical road speeds.</li>
          <li><b>Toll prices:</b> not available. Routes only say when a section is a toll road.</li>
          <li><b>Speed cameras (AWAS):</b> {awasText}</li>
          <li><b>Speed limits:</b> not shown yet.</li>
        </ul>

        <h3>Privacy</h3>
        <ul>
          <li>No account, no login, no saved trips. Your position lives in memory only and is gone when you close the app.</li>
          <li>Starting a route sends the start and end points to the routing server ({host(config.routingUrl)}). Typing in search sends your text, and a nearby point, to the search server ({host(config.geocoderUrl)}). Map tiles come from {host(config.styleUrl)}.</li>
          <li>Those are public demo servers run by others. They see your network address like any website does.</li>
        </ul>

        <h3>Limits of a web app</h3>
        <p>Keep the screen on and the app in front. Phones stop web apps from reading GPS in the background, and the screen may dim on some iPhones. Do not interact with the phone while driving.</p>

        <h3>Credits</h3>
        <p>Map data © OpenStreetMap contributors. Basemap by OpenFreeMap. Routing by Valhalla (FOSSGIS e.V. demo server). Search by Photon (komoot).</p>
      </div>
    </div>
  );
}
