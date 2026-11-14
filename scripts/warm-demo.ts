// npm run warm-demo               all demo sentences; demo-cache/ is REPLACED by exactly the entries they used
// npm run warm-demo -- marta      only these sentences; their entries are ADDED, other sentences' entries kept
// Runs the sentences (live where .cache misses) and copies the Exa and LLM cache entries they used into
// demo-cache/ (tracked in git; the cache readers fall back to it). Same calls as the golden test and
// scripts/run-findSteps.ts: parseProfile -> findSteps -> findCommunityTips -> detectConflicts (+ getPages).
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.EXA_LOG ??= "0";
process.env.EXA_CACHE = "write";
process.env.LLM_CACHE = "write";

import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { detectConflicts } from "../lib/agent/detectConflicts";
import { attachTips, findCommunityTips } from "../lib/agent/findCommunityTips";
import { findSteps } from "../lib/agent/findSteps";
import { parseProfile } from "../lib/agent/parseProfile";
import { resetUsedCacheEntries, usedCacheEntries } from "../lib/cache/disk";
import { DEMO_SENTENCES, type DemoKey } from "../lib/demo/sentences";
import { exaStats, resetExaStats } from "../lib/exa/search";

const OUT = path.join(process.cwd(), "demo-cache");
const SUBDIR: Record<string, string> = { EXA_CACHE: "exa", LLM_CACHE: "llm" };

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => !(a in DEMO_SENTENCES));
  if (unknown.length) throw new Error(`unknown demo sentence(s): ${unknown.join(", ")}; known: ${Object.keys(DEMO_SENTENCES).join(", ")}`);
  const keys = (args.length ? args : Object.keys(DEMO_SENTENCES)) as DemoKey[];
  const subset = args.length > 0;

  resetUsedCacheEntries();
  resetExaStats();
  let llmCost = 0;
  for (const key of keys) {
    const t0 = Date.now();
    const parsed = await parseProfile(DEMO_SENTENCES[key]);
    if (!parsed.ok) throw new Error(`${key}: out of scope`);
    const r = await findSteps(parsed.profile);
    const t = await findCommunityTips(parsed.profile, r.steps);
    const c = await detectConflicts(attachTips(r.steps, t.tips), t.tips, { profile: parsed.profile });
    const cost = r.reports.reduce((n, x) => n + (x.llm && x.llm.provider !== "exa" ? (x.llm.costUsd ?? 0) : 0), 0);
    llmCost += cost;
    console.log(
      `${key.padEnd(6)} ${((Date.now() - t0) / 1000).toFixed(1)}s  steps ${r.steps.length}  stubs ${r.stubs.length}  ` +
        `verified ${r.reports.reduce((n, x) => n + x.verified, 0)}  dropped ${r.dropped.length}  ` +
        `tips ${t.tips.length}  conflicts ${r.conflicts.length + c.conflicts.length}  step extractor $${cost.toFixed(3)}`,
    );
  }

  const entries = usedCacheEntries();
  if (!subset) await rm(OUT, { recursive: true, force: true });
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
  console.log(`\ndemo-cache/ (${subset ? `added for ${keys.join(", ")}` : "replaced"}): ${JSON.stringify(counts)} entries`);
  console.log(`exa: ${stats.live} live calls $${stats.costUsd.toFixed(3)}, ${stats.cached} cached; step extractor $${llmCost.toFixed(3)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
