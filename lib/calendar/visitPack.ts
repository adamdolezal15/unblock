import type { Step } from "../types";

export const DETAILS_SUFFIX = "…full pack in Unblock";

/** The visit pack as plain text. Empty fields are omitted, never invented. */
export function visitPackText(step: Step, opts: { unblocks: Step[]; estimated: boolean }): string {
  const vp = step.visitPack;
  const lines: string[] = [];
  lines.push(`What: ${step.title} (${step.authority})`);
  lines.push(
    opts.unblocks.length > 0
      ? `Why: unblocks ${opts.unblocks.map((s) => s.title).join(", ")}`
      : "Why: nothing else depends on this step",
  );
  if (vp?.address) lines.push(`Address: ${vp.address}`);
  if (vp?.hours) lines.push(`Hours: ${vp.hours}`);
  if (vp?.documents?.length) {
    lines.push("Bring:");
    for (const d of vp.documents) lines.push(`- ${d}`);
  }
  if (vp?.bookingUrl) lines.push(`Booking: ${vp.bookingUrl}`);
  if (opts.estimated) {
    lines.push("Date is an estimate. Check the authority's site for real appointment times.");
  }
  const urls = [...new Set(step.citations.map((c) => c.url))];
  if (urls.length) {
    lines.push("Sources:");
    for (const u of urls) lines.push(`- ${u}`);
  }
  return lines.join("\n");
}

/** Truncates by code point to at most `max` characters including the suffix. */
export function truncateDetails(text: string, max = 1500): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const keep = max - Array.from(DETAILS_SUFFIX).length - 1;
  return chars.slice(0, keep).join("").trimEnd() + "\n" + DETAILS_SUFFIX;
}
