// A single station of the line as a small inline SVG (for HTML layouts: hero timeline, Day by day rail).
import { Station, Terminus } from "./primitives";

export type MarkerKind = "station" | "main" | "hollow" | "small" | "end";

export function Marker({ kind, size = 28 }: { kind: MarkerKind; size?: number }) {
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="block">
      {kind === "end" ? (
        <Terminus x={c} y={c} />
      ) : kind === "small" ? (
        <Station x={c} y={c} hollow scale={0.6} />
      ) : (
        <Station x={c} y={c} main={kind === "main"} hollow={kind === "hollow"} />
      )}
    </svg>
  );
}
