// Lake depth contours as SVG paths: nested, uneven closed curves around a centre, the way a Finnish basemap
// draws them. Pure and deterministic (same paths on the server and in the browser).

export type Lake = {
  cx: number;
  cy: number;
  /** Radius of the outermost ring. */
  r: number;
  rings: number;
  /** Shape seed: changes the wobble so no two lakes look alike. */
  seed: number;
  /** Horizontal stretch (1 = round). */
  stretch?: number;
};

const SAMPLES = 18;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Ring k (0 = outermost) of a lake: polar wobble with three harmonics, smoothed into cubic Beziers. */
export function ringPath(l: Lake, k: number): string {
  const t = 1 - k / (l.rings + 0.6); // inner rings shrink, never to zero
  const s = l.stretch ?? 1;
  const pts: [number, number][] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const a = (i / SAMPLES) * Math.PI * 2;
    // Inner rings wobble a little more and drift off-centre: depth is never concentric.
    const w =
      1 +
      0.13 * Math.sin(2 * a + l.seed) +
      (0.07 + 0.02 * k) * Math.sin(3 * a + l.seed * 1.7 + k * 0.5) +
      0.04 * Math.sin(5 * a + l.seed * 2.3 - k * 0.7);
    const rr = l.r * t * w;
    const dx = k * l.r * 0.035 * Math.cos(l.seed);
    const dy = k * l.r * 0.03 * Math.sin(l.seed);
    pts.push([l.cx + dx + Math.cos(a) * rr * s, l.cy + dy + Math.sin(a) * rr]);
  }
  // Closed Catmull-Rom to Bezier.
  const n = pts.length;
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d + "Z";
}

/** Every ring of a lake, outermost first. */
export const lakeRings = (l: Lake) => Array.from({ length: l.rings }, (_, k) => ringPath(l, k));

/** Homepage, 1440x900: three lakes around the centre column (13 rings). */
export const HERO_LAKES: Lake[] = [
  { cx: 250, cy: 380, r: 250, rings: 5, seed: 0.6, stretch: 1.1 },
  { cx: 1190, cy: 660, r: 260, rings: 5, seed: 2.4, stretch: 1.15 },
  { cx: 1150, cy: 150, r: 125, rings: 3, seed: 4.1 },
];
/** The filled innermost ring (3% blue): the deepest point of the east lake. */
export const HERO_DEEP = HERO_LAKES[1];

/** Result page, 1440x1500: lakes cut by the page edges, clear of the 1040px content column (10 rings). */
export const RESULT_LAKES: Lake[] = [
  { cx: -10, cy: 330, r: 230, rings: 4, seed: 1.3, stretch: 0.9 },
  { cx: 1460, cy: 760, r: 250, rings: 4, seed: 3.2, stretch: 0.9 },
  { cx: 40, cy: 1260, r: 150, rings: 2, seed: 5.0 },
];

/** Below 640px (390x844): two lakes in the corners, two rings each. */
export const MOBILE_LAKES: Lake[] = [
  { cx: 10, cy: 130, r: 150, rings: 2, seed: 0.9 },
  { cx: 390, cy: 760, r: 170, rings: 2, seed: 2.8 },
];
