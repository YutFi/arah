export type PermState = "granted" | "prompt" | "denied" | "unknown";

/** Ask the browser whether location is already allowed, without prompting. */
export async function queryLocationPermission(): Promise<PermState> {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const s = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return s.state as PermState;
  } catch {
    return "unknown"; // some browsers do not support asking
  }
}

/** Get told when the person changes the location setting. Returns an unsubscribe function. */
export function onLocationPermissionChange(cb: (s: PermState) => void): () => void {
  let status: PermissionStatus | null = null;
  let dead = false;
  const handler = () => status && cb(status.state as PermState);
  try {
    void navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (dead) return;
        status = s;
        s.addEventListener("change", handler);
      })
      .catch(() => {});
  } catch {
    /* unsupported */
  }
  return () => {
    dead = true;
    status?.removeEventListener("change", handler);
  };
}

export interface Env {
  os: "ios" | "android" | "other";
  browser: "safari" | "chrome" | "firefox" | "edge" | "other";
  /** Opened from the home screen icon rather than a browser tab. */
  standalone: boolean;
}

export function detectEnv(): Env {
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  let browser: Env["browser"] = "other";
  if (/EdgiOS|EdgA|Edg\//.test(ua)) browser = "edge";
  else if (/FxiOS|Firefox/.test(ua)) browser = "firefox";
  else if (/CriOS/.test(ua) || (/Chrome\//.test(ua) && !/OPR|SamsungBrowser/.test(ua))) browser = "chrome";
  else if (/Safari/.test(ua)) browser = "safari";

  return { os: ios ? "ios" : android ? "android" : "other", browser, standalone };
}
