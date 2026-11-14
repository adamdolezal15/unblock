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

type Conflict = { topic: string; a: Citation; b: Citation; note: string };
```

## Pipeline
All LLM-shaped work goes through `lib/llm` `extract(task, input, zodSchema)`. `LLM_PROVIDER=anthropic` (default): Claude Sonnet 5.5 reading the Exa results; needs `ANTHROPIC_API_KEY`, except with `LLM_CACHE=read` (no API calls). `LLM_PROVIDER=exa`: Exa `deep` search + `outputSchema` + `systemPrompt`; also the fallback when there is no key. Every extraction is disk-cached in `.cache/llm` (`LLM_CACHE=read|write|off`, key = provider + model + prompt version/hash + schema + input + docs hash), so the demo runs offline with `EXA_CACHE=read LLM_CACHE=read`. Nothing outside `lib/llm` knows which provider ran.

1. `parseProfile(text, today?)` → `{ok, profile, assumptions[]}` | `{ok:false, outOfScope}`. Currently deterministic (word lists, dates, salary); the LLM version keeps the signature.
2. `findSteps(profile)`: canonical step ids from `lib/agent/stepTaxonomy.ts` (search hints only, **no facts**), selected per profile. Per step, in parallel: `searchOfficial` (+ `searchProvider` for bank steps, + university domains for study steps) → `extract` with one per-step schema (`{title, claims[{kind,value,url,quote}]}`, 6 properties, 2 levels; quotes requested as a field because `output.grounding` has url+title only) → `verifyCitations` (quote must be in Exa text for that URL: highlights in hand, else `getPages`; exact or ≥ 0.9 token overlap; numbers in a value must be in its quote) → Step. A step without a verified `applies` claim becomes a stub "not found, check <url>". Same-step disagreements on mode / processing time / cost of delay → `Conflict`. Cost ≈ $0.15–0.17 per cold run (8 steps: 9 auto + 8 deep + ~8 contents), 0 when cached.
3. `findCommunityTips(steps)` Exa search without domain filter, forums and guides → tips + conflicts
4. `lib/graph/` (pure): `buildGraph` (unknown requires → `unresolved` placeholders), `topoOrder` (cycles returned as `Deadlock`, never thrown; UI highlights them), `criticalNode`, `schedule` (Helsinki working days from max(arrival, today), parallel where independent, `durationDays`/`waitDays` from community data else defaults flagged `estimated`), `criticalPath`. Priority = transitive dependents × cost-of-delay urgency.
5. `toCalendar(steps)` → Google template links + .ics

Stream progress to UI ("searching dvv.fi…", "reading kela.fi…").

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
