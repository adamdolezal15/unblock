// Run the core pipeline headless: parseProfile -> findSteps -> lib/graph.
//   npx tsx scripts/run-findSteps.ts "I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR, and starting a master's at Aalto"
// EXA_CACHE=off forces live calls; EXA_LOG=1 prints every Exa call.
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.EXA_LOG ??= "0";

import { parseProfile } from "../lib/agent/parseProfile";
import { findSteps } from "../lib/agent/findSteps";
import { cacheMode } from "../lib/exa/cache";
import { exaStats, resetExaStats } from "../lib/exa/search";
import { buildGraph, criticalNode, criticalPath, describeVisitAlternative, schedule, topoOrder } from "../lib/graph";

const SHORT: Record<string, string> = {
  bank_account: "the bank account",
  strong_identification: "strong ID",
  tax_card: "the tax card",
  vero_identity_code: "the Vero ID code",
  dvv_registration: "DVV registration",
  eu_registration: "EU registration",
  kela_registration: "Kela",
  police_id_card: "the police ID card",
};
import { estimatesWithTips } from "../lib/agent/estimates";
import { attachTips, findCommunityTips } from "../lib/agent/findCommunityTips";
import { detectConflicts } from "../lib/agent/detectConflicts";
import type { Citation, VerifiedClaim } from "../lib/types";

const BADGE: Record<Citation["trust"], string> = {
  official: "OFFICIAL",
  provider: "PROVIDER",
  university: "UNIVERSITY",
  news: "NEWS",
  community: "COMMUNITY",
};

const wrap = (s: string, n = 150) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function printClaim(prefix: string, c: VerifiedClaim) {
  const fuzzy = c.matchScore < 1 ? ` ~${c.matchScore}` : "";
  console.log(`${prefix}"${wrap(c.citation.quote)}"`);
  console.log(`${prefix.replace(/[^ ]/g, " ")}[${BADGE[c.citation.trust]}]${fuzzy} ${c.citation.url}`);
}

async function main() {
  const sentence = process.argv.slice(2).join(" ").trim();
  if (!sentence) {
    console.error('usage: npx tsx scripts/run-findSteps.ts "<sentence>"');
    process.exit(1);
  }
  const t0 = Date.now();
  console.log(`input: ${sentence}`);
  console.log(`EXA_CACHE=${cacheMode()}  LLM_PROVIDER=${process.env.LLM_PROVIDER ?? "anthropic (default)"}\n`);

  const parsed = await parseProfile(sentence);
  if (!parsed.ok) {
    console.log(`OUT OF SCOPE: ${parsed.outOfScope}`);
    return;
  }
  console.log("profile:", JSON.stringify(parsed.profile));
  for (const a of parsed.assumptions) console.log(`  assumption: ${a}`);

  resetExaStats();
  const onProgress = (m: string) => console.log(`  … ${m}`);
  const result = await findSteps(parsed.profile, { onProgress });
  const tipsResult = await findCommunityTips(parsed.profile, result.steps, { onProgress });
  const steps = attachTips(result.steps, tipsResult.tips);
  const conflictResult = await detectConflicts(steps, tipsResult.tips, { profile: parsed.profile, onProgress });
  const conflicts = [...result.conflicts, ...conflictResult.conflicts];
  const ms = Date.now() - t0;

  console.log(`\n=== STEPS (${result.steps.length}) ===`);
  for (const s of result.steps) {
    if (s.milestone) {
      console.log(`\n◆ ${s.title}  (${s.id} · milestone)`);
      for (const g of s.requiresAnyOf ?? []) console.log(`  ├ REQUIRES ANY OF: ${g.join(" | ")}`);
      for (const c of s.claims ?? []) printClaim(`  ├ option ${c.stepId}: `, c);
      continue;
    }
    console.log(`\n● ${s.title}  (${s.id} · ${s.authority} · ${s.mode})`);
    if (s.confirmation?.by === "required_by") {
      console.log(`  ├ confirmed because required by: ${s.confirmation.stepIds.join(", ")}`);
    }
    const claims = s.claims ?? [];
    for (const c of claims.filter((c) => c.kind === "applies")) printClaim("  ├ applies: ", c);
    for (const c of claims.filter((c) => c.kind === "requires")) printClaim(`  ├ REQUIRES → ${c.value}: `, c);
    for (const c of claims.filter((c) => c.kind === "provides")) printClaim(`  ├ PROVIDES ${c.value}: `, c);
    for (const c of claims.filter((c) => c.kind === "same_visit")) printClaim(`  ├ SAME VISIT as ${c.value}: `, c);
    if (s.visitId) console.log(`  ├ visit: ${s.visitId}`);
    for (const c of claims.filter((c) => !["applies", "requires", "provides", "same_visit"].includes(c.kind))) {
      printClaim(`  ├ ${c.kind} = ${wrap(c.value, 60)}: `, c);
    }
  }

  if (result.stubs.length) {
    console.log(`\n=== NOT CONFIRMED (${result.stubs.length}) ===`);
    for (const s of result.stubs) console.log(`  ○ ${s.id}: ${s.message}`);
  }

  console.log(`\n=== COMMUNITY TIPS (${tipsResult.tips.length}, steps searched: ${tipsResult.reports.map((r) => r.stepId).join(", ")}) ===`);
  for (const [stepId, tips] of Object.entries(tipsResult.byStep)) {
    console.log(`  ${stepId}:`);
    for (const t of tips) {
      const wait = t.waitDays !== undefined ? ` (waitDays ${t.waitDays})` : "";
      console.log(`    - ${t.kind}${wait}: ${wrap(t.tip, 140)}`);
      console.log(`      "${wrap(t.citation.quote, 140)}"`);
      console.log(`      [${BADGE[t.citation.trust]}]${t.matchScore < 1 ? ` ~${t.matchScore}` : ""} ${t.citation.url}`);
    }
  }

  if (conflicts.length) {
    console.log(`\n=== CONFLICTS (${conflicts.length}) ===`);
    for (const c of conflicts) {
      console.log(`  ! ${c.stepId} · ${c.topic}: ${c.note}`);
      console.log(`    a [${BADGE[c.a.trust]}] "${wrap(c.a.quote, 140)}" ${c.a.url}`);
      console.log(`    b [${BADGE[c.b.trust]}] "${wrap(c.b.quote, 140)}" ${c.b.url}`);
      console.log(`    what to do: ${c.whatToDo}`);
    }
  } else {
    console.log("\n=== CONFLICTS (0) ===");
  }

  // --- graph
  const graph = buildGraph(steps);
  const topo = topoOrder(graph);
  const crit = criticalNode(graph);
  const estimates = estimatesWithTips(steps, tipsResult.tips);
  const sched = schedule(graph, parsed.profile, { estimates });
  const path = criticalPath(graph, sched);
  console.log("\n=== GRAPH ===");
  console.log(`  nodes ${graph.nodes.length} (${graph.nodes.filter((n) => n.unresolved).length} unresolved), edges ${graph.edges.length}`);
  for (const e of graph.edges) console.log(`  ${e.source} → ${e.target}${e.anyOf ? "   (any-of)" : ""}`);
  console.log("  schedule (working day N from the start; wait cited > community-reported > default 5 = est.):");
  for (const id of sched.order) {
    const it = sched.items[id];
    if (!it) continue;
    const cited = it.waitSource === "community" ? "COMMUNITY" : it.waitSource ? "cited" : it.estimated ? "est." : "";
    const visit = it.visitId ? `, ${it.visitId}` : "";
    const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    const moved = it.movedBy ? `  ← moved from ${fmt(it.movedBy.from)}: ${it.movedBy.holiday}` : "";
    console.log(`    day ${String(it.startIndex + 1).padStart(3)} ${it.startDate} → ready ${it.readyDate}  ${id}  (wait ${it.waitDays}${cited ? `, ${cited}` : ""}${visit})${moved}`);
    if (it.note) console.log(`             note: ${it.note}`);
  }
  for (const c of sched.visitChoices) {
    console.log(`  visit ${c.visitId}: chose ${c.chosen.mode} (${c.chosen.visits} visit${c.chosen.visits === 1 ? "" : "s"}), plan ends ${c.chosen.planEnd}`);
    console.log(`    ${describeVisitAlternative(c, (id) => SHORT[id] ?? id.replace(/_/g, " "))}`);
  }
  console.log(`  order: ${topo.order.join(" → ") || "(none)"}`);
  for (const d of topo.deadlocks) console.log(`  DEADLOCK: ${d.stepIds.join(" → ")}: ${d.explanation}`);
  console.log(`  critical node: ${crit ?? "(none: no dependencies found)"}`);
  console.log(
    `  critical path: ${path.stepIds.map((id) => `${id} [${sched.items[id].startDate} → ${sched.items[id].readyDate}]`).join(" → ") || "(empty)"}\n    (${path.totalDays} working days, ${path.calendarDays} calendar days, ${sched.startDate} → ${path.stepIds.length ? sched.items[path.stepIds[path.stepIds.length - 1]].doneDate : sched.startDate})`,
  );

  // --- totals
  const stats = exaStats();
  const verified = result.steps.reduce((n, s) => n + (s.milestone ? 0 : (s.claims?.length ?? 0)), 0); // milestone claims are the providers' own
  const stubIds = new Set(result.stubs.map((s) => s.id));
  const verifiedInStubs = result.reports.reduce((n, r) => n + (stubIds.has(r.id) ? r.verified : 0), 0);
  const byReason: Record<string, number> = {};
  for (const d of result.dropped) byReason[d.reason] = (byReason[d.reason] ?? 0) + 1;
  const total = verified + verifiedInStubs + result.dropped.length;

  console.log("\n=== RUN ===");
  console.log(`  time: ${(ms / 1000).toFixed(1)} s`);
  console.log(`  exa calls: ${stats.calls} (${stats.live} live, ${stats.cached} cached)`);
  for (const [h, v] of Object.entries(stats.byHelper)) {
    console.log(`    ${h.padEnd(15)} live ${v.live}  cached ${v.cached}  $${v.costUsd.toFixed(3)}`);
  }
  // Exa deep extraction is already in exaStats; only non-Exa extractor cost is added on top.
  const llmProvider = result.reports.find((r) => r.llm)?.llm?.provider ?? "none";
  const llmExtra = result.reports.reduce((n, r) => n + (r.llm && r.llm.provider !== "exa" ? (r.llm.costUsd ?? 0) : 0), 0);
  console.log(`  extractor: ${llmProvider}`);
  console.log(`  exa cost this run: $${stats.costUsd.toFixed(3)} (cache hits are free)`);
  if (llmExtra) console.log(`  ${llmProvider} cost this run: $${llmExtra.toFixed(3)} (estimated from token usage)`);
  console.log(`  total cost this run: $${(stats.costUsd + llmExtra).toFixed(3)}`);
  console.log(
    `  claims: ${total} extracted, ${verified + verifiedInStubs} verified (${verified} shown, ${verifiedInStubs} in unconfirmed steps), ${result.dropped.length} dropped` +
      (total ? ` → ${Math.round(((verified + verifiedInStubs) / total) * 100)}% verified` : ""),
  );
  console.log(`  dropped by reason: ${JSON.stringify(byReason)}`);
  console.log("  per step:");
  for (const r of result.reports) {
    console.log(
      `    ${r.id.padEnd(22)} extracted ${String(r.extracted).padStart(2)}  verified ${String(r.verified).padStart(2)}  dropped ${String(r.dropped).padStart(2)}  sources ${r.sources}  ${(r.ms / 1000).toFixed(1)}s${r.error ? `  ERROR ${r.error}` : ""}`,
    );
  }
  console.log("  community tips per step:");
  for (const r of tipsResult.reports) {
    console.log(`    ${r.stepId.padEnd(22)} sources ${String(r.sources).padStart(2)}  extracted ${String(r.extracted).padStart(2)}  verified ${String(r.verified).padStart(2)}  ${(r.ms / 1000).toFixed(1)}s${r.error ? `  ERROR ${r.error}` : ""}`);
  }
  console.log("  conflict checks per step:");
  for (const r of conflictResult.reports) {
    console.log(`    ${r.stepId.padEnd(22)} sources ${String(r.sources).padStart(2)}  proposed ${r.proposed}  kept ${r.kept}  ${(r.ms / 1000).toFixed(1)}s${r.error ? `  ERROR ${r.error}` : ""}`);
  }
  if (result.dropped.length) {
    console.log("  sample dropped:");
    for (const d of result.dropped.slice(0, 5)) {
      console.log(`    - [${d.reason}${d.bestScore !== undefined ? ` ${d.bestScore}` : ""}] ${d.stepId}.${d.kind}="${wrap(d.value, 40)}" "${wrap(d.quote, 100)}" ${d.url}`);
    }
  }

  // Machine-readable dump for comparisons (RUN_JSON=path).
  if (process.env.RUN_JSON) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      process.env.RUN_JSON,
      JSON.stringify({ profile: parsed.profile, result, tips: tipsResult, conflicts, graph, topo, crit, path, stats, llmExtra, ms }, null, 2),
      "utf8",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
