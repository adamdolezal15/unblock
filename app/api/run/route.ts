// POST /api/run  {text}  ->  NDJSON stream of PipelineEvent (lib/types.ts), one JSON object per line.
// Body may carry {passcode}: with env LIVE_PASSCODE set, a live (non-demo) run needs it; demo sentences never do.
// ?fast=1 skips the demo replay delays. The run stops when the client disconnects; a global 75 s timeout
// (lib/agent/run.ts) ends it with a partial result, never a blank response.
import { timingSafeEqual } from "node:crypto";
import { RUN_TIMEOUT_MS } from "@/lib/agent/run";
import { isDemoSentence } from "@/lib/demo/sentences";
import { encodeEvent, runStream } from "@/lib/agent/runStream";
import type { PipelineEvent } from "@/lib/types";

// Seconds. Pipeline deadline (75 s) + replay budget, with ample headroom (Vercel Hobby with Fluid compute allows 300).
export const maxDuration = 300;

/** Shown on the first screen next to the demo links when a live run is refused. */
export const LOCKED_MESSAGE = "Live planning is limited during the hackathon. Try a saved demo:";

function passcodeOk(given: unknown): boolean {
  const want = process.env.LIVE_PASSCODE?.trim();
  if (!want) return true;
  if (typeof given !== "string") return false;
  const a = Buffer.from(given.trim());
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

const MAX_TEXT = 2000;

const HEADERS = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store, no-transform",
  "x-accel-buffering": "no",
  "x-content-type-options": "nosniff",
};

function single(status: number, e: PipelineEvent): Response {
  return new Response(encodeEvent(e), { status, headers: HEADERS });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return single(400, { type: "error", message: 'Send JSON: {"text": "your situation in one sentence"}', recoverable: true });
  }
  const raw = (body as { text?: unknown } | null)?.text;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    return single(400, { type: "error", message: "Describe your situation in one sentence, e.g. \"Czech citizen moving to Helsinki on 1 December for a job\".", recoverable: true });
  }
  if (text.length > MAX_TEXT) {
    return single(413, { type: "error", message: `Please keep it under ${MAX_TEXT} characters.`, recoverable: true });
  }

  if (!isDemoSentence(text) && !passcodeOk((body as { passcode?: unknown }).passcode)) {
    return single(401, { type: "locked", message: LOCKED_MESSAGE });
  }

  const fast = new URL(request.url).searchParams.get("fast") === "1";
  const stream = runStream(text, { signal: request.signal, fast, timeoutMs: RUN_TIMEOUT_MS });
  return new Response(stream, { headers: HEADERS });
}
