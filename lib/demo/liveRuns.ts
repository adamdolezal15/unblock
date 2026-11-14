// How long a demo sentence's original live run took: demo-cache/runs/<key>.json (tracked in git).
// A replay is served entirely from cache and finishes in under a second, so it shows this number instead
// of its own; with no record the duration is omitted, never guessed.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { modeFromEnv, onVercel } from "../cache/disk";
import type { RunSummary } from "../types";
import { DEMO_SENTENCES, type DemoKey } from "./sentences";

export type LiveRunRecord = { totalMs: number; exaLive: number; llmLive: number; exa: number; llm: number; recordedAt: string };

const DIR = path.join(process.cwd(), "demo-cache", "runs");

const keyOf = (text: string): DemoKey | undefined =>
  (Object.keys(DEMO_SENTENCES) as DemoKey[]).find((k) => DEMO_SENTENCES[k] === text.trim());

const liveCalls = (c: Pick<LiveRunRecord, "exaLive" | "llmLive">) => c.exaLive + c.llmLive;

export async function readLiveRun(text: string): Promise<LiveRunRecord | null> {
  const key = keyOf(text);
  if (!key) return null;
  try {
    return JSON.parse(await readFile(path.join(DIR, `${key}.json`), "utf8")) as LiveRunRecord;
  } catch {
    return null;
  }
}

/**
 * The duration a finished run should show (RunSummary.liveMs). A run that did live work shows its own time and,
 * for a demo sentence that was mostly live (at least half its calls), is recorded unless a record with more live
 * calls exists. A run served entirely from cache shows the recorded original, else nothing.
 */
export async function liveDuration(text: string, s: Pick<RunSummary, "totalMs" | "partial" | "calls">): Promise<number | undefined> {
  const { calls } = s;
  if (liveCalls(calls) === 0) return (await readLiveRun(text))?.totalMs;
  const key = keyOf(text);
  const mostlyLive = liveCalls(calls) * 2 >= calls.exa + calls.llm;
  if (key && mostlyLive && !s.partial && !onVercel() && modeFromEnv("EXA_CACHE") !== "read") {
    const prev = await readLiveRun(text);
    if (!prev || liveCalls(calls) > liveCalls(prev)) {
      const rec: LiveRunRecord = { totalMs: s.totalMs, ...calls, recordedAt: new Date().toISOString() };
      await mkdir(DIR, { recursive: true })
        .then(() => writeFile(path.join(DIR, `${key}.json`), `${JSON.stringify(rec, null, 2)}\n`))
        .catch(() => undefined); // read-only filesystem (serverless): the run still shows its own time
    }
  }
  return s.totalMs;
}
