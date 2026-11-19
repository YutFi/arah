import { formatDistance } from "@arah/core";
import type { Place } from "../lib/geocode";
import { t } from "../lib/i18n";
import { CheckIcon, CloseIcon, FlagIcon } from "./icons";

/** Small bar shown on the map while a trip is being put together. */
export function TripBar({ count, onEdit, onStart }: { count: number; onEdit: () => void; onStart: () => void }) {
  return (
    <div className="trip-bar" role="region" aria-label={t("trip.title")}>
      <button className="trip-bar-main" onClick={onEdit}>
        <span className="trip-badge" aria-hidden>{count}</span>
        <span>{t(count === 1 ? "trip.bar.one" : "trip.bar.other", { n: count })}</span>
        <u>{t("trip.edit")}</u>
      </button>
      <button className="btn primary trip-go" onClick={onStart}>{t("trip.start")}</button>
    </div>
  );
}

interface SheetProps {
  stops: Place[];
  /** While driving: index of the stop you are heading to. Null when the trip has not started. */
  current: number | null;
  onMove: (i: number, d: -1 | 1) => void;
  onRemove: (i: number) => void;
  onNearest: () => void;
  onClear: () => void;
  onAddMore: () => void;
  /** While driving: head to this stop now. */
  onGoTo: (i: number) => void;
  onClose: () => void;
}

/** The list of stops: reorder, remove, sort nearest first. Also used while driving to skip ahead. */
export function TripSheet(p: SheetProps) {
  const driving = p.current !== null;
  const cur = p.current ?? -1;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t("trip.title")} onClick={p.onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="sheet-head">
          <div className="sheet-title">{t("trip.title")}</div>
          <button className="icon-btn" aria-label={t("common.close")} onClick={p.onClose}><CloseIcon size={20} /></button>
        </div>
        {!driving && <div className="foot-note">{t("trip.hint")}</div>}
        {p.stops.length === 0 && <p>{t("trip.empty")}</p>}
        <ol className="trip-list">
          {p.stops.map((s, i) => {
            const done = driving && i < cur;
            const now = driving && i === cur;
            return (
              <li key={s.id} className={`trip-row${done ? " done" : ""}${now ? " now" : ""}`}>
                <span className="trip-badge" aria-hidden>{done ? <CheckIcon size={14} /> : i + 1}</span>
                <div className="trip-name">
                  <b>{s.name}</b>
                  {s.detail && <small>{s.detail}</small>}
                  {now && <small className="tag">{t("trip.now")}</small>}
                </div>
                <div className="trip-ctl">
                  {!driving && (
                    <>
                      <button className="icon-btn" aria-label={t("trip.up")} disabled={i === 0} onClick={() => p.onMove(i, -1)}>↑</button>
                      <button className="icon-btn" aria-label={t("trip.down")} disabled={i === p.stops.length - 1} onClick={() => p.onMove(i, 1)}>↓</button>
                    </>
                  )}
                  {driving && i > cur && (
                    <button className="chip-btn" onClick={() => p.onGoTo(i)}>{t("trip.skipTo")}</button>
                  )}
                  {!done && !now && <button className="icon-btn" aria-label={t("trip.remove")} onClick={() => p.onRemove(i)}><CloseIcon size={20} /></button>}
                </div>
              </li>
            );
          })}
        </ol>
        {p.stops.length > 2 && (
          <>
            <div className="tools">
              <button className="chip-btn" onClick={p.onNearest}>{t("trip.nearest")}</button>
            </div>
            <div className="foot-note">{t("trip.nearestNote")}</div>
          </>
        )}
        <div className="actions">
          {!driving && <button className="btn ghost" onClick={p.onAddMore}>{t("trip.addMore")}</button>}
          <button className="btn primary" onClick={p.onClose}>{t("trip.close")}</button>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={p.onClear}>{driving ? t("trip.end") : t("trip.clear")}</button>
        </div>
      </div>
    </div>
  );
}

interface PromptProps {
  arrivedAt: Place;
  next: Place;
  awayM: number | null;
  busy: boolean;
  error: boolean;
  onGo: () => void;
  onFinish: () => void;
}

/**
 * Shown when you reach a stop that is not the last one. It stays until you answer:
 * there is no timer and tapping outside does nothing, so it never decides for you.
 */
export function NextStopPrompt(p: PromptProps) {
  return (
    <div className="modal prompt" role="alertdialog" aria-modal="true" aria-labelledby="next-stop-title" aria-describedby="next-stop-body">
      <div className="modal-card center" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="prompt-flag" aria-hidden><FlagIcon size={30} /></div>
        <h2 id="next-stop-title">{t("trip.arrived", { name: p.arrivedAt.name })}</h2>
        <p id="next-stop-body">
          <b>{t("trip.next")}</b>
          <br />
          {t("trip.nextName", { name: p.next.name })}
          {p.awayM != null && (
            <>
              <br />
              <small>{t("trip.nextAway", { d: formatDistance(Math.round(p.awayM / 100) * 100) })}</small>
            </>
          )}
        </p>
        {p.error && <div className="note error" role="alert">{t("trip.err")}</div>}
        <div className="actions col">
          <button className="btn primary" disabled={p.busy} onClick={p.onGo}>
            {p.busy ? t("trip.finding") : p.error ? t("trip.retry") : t("trip.go")}
          </button>
          <button className="btn ghost" disabled={p.busy} onClick={p.onFinish}>{t("trip.finish")}</button>
        </div>
      </div>
    </div>
  );
}
