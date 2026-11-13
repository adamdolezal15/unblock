@AGENTS.md

# CLAUDE.md: Unblock (Junction 2026, Exa challenge)

Read SPEC.md first. It is the source of truth for scope and data shapes.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- `exa-js` for all web search and content (never raw fetch to other sites)
- `@anthropic-ai/sdk` for LLM steps (profile parsing, synthesis)
- Graph rendering: React Flow
- Keys in `.env.local`: `EXA_API_KEY`, `ANTHROPIC_API_KEY`. Never commit them, never log them.

## Exa usage rules
- Use the current Exa API. If unsure about a parameter, check the Exa agent skill / docs, do not guess.
- Content fields go inside `contents` on `/search` (`contents: { highlights: true }`).
- Official layer: always `includeDomains` from SPEC.md.
- During development use `type: "auto"` and `numResults <= 5`. Use `deep` only where SPEC says so.
- When using `outputSchema`, do not add citation/confidence fields. Exa returns `output.grounding` itself. Max 10 properties, 2 nesting levels.

## Product rules (non-negotiable)
- No claim without a citation. If no source is found, say "not found, check <official url>".
- Every citation quote is verified programmatically against the text Exa returned (`lib/agent/verifyCitations.ts`). Unverified claims are dropped, never shown.
- All Exa calls go through the disk cache in `lib/exa/` (`EXA_CACHE=read|write|off`). Saves credits and makes the demo work offline.
- Always label trust: official / university / community.
- If sources disagree, show both. Never silently pick one.

## Code layout
- `lib/exa/*` Exa calls only
- `lib/agent/*` pipeline steps from SPEC.md (one file per step)
- `lib/prompts/*` all LLM prompts as separate files
- `lib/calendar/*` Google template links + .ics
- `app/api/*` route handlers, stream progress events
- `scripts/*` smoke tests

## Workflow
- One feature per prompt, run it, commit.
- After each change run `npx tsx scripts/exa-smoke-test.ts` and the queries in test-queries.md.
- Update SPEC.md when a decision changes.
