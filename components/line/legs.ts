// Which legs of a linear route are the blue line: every leg between the first and the last stop that is
// on the slowest chain. Stops off the chain still sit on the line, drawn as ink stations.
export function mainLegs(onMain: boolean[]): boolean[] {
  const first = onMain.indexOf(true);
  const last = onMain.lastIndexOf(true);
  return onMain.slice(0, -1).map((_, i) => first >= 0 && i >= first && i + 1 <= last);
}
