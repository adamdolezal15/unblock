// Smoke test: is the Exa key working, and do we get citable highlights from official sites?
// Run: npm i exa-js dotenv && npx tsx scripts/exa-smoke-test.ts
import "dotenv/config";
import Exa from "exa-js";

const exa = new Exa(process.env.EXA_API_KEY);

const OFFICIAL = ["dvv.fi", "vero.fi", "migri.fi", "kela.fi", "suomi.fi", "infopankki.fi"];

async function main() {
  // 1) Basic search with highlights, official domains only
  const t0 = Date.now();
  const res = await exa.search(
    "What do I need to open a bank account in Finland as a newcomer? Personal identity code, registration requirements",
    {
      type: "auto",
      numResults: 5,
      includeDomains: [...OFFICIAL, "finanssivalvonta.fi"],
      contents: { highlights: true },
    } as any
  );
  console.log(`\n[1] auto search: ${Date.now() - t0} ms, ${res.results.length} results`);
  for (const r of res.results as any[]) {
    console.log(`- ${r.title}\n  ${r.url}`);
    for (const h of r.highlights ?? []) console.log(`    > ${h.slice(0, 200)}`);
  }

  // 2) Deep search with structured output (check shape of output + grounding)
  const t1 = Date.now();
  const deep: any = await exa.search(
    "Steps an EU citizen must take after moving to Helsinki for work, and which step requires which",
    {
      type: "deep",
      numResults: 5,
      includeDomains: OFFICIAL,
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
    } as any
  );
  console.log(`\n[2] deep + outputSchema: ${Date.now() - t1} ms`);
  console.log(JSON.stringify(deep.output ?? deep, null, 2).slice(0, 3000));
}

main().catch((e) => {
  console.error("Exa call failed:", e?.message ?? e);
  process.exit(1);
});
