import { useSyncExternalStore } from "react";
import { cleanVehicle, DEFAULT_VEHICLE, type Vehicle } from "@arah/core";

/**
 * Which vehicle you drive and the lorry's size. Kept only on this phone (localStorage),
 * never uploaded, so you do not have to enter it again.
 */
const KEY = "arah.vehicle";

function load(): Vehicle {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? cleanVehicle(JSON.parse(raw) as Partial<Vehicle>) : DEFAULT_VEHICLE;
  } catch {
    return DEFAULT_VEHICLE;
  }
}

let current: Vehicle = load();
const listeners = new Set<() => void>();

export function getVehicle(): Vehicle {
  return current;
}

export function setVehicle(next: Vehicle) {
  current = cleanVehicle(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* blocked or full: it still applies until the page closes */
  }
  for (const l of listeners) l();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useVehicle(): Vehicle {
  return useSyncExternalStore(subscribe, getVehicle, getVehicle);
}
