// Live smoke test for official forms: reads a few official pages with their links and prints the forms found.
//   npx tsx scripts/forms-smoke.ts [url...]
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { getPages } = await import("../lib/exa/search");
  const { formsFromPages } = await import("../lib/agent/forms");
  const urls = process.argv.slice(2);
  const targets = urls.length ? urls : ["https://www.vero.fi/en/individuals/tax-cards/", "https://migri.fi/en/residence-permit-for-an-employed-person"];
  const { docs } = await getPages(targets, { maxCharacters: 20_000, links: 100 });
  for (const d of docs) {
    const forms = formsFromPages([{ url: d.url, text: d.text ?? "", links: d.links ?? [], fetchedAt: d.fetchedAt }]);
    console.log(`\n${d.url}: ${d.links?.length ?? 0} links, ${forms.length} forms`);
    for (const f of forms) console.log(`  ${f.name} | ${f.type ?? "no link"} | ${f.url ?? "-"} | ${f.guidance ?? "-"}\n    "${f.citation.quote}"`);
  }
}
void main();
