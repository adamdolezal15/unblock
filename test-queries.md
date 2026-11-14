# Test queries

Run after every significant change. Note what broke.

The three **Demo** rows are `lib/demo/sentences.ts`; their cache entries are in `demo-cache/` (`npm run warm-demo`), and query 1 is pinned by `tests/golden/marta.test.ts`.

| # | Input | Must contain |
|---|---|---|
| 1 | I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR, and starting a master's at Aalto | **Demo (Marta).** EU registration → DVV; ID code any-of (DVV \| Vero tax office); tax card on day 1 in the same Vero visit, not after DVV; bank → Kela, bank → strong ID; 60 % withholding warning |
| 2 | Brazilian PhD student moving to Tampere with my wife in January | **Demo.** Residence permit / Migri; family member steps; Tampere offices, not Helsinki; arrival 1 January |
| 3 | Swedish citizen moving to Espoo for work | Nordic-specific registration path (different from EU) |
| 4 | Indian software engineer, arriving in Helsinki next week, no residence permit card yet | **Demo.** Permit card dependency; strong ID blocked until bank; police ID card in person |
| 5 | German exchange student, Helsinki, 5 months | Short stay; may not need full bank credentials; DVV via university check-in |
| 6 | Ukrainian under temporary protection, Helsinki | Different rules; basic banking without personal ID code (FIN-FSA) |
| 7 | I want to open a bank account in Finland, I am EU citizen | Conflict shown: OP says ID code required vs FIN-FSA basic banking |
| 8 | Out of scope: "Plan my wedding in Rome" | Polite refusal + explains scope |

Check for every query:
- every edge has a citation with a real quote
- community tips are labelled as community
- calendar links open with correct title, date and location
- total time < 60 s, progress streams

## parseProfile inputs (18)
`tests/parse/inputs.ts`: rows 1-8 above, then 10 adversarial ones (typos, Finnish, Czech, vague, other city + yearly salary, "I already have a bank account", Swedish + Brazilian wife, injection + real content, injection only, leaving Finland). Answers are cached in `demo-cache/llm`; `npm run parse-table` prints them as a table (`LLM_CACHE=read` for cache only, `-- --export` to refresh the tracked cache).
