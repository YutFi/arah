import { useState } from "react";
import { TRUCK_LIMITS, tollClassFor, type TruckSpec, type Vehicle, type VehicleType } from "@arah/core";
import { useT, type Key } from "../lib/i18n";
import { CarIcon, MotorcycleIcon, TruckIcon } from "./icons";

const TYPES: { id: VehicleType; icon: typeof CarIcon; label: Key }[] = [
  { id: "car", icon: CarIcon, label: "veh.car" },
  { id: "motorcycle", icon: MotorcycleIcon, label: "veh.motorcycle" },
  { id: "truck", icon: TruckIcon, label: "veh.truck" },
];

interface Props {
  vehicle: Vehicle;
  onChange: (v: Vehicle) => void;
}

type SizeKey = "heightM" | "widthM" | "lengthM" | "weightT";
const SIZES: { key: SizeKey; label: Key; hint: string }[] = [
  { key: "heightM", label: "veh.height", hint: `${TRUCK_LIMITS.heightM.min}-${TRUCK_LIMITS.heightM.max}` },
  { key: "widthM", label: "veh.width", hint: `${TRUCK_LIMITS.widthM.min}-${TRUCK_LIMITS.widthM.max}` },
  { key: "lengthM", label: "veh.length", hint: `${TRUCK_LIMITS.lengthM.min}-${TRUCK_LIMITS.lengthM.max}` },
  { key: "weightT", label: "veh.weight", hint: `${TRUCK_LIMITS.weightT.min}-${TRUCK_LIMITS.weightT.max}` },
];

/** Car / motorcycle / truck, and for a truck its axles and size. */
export function VehiclePicker({ vehicle, onChange }: Props) {
  const { t } = useT();
  // What is typed is kept as text so "2." or an empty box is fine while typing; only a valid number is saved.
  const [typed, setTyped] = useState<Partial<Record<SizeKey, string>>>(() => {
    const o: Partial<Record<SizeKey, string>> = {};
    for (const s of SIZES) if (vehicle.truck[s.key] !== undefined) o[s.key] = String(vehicle.truck[s.key]);
    return o;
  });

  const setTruck = (patch: Partial<TruckSpec>) => onChange({ ...vehicle, truck: { ...vehicle.truck, ...patch } });

  const typeSize = (key: SizeKey, text: string) => {
    setTyped((o) => ({ ...o, [key]: text }));
    const n = text.trim() === "" ? undefined : Number(text.replace(",", "."));
    setTruck({ [key]: n !== undefined && Number.isFinite(n) ? n : undefined });
  };

  return (
    <div className="veh">
      <div className="veh-seg" role="radiogroup" aria-label={t("veh.aria")}>
        {TYPES.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            role="radio"
            aria-checked={vehicle.type === id}
            className={`veh-opt${vehicle.type === id ? " on" : ""}`}
            onClick={() => onChange({ ...vehicle, type: id })}
          >
            <Icon size={22} />
            <span>{t(label)}</span>
          </button>
        ))}
      </div>

      {vehicle.type === "truck" && (
        <fieldset className="veh-truck">
          <legend>{t("veh.truckTitle")}</legend>
          <div className="veh-axles" role="radiogroup" aria-label={t("veh.axles")}>
            <span className="veh-axles-label">{t("veh.axles")}</span>
            {([2, 3, 4] as const).map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={vehicle.truck.axles === n}
                className={`veh-axle${vehicle.truck.axles === n ? " on" : ""}`}
                onClick={() => setTruck({ axles: n })}
              >
                {n === 4 ? "4+" : n}
              </button>
            ))}
            <span className="veh-class">{t("veh.tollClass", { c: tollClassFor(vehicle) as number })}</span>
          </div>
          <div className="veh-sizes">
            {SIZES.map((s) => (
              <label key={s.key}>
                <span>{t(s.label)}</span>
                <input
                  inputMode="decimal"
                  placeholder={s.hint}
                  value={typed[s.key] ?? ""}
                  onChange={(e) => typeSize(s.key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <p className="veh-hint">{t("veh.truckHint")}</p>
        </fieldset>
      )}
    </div>
  );
}
