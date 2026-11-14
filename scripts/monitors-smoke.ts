// npx tsx scripts/monitors-smoke.ts
// Live check of the Search Monitors API as lib/exa/monitors.ts uses it: create one monitor (weekly, scoped to
// dvv.fi, webhook to the placeholder URL), trigger a run, poll it, print the shape, delete the monitor.
// One Exa search of cost. Never leaves a monitor behind.
import { config } from "dotenv";
config({ path: ".env.local" });

import { exa } from "../lib/exa/client";
import { INTERVAL, latestRun, webhookTarget } from "../lib/exa/monitors";

async function main() {
  const target = webhookTarget();
  console.log("webhook:", target.url, "(public:", target.public, ")");
  const m = await exa().monitors.create({
    name: "Unblock smoke test (deleted right after)",
    search: { query: process.argv[2] ?? "DVV registration in Finland: changes, updates and new requirements", numResults: 3, includeDomains: (process.argv[3] ?? "dvv.fi").split(","), contents: { highlights: true } },
    trigger: INTERVAL,
    webhook: { url: target.url, events: ["monitor.run.completed"] },
    metadata: { runId: "smoke", stepId: "dvv_registration" },
  });
  console.log("created", m.id, "status", m.status, "nextRunAt", m.nextRunAt, "secret returned:", typeof m.webhookSecret === "string" && m.webhookSecret.length > 0);
  try {
    const before = await latestRun(m.id);
    const trig = await exa().monitors.trigger(m.id);
    console.log("trigger response:", JSON.stringify(trig), "| runs before:", before?.id ?? null);
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const run = await latestRun(m.id);
      if (!run || run.id === before?.id) continue;
      console.log(`poll ${i}: run ${run.id} ${run.status}`);
      if (["completed", "failed", "cancelled"].includes(run.status)) {
        console.log("failReason:", run.failReason, "| results:", run.output?.results?.length ?? null);
        for (const r of run.output?.results ?? []) console.log(" -", JSON.stringify(r).slice(0, 260));
        return;
      }
    }
    console.log("no finished run within 75 s");
  } finally {
    await exa().monitors.delete(m.id);
    console.log("deleted", m.id);
  }
}
main().catch((e) => {
  console.error("FAILED:", (e as Error).message);
  process.exit(1);
});
