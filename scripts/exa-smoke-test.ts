// Smoke test for lib/exa: key works, official layer returns citable highlights, community layer
// finds the banking conflict sources, deep+outputSchema shape, /contents, and the disk cache.
// Run: npx tsx scripts/exa-smoke-test.ts      (EXA_CACHE=off to force live calls)
import { config } from "dotenv";
config({ path: ".env.local" });

import { cacheMode } from "../lib/exa/cache";
import { cityDomains, officialDomains, trustOf, TRUST_RANK } from "../lib/exa/domains";
import { exaSearch, getPages, searchCommunity, searchOfficial, searchProvider } from "../lib/exa/search";
import type { ExaDoc } from "../lib/types";

let failures = 0;
function check(ok: boolean, label: string) {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failures++;
}

function printDocs(docs: ExaDoc[]) {
  for (const d of docs) {
    console.log(`  - [${d.trust}] ${d.title}\n    ${d.url}`);
    for (const h of d.highlights.slice(0, 2)) console.log(`      > ${h.replace(/\s+/g, " ").slice(0, 160)}`);
  }
}

async function main() {
  console.log(`EXA_CACHE=${cacheMode()}`);

  // 0) Pure helpers
  console.log("\n[0] domains");
  check(cityDomains("Tampere")[0] === "tampere.fi", "cityDomains(Tampere) = tampere.fi");
  check(cityDomains("Helsinki")[0] === "hel.fi", "cityDomains(Helsinki) = hel.fi");
  check(officialDomains("Espoo").includes("espoo.fi"), "officialDomains(Espoo) includes espoo.fi");
  check(trustOf("https://studies.helsinki.fi/x") === "university", "studies.helsinki.fi -> university");
  check(trustOf("https://www.hel.fi/en") === "official", "hel.fi -> official");
  check(trustOf("https://www.reddit.com/r/Finland") === "community", "reddit -> community");

  check(trustOf("https://www.op.fi/henkiloasiakkaat") === "provider", "op.fi -> provider");
  check(trustOf("https://yle.fi/a/1") === "news", "yle.fi -> news");
  check(
    TRUST_RANK.official > TRUST_RANK.provider && TRUST_RANK.provider > TRUST_RANK.university &&
      TRUST_RANK.university > TRUST_RANK.news && TRUST_RANK.news > TRUST_RANK.community,
    "TRUST_RANK order official > provider > university > news > community",
  );

  // 1) Official layer, highlights
  const officialArgs = {
    query: "What do I need to open a bank account in Finland as a newcomer? Personal identity code, registration requirements",
    objective:
      "Find official Finnish authority pages stating what a newcomer needs to open a bank account and whether a Finnish personal identity code is required. Pull the exact requirement sentences.",
    city: "Helsinki",
  };
  const off = await searchOfficial(officialArgs);
  console.log(`\n[1] official auto search: ${off.meta.ms} ms (cache ${off.meta.hit ? "hit" : "miss"}), ${off.docs.length} results, $${off.meta.costUsd ?? "?"}`);
  printDocs(off.docs);
  check(off.docs.length > 0, "official search returned results");
  check(off.docs.every((d) => d.trust === "official"), "all official results labelled official");
  check(off.docs.some((d) => d.highlights.length > 0), "official results carry highlights");

  // 2) Community layer (demo conflict: banks vs FIN-FSA basic banking)
  const com = await searchCommunity({
    query: "Opening a bank account in Finland without a Finnish personal identity code, experiences",
    objective:
      "Find bank pages, forum threads and expat guides about opening a Finnish bank account without a personal identity code. Rank bank requirement pages (OP, Nordea, S-Pankki) and first-hand experiences first. Pull sentences on what each bank requires.",
  });
  console.log(`\n[2] community auto search: ${com.meta.ms} ms (cache ${com.meta.hit ? "hit" : "miss"}), ${com.docs.length} results`);
  printDocs(com.docs);
  check(com.docs.length > 0, "community search returned results");
  console.log(`  info: op.fi present = ${com.docs.some((d) => d.url.includes("op.fi"))}`);

  // 2b) Provider layer: what banks themselves say (op.fi was missing from the community run)
  const prov = await searchProvider("Opening a bank account in Finland as a foreigner without a Finnish personal identity code", {
    objective: "Find bank pages stating what a newcomer needs to open an account, and whether a Finnish personal identity code is required.",
  });
  console.log(`
[2b] provider search: ${prov.meta.ms} ms (cache ${prov.meta.hit ? "hit" : "miss"}), ${prov.docs.length} results`);
  printDocs(prov.docs);
  check(prov.docs.length > 0, "provider search returned results");
  check(prov.docs.every((d) => d.trust === "provider"), "all provider results labelled provider");
  console.log(`  info: op.fi present = ${prov.docs.some((d) => d.url.includes("op.fi"))}`);

  // 3) Deep + outputSchema (option A, kept for comparison only)
  const deep = await exaSearch({
    query: "Steps an EU citizen must take after moving to Helsinki for work, and which step requires which",
    type: "deep",
    numResults: 5,
    includeDomains: officialDomains("Helsinki"),
    contents: { highlights: true },
    outputSchema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              requires: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  });
  console.log(`\n[3] deep + outputSchema: ${deep.meta.ms} ms (cache ${deep.meta.hit ? "hit" : "miss"}), $${deep.meta.costUsd ?? "?"}`);
  const content = deep.response.output?.content;
  console.log(`  output.content: ${JSON.stringify(content).slice(0, 600)}`);
  console.log(`  output.grounding[0..2]: ${JSON.stringify(deep.response.output?.grounding?.slice(0, 3))}`);
  check(!!deep.response.output, "deep returned output");
  check(Array.isArray(deep.response.output?.grounding), "deep returned output.grounding array");

  // 4) /contents on the top official URL
  if (off.docs[0]) {
    const c = await getPages([off.docs[0].url], { maxCharacters: 20_000 });
    const text = c.docs[0]?.text ?? "";
    console.log(`\n[4] contents: ${c.meta.ms} ms (cache ${c.meta.hit ? "hit" : "miss"}), ${text.length} chars from ${off.docs[0].url}`);
    check(text.length > 200, "contents returned page text");
    const h = off.docs[0].highlights[0];
    if (h) {
      const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
      console.log(`  info: first highlight is a substring of full text = ${norm(text).includes(norm(h).slice(0, 80))}`);
    }
  }

  // 5) Cache: repeating call 1 must be a hit (unless EXA_CACHE=off)
  if (cacheMode() !== "off") {
    const again = await searchOfficial(officialArgs);
    console.log(`\n[5] cache: repeat call ${again.meta.ms} ms`);
    check(again.meta.hit, "repeat call served from cache");
    check(JSON.stringify(again.docs) === JSON.stringify(off.docs), "cached docs identical");
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e?.message ?? e);
  process.exit(1);
});
