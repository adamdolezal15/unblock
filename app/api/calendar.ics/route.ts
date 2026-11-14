// GET /api/calendar.ics?runId=<id>  ->  .ics with every visit (+ tip reminders) of a finished run.
// Runs are written by POST /api/run (lib/agent/runStore: .cache/runs/<runId>.json).
import { loadRun, RUN_ID } from "@/lib/agent/runStore";
import { eventsFromSchedule, toIcs } from "@/lib/calendar";
import { buildGraph, schedule as buildSchedule } from "@/lib/graph";
import { parseRefinements, refine, REFINE_PARAM } from "@/lib/refine/refine";


function text(status: number, message: string): Response {
  return new Response(message + "\n", { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId || !RUN_ID.test(runId)) {
    return text(400, "Missing or invalid runId. Use /api/calendar.ics?runId=<id> (letters, digits, - and _).");
  }

  let run;
  try {
    run = await loadRun(runId);
  } catch (err) {
    return text(500, `Run "${runId}" could not be read: ${(err as Error).message}`);
  }
  if (!run) return text(404, `No run "${runId}" found. Run the plan first (POST /api/run).`);
  if (!Array.isArray(run.steps)) return text(500, `Run "${runId}" has no steps array.`);

  const sched = run.schedule ?? buildSchedule(buildGraph(run.steps), run.profile ?? {});
  // "Make it more accurate" answers (?r=has_code,no_bank): the same pure re-plan the page does, no search.
  const answers = parseRefinements(new URL(request.url).searchParams.get(REFINE_PARAM));
  const events = answers.length
    ? refine({ profile: run.profile, steps: run.steps, tips: run.tips ?? [], startDate: sched.origin ?? sched.startDate }, answers).plan.events
    : eventsFromSchedule(run.steps, sched);
  const ics = toIcs(events);
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="unblock-${runId}.ics"`,
      "cache-control": "no-store",
    },
  });
}
