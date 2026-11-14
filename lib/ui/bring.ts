// The "Bring" list of a visit without near-duplicates. Sources for the steps of one visit often name the same
// thing twice in different words ("valid passport or identity card" / "valid passport or official proof of
// identity with a photograph"; two wordings of the income estimate). The first wording is kept.

const STOP = new Set(["a", "an", "and", "or", "the", "of", "for", "in", "to", "your", "with", "if", "any", "e", "g", "eg", "such", "as", "valid", "official"]);

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w && !STOP.has(w)),
  );

/** A passport (as an identity document), not an item that is a photograph ("one passport photograph taken …"). */
const isPassport = (s: string) => /\bpassport\b/i.test(s) && !/^\W*(?:one |a |two )?(?:passport )?photo(?:graph)?s?\b/i.test(s);

function similar(a: string, b: string): boolean {
  if (isPassport(a) && isPassport(b)) return true;
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return false;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both) >= 0.6;
}

export function dedupeBring<T extends { value: string }>(items: readonly T[]): T[] {
  const out: T[] = [];
  for (const it of items) if (!out.some((o) => o.value.trim().toLowerCase() === it.value.trim().toLowerCase() || similar(o.value, it.value))) out.push(it);
  return out;
}
