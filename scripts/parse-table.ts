// Parse the 18 inputs of tests/parse/inputs.ts and print a compact table.
//   npx tsx scripts/parse-table.ts            LLM_CACHE=write: live where the cache misses
//   LLM_CACHE=read npx tsx scripts/parse-table.ts   cache only
//   --export   copy the cache entries used into demo-cache/llm (git-tracked), so tests run offline
//   --det      use the deterministic parser instead
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LLM_CACHE ??= "write";

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { parseProfile, parseProfileDeterministic } from "../lib/agent/parseProfile";
import { partnerDifferences } from "../lib/agent/partnerSteps";
import { resetUsedCacheEntries, usedCacheEntries } from "../lib/cache/disk";
import { PARSE_CASES, PARSE_TODAY } from "../tests/parse/inputs";

const CITIZEN: Record<string, string> = { EU: "EU", NON_EU: "non-EU", NORDIC: "Nordic" };

async function main() {
  const det = process.argv.includes("--det");
  resetUsedCacheEntries();
  const rows: string[][] = [["#", "src", "citizen", "purpose", "city", "arrival", "extra", "done", "assumptions"]];
  const details: string[] = [];
  for (const c of PARSE_CASES) {
    const r = det ? parseProfileDeterministic(c.text, PARSE_TODAY) : await parseProfile(c.text, PARSE_TODAY);
    if (!r.ok) {
      rows.push([String(c.n), r.source === "llm" ? "llm" : "det", "-", "-", "-", "-", "-", "-", `OUT OF SCOPE: ${r.outOfScope}`]);
      continue;
    }
    const p = r.profile;
    const extra = [
      p.monthlySalaryEur ? `${p.monthlySalaryEur}€/mo` : "",
      p.stayMonths ? `${p.stayMonths}mo stay` : "",
      p.temporaryProtection ? "temp.prot." : "",
      ...r.people.slice(1).map((o) => `+${o.relation}:${CITIZEN[o.citizenship]}`),
    ].filter(Boolean);
    rows.push([
      String(c.n), r.source === "llm" ? "llm" : "det", CITIZEN[p.citizenship], p.purpose.join("+"), p.city,
      p.arrivalDate ?? "-", extra.join(" ") || "-", (p.alreadyDone ?? []).join(",") || "-",
      r.assumptions.length ? r.assumptions.join(" | ") : "-",
    ]);
    for (const d of partnerDifferences(r.people)) details.push(`  #${c.n} ${d.summary}`);
  }
  // markdown table
  const w = rows[0].map((_, i) => Math.min(60, Math.max(...rows.map((r) => r[i].length))));
  const line = (r: string[]) => `| ${r.map((x, i) => (i === r.length - 1 ? x : x.padEnd(w[i]))).join(" | ")} |`;
  console.log(line(rows[0]));
  console.log(`|${rows[0].map((_, i) => (i === rows[0].length - 1 ? " --- " : `-${"-".repeat(w[i])}-`)).join("|")}|`);
  for (const r of rows.slice(1)) console.log(line(r));
  if (details.length) console.log(`\nPartner steps that differ:\n${details.join("\n")}`);

  if (process.argv.includes("--export")) {
    const dest = path.join(process.cwd(), "demo-cache", "llm");
    await mkdir(dest, { recursive: true });
    let n = 0;
    for (const e of usedCacheEntries()) {
      if (e.label !== "LLM_CACHE") continue;
      if (path.resolve(e.file) !== path.resolve(dest, e.name)) await copyFile(e.file, path.join(dest, e.name));
      n++;
    }
    console.log(`\nexported ${n} LLM cache entries to demo-cache/llm`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
