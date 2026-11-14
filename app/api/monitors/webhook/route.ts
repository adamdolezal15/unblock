// POST /api/monitors/webhook  <-  Exa, when a monitor run completes.
// Verifies `Exa-Signature` against the webhook secret stored for that monitor before anything from the body is stored.
import { RUN_ID } from "@/lib/agent/runStore";
import { resultsOf, verifyWebhookSignature } from "@/lib/exa/monitors";
import { ingestRun, saveStore, withStore } from "@/lib/exa/monitorStore";

type Event = {
  type?: string;
  data?: {
    id?: string;
    monitorId?: string;
    status?: string;
    failReason?: string | null;
    completedAt?: string | null;
    metadata?: Record<string, string> | null;
    output?: { results?: Record<string, unknown>[] | null } | null;
  };
};

const status = (code: number) => new Response(null, { status: code });

export async function POST(request: Request) {
  const raw = await request.text(); // the signature covers the raw bytes
  let event: Event;
  try {
    event = JSON.parse(raw) as Event;
  } catch {
    return status(400);
  }
  const data = event.data;
  const runId = data?.metadata?.runId ?? ""; // only used to find the stored secret; nothing is trusted before the check below
  if (!data?.monitorId || !data.id || !RUN_ID.test(runId)) return status(400);

  const code = await withStore(runId, async (store) => {
    const monitor = store?.monitors.find((m) => m.id === data.monitorId);
    if (!store || !monitor) return 404;
    if (!verifyWebhookSignature(raw, request.headers.get("exa-signature"), monitor.secret)) return 401;
    if (event.type !== "monitor.run.completed") return 200; // signed, but not an event we store
    ingestRun(
      store,
      monitor,
      { id: data.id!, status: data.status ?? "completed", completedAt: data.completedAt, failReason: data.failReason, output: data.output },
      (m, r, baseline) => resultsOf(m, r, baseline),
    );
    delete monitor.pending;
    await saveStore(store);
    return 200;
  }).catch(() => 500);

  return status(code);
}
