// POST /api/run  {text}  ->  NDJSON stream of PipelineEvent (lib/types.ts), one JSON object per line.
// ?fast=1 skips the demo replay delays. The run stops when the client disconnects; a global 75 s timeout
// (lib/agent/run.ts) ends it with a partial result, never a blank response.
import { RUN_TIMEOUT_MS } from "@/lib/agent/run";
import { encodeEvent, runStream } from "@/lib/agent/runStream";
import type { PipelineEvent } from "@/lib/types";

// Seconds. Pipeline deadline (75 s) + demo replay budget headroom; within Vercel's limits with Fluid compute.
export const maxDuration = 120;

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

  const fast = new URL(request.url).searchParams.get("fast") === "1";
  const stream = runStream(text, { signal: request.signal, fast, timeoutMs: RUN_TIMEOUT_MS });
  return new Response(stream, { headers: HEADERS });
}
