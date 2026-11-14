// POST /api/monitors/check {runId} -> "Check now": triggers a run of every monitor of the plan.
// The result is read by GET /api/monitors?runId=<id>&sync=1 (the browser polls it); the webhook is not needed.
import { RUN_ID } from "@/lib/agent/runStore";
import { triggerCheck } from "@/lib/exa/monitors";
import { publicView, saveStore, withStore } from "@/lib/exa/monitorStore";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { runId?: unknown } | null;
  const runId = String(body?.runId ?? "");
  if (!RUN_ID.test(runId)) return Response.json({ error: "Missing or invalid runId." }, { status: 400 });
  if ((process.env.EXA_CACHE ?? "").toLowerCase() === "read") {
    return Response.json({ error: "Checking needs live access to Exa, and this server is running offline from its cache." }, { status: 409 });
  }
  try {
    const store = await withStore(runId, async (s) => {
      if (!s) return null;
      await Promise.all(
        s.monitors
          .filter((m) => !m.pending)
          .map((m) =>
            triggerCheck(m).catch((e) => {
              m.lastError = (e as Error).message.slice(0, 80);
            }),
          ),
      );
      await saveStore(s);
      return s;
    });
    if (!store) return Response.json({ error: "This plan is not being watched yet." }, { status: 404 });
    return Response.json({ watching: true, store: publicView(store) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[unblock] monitors: check failed:", (e as Error).message);
    return Response.json({ error: "Could not start the check right now. Try again in a moment." }, { status: 502 });
  }
}
