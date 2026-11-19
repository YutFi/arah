import { useEffect, useRef, useState } from "react";
import { CATEGORIES, parseCoordinates, type CategoryId, type LatLng } from "@arah/core";
import { searchPlaces, type Place } from "../lib/geocode";
import { CatIcon, CATEGORY_UI } from "../lib/categories";
import { catLabel, setLang, useT } from "../lib/i18n";
import { removeSaved, useSaved, type SavedPlace } from "../lib/saved";
import { BriefcaseIcon, CloseIcon, HomeIcon, InfoIcon, MosqueIcon, ParkIcon, SearchIcon, StarIcon } from "./icons";

interface Props {
  near: LatLng | null;
  onPick: (p: Place) => void;
  onAbout: () => void;
  active: CategoryId[];
  onToggleCategory: (id: CategoryId) => void;
  onPrayer: () => void;
  /** e.g. "Zohor 12:59", or null while no position is known. */
  prayerLabel: string | null;
  onPickSaved: (s: SavedPlace) => void;
  onParkHere: () => void;
  onTraffic: () => void;
}

function pinFor(c: LatLng, name: string): Place {
  return {
    id: `pin-${c.lat}-${c.lng}`,
    name,
    detail: "",
    lat: c.lat,
    lng: c.lng,
    kind: "pin",
    unnamed: true,
  };
}

export function SearchPanel({ near, onPick, onAbout, active, onToggleCategory, onPrayer, prayerLabel, onPickSaved, onParkHere, onTraffic }: Props) {
  const { t, lang } = useT();
  const saved = useSaved();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [focused, setFocused] = useState(false);
  const nearRef = useRef(near);
  nearRef.current = near;
  const inputRef = useRef<HTMLInputElement>(null);
  const submitAc = useRef<AbortController | null>(null);

  const coord = parseCoordinates(q);

  useEffect(() => {
    setNotFound(false);
    if (q.trim().length < 2 || coord) {
      setResults([]);
      setError(false);
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError(false);
      try {
        setResults(await searchPlaces(q, nearRef.current, ac.signal));
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      } finally {
        if (!ac.signal.aborted) setBusy(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const choose = (p: Place) => {
    setQ("");
    setResults([]);
    setNotFound(false);
    inputRef.current?.blur();
    onPick(p);
  };

  // Enter / "go": go straight to the best match, like other map apps do.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    if (coord) return choose(pinFor(coord, t("search.pinned")));
    const first = results[0];
    if (first && !first.approximate) return choose(first);
    submitAc.current?.abort();
    const ac = new AbortController();
    submitAc.current = ac;
    setBusy(true);
    setError(false);
    try {
      const found = await searchPlaces(q, nearRef.current, ac.signal, { deep: true });
      if (ac.signal.aborted) return;
      setResults(found);
      if (found[0]) choose(found[0]);
      else setNotFound(true);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(true);
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  };

  const showSaved = focused && q.length === 0;
  const showList = focused || q.length > 0;
  const typed = q.trim().length >= 2;

  return (
    <div className="search" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
      <form className="search-box" onSubmit={submit}>
        <span className="search-icon" aria-hidden><SearchIcon size={22} /></span>
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="go"
          placeholder={t("search.placeholder")}
          aria-label={t("search.aria")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          autoComplete="off"
        />
        <button
          type="button"
          className="lang-btn"
          aria-label={`${t("lang.label")}: ${lang === "ms" ? t("lang.en") : t("lang.ms")}`}
          onClick={() => setLang(lang === "ms" ? "en" : "ms")}
        >
          {lang === "ms" ? "EN" : "BM"}
        </button>
        <button type="button" className="icon-btn" aria-label={t("search.about")} onClick={onAbout}><InfoIcon size={20} /></button>
      </form>

      {showSaved && (
        <ul className="results saved-list" role="listbox" aria-label={t("saved.title")}>
          {saved.map((s) => (
            <li key={s.id} className="saved-item">
              <button className="result" onMouseDown={(e) => e.preventDefault()} onClick={() => onPickSaved(s)}>
                <span className="result-name">
                  {s.kind === "home" ? <HomeIcon size={16} /> : s.kind === "work" ? <BriefcaseIcon size={16} /> : s.kind === "parked" ? <ParkIcon size={16} /> : <StarIcon size={16} filled />}{" "}
                  {s.kind === "home" ? t("saved.home") : s.kind === "work" ? t("saved.work") : s.kind === "parked" ? t("saved.parked") : s.name}
                </span>
                {(s.kind !== "fav") && <span className="result-detail">{s.name}</span>}
              </button>
              <button className="icon-btn sm" aria-label={`${t("saved.delete")}: ${s.name}`} onMouseDown={(e) => e.preventDefault()} onClick={() => removeSaved(s.id)}><CloseIcon size={15} /></button>
            </li>
          ))}
          <li>
            <button className="result" onMouseDown={(e) => e.preventDefault()} onClick={onParkHere}>
              <span className="result-name">🅿️ {t("saved.parkHere")}</span>
            </button>
          </li>
          <li className="result-note">{saved.length === 0 ? t("saved.empty") + " " : ""}{t("saved.note")}</li>
        </ul>
      )}

      {!showSaved && showList && (coord || busy || error || notFound || results.length > 0 || typed) && (
        <ul className="results" role="listbox">
          {coord && (
            <li>
              <button className="result" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(pinFor(coord, t("search.pinned")))}>
                <span className="result-name">{t("search.coords")}</span>
                <span className="result-detail">{coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}</span>
              </button>
            </li>
          )}
          {busy && <li className="result-note">{t("search.searching")}</li>}
          {error && <li className="result-note error">{t("search.unavailable")}</li>}
          {!coord && !busy && !error && typed && results.length === 0 && (
            <li className="result-note">{notFound ? t("search.notFound") : t("search.noExact")}</li>
          )}
          {results.map((p, i) => (
            <li key={p.id} style={{ ["--i" as string]: i }}>
              <button className="result" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
                <span className="result-name">
                  {p.name}
                  {p.approximate && <span className="tag toll approx">{t("search.closest")}</span>}
                </span>
                {p.detail && <span className="result-detail">{p.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="cats" role="group" aria-label={t("search.showNearby")}>
        {CATEGORIES.map((c, i) => {
          const on = active.includes(c.id);
          return (
            <button
              key={c.id}
              className={`cat${on ? " on" : ""}`}
              aria-pressed={on}
              onClick={() => onToggleCategory(c.id)}
              style={{ ["--cat" as string]: CATEGORY_UI[c.id].color, ["--i" as string]: i }}
            >
              <span className="cat-dot"><CatIcon id={c.id} size={15} /></span>
              {catLabel(c.id)}
            </button>
          );
        })}
      </div>
      <div className="chips">
        {prayerLabel && (
          <button className="chip chip-btn-like" onClick={onPrayer} aria-label={t("prayer.title")}>
            <MosqueIcon size={16} /> {prayerLabel}
          </button>
        )}
        <button className="chip warn chip-btn-like" onClick={onTraffic}>{t("traffic.chip")} ⓘ</button>
      </div>
    </div>
  );
}
