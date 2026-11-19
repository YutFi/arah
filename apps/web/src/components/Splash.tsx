import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { useT } from "../lib/i18n";

/** Opening screen. Stays about 2 seconds, then fades out. */
export function Splash({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t1 = setTimeout(() => setLeaving(true), reduce ? 600 : 2000);
    const t2 = setTimeout(onDone, reduce ? 800 : 2450);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div className={`splash${leaving ? " leaving" : ""}`} aria-hidden={leaving}>
      <div className="splash-road" aria-hidden />
      <div className="splash-center">
        <div className="splash-logo">
          <Logo size={96} />
        </div>
        <div className="splash-word">Arah</div>
        <div className="splash-tag">{t("splash.tag")}</div>
      </div>
      <div className="splash-foot">
        <div className="splash-made">{t("splash.made")}</div>
        <div>{t("splash.foot")}</div>
      </div>
    </div>
  );
}
