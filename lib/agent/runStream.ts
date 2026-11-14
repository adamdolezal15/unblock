// run() as an NDJSON byte stream (one PipelineEvent per line), shared by POST /api/run and scripts/run.ts.
// Demo replay: for an exact demo sentence served entirely from cache the pipeline finishes in about a
// second, so status lines are spaced 70–180 ms apart (~9 s for Marta's ~73 lines) to keep the activity feed readable on stage.
// The moment any live (uncached) Exa / LLM call happens, the spacing stops: real work is slow enough.
// `fast` skips the spacing (tests).
import { DEMO_SENTENCES } from "../demo/sentences";
import { newMeter } from "../events/context";
import type { PipelineEvent } from "../types";
import { run, type RunOptions } from "./run";

export type RunStreamOptions = Pick<RunOptions, "signal" | "timeoutMs" | "today" | "runId" | "persist"> & {
  /** Skip demo replay delays. */
  fast?: boolean;
  /** Override the replay delay (ms) per status line; default 70–180 ms at random. */
  replayDelay?: () => number;
};

/** Total replay delay cap, so a long cached run never drags on stage. */
export const REPLAY_BUDGET_MS = 10_000;

const DEMO_TEXTS: ReadonlySet<string> = new Set(Object.values(DEMO_SENTENCES));

export function isDemoSentence(text: string): boolean {
  return DEMO_TEXTS.has(text.trim());
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

export function encodeEvent(e: PipelineEvent): string {
  return `${JSON.stringify(e)}\n`;
}

export function runStream(text: string, opts: RunStreamOptions = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const gone = new AbortController(); // client disconnected (request aborted or stream cancelled)
  const onRequestAbort = () => gone.abort();
  if (opts.signal?.aborted) gone.abort();
  opts.signal?.addEventListener("abort", onRequestAbort, { once: true });

  const meter = newMeter();
  const replay = !opts.fast && isDemoSentence(text);
  const delay = opts.replayDelay ?? (() => 70 + Math.random() * 110);
  let spent = 0;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // Events are written in order through one promise chain; only status lines wait.
      let tail = Promise.resolve();
      const write = (e: PipelineEvent) => {
        if (gone.signal.aborted) return;
        try {
          controller.enqueue(enc.encode(encodeEvent(e)));
        } catch {
          gone.abort(); // stream already closed by the consumer
        }
      };
      const push = (e: PipelineEvent) => {
        tail = tail.then(async () => {
          const allCached = meter.exaLive === 0 && meter.llmLive === 0;
          if (replay && e.type === "status" && allCached && spent < REPLAY_BUDGET_MS) {
            const ms = delay();
            spent += ms;
            await sleep(ms, gone.signal);
          }
          write(e);
        });
      };

      run(text, { ...opts, signal: gone.signal, meter, onEvent: push })
        .catch((err) => push({ type: "error", message: `Unexpected failure: ${(err as Error).message}`, recoverable: false }))
        .finally(() => {
          tail.then(() => {
            opts.signal?.removeEventListener("abort", onRequestAbort);
            if (!gone.signal.aborted) controller.close();
          });
        });
    },
    cancel() {
      gone.abort();
    },
  });
}

/** Parse an NDJSON body back into events (scripts, tests). */
export async function* readEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<PipelineEvent> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as PipelineEvent;
    }
    if (done) break;
  }
  if (buf.trim()) yield JSON.parse(buf) as PipelineEvent;
}
