# Unblock: SPEC

## One-liner
Agent that turns a newcomer's situation into a **dependency graph of bureaucratic steps**, finds the **critical path**, and puts every physical visit into the **calendar** with a "visit pack". Every claim is cited.

## Target user
People moving to Finland (workers, students, families). Scope: Helsinki region first, other Finnish cities should still work via live search.

## Core features (only these 3)

### F1: Live dependency graph
- Input: one free-text sentence ("I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR, and starting a master's at Aalto").
- Agent extracts a profile: citizenship (EU / non-EU / Nordic), purpose (work / study / family), city, start date, monthly salary (optional), family.
- Exa search restricted to official domains → list of steps + prerequisites.
- Output: nodes (steps) and edges ("A requires B"). **Every edge has a citation** (url + quoted sentence from Exa highlights).
- Highlight the critical node (most downstream steps blocked by it).

### F2: Two layers of truth
- Layer "official": includeDomains = official list (see below).
- Layer "lived experience": forums, blogs, university guides (finlandforum.org, reddit, notion guides, uni sites). Wait times, tricks, gotchas.
- UI shows them separately with a trust badge (Official / University / Community).
- **Conflict detection**: if two sources disagree on the same fact, show both with a warning.

### F3: Critical path → calendar
- Order steps topologically + by cost of delay (e.g. no tax card = 60 % withholding).
- Each physical step becomes a calendar event via Google Calendar template link + downloadable .ics (all steps).
- Event body = visit pack: what, why (what it unblocks), address, opening hours, documents to bring, booking link, source URL.
- Final summary: done online / waiting for approval / in calendar / critical path length in days.

## Official domains (starting list)
dvv.fi, vero.fi, migri.fi, enterfinland.fi, kela.fi, poliisi.fi, suomi.fi, infopankki.fi, ihhelsinki.fi, finanssivalvonta.fi, hel.fi, myhelsinki.fi
+ the profile city's municipal domain (`<city>.fi`, e.g. tampere.fi, espoo.fi), added per run and labelled official.

## University / semi-official
aalto.fi, helsinki.fi, studies.helsinki.fi, hanken.fi, uniarts.fi, tuni.fi

## Data shapes

```ts
type Profile = {
  citizenship: "EU" | "NON_EU" | "NORDIC";
  purpose: ("work" | "study" | "family")[];
  city: string;
  arrivalDate?: string;       // ISO
  monthlySalaryEur?: number;
  hasFamily?: boolean;
  temporaryProtection?: boolean;
  stayMonths?: number;
  alreadyDone?: string[];     // step / milestone ids the person already has; not searched, shown as done
  relation?: "self" | "spouse" | "child" | "other"; // only on parseProfile().people entries after the first
};

type Citation = { url: string; quote: string; trust: "official" | "provider" | "university" | "news" | "community"; fetchedAt: string };

// Every edge and fact of a Step. `citation.quote` is the matched page text (verbatim), not the extractor's copy.
type VerifiedClaim = {
  stepId: string;
  kind: "applies" | "requires" | "provides" | "mode" | "document" | "cost_of_delay" | "processing_time" | "address" | "hours" | "booking_url";
  value: string;               // requires: a canonical step id
  citation: Citation;
  matchScore: number;          // 1 exact, >= 0.9 fuzzy
};

type Step = {
  id: string;                  // e.g. "dvv_registration"
  title: string;
  authority: string;           // DVV, Vero, Kela...
  mode: "online" | "in_person" | "either";
  requires: string[];          // step ids, ALL needed
  requiresAnyOf?: string[][];  // each group met by ANY one option, e.g. [["dvv_registration","vero_identity_code"]]
  milestone?: boolean;         // a state (personal_identity_code), not an action: 0 days, never the critical node
  costOfDelay?: string;        // human-readable, e.g. "60 % tax withheld from salary"
  visitPack?: { address?: string; hours?: string; documents: string[]; bookingUrl?: string };
  citations: Citation[];
  communityTips?: Citation[];
  claims?: VerifiedClaim[];    // per-edge / per-fact citations
  confirmation?: { by: "applies" } | { by: "required_by"; stepIds: string[]; citations: Citation[] };
};

// "Needs a personal identity code" -> requires personal_identity_code (milestone). Its options are the
// steps with a verified `provides` claim (DVV registration, a Vero tax office visit, a residence permit...).
// lib/graph: an any-of group is satisfied by its earliest-finishing option; schedule waits come from
// cited processing_time claims where present (lib/agent/estimates.ts), else defaults flagged estimated.
// Same visit (cited same_visit claims -> shared visitId): per visit group the scheduler evaluates merged vs
// separate, picks the earliest plan end (tie: fewer visits) and reports the rejected option in
// Schedule.visitChoices[].alternative (member dates, visits, plan-end shift); text via describeVisitAlternative().
// Finnish public holidays (+ Christmas Eve, Midsummer Eve) are skipped by default; pushed steps carry movedBy.

// Lived-experience tip (findCommunityTips). waitDays = working days parsed from the VERIFIED quote, never the extractor.
type Tip = { stepId: string; tip: string; kind: "wait_time" | "trick" | "gotcha" | "document"; waitDays?: number; citation: Citation; matchScore: number };

// a = the more trusted side (TRUST_RANK). whatToDo = which source to rely on and why; guidance, not legal advice.
type Conflict = { stepId: string; topic: string; a: Citation; b: Citation; note: string; whatToDo: string };
```

## Pipeline
All LLM-shaped work goes through `lib/llm` `extract(task, input, zodSchema)`. `LLM_PROVIDER=anthropic` (default): Claude Sonnet 5.5 reading the Exa results; needs `ANTHROPIC_API_KEY`, except with `LLM_CACHE=read` (no API calls). `LLM_PROVIDER=exa`: Exa `deep` search + `outputSchema` + `systemPrompt`; also the fallback when there is no key. Every extraction is disk-cached in `.cache/llm` (`LLM_CACHE=read|write|off`, key = provider + model + prompt version/hash + schema + input + docs hash), so the demo runs offline with `EXA_CACHE=read LLM_CACHE=read`. Nothing outside `lib/llm` knows which provider ran.

1. `parseProfile(text, today?)` → `{ok, profile, assumptions[], people[], source}` | `{ok:false, outOfScope, source}`. LLM first (`lib/agent/parseProfileLlm.ts`, prompt + zod schema in `lib/prompts/parseProfile.ts`, through `lib/llm` `extract`, cached like every extraction, key independent of today). The model only reads the text: relative dates come back as an offset / month and are resolved in code against `today`; city, citizenship, purpose and arrival defaults are filled in code and each becomes an assumption. Falls back to the deterministic parser (`parseProfileDeterministic`, English only) when there is no key, the cache misses in read mode, or the call fails (`source: "deterministic"`). Handles typos, Finnish/Czech, vague input, any Finnish city, out of scope (leaving Finland, off-topic) and prompt injection (user text is data inside `<user_input>`, output is schema-validated). `people[0]` is the main applicant (= `profile`); a spouse/child with their own citizenship follows. `profile.alreadyDone` lists steps the person says they hold ("I already have a bank account / personal identity code"): not searched, added by `findSteps` as `done` milestones (0 days, no visit, no citations: their statement, not a claim). findSteps plans for the main applicant only (`hasFamily` makes it research the family-member step); `partnerDifferences(people)` (`lib/agent/partnerSteps.ts`) only lists the citizenship-path steps that differ per partner (e.g. non-EU spouse of a Nordic citizen: residence permit), not researched or cited. Tests: `tests/parse/inputs.ts` (18 inputs), cache in `demo-cache/llm`, table via `npm run parse-table`.
2. `findSteps(profile)`: canonical step ids from `lib/agent/stepTaxonomy.ts` (search hints only, **no facts**), selected per profile. Per step, in parallel: `searchOfficial` (+ `searchProvider` for bank steps, + university domains for study steps) → `extract` with one per-step schema (`{title, claims[{kind,value,url,quote}]}`, 6 properties, 2 levels; quotes requested as a field because `output.grounding` has url+title only) → `verifyCitations` (quote must be in Exa text for that URL: highlights in hand, else `getPages`; exact or ≥ 0.9 token overlap; numbers in a value must be in its quote) → Step. A step without a verified `applies` claim becomes a stub "not found, check <url>". Same-step disagreements on mode / processing time / cost of delay → `Conflict`. Cost ≈ $0.15–0.17 per cold run (8 steps: 9 auto + 8 deep + ~8 contents), 0 when cached.
3. `findCommunityTips(profile, steps)`: for the critical node and every in-person step, two `searchCommunity` queries (wait / appointments; tricks / what people forgot), official domains excluded, `startPublishedDate` = 1 Jan two years back (year granularity keeps cache keys stable), full text for the top 3 wait-query pages → `extract` (`lib/prompts/extractTips.ts`) → `verifyCitations` per tip → `Tip[]`. Trust from the URL (university guides = "university"). `estimatesWithTips`: cited processing time first, else the median verified community wait, labelled in the schedule item's `note`/`waitSource`; only steps with neither stay `estimated`.
   `detectConflicts(steps, tips, {profile})`: per step, its verified claims + tips + the taxonomy's `conflictSearches` (bank_account: `searchOfficial` on finanssivalvonta.fi and `searchProvider`) → `extract` (`lib/prompts/detectConflicts.ts`) proposes pairs → kept only if verdict is "contradiction", both quotes verify, and the pages differ.
4. `lib/graph/` (pure): `buildGraph` (unknown requires → `unresolved` placeholders), `topoOrder` (cycles returned as `Deadlock`, never thrown; UI highlights them), `criticalNode`, `schedule` (Helsinki working days from max(arrival, today), parallel where independent, `durationDays`/`waitDays` from community data else defaults flagged `estimated`), `criticalPath`. Priority = transitive dependents × cost-of-delay urgency.
5. `toCalendar(steps)` → Google template links + .ics

### Orchestration and streaming
`lib/agent/run.ts` `run(text, {signal, onEvent, timeoutMs, today})`: parseProfile → findSteps (each step is emitted as soon as its own `applies` claim verifies; re-sent if its final form changes, so `step` events are upserts by id) → graph (pure, at once) ∥ findCommunityTips ∥ detectConflicts for steps that get no tips → schedule + calendar (need the tips' waits) ∥ detectConflicts for the tip steps → persist → `done`. Events: `PipelineEvent` in `lib/types.ts` (status, profile, step, stub, graph, tip, conflict, schedule, calendar, partial, out_of_scope, error, done with `RunSummary`).
- Status lines come from inside `lib/exa` and `lib/llm` (`lib/events/context.ts`, AsyncLocalStorage per run: status sink, abort signal, cost/cache meter), so the feed shows real work ("Found 5 official sources: dvv.fi, …", "Reading dvv.fi…", "Extracting cited steps from 5 sources…"). Outside a run they are no-ops.
- `POST /api/run {text}` → NDJSON (`lib/agent/runStream.ts`). Client disconnect aborts: no new Exa / LLM call starts and nothing more is emitted. Global timeout 75 s: what finished is completed with the pure stages (graph, schedule, calendar), then `partial {missing[]}` and `done` (never a blank response). `maxDuration = 120`. Out of scope → exactly one `out_of_scope` event. Per-step failures inside a stage → `error {recoverable: true}`.
- Every run with a profile is saved to `.cache/runs/<runId>.json` (OS temp dir if read-only); `done.summary.runId`; `GET /api/calendar.ics?runId=` reads it.
- Demo replay: an exact demo sentence served fully from cache spaces status lines 70–180 ms apart (~9 s for Marta, capped at 10 s in total); spacing stops at the first live call. `?fast=1` skips it.
- `npx tsx scripts/run.ts [--fast] [--json] "<sentence>"` prints the stream.

## UI (app/page.tsx, components/, lib/ui/)
Civic document, not a dashboard: light paper theme only, Finnish blue (#003580) only for the critical path, links and the primary button, amber only for conflicts, green only for done. Source Serif 4 for headlines and quotes, IBM Plex Sans for UI, sentence case, hairline rules, no chips or uppercase labels.
- Answer first: a letter (, pure, run data only): headline (set-up date from the critical path; the any-of shortcut when one option is ready >= 3 working days earlier, else the first critical step), then paragraphs: shortcut, money at stake (only from a verified cost_of_delay quote stating a % of salary, times the stated salary), the first conflict, community-sourced waits and estimated dates. Closing stats sentence with the rejected-claims list.
- Footnotes are per source page, numbered in reading order (letter first, then every other citation), shared by the letter, the side panel and the Sources list (grouped by trust tier). A footnote opens the verified quote; links use a URL text fragment to scroll to the sentence.
- Profile as one sentence with editable parts; an edit appends a correction to the original sentence and re-runs.
- Your map: React Flow, x = scheduled start (one column per date), lanes by authority (StepDef.authority), short labels (StepDef.short), orthogonal routes that never cross a node, any-of diamonds, merged visits in a frame (the requirement met inside the visit is not drawn).

## Out of scope
Lease checking, Websets, full benefits engine, Google OAuth, chat UI as main screen, OCR.

## Demo (3 min)
1. Problem: "Every office tells you its step. Nobody tells you they depend on each other."
2. Marta's sentence → graph builds live → click edge → citation. Demo sentences (`lib/demo/sentences.ts`, cached in `demo-cache/` so it runs offline):
   - "I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR, and starting a master's at Aalto"
   - "Brazilian PhD student moving to Tampere with my wife in January"
   - "Indian software engineer, arriving in Helsinki next week, no residence permit card yet"
3. Community layer + conflict (OP vs FIN-FSA on personal ID code for basic banking).
4. "Plan it" → calendar fills.
5. Judge tries their own situation.
