// Finished runs on disk: .cache/runs/<runId>.json. Read by GET /api/calendar.ics?runId=.
// On a read-only filesystem (serverless) the run goes to the OS temp dir instead; loadRun checks both.
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Schedule, CriticalPath } from "../graph/types";
import type { Conflict, Profile, RunSummary, Step, StepStub, StreamCalEvent, Tip } from "../types";

export type RunRecord = {
  runId: string;
  createdAt: string;
  text: string;
  partial: boolean;
  profile: Profile;
  assumptions: string[];
  /** Steps with community tips attached (what the calendar was built from). */
  steps: Step[];
  stubs: StepStub[];
  tips: Tip[];
  conflicts: Conflict[];
  schedule?: Schedule;
  criticalPath?: CriticalPath;
  events: StreamCalEvent[];
  summary: RunSummary;
};

export const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

const dirs = () => [path.join(process.cwd(), ".cache", "runs"), path.join(os.tmpdir(), "unblock-runs")];

/** Sortable and unguessable enough for a demo: time in base36 + 6 random bytes. */
export function newRunId(): string {
  return `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
}

/** Writes the run; returns the file path, or null if no location was writable. */
export async function saveRun(record: RunRecord): Promise<string | null> {
  if (!RUN_ID.test(record.runId)) throw new Error(`invalid runId ${record.runId}`);
  for (const dir of dirs()) {
    try {
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `${record.runId}.json`);
      await writeFile(file, JSON.stringify(record, null, 2), "utf8");
      return file;
    } catch {
      // try the next location
    }
  }
  return null;
}

/** null when no run with this id exists. Throws on unreadable / invalid files. */
export async function loadRun(runId: string): Promise<RunRecord | null> {
  if (!RUN_ID.test(runId)) return null;
  for (const dir of dirs()) {
    let raw: string;
    try {
      raw = await readFile(path.join(dir, `${runId}.json`), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw e;
    }
    return JSON.parse(raw) as RunRecord;
  }
  return null;
}
