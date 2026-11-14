# Unblock: SPEC

## One-liner
Agent that turns a newcomer's situation into a **dependency graph of bureaucratic steps**, finds the **critical path**, and puts every physical visit into the **calendar** with a "visit pack". Every claim is cited.

## Target user
People moving to Finland (workers, students, families). Scope: Helsinki region first, other Finnish cities should still work via live search.

## Core features (only these 3)

### F1: Live dependency graph
- Input: one free-text sentence ("Moving to Helsinki on 1 Sept for a job, Czech citizen, starting a master's at Aalto").
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
};

type Citation = { url: string; quote: string; trust: "official" | "university" | "community"; fetchedAt: string };

type Step = {
  id: string;                  // e.g. "dvv_registration"
  title: string;
  authority: string;           // DVV, Vero, Kela...
  mode: "online" | "in_person" | "either";
  requires: string[];          // step ids
  costOfDelay?: string;        // human-readable, e.g. "60 % tax withheld from salary"
  visitPack?: { address?: string; hours?: string; documents: string[]; bookingUrl?: string };
  citations: Citation[];
  communityTips?: Citation[];
};

type Conflict = { topic: string; a: Citation; b: Citation; note: string };
```

## Pipeline
1. `parseProfile(text)` LLM (Haiku/Sonnet) → Profile
2. `findSteps(profile)` parallel Exa `auto` searches (one per authority), official domains, `contents.highlights` → Claude extracts steps/edges citing numbered highlight sentences → `verifyCitations` → Step[] with citations. (Not `deep`: its `output.grounding` gives url+title only, no quotes. See docs/exa-response-shapes.md.)
3. `findCommunityTips(steps)` Exa search without domain filter, forums and guides → tips + conflicts
4. `lib/graph/` (pure): `buildGraph` (unknown requires → `unresolved` placeholders), `topoOrder` (cycles returned as `Deadlock`, never thrown; UI highlights them), `criticalNode`, `schedule` (Helsinki working days from max(arrival, today), parallel where independent, `durationDays`/`waitDays` from community data else defaults flagged `estimated`), `criticalPath`. Priority = transitive dependents × cost-of-delay urgency.
5. `toCalendar(steps)` → Google template links + .ics

Stream progress to UI ("searching dvv.fi…", "reading kela.fi…").

## Out of scope
Lease checking, Websets, full benefits engine, Google OAuth, chat UI as main screen, OCR.

## Demo (3 min)
1. Problem: "Every office tells you its step. Nobody tells you they depend on each other."
2. Marta's sentence → graph builds live → click edge → citation.
3. Community layer + conflict (OP vs FIN-FSA on personal ID code for basic banking).
4. "Plan it" → calendar fills.
5. Judge tries their own situation.
