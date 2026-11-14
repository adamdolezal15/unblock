// GET  /api/monitors?runId=<id>[&sync=1]  -> the plan's monitors and what they found (sync=1 also reads finished runs).
// POST /api/monitors {runId}               -> "Watch for changes": one weekly monitor per key official topic of the plan.
// Only ever called by a click. Monitors live on Exa, so this needs live access: refused in EXA_CACHE=read.
import { loadRun, RUN_ID } from "@/lib/agent/runStore";
import { collectPending } from "@/lib/exa/monitorSync";
import { createPlanMonitors, monitorTopics, WebhookNotConfigured } from "@/lib/exa/monitors";
import { loadStore, publicView, saveStore, withStore } from "@/lib/exa/monitorStore";

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const calm = (status: number, message: string) => json(status, { error: message });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? "";
  if (!RUN_ID.test(runId)) return calm(400, "Missing or invalid runId.");
  try {
    if (url.searchParams.get("sync") === "1") {
      const store = await withStore(runId, async (s) => {
        if (!s) return null;
        if (s.monitors.some((m) => m.pending)) {
          await collectPending(s);
          await saveStore(s);
        }
        return s;
      });
      return json(200, store ? { watching: true, store: publicView(store) } : { watching: false });
    }
    const store = await loadStore(runId);
    return json(200, store ? { watching: true, store: publicView(store) } : { watching: false });
  } catch {
    return calm(500, "Could not read the watch list right now.");
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { runId?: unknown } | null;
  const runId = String(body?.runId ?? "");
  if (!RUN_ID.test(runId)) return calm(400, "Missing or invalid runId.");
  if ((process.env.EXA_CACHE ?? "").toLowerCase() === "read") {
    return calm(409, "Watching needs live access to Exa, and this server is running offline from its cache.");
  }
  try {
    const run = await loadRun(runId);
    if (!run) return calm(404, "That plan is no longer on this server. Run it again first.");
    const existing = await loadStore(runId);
    if (existing) return json(200, { watching: true, store: publicView(existing) });
    if (monitorTopics(run).length === 0) return calm(422, "There are no official pages to watch for this plan.");
    const store = await createPlanMonitors(run);
    await saveStore(store);
    return json(200, { watching: true, store: publicView(store) });
  } catch (e) {
    if (e instanceof WebhookNotConfigured) {
      // Exa requires a webhook and rejects localhost, so there is no local stand-in.
      return calm(409, "Watching needs a public webhook address. Set MONITOR_WEBHOOK_URL in .env.local to a public https URL (a tunnel to this server), then restart.");
    }
    console.error("[unblock] monitors: create failed:", (e as Error).message);
    return calm(502, "Could not set up watching right now. Nothing was started. Try again in a moment.");
  }
}
