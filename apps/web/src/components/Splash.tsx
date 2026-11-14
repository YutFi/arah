import { useEffect, useState } from "react";
import { Logo } from "./Logo";

/** Opening screen. Stays about 2 seconds, then fades out. */
export function Splash({ onDone }: { onDone: () => void }) {
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
      <svg className="splash-route" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path d="M-20 700 C 120 640, 80 520, 220 470 S 330 330, 260 220 S 420 120, 440 40" />
        <circle cx="440" cy="40" r="7" />
      </svg>
      <div className="splash-center">
        <div className="splash-logo">
          <span className="ring r1" />
          <span className="ring r2" />
          <Logo size={104} />
        </div>
        <div className="splash-word">Arah</div>
        <div className="splash-tag">Navigate Malaysia, privately.</div>
      </div>
      <div className="splash-foot">Open source · No account · No tracking</div>
    </div>
  );
}
