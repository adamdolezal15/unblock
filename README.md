# Unblock

Unblock turns one sentence about your move to Finland into a dated plan: which official steps you need, in what order, and what each depends on.
Every claim carries a citation, and the quote is checked against the text Exa returned. Anything that cannot be verified is dropped, never shown.
Sources are labelled official / university / community; when they disagree, both are shown.

## Run it

```bash
npm i
# .env.local
#   EXA_API_KEY=...
#   ANTHROPIC_API_KEY=...
npm run build && npm start      # http://localhost:3000
```

No keys? The three demo sentences below run fully offline from `demo-cache/`:

```bash
EXA_CACHE=read LLM_CACHE=read npm run build && EXA_CACHE=read LLM_CACHE=read npm start
```

Other scripts: `npm test`, `npm run warm-demo` (refresh the demo cache with live calls), `npx tsc --noEmit`.

## Demo sentences

1. I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR, and starting a master's at Aalto
2. Brazilian PhD student moving to Tampere with my wife in January
3. Indian software engineer, arriving in Helsinki next week, no residence permit card yet

## Architecture

- `lib/exa`: every Exa call (search, contents), the official-domain lists, and the disk cache (`EXA_CACHE=read|write|off`).
- `lib/llm`: Claude (or Exa deep search) for profile parsing and step extraction, with its own cache (`LLM_CACHE`) and schema salvage.
- `lib/agent`: the pipeline, one file per step: parse profile, find steps, community tips, conflict detection, citation verification, `run.ts` orchestration and the NDJSON stream.
- `lib/graph`: dependency graph, Finnish holidays, scheduling, critical path, and the "usual order vs your order" comparison.
- `lib/calendar`: Google Calendar template links and `.ics` export for visits and reminders.
- `app` (+ `components`, `lib/ui`): Next.js App Router; `POST /api/run` streams `PipelineEvent`s that the UI reduces into Summary, Day by day and Map views.

Failures degrade quietly: empty, over-long, out-of-scope and unreadable input, or a failing network or LLM, all end in a short plain message and never a stack trace.

## How to extend

- **New country pack:** add its official domains (`lib/exa/domains.ts`), its step taxonomy (`lib/agent/stepTaxonomy.ts`), its public holidays (`lib/graph/holidays.ts`), then run `npm run warm-demo` to build the demo cache for its sentences (`lib/demo/sentences.ts`).
- **New feature:** add a `PipelineEvent` variant in `lib/types.ts`, emit it from `lib/agent/run.ts`, handle it in `lib/ui/runState.ts`, and render it in a new view under `components/views`.
