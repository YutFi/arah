import { useEffect, useState } from "react";
import type { Manifest } from "@arah/core";
import type { AwasState } from "../lib/awasData";
import { getManifest } from "../lib/osmData";
import { config } from "../lib/config";
import { setLang, useT } from "../lib/i18n";
import { CloseIcon } from "./icons";

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
  const { t, lang } = useT();
  const [snap, setSnap] = useState<Manifest | null | undefined>(undefined);
  useEffect(() => {
    void getManifest().then(setSnap);
  }, []);
  const n = (x: number) => x.toLocaleString(lang === "ms" ? "ms-MY" : "en-MY");
  const snapText =
    snap === undefined
      ? t("about.checking")
      : snap
        ? t("about.snap", {
            d: new Date(snap.builtAt).toLocaleDateString(lang === "ms" ? "ms-MY" : "en-MY", { day: "numeric", month: "short", year: "numeric" }),
            places: n(snap.counts.places),
            lights: n(snap.counts.signals),
            cams: n(snap.counts.cameras),
            tolls: n(snap.counts.tolls),
          })
        : t("about.noSnap");

  const awasText =
    awas.status === "loaded"
      ? t("about.awas.loaded", { n: awas.cameras.length, skipped: awas.skipped ? t("about.awas.skipped", { n: awas.skipped }) : "" })
      : awas.status === "empty"
        ? t("about.awas.empty")
        : awas.status === "loading"
          ? t("about.awas.loading")
          : t("about.awas.error");

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t("about.aria")}>
      <div className="modal-card" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="sheet-head">
          <div className="sheet-title">{t("about.title")}</div>
          <button className="icon-btn" aria-label={t("about.close")} onClick={onClose}><CloseIcon size={20} /></button>
        </div>

        <h3>{t("lang.label")}</h3>
        <div className="lang-row" role="group" aria-label={t("lang.label")}>
          <button className={`chip-btn${lang === "ms" ? " on" : ""}`} aria-pressed={lang === "ms"} onClick={() => setLang("ms")}>{t("lang.ms")}</button>
          <button className={`chip-btn${lang === "en" ? " on" : ""}`} aria-pressed={lang === "en"} onClick={() => setLang("en")}>{t("lang.en")}</button>
        </div>

        <h3>{t("about.works")}</h3>
        <p>{t("about.worksBody")}</p>
        <p>{t("about.worksRoute")}</p>

        <h3>{t("about.mapData")}</h3>
        <p>{snapText}</p>

        <h3>{t("about.notYet")}</h3>
        <ul>
          <li><b>{t("about.traffic")}</b> {t("about.trafficBody")}</li>
          <li><b>{t("about.tolls")}</b> {t("about.tollsBody")}</li>
          <li><b>{t("about.awas")}</b> {awasText} {t("about.awasTail")}</li>
          <li><b>{t("about.limits")}</b> {t("about.limitsBody")}</li>
        </ul>

        <h3>{t("about.privacy")}</h3>
        <ul>
          <li>{t("about.priv1")}</li>
          <li>
            {t("about.priv2", {
              routing: host(config.routingUrl),
              geo: host(config.geocoderUrl),
              addr: host(config.addressUrl),
              poi: config.poiUrls.map(host).join(" / "),
              tiles: host(config.styleUrl),
            })}
          </li>
          <li>{t("about.priv3")}</li>
        </ul>

        <h3>{t("about.web")}</h3>
        <p>{t("about.webBody")}</p>

        <h3>{t("about.credits")}</h3>
        <p>{t("about.creditsBody")}</p>
        <p>{t("about.made")}</p>
      </div>
    </div>
  );
}
