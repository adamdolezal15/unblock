// npx tsx scripts/eval-invariants.ts [--only a,b] [--export] [--read]
// Runs every profile of the invariant matrix (lib/eval/profiles.ts) through the real pipeline (runStream →
// the UI reducer, exactly what the browser gets), checks lib/eval/invariants.ts on each, and prints a
// profile × invariant table. Cached Exa / LLM answers are reused (.cache, then demo-cache); only misses
// call out. --read: cache only. --export copies the cache entries used into demo-cache/ (tracked), so
// tests/golden/invariants.test.ts runs offline. Each state is saved to .cache/eval/<key>.json.
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.EXA_LOG ??= "0";
const READ = process.argv.includes("--read");
process.env.EXA_CACHE = READ ? "read" : "write";
process.env.LLM_CACHE = READ ? "read" : "write";

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readEvents, runStream } from "../lib/agent/runStream";
import { resetUsedCacheEntries, usedCacheEntries } from "../lib/cache/disk";
import { checkInvariants, INVARIANTS, type InvariantId, type Violation } from "../lib/eval/invariants";
import { EVAL_PROFILES, EVAL_TODAY, type EvalProfile } from "../lib/eval/profiles";
import { initialRunState, runReducer, type RunState } from "../lib/ui/runState";

const IDS = Object.keys(INVARIANTS) as InvariantId[];

async function runOne(p: EvalProfile): Promise<{ state: RunState; violations: Violation[]; cost: number; ms: number }> {
  const t0 = Date.now();
  let state = runReducer(initialRunState, { type: "start", text: p.text, at: 0 });
  for await (const event of readEvents(runStream(p.text, { fast: true, persist: false, today: EVAL_TODAY, timeoutMs: 600_000 }))) {
    state = runReducer(state, { type: "event", event, at: Date.now() - t0 });
  }
  const violations = state.phase === "done" ? checkInvariants(state) : [{ id: "scheduled" as const, detail: `run ended in phase ${state.phase}: ${state.error ?? state.outOfScope ?? ""}` }];
  return { state, violations, cost: state.summary?.costUsd.total ?? 0, ms: Date.now() - t0 };
}

async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length) {
        const k = i++;
        out[k] = await f(xs[k]);
      }
    }),
  );
  return out;
}

async function main() {
  const onlyArg = process.argv.find((a, i) => process.argv[i - 1] === "--only");
  const only = onlyArg ? new Set(onlyArg.split(",")) : null;
  const profiles = EVAL_PROFILES.filter((p) => !only || only.has(p.key));
  resetUsedCacheEntries();

  const results = await pool(profiles, 3, async (p) => {
    const r = await runOne(p);
    console.error(`  ${p.key.padEnd(10)} ${(r.ms / 1000).toFixed(1)}s  $${r.cost.toFixed(3)}  ${r.violations.length} violations`);
    await mkdir(path.join(".cache", "eval"), { recursive: true });
    await writeFile(path.join(".cache", "eval", `${p.key}.json`), JSON.stringify({ text: p.text, state: r.state, violations: r.violations }, null, 1));
    return { p, ...r };
  });

  // Table: profile × invariant, "·" = holds, number = violations.
  const head = ["profile".padEnd(10), "class".padEnd(6), ...IDS.map((id) => id.slice(0, 6).padEnd(6)), "cost"].join(" ");
  console.log(`\n${head}\n${"-".repeat(head.length)}`);
  for (const r of results) {
    const prof = r.state.profile?.profile;
    const cls = prof ? (prof.temporaryProtection ? "TP" : prof.citizenship) : "?";
    const cells = IDS.map((id) => {
      const n = r.violations.filter((v) => v.id === id).length;
      return (n ? String(n) : "·").padEnd(6);
    });
    console.log([r.p.key.padEnd(10), cls.padEnd(6), ...cells, `$${r.cost.toFixed(3)}`].join(" "));
  }
  const total = results.reduce((n, r) => n + r.cost, 0);
  const bad = results.reduce((n, r) => n + r.violations.length, 0);
  console.log(`\n${results.length} profiles, ${bad} violations, live cost $${total.toFixed(3)}`);
  for (const id of IDS) console.log(`  ${id.padEnd(12)} ${INVARIANTS[id]}`);

  for (const r of results) {
    if (!r.violations.length) continue;
    console.log(`\n${r.p.key}:`);
    for (const v of r.violations) console.log(`  [${v.id}] ${v.detail}`);
  }

  if (process.argv.includes("--export")) {
    const SUB: Record<string, string> = { EXA_CACHE: "exa", LLM_CACHE: "llm" };
    let n = 0;
    for (const e of usedCacheEntries()) {
      const sub = SUB[e.label];
      if (!sub) continue;
      const dest = path.join("demo-cache", sub, e.name);
      await mkdir(path.dirname(dest), { recursive: true });
      if (path.resolve(e.file) !== path.resolve(dest)) await copyFile(e.file, dest);
      n++;
    }
    console.log(`\nexported ${n} cache entries to demo-cache/`);
  }
  process.exitCode = bad ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
