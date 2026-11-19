/** The Arah mark: a lane-yellow arrow on asphalt, with a dashed centre line running under it. */
export function Logo({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="Arah" className="logo">
      <rect width="96" height="96" rx="20" fill="#14181b" />
      <path d="M48 62 V92 M48 8 V14" stroke="#f6b800" strokeWidth="5" strokeDasharray="9 7" opacity=".55" />
      <path d="M48 16 L70 72 L48 60 L26 72 Z" fill="#f6b800" stroke="#f7f4ec" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}
