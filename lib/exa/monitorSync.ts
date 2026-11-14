// Reads the result of runs that were triggered (the plan's first run, "Check now") into the store.
import { latestRun, resultsOf } from "./monitors";
import { ingestRun, type MonitorStore } from "./monitorStore";

const PENDING_TIMEOUT_MS = 5 * 60_000;

/** For every monitor waiting on a run: if a newer run than the one seen before has finished, ingest it. */
export async function collectPending(store: MonitorStore): Promise<void> {
  await Promise.all(
    store.monitors
      .filter((m) => m.pending)
      .map(async (m) => {
        const pending = m.pending!;
        try {
          const run = await latestRun(m.id);
          if (run && run.id !== pending.before && ["completed", "failed", "cancelled"].includes(run.status)) {
            ingestRun(store, m, run, (mon, r, baseline) => resultsOf(mon, r, baseline));
            delete m.pending;
          }
        } catch {
          // transient: try again on the next poll
        }
        if (m.pending && Date.now() - Date.parse(pending.since) > PENDING_TIMEOUT_MS) {
          m.lastError = "timed_out";
          delete m.pending;
        }
      }),
  );
}
