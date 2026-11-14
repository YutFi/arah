import { validateDataset, type CameraRecord } from "@arah/core";

/** Positions are approximate, so allow a little more sideways slack than exact data would need. */
export const AWAS_MATCH = { maxOffRouteM: 35, maxBearingDiffDeg: 60 } as const;
/** The banner shows this far ahead (JPJ signboards warn from about 1 km). */
export const AWAS_LOOKAHEAD_M = 1000;

export interface AwasState {
  status: "loading" | "empty" | "loaded" | "error";
  cameras: CameraRecord[];
  skipped: number;
}

/**
 * Load the AWAS dataset. Records that fail the data gate (no source, no
 * verification date, bad coordinates) are dropped and never reach the screen.
 */
export async function loadAwas(): Promise<AwasState> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/awas.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const { valid, issues } = validateDataset(await res.json());
    return {
      status: valid.length === 0 ? "empty" : "loaded",
      cameras: valid,
      skipped: new Set(issues.map((i) => i.id)).size,
    };
  } catch {
    return { status: "error", cameras: [], skipped: 0 };
  }
}
