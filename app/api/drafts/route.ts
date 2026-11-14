// POST /api/drafts  {offerId, source: DraftSource}  ->  {draft} | {error}
// On demand (the "Prepare draft" button), never during the run. The source is the browser's own run state,
// cut down to profile, steps, conflicts and planned dates; offers and facts are re-derived here from it.
import { generateDraft } from "@/lib/agent/drafts";
import type { DraftSource } from "@/lib/agent/draftOffers";

export const maxDuration = 60;

const MAX_BYTES = 1_500_000;

function bad(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

function isSource(x: unknown): x is DraftSource {
  const s = x as DraftSource | null;
  return (
    !!s &&
    typeof s === "object" &&
    !!s.profile &&
    Array.isArray(s.profile.purpose) &&
    typeof s.profile.city === "string" &&
    Array.isArray(s.steps) &&
    s.steps.every((st) => st && typeof st.id === "string" && Array.isArray(st.requires)) &&
    Array.isArray(s.conflicts) &&
    !!s.dates &&
    typeof s.dates === "object"
  );
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return bad(413, "The plan is too large to draft from.");
  let body: { offerId?: unknown; source?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return bad(400, "Send JSON: {offerId, source}.");
  }
  if (typeof body.offerId !== "string" || !isSource(body.source)) return bad(400, "Send JSON: {offerId, source}.");
  try {
    const draft = await generateDraft(body.source, body.offerId);
    if (!draft) return bad(404, "This draft is not available for this plan.");
    return Response.json({ draft }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[unblock] draft failed:", e instanceof Error ? e.message : e);
    return bad(500, "The draft could not be prepared right now. Please try again.");
  }
}
