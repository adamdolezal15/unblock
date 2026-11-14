// A mark on the route line (globals.css .route): the logo's dot at a section start, its diamond at the
// shortcut step. Place inside a `relative` element that sits flush with the route's content edge.
import { Interchange, Station } from "./primitives";
import { C } from "./spec";

export function RouteMark({ kind = "dot", top = 6, onBand = false }: { kind?: "dot" | "diamond"; top?: number; onBand?: boolean }) {
  return (
    <span className="route-mark" style={{ top }} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        {onBand ? (
          <>
            <circle cx={12} cy={12} r={8} fill={C.blue} />
            <circle cx={12} cy={12} r={5.5} fill={C.white} />
          </>
        ) : kind === "diamond" ? (
          <Interchange x={12} y={12} scale={1.05} color={C.blue} lit />
        ) : (
          <Station x={12} y={12} main scale={0.85} />
        )}
      </svg>
    </span>
  );
}
