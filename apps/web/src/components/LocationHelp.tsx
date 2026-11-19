import { detectEnv } from "../lib/permission";
import { boldParts, t, useT, type Key } from "../lib/i18n";
import { CloseIcon } from "./icons";

// Turns **bold** markers into <b> without using innerHTML.
function rich(text: string) {
  return boldParts(text).map((p, i) => (p.bold ? <b key={i}>{p.text}</b> : p.text));
}

/** Shown before we ask: explains why, so the browser prompt makes sense. */
export function LocationPrimer({ onAllow, onSkip }: { onAllow: () => void; onSkip: () => void }) {
  const { t } = useT();
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t("loc.turnOnBtn")}>
      <div className="modal-card center" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
        <div className="pin-art" aria-hidden>◎</div>
        <h2>{t("loc.primerTitle")}</h2>
        <p>{t("loc.primerBody")}</p>
        <p className="muted">
          {rich(t("loc.primerConfirm", { allow: `**${t("loc.primerAllow")}**`, allowWhile: `**${t("loc.primerAllowWhile")}**` }))}
        </p>
        <div className="actions col">
          <button className="btn primary" onClick={onAllow}>{t("loc.turnOnBtn")}</button>
          <button className="btn ghost" onClick={onSkip}>{t("loc.notNow")}</button>
        </div>
      </div>
    </div>
  );
}

const list = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => t(`${prefix}.${i + 1}` as Key));

function steps(): { title: string; items: string[] } {
  const env = detectEnv();

  if (env.os === "ios" && env.standalone) return { title: t("loc.ios.sa.title"), items: list("loc.ios.sa", 4) };
  if (env.os === "ios" && env.browser === "safari") return { title: t("loc.ios.saf.title"), items: list("loc.ios.saf", 4) };
  if (env.os === "ios") {
    const name = env.browser === "chrome" ? "Chrome" : env.browser === "firefox" ? "Firefox" : env.browser === "edge" ? "Edge" : t("loc.ios.other.browser");
    const items = [1, 2, 3, 4, 5].map((i) => t(`loc.ios.other.${i}` as Key, { name }));
    return { title: t("loc.ios.other.title", { name }), items };
  }
  if (env.os === "android") return { title: env.browser === "chrome" ? t("loc.and.chrome.title") : t("loc.and.title"), items: list("loc.and", 4) };
  return { title: t("loc.other.title"), items: list("loc.other", 3) };
}

/** Shown when the browser is blocking location: exact steps for this phone. */
export function LocationHelp({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }) {
  const { t } = useT();
  const s = steps();
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t("loc.helpAria")}>
      <div className="modal-card" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="sheet-head">
          <div className="sheet-title">{t("loc.helpTitle")}</div>
          <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}><CloseIcon size={20} /></button>
        </div>
        <p>{t("loc.helpBody")}</p>
        <h3>{s.title}</h3>
        <ol className="steps">
          {s.items.map((x, i) => (
            <li key={i}>{rich(x)}</li>
          ))}
        </ol>
        <div className="actions col">
          <button className="btn primary" onClick={onRetry}>{t("loc.retry")}</button>
          <button className="btn ghost" onClick={() => window.location.reload()}>{t("loc.reload")}</button>
        </div>
        <p className="muted small">{t("loc.helpFoot")}</p>
      </div>
    </div>
  );
}
