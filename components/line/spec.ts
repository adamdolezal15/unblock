// The line: one set of measurements for the logo, the hero timeline, Day by day and the metro map.
// Documented in docs/BRAND.md. Values are in SVG user units at 1x (= CSS px when unscaled).

export const C = {
  blue: "#003580", // the line: the slowest chain, primary actions
  lake: "#e0e7f0", // Finnish blue at 12% on white (lit / hover)
  ink: "#1b2330",
  grey: "#d5d0c6", // other routes, unlit stations
  paper: "#f6f4ef",
  white: "#ffffff",
  muted: "#5b6472",
  amber: "#a8640c", // disagreement only
  green: "#2e7d5b", // done only
} as const;

export const LINE = {
  main: 4, // the slowest chain
  branch: 2, // other routes
} as const;

export const STATION = {
  r: 6, // filled station
  halo: 2.5, // paper ring that separates a station from the line it sits on
  hollowStroke: 2.5, // estimated / online: hollow station
} as const;

export const DIAMOND = {
  size: 12, // side of the square before the 45° turn: "either one is enough"
  stroke: 2.5,
} as const;

export const TERMINUS = {
  r: 9, // "Set up": filled blue with a paper check
  check: 2.4,
} as const;

export const MOTION = {
  pulseMs: 900, // one status event: a pulse travels the line once
  shimmerMs: 4200, // idle: a slow light along the line
  turnMs: 420, // the diamond turns when the plan's shape is known
  drawMs: 520, // the check draws itself on done
} as const;
