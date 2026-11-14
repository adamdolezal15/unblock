// Short display names for steps.
import { shortLabel } from "@/lib/agent/stepTaxonomy";

/** Short label from the taxonomy ("ID code at Vero"), else the title without "(already done)". */
export function nodeLabel(id: string, title: string): string {
  return shortLabel(id) ?? title.replace(/ \(already done\)$/, "");
}
