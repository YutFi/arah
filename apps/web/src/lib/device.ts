/** Small wrappers around phone features. Each one fails quietly where unsupported. */

// ---- Voice guidance --------------------------------------------------------

let voiceOn = true;
let voiceLang = "en-US";
export const voice = {
  get enabled() {
    return voiceOn;
  },
  set enabled(v: boolean) {
    voiceOn = v;
    if (!v) cancel();
  },
  /** Call from a tap handler: iOS only allows speech after a user gesture. */
  unlock() {
    try {
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch {
      /* ignore */
    }
  },
  /** Stop anything being said right now. */
  cancel() {
    cancel();
  },
  /** "ms-MY" for Bahasa Melayu, "en-US" for English. */
  set lang(v: string) {
    voiceLang = v;
  },
  speak(text: string) {
    if (!voiceOn || !text || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voiceLang;
      u.rate = 1;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  },
};

function cancel() {
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

// ---- Keep the screen on while navigating -----------------------------------

type Sentinel = { release(): Promise<void> };
let sentinel: Sentinel | null = null;
let wanted = false;

async function acquire() {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<Sentinel> } }).wakeLock;
    if (wl && wanted && !sentinel) sentinel = await wl.request("screen");
  } catch {
    sentinel = null; // denied or unsupported: navigation still works, screen may dim
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    // The browser drops the lock when the page is hidden; take it again on return.
    sentinel = null;
    if (document.visibilityState === "visible") void acquire();
  });
}

export const wakeLock = {
  async on() {
    wanted = true;
    await acquire();
  },
  async off() {
    wanted = false;
    try {
      await sentinel?.release();
    } catch {
      /* ignore */
    }
    sentinel = null;
  },
};
