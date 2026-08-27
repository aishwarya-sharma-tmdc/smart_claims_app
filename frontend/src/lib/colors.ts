import type { ClaimStatus } from "./api";

// Concrete hex values that read well on both light and dark surfaces
// (charts/badges use these directly since SVG fill can't resolve CSS vars).
export const CHART = {
  teal: "#14b8a6",
  blue: "#5b8cff",
  violet: "#7c6bff",
  amber: "#e08704",
  ember: "#ff5537",
  good: "#0ea88f",
  slate: "#94a3b8",
};

export const STATUS_COLORS: Record<ClaimStatus, string> = {
  Approved: "#0ea88f",
  Denied: "#ff5537",
  "In Progress": "#5b8cff",
};

// Bundle-stage accent ramp (Initial → Decision Ready), cool→teal progression.
export const STAGE_COLORS = [
  "#94a3b8", // Initial
  "#5b8cff", // Growing
  "#7c6bff", // Enriched
  "#2bb0c9", // Comprehensive
  "#14b8a6", // Complete
  "#0ea88f", // Decision Ready
];

export const soft = (hex: string, pct = 14): string =>
  `color-mix(in srgb, ${hex} ${pct}%, transparent)`;

// A completeness / progress score → color (red low, amber mid, teal high).
export const progressColor = (pct: number): string =>
  pct >= 80 ? "#0ea88f" : pct >= 45 ? "#e08704" : "#ff5537";
