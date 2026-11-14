import { detectEnv } from "../lib/permission";

/** Shown before we ask: explains why, so the browser prompt makes sense. */
export function LocationPrimer({ onAllow, onSkip }: { onAllow: () => void; onSkip: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Turn on location">
      <div className="modal-card center" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
        <div className="pin-art" aria-hidden>◎</div>
        <h2>See where you are</h2>
        <p>
          Arah uses your location to start routes from where you are and to guide you turn by turn.
          It stays on your phone: no account, no saved trips.
        </p>
        <p className="muted">Your phone will ask you to confirm. Tap <b>Allow</b> (or <b>Allow While Using App</b>).</p>
        <div className="actions col">
          <button className="btn primary" onClick={onAllow}>Turn on location</button>
          <button className="btn ghost" onClick={onSkip}>Not now</button>
        </div>
      </div>
    </div>
  );
}

function steps(): { title: string; items: string[] } {
  const env = detectEnv();

  if (env.os === "ios" && env.standalone) {
    return {
      title: "On iPhone (Arah on your Home Screen)",
      items: [
        "Open the iPhone **Settings** app.",
        "Tap **Privacy & Security**, then **Location Services**. Make sure it is **On**.",
        "Scroll down to **Safari Websites** and choose **While Using the App**.",
        "Come back to Arah, close it fully, open it again, and tap **Try again**.",
      ],
    };
  }
  if (env.os === "ios" && env.browser === "safari") {
    return {
      title: "On iPhone, in Safari",
      items: [
        "Tap the **aA** icon at the left of the address bar.",
        "Tap **Website Settings**, then set **Location** to **Allow**.",
        "If Location is missing or greyed out: open the **Settings** app, tap **Privacy & Security**, **Location Services**, make sure it is **On**, then **Safari Websites**, then **While Using the App**.",
        "Come back here and tap **Try again**.",
      ],
    };
  }
  if (env.os === "ios") {
    const name = env.browser === "chrome" ? "Chrome" : env.browser === "firefox" ? "Firefox" : env.browser === "edge" ? "Edge" : "your browser";
    return {
      title: `On iPhone, in ${name}`,
      items: [
        "Open the iPhone **Settings** app.",
        "Tap **Privacy & Security**, then **Location Services**. Make sure it is **On**.",
        `Scroll to **${name === "your browser" ? "your browser" : name}** and choose **While Using the App**.`,
        "Come back here and tap **Try again**. If it is still blocked, close this tab, open the link again, and tap **Allow** when asked.",
        "Safari is the most reliable browser for this on iPhone.",
      ],
    };
  }
  if (env.os === "android") {
    return {
      title: env.browser === "chrome" ? "On Android, in Chrome" : "On Android",
      items: [
        "Swipe down from the top of the screen and make sure **Location** is switched on.",
        "In the browser, tap the **icon at the left of the address bar** (a lock or small sliders).",
        "Tap **Permissions**, then **Location**, and choose **Allow**. If you see **Reset permission**, tap it and then allow location again.",
        "Come back here and tap **Try again**.",
      ],
    };
  }
  return {
    title: "In your browser",
    items: [
      "Click the **lock or sliders icon** at the left of the address bar.",
      "Find **Location** and set it to **Allow**.",
      "Tap **Try again**, or reload the page.",
    ],
  };
}

// Turns **bold** markers into <b> without using innerHTML.
function rich(text: string) {
  return text.split("**").map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

/** Shown when the browser is blocking location: exact steps for this phone. */
export function LocationHelp({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }) {
  const s = steps();
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="How to turn on location">
      <div className="modal-card" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="sheet-head">
          <div className="sheet-title">Turn on location</div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <p>Your browser is blocking location for Arah, so it cannot show where you are.</p>
        <h3>{s.title}</h3>
        <ol className="steps">
          {s.items.map((t, i) => (
            <li key={i}>{rich(t)}</li>
          ))}
        </ol>
        <div className="actions col">
          <button className="btn primary" onClick={onRetry}>Try again</button>
          <button className="btn ghost" onClick={() => window.location.reload()}>Reload the page</button>
        </div>
        <p className="muted small">
          Menu names can differ a little between phones. You can still use Arah without location: search for a
          place and the route starts from the middle of the map.
        </p>
      </div>
    </div>
  );
}
