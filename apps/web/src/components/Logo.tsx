/** The Arah mark: a navigation arrow on a blue tile. */
export function Logo({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="Arah" className="logo">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f94ff" />
          <stop offset="1" stopColor="#0b4fe0" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="22" fill="url(#logo-bg)" />
      <path d="M48 17 L71 77 L48 64 L25 77 Z" fill="#fff" strokeLinejoin="round" />
    </svg>
  );
}
