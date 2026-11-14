import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildGraph, schedule as buildSchedule } from "@/lib/graph";
import type { Schedule } from "@/lib/graph";
import { eventsFromSchedule, toIcs } from "@/lib/calendar";
import type { Profile, Step } from "@/lib/types";

export const runtime = "nodejs";

/** Shape of `.cache/runs/<runId>.json`. The pipeline that writes it comes later. */
type RunFile = { steps: Step[]; profile?: Pick<Profile, "arrivalDate">; schedule?: Schedule };

const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

function text(status: number, message: string): Response {
  return new Response(message + "\n", { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId || !RUN_ID.test(runId)) {
    return text(400, "Missing or invalid runId. Use /api/calendar.ics?runId=<id> (letters, digits, - and _).");
  }

  let run: RunFile;
  try {
    run = JSON.parse(await readFile(path.join(process.cwd(), ".cache", "runs", `${runId}.json`), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return text(404, `No run "${runId}" found: .cache/runs/${runId}.json does not exist yet. Run the plan first.`);
    }
    return text(500, `Run "${runId}" could not be read: ${(err as Error).message}`);
  }
  if (!Array.isArray(run.steps)) return text(500, `Run "${runId}" has no steps array.`);

  const sched = run.schedule ?? buildSchedule(buildGraph(run.steps), run.profile ?? {});
  const ics = toIcs(eventsFromSchedule(run.steps, sched));
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="unblock-${runId}.ics"`,
      "cache-control": "no-store",
    },
  });
}
