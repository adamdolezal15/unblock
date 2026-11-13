# Unblock: implementation plan

## Context
Repo is a fresh Next 16.4 scaffold (`app/page.tsx` default, `scripts/exa-smoke-test.ts`, deps: exa-js 2.28, @anthropic-ai/sdk, reactflow, zod, vitest). No `lib/` yet, **not a git repo**. Goal: SPEC.md F1–F3 working on live judge queries in under 60 s, with every shown claim tied to a quote we've checked against the text Exa returned.

Exa usage follows `.agents/skills/build-with-exa`: `/search` with `contents: { highlights: true }`, `objective` on every pipeline search, `includeDomains` only where SPEC requires it (official layer), `type: "auto"`, and `outputSchema` only on auto/deep (never lite). Before writing any route handler, read `node_modules/next/dist/docs/` for route handlers and streaming (AGENTS.md says the APIs changed).

## 1. File structure
```
app/
  page.tsx                  input box + progress log + graph + side panel
  api/plan/route.ts         POST {text} -> NDJSON stream of PipelineEvent
  api/ics/route.ts          POST steps -> .ics download
components/ Graph.tsx (React Flow), CitationPanel.tsx, TrustBadge.tsx, ConflictCard.tsx, CalendarList.tsx
lib/
  types.ts                  SPEC types + PipelineEvent, Evidence, ExaDoc
  exa/client.ts             Exa singleton; the only place that imports exa-js
  exa/cache.ts              sha256(request) -> .cache/exa/<hash>.json, EXA_CACHE=read|write|off
  exa/search.ts             searchOfficial(), searchCommunity(), fetchContents(): all go through the cache
  exa/domains.ts            OFFICIAL, UNIVERSITY, cityDomains(city), trustOf(url)
  agent/parseProfile.ts
  agent/planQueries.ts      profile -> SearchSpec[] (deterministic templates, no LLM)
  agent/findSteps.ts
  agent/findCommunityTips.ts
  agent/detectConflicts.ts
  agent/verifyCitations.ts
  agent/buildGraph.ts
  agent/runPipeline.ts      orchestrates the steps and emits events
  prompts/ parseProfile.ts, extractSteps.ts, extractTips.ts, detectConflicts.ts
  calendar/ googleLink.ts, ics.ts, visitPack.ts
scripts/ exa-smoke-test.ts (exists), run-test-queries.ts (runs test-queries.md headless and prints timings and checks)
.cache/exa/                 committed, so the demo works offline
```

## 2. Pipeline (signatures)
| # | Function | Model | Notes |
|---|---|---|---|
| 1 | `parseProfile(text: string, today: string): Promise<Profile \| {outOfScope: string}>` | Claude **Haiku 5.5** (`claude-haiku-5-5`), tool-use with a zod schema | Resolves relative dates ("next week") against `today`; handles query 8 (refusal) |
| 2a | `planQueries(p: Profile): SearchSpec[]` | none | About 6–8 specs, one per authority/topic (DVV, Vero, Migri/EnterFinland, Kela, Poliisi, bank/FIN-FSA, university, city office). Each spec = `{query, objective, includeDomains, topic}` |
| 2b | `searchOfficial(specs): Promise<ExaDoc[]>` | Exa `auto`, highlights, `includeDomains`, `numResults: 5` | All specs run in parallel. `ExaDoc = {url, title, trust, highlights[], fetchedAt}` |
| 2c | `findSteps(p, docs): Promise<RawStep[]>` | Claude **Sonnet 5.5**, tool-use | Prompt gets highlights split into numbered sentences `[D3.S7]`. Every step and edge must cite sentence IDs, not free text |
| 2d | `verifyCitations(raw, docs): {steps: Step[], dropped: Dropped[]}` | none | Resolves IDs to sentences, normalises text (whitespace, quotes, case), confirms each is a substring of the Exa text. Unverified edges are dropped. A step with no surviving citation becomes "not found, check <url>" |
| 3a | `searchCommunity(p): Promise<ExaDoc[]>` | Exa `auto`, highlights, **no** domain filter, `objective` = "forums, blogs, uni guides about wait times and gotchas" | Starts in parallel with 2b, keyed on profile topics rather than steps |
| 3b | `findCommunityTips(steps, docs): Promise<Map<stepId, Citation[]>>` | Claude **Haiku 5.5** | Same sentence-ID and verification scheme. Trust: university/community via `trustOf(url)` |
| 3c | `detectConflicts(steps, tips): Promise<Conflict[]>` | Claude **Sonnet 5.5** | Compares only verified citations on the same topic. Both sides are shown |
| 4 | `buildGraph(steps): {order, criticalNodeId, criticalPath, lengthDays}` | none | Kahn topological sort plus cycle breaking. Critical node = most transitive descendants. Path weighted by `costOfDelay` and duration estimates |
| 5a | `enrichVisitPacks(inPersonSteps)` | Exa `auto` highlights, includeDomains (address, hours, booking) | In parallel per step. Fields without a citation stay empty |
| 5b | `toCalendar(steps, order, arrival): CalEvent[]` + `toIcs()` | none | Google `calendar/render?action=TEMPLATE` links. Body = visit pack + source URL |

The stream emits `PipelineEvent = progress | profile | docs | steps | edge | tips | conflicts | graph | calendar | error | done`.

## 3. Step discovery: A vs B
| | A: `deep` + `outputSchema` | B: parallel `auto` + Claude + quote verification |
|---|---|---|
| Citation reliability | `output.grounding` is per field/claim and points to a URL, not an edge-level sentence. Our verify rule can't run against it | Each edge maps to an exact sentence in Exa text, checked by code |
| Latency | One call, but deep takes roughly 10–40 s and is opaque. Nothing to stream until it ends | Searches about 2–4 s in parallel, then Claude about 10–15 s while streaming partial nodes |
| Cost | Deep pricing is a multiple of auto | 6–8 auto calls plus one Sonnet call. Cached after the first run |
| Determinism | Low. Schema fill varies from run to run | Queries are templated and cached. Only the Claude step varies (temperature 0) |
| UI sources | URL list | Click an edge to see the quote, URL and trust badge, plus the live "searching dvv.fi…" log |

**Recommend B.** It is the only option that meets "every edge quotes a verified sentence", and it gives the per-authority progress stream. Use A only in the smoke test to compare step coverage. **Update SPEC.md step 2**: drop "deep mode for synthesis".

Using sentence IDs instead of free-text quotes makes verification pass by construction for real sentences. Claude can then only fail by citing a sentence that doesn't support the edge, and the conflict/QA step plus manual test-queries catch that.

## 4. Latency budget (target ~35 s, hard cap 55 s)
```
t=0     parseProfile (Haiku)                                ~2 s
t=2     ┌ searchOfficial x7 (parallel)                       ~3 s
        └ searchCommunity x3 (parallel, same moment)         ~3 s
t=5     ┌ findSteps (Sonnet, streamed)                       ~15 s
        └ (community docs already in hand)
t=20    verify + buildGraph (ms)        -> graph event; UI renders
t=20    ┌ findCommunityTips (Haiku)                          ~6 s
        ├ detectConflicts (Sonnet)                           ~8 s
        └ enrichVisitPacks x N (Exa parallel)                ~4 s
t=29    toCalendar -> done
```
Guards: 8 s timeout per Exa call (on timeout, use cached data or skip and say so). Cap at 12 steps. `Promise.allSettled` everywhere. A global 55 s deadline emits whatever has finished so far.

## 5. Top 5 risks and first-hours de-risk
1. **Highlights miss the dependency sentence** (e.g. "you need a personal identity code to…"). In hour 1, run the 7 official queries for test query 1 and grep the highlights for the expected edges. If coverage is poor, add a `fetchContents(urls, {text: {maxCharacters}})` pass for the top 3 official URLs and verify against that.
2. **Over 60 s on live queries.** In hour 2, time an end-to-end run with the cache off. Moving tips and conflicts after the graph and capping steps is already planned. Fall back to Haiku for extraction if Sonnet exceeds 20 s.
3. **Off-list cities and situations** (Tampere, temporary protection, Nordic). `cityDomains(city)` adds `<city>.fi`. Migri temporary-protection queries are templated. Test queries 2, 3 and 6 run early.
4. **Demo conflict not reproduced** (OP vs FIN-FSA). Write a targeted community query for banking ID requirements, check that op.fi appears, and freeze the result in `.cache/exa`.
5. **Next 16 API drift and exa-js typing** (the smoke test needs `as any`). Read the Next docs on route handlers and streaming. Build a thin typed wrapper in `lib/exa/search.ts`. Get the NDJSON stream to the browser working end to end before adding any real logic.

## 6. Decisions (answered)
- **Git:** step 0 is `git init`, confirm `.gitignore` covers `.env.local`, initial commit, then one commit per feature.
- **Domains:** OFFICIAL list plus `<city>.fi` from the profile, labelled official. SPEC.md gets updated to match.
- **Models:** Haiku 5.5 for profile and tips. Sonnet 5.5 for step extraction and conflicts.
- **Deploy:** undecided, so build for local but keep it Vercel-compatible: `export const maxDuration = 60` on the route, the cache read-only when the filesystem isn't writable, and `.cache/exa` committed and pre-warmed by `run-test-queries.ts`.

Still open (not blocking): UI language (English assumed). Finnish-only pages are allowed as sources, with quotes shown in the original plus a Claude translation labelled as such.

## Verification
- `npx tsx scripts/exa-smoke-test.ts`, then `npx tsx scripts/run-test-queries.ts`: checks timing under 60 s, that every edge has a verified quote, that community tips are labelled, and that query 8 is refused.
- vitest units: `verifyCitations` (paraphrase rejected, whitespace/quote normalisation), `buildGraph` (critical node, cycles), `googleLink` (title, date, location encoded).
- Manual: `npm run dev`, type queries 1 and 7, click edges, open a calendar link, import the .ics.
