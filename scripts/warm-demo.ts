// npm run warm-demo
// Runs the demo sentences (live where .cache misses), then replaces demo-cache/ with exactly the Exa and
// LLM cache entries those runs used. demo-cache/ is tracked in git; the cache readers fall back to it.
// Same calls as the golden test and scripts/run-findSteps.ts: parseProfile -> findSteps -> getPages.
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.EXA_LOG ??= "0";
process.env.EXA_CACHE = "write";
process.env.LLM_CACHE = "write";

import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { findSteps } from "../lib/agent/findSteps";
import { parseProfile } from "../lib/agent/parseProfile";
import { resetUsedCacheEntries, usedCacheEntries } from "../lib/cache/disk";
import { DEMO_SENTENCES } from "../lib/demo/sentences";
import { exaStats, resetExaStats } from "../lib/exa/search";

const OUT = path.join(process.cwd(), "demo-cache");
const SUBDIR: Record<string, string> = { EXA_CACHE: "exa", LLM_CACHE: "llm" };

async function main() {
  resetUsedCacheEntries();
  resetExaStats();
  let llmCost = 0;
  for (const [key, sentence] of Object.entries(DEMO_SENTENCES)) {
    const t0 = Date.now();
    const parsed = await parseProfile(sentence);
    if (!parsed.ok) throw new Error(`${key}: out of scope`);
    const r = await findSteps(parsed.profile);
    const cost = r.reports.reduce((n, x) => n + (x.llm && x.llm.provider !== "exa" ? (x.llm.costUsd ?? 0) : 0), 0);
    llmCost += cost;
    console.log(
      `${key.padEnd(6)} ${((Date.now() - t0) / 1000).toFixed(1)}s  steps ${r.steps.length}  stubs ${r.stubs.length}  ` +
        `verified ${r.reports.reduce((n, x) => n + x.verified, 0)}  dropped ${r.dropped.length}  extractor $${cost.toFixed(3)}`,
    );
  }

  const entries = usedCacheEntries();
  await rm(OUT, { recursive: true, force: true });
  const counts: Record<string, number> = {};
  for (const e of entries) {
    const sub = SUBDIR[e.label];
    if (!sub) continue;
    await mkdir(path.join(OUT, sub), { recursive: true });
    const dest = path.join(OUT, sub, e.name);
    if (path.resolve(e.file) !== path.resolve(dest)) await copyFile(e.file, dest);
    counts[sub] = (counts[sub] ?? 0) + 1;
  }
  const stats = exaStats();
  console.log(`\ndemo-cache/: ${JSON.stringify(counts)} entries`);
  console.log(`exa: ${stats.live} live calls $${stats.costUsd.toFixed(3)}, ${stats.cached} cached; extractor $${llmCost.toFixed(3)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
