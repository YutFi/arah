import type { CategoryId } from "@arah/core";

/** Look of each category: colour and a simple line icon (drawn for Arah). */
export const CATEGORY_UI: Record<CategoryId, { color: string; icon: string }> = {
  fuel: {
    color: "#f59e0b",
    icon: '<rect x="5" y="3" width="9" height="18" rx="1.5"/><path d="M7.5 7.5h4M14 8h2.5A1.5 1.5 0 0 1 18 9.5V16a1.5 1.5 0 0 0 3 0V8l-2.5-2.5"/>',
  },
  worship: {
    color: "#0d9488",
    icon: '<path d="M3 21h18M5 21V11.5L12 7l7 4.5V21"/><path d="M12 7V3.5M10.2 5h3.6M10 21v-5a2 2 0 0 1 4 0v5"/>',
  },
  food: {
    color: "#ef4444",
    icon: '<path d="M6 3v6a2.5 2.5 0 0 0 5 0V3M8.5 3v18M17 21V3c-2.5 1.5-3.5 4.5-3.5 8H17"/>',
  },
  fun: {
    color: "#8b5cf6",
    icon: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/><path d="M14.5 8.5v7" stroke-dasharray="1.6 1.8"/>',
  },
  hot: {
    color: "#ec4899",
    icon: '<path d="M12 3c.8 3.4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 1.6 1 2.6 2 2.6 0-3-1-4.6 1-8.1z"/>',
  },
  see: {
    color: "#10b981",
    icon: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  },
  ev: {
    color: "#06b6d4",
    icon: '<path d="M13 2 5 13.5h6L10 22l8-11.5h-6z"/>',
  },
  health: {
    color: "#dc2626",
    icon: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
  },
  money: {
    color: "#16a34a",
    icon: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
  },
  shop: {
    color: "#f97316",
    icon: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
  },
  parking: {
    color: "#3b82f6",
    icon: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M10 17V8h3a2.5 2.5 0 0 1 0 5h-3"/>',
  },
};

const svgAttrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/** Icon as an SVG string (for map markers). */
export function iconSvg(id: CategoryId, size = 18): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}">${CATEGORY_UI[id].icon}</svg>`;
}

/** Icon as a React element. */
export function CatIcon({ id, size = 18 }: { id: CategoryId; size?: number }) {
  return (
    <svg {...{ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }} width={size} height={size} aria-hidden="true" dangerouslySetInnerHTML={{ __html: CATEGORY_UI[id].icon }} />
  );
}
