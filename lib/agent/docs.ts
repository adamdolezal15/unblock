import type { ExaDoc } from "../types";
import { normalizeUrl } from "./verifyCitations";

/** One doc per (normalised) URL, keeping every highlight and the full text from any copy. */
export function mergeDocs(docs: ExaDoc[]): ExaDoc[] {
  const byUrl = new Map<string, ExaDoc>();
  for (const d of docs) {
    const k = normalizeUrl(d.url);
    const prev = byUrl.get(k);
    if (!prev) byUrl.set(k, { ...d, highlights: [...d.highlights] });
    else {
      for (const h of d.highlights) if (!prev.highlights.includes(h)) prev.highlights.push(h);
      prev.text ??= d.text;
    }
  }
  return [...byUrl.values()];
}
