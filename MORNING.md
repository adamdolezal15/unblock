# MORNING.md: final polish (before the demo)

Revert everything: `git checkout before-final` (tag pushed). To undo one step, `git revert <commit>`.

## What changed (one commit each, every one green on `npm test` + `npm run build`)
1. **89e03e3** Day by day: one date marker per day; same-day visits stacked under it. Merged visit = one title ("Vero: ID code + tax card"), other steps as checklist lines.
2. **85c91ef** Waits: one line per day, only the slowest chain's wait, no "Estimate: no official figure found" on the rail. All waits in full are in the card's Details.
3. **c40c531** No "On the slowest chain" label, no blue card border. Critical days: filled blue dot + blue date; others hollow. Header: "Blue dates set your finish date."
4. **bf7f346** "If you skip it: …" → one muted "Skip it: …" line; full sentence in Details (+ `tests/ui/skipLine.test.ts`).
5. **6c8f9c7** Online steps off the slowest chain → one "Anytime online" group ("Possible from 7 Dec"), not on the timeline. Labels "Dec · Tue".
6. **3d24824** Ready to send: forms as a plain list (name, Open), no footnotes / "For …". A prepared draft stays collapsed (title, subject, Copy, Open in email); "Read the draft" expands, no inner scrollbar.
7. **88159e2** Visual system pass: tokens only (no raw white), landing button 44px primary spec, one tag radius, map labels on the scale.
- **ccca6fb** Flaky drafts test fixed at the cause: draft offers now use the schedule's step order instead of stream order, so two same-day visits never swap which gets the booking note (passed 6/6 + every gate since). Was a known flake; no test expectation changed.

Marta (clean `?demo=marta`): Vero shortcut, 5 visits, 15 days sooner (guarded by `tests/golden/marta-headline.test.tsx`, green).

## Skipped / not finished
- **Spanish and Portuguese demos:** there are none. `DEMO_SENTENCES` has marta, brazil, india, vietnam. Not rendered/checked one by one in this pass (their golden/invariant tests are green).
- **Step 8 (consistency on map tab + activity panel):** screenshots taken (below) but not reviewed or fixed: usage limit reached.
- **Step 9 (full visual check):** Marta desktop + mobile and the empty state were checked after each step; no overlaps or horizontal scroll seen. Brazil/India/Vietnam not screenshot-checked.
- Drafts still need "Prepare draft" before the subject shows (auto-preparing would add model calls = a new feature).
- Still in the design: "SET UP BY" uppercase label, "Optional" uppercase tag, some 4/12px inner gaps.

## Heads-up
- Your `next dev` on :3000 stopped hot-reloading `globals.css` earlier: **restart it** before the demo or the old styles show.

## Screenshots (`docs/morning/`)
marta-1440.png, marta-390-header.png, marta-390-timeline.png, empty-1440.png, empty-390.png, map-1440.png (not reviewed), activity-1440.png (not reviewed).
