// npx tsx scripts/warm-drafts.ts [demoKey ...]   (default: marta)
// Runs the demo sentence from cache (exactly what the browser gets), prepares every draft it offers, and copies
// the drafts' LLM cache entries into demo-cache/llm (tracked), so the demo's "Prepare draft" works offline.
// Only the drafts themselves can call the model (everything else is already cached).
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.EXA_LOG ??= "0";
process.env.EXA_CACHE = "read";
process.env.LLM_CACHE = "write";

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { readEvents, runStream } from "../lib/agent/runStream";
import { generateDraft } from "../lib/agent/drafts";
import { draftOffers } from "../lib/agent/draftOffers";
import { resetUsedCacheEntries, usedCacheEntries } from "../lib/cache/disk";
import { DEMO_SENTENCES, type DemoKey } from "../lib/demo/sentences";
import { EVAL_TODAY } from "../lib/eval/profiles";
import { initialRunState, runReducer } from "../lib/ui/runState";
import { draftSource } from "../lib/ui/useDrafts";

async function main() {
  const keys = (process.argv.slice(2).length ? process.argv.slice(2) : ["marta"]) as DemoKey[];
  for (const key of keys) {
    const text = DEMO_SENTENCES[key];
    let state = runReducer(initialRunState, { type: "start", text, at: 0 });
    for await (const event of readEvents(runStream(text, { fast: true, persist: false, today: EVAL_TODAY }))) {
      state = runReducer(state, { type: "event", event, at: 1 });
    }
    const src = draftSource(state);
    if (!src) throw new Error(`${key}: run did not finish`);
    resetUsedCacheEntries();
    for (const offer of draftOffers(src)) {
      const d = await generateDraft(src, offer.id);
      console.log(`${key} ${offer.id.padEnd(32)} ${d?.by ?? "none"}  ${d?.sentences.length ?? 0} sentences, ${d?.sources.length ?? 0} sources`);
    }
    let n = 0;
    for (const e of usedCacheEntries()) {
      if (e.label !== "LLM_CACHE") continue;
      const dest = path.join("demo-cache", "llm", e.name);
      await mkdir(path.dirname(dest), { recursive: true });
      if (path.resolve(e.file) !== path.resolve(dest)) await copyFile(e.file, dest);
      n++;
    }
    console.log(`${key}: ${n} draft cache entries in demo-cache/llm`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
