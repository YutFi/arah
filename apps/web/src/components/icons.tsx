import type { ReactNode } from "react";

/**
 * Icons drawn for Arah: plain strokes on a 24 px grid, coloured by the text colour around
 * them. They replace the emoji and arrow characters the app used before, which looked
 * different on every phone.
 */
type P = { size?: number; className?: string };

function Svg({ size = 20, className, children }: P & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const CarIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 16V13l1.8-4.6A2 2 0 0 1 7.7 7h8.6a2 2 0 0 1 1.9 1.4L20 13v3" />
    <path d="M3 13h18" />
    <circle cx="7.5" cy="16.5" r="1.8" />
    <circle cx="16.5" cy="16.5" r="1.8" />
    <path d="M9.3 16.5h5.4" />
  </Svg>
);

export const MotorcycleIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="5.5" cy="16" r="3" />
    <circle cx="18.5" cy="16" r="3" />
    <path d="M5.5 16 8.6 9.5H12l3.3 6.5" />
    <path d="M12 9.5 13.6 7h2.6" />
    <path d="m18.5 16-3-8.5" />
  </Svg>
);

export const TruckIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 6.5H13v10H2.5z" />
    <path d="M13 9.5h4l3.5 3.5v3.5H13" />
    <circle cx="6.5" cy="17.5" r="1.8" />
    <circle cx="17.5" cy="17.5" r="1.8" />
  </Svg>
);

export const CameraIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-1.8h6.2L15.3 7h4.2A1.5 1.5 0 0 1 21 8.5V17a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17z" />
    <circle cx="12" cy="12.5" r="3.2" />
  </Svg>
);

export const TollIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 20V6" />
    <rect x="5" y="7" width="15" height="3.6" rx="1" />
    <path d="M9.5 7v3.6M14 7v3.6" />
    <path d="M3 20h4" />
  </Svg>
);

export const SpeakerIcon = ({ off, ...p }: P & { off?: boolean }) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
    {off ? (
      <path d="m16 9.5 5 5m0-5-5 5" />
    ) : (
      <>
        <path d="M15.5 9a4 4 0 0 1 0 6" />
        <path d="M18 6.5a8 8 0 0 1 0 11" />
      </>
    )}
  </Svg>
);

/** Two roads leaving one point: "another way". */
export const ForkIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 21v-6" />
    <path d="m12 15-5.5-6" />
    <path d="m12 15 5.5-6" />
    <path d="M5 12.5V8.5h4" />
    <path d="M19 12.5V8.5h-4" />
  </Svg>
);

export const LocateIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5" />
  </Svg>
);

export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

export const SearchIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 5.5 5.5" />
  </Svg>
);

export const FlagIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 21V4" />
    <path d="M6 5h12l-3 4 3 4H6" />
  </Svg>
);

export const WarnIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 2.8 19.5h18.4z" />
    <path d="M12 10v4.2" />
    <circle cx="12" cy="16.8" r=".6" fill="currentColor" />
  </Svg>
);

/** Small mark for "motorcycle lane on this road": a lane stripe with a rider dot. */
export const LaneIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 3v18M17 3v18" />
    <path d="M12 4.5v3M12 10.5v3M12 16.5v3" />
  </Svg>
);


export const HomeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 11 12 4l8 7" />
    <path d="M6 10v9.5h4.5V14h3v5.5H18V10" />
  </Svg>
);

export const BriefcaseIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="8" width="17" height="11.5" rx="1.8" />
    <path d="M9 8V6.2A1.2 1.2 0 0 1 10.2 5h3.6A1.2 1.2 0 0 1 15 6.2V8" />
    <path d="M3.5 13.5h17" />
  </Svg>
);

export const ParkIcon = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M10 16.5V8h3.2a2.5 2.5 0 0 1 0 5H10" />
  </Svg>
);

export const StarIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Svg {...p}>
    <path d="m12 4 2.4 5 5.4.7-3.9 3.8.9 5.4L12 16.4 7.2 18.9l.9-5.4L4.2 9.7 9.6 9z" fill={filled ? "currentColor" : "none"} />
  </Svg>
);

export const MosqueIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 20v-6.5a6 6 0 0 1 12 0V20" />
    <path d="M12 7.5V4m0 0 .9 1.2M12 4l-.9 1.2" />
    <path d="M3.5 20h17" />
    <path d="M10 20v-3.2a2 2 0 0 1 4 0V20" />
  </Svg>
);

export const PinIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s6.5-5.8 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.2 6.5 11 6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
);

export const InfoIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r=".7" fill="currentColor" />
  </Svg>
);

export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

const rad = (d: number) => (d * Math.PI) / 180;

/** Valhalla manoeuvre type -> how far to turn (degrees, + right), or a special glyph. */
function turnFor(type: number): number | "flag" | "uturn-r" | "uturn-l" | "round" | "straight" {
  switch (type) {
    case 4:
    case 5:
    case 6:
      return "flag";
    case 9:
    case 17:
    case 23:
    case 36:
      return 38;
    case 10:
    case 2:
    case 18:
    case 20:
      return 90;
    case 11:
      return 138;
    case 12:
      return "uturn-r";
    case 13:
      return "uturn-l";
    case 14:
      return -138;
    case 15:
    case 3:
    case 19:
    case 21:
      return -90;
    case 16:
    case 24:
    case 37:
      return -38;
    case 26:
    case 27:
      return "round";
    default:
      return "straight";
  }
}

/** The turn arrow on the banner. Drawn as a line that bends, with an arrowhead, so every angle looks consistent. */
export function ManeuverIcon({ type, size = 44 }: { type: number; size?: number }) {
  const k = turnFor(type);
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const head = (x: number, y: number, deg: number) => (
    <polygon points="0,0 -8.5,13 8.5,13" transform={`translate(${x} ${y}) rotate(${deg})`} fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  );
  let body: ReactNode;
  if (k === "flag") {
    body = (
      <>
        <path d="M15 42V8" {...common} />
        <path d="M15 10h20l-6 7 6 7H15" {...common} strokeWidth={4} />
      </>
    );
  } else if (k === "uturn-r" || k === "uturn-l") {
    body = (
      <g transform={k === "uturn-l" ? "translate(48 0) scale(-1 1)" : undefined}>
        <path d="M16 43V20a8 8 0 0 1 16 0v8" {...common} />
        {head(32, 36, 180)}
      </g>
    );
  } else if (k === "round") {
    body = (
      <>
        <circle cx="24" cy="21" r="10" {...common} strokeWidth={4.5} />
        <path d="M24 44V32" {...common} strokeWidth={4.5} />
        {head(33, 12.5, 40)}
      </>
    );
  } else if (k === "straight") {
    body = (
      <>
        <path d="M24 42V16" {...common} />
        {head(24, 6, 0)}
      </>
    );
  } else {
    const L = 17;
    const ex = 24 + L * Math.sin(rad(k));
    const ey = 28 - L * Math.cos(rad(k));
    const bx = ex - 7 * Math.sin(rad(k));
    const by = ey + 7 * Math.cos(rad(k));
    body = (
      <>
        <path d={`M24 43V28L${bx.toFixed(1)} ${by.toFixed(1)}`} {...common} />
        {head(ex, ey, k)}
      </>
    );
  }
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
}
