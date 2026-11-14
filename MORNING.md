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

- **4782b1c** Activity panel: no second "How I worked this out" heading or second Hide under the link that opens it.
- **a65f0a4** Forms: an extracted name that is a sentence fragment (India showed "your application the") is shown as "Official form" (+ test).

## Last small fixes (after the polish; each test + build green)
- **0e97049** Merged card label "Vero · both in one visit", tax card with a check icon; draft links "Prepare booking note" / "Booking note ready" (never "Draft ready: <type>: <title>"); Bring lists without near-duplicates (`lib/ui/bring.ts`, Marta's Vero list had the passport and the income estimate twice) and no repeated draft link in Details; "Anytime online": "No fixed date. Do these when it suits you." with "Visit your bank" or "Online" per card; dates "Dec · Tue".
- **0dd3be1** Demo mode (`?demo=`): profile values are plain text, no "Edit your situation"; "Saved demo · Plan your own move →" loads the empty landing page.
- **99e6637** "Watch this plan" button; the Exa line no longer ends a line with a lone "•".
- "Visit your bank": the bank step is "either" (online or in person) in the sources; the UI says "Visit your bank" for bank steps that are not online-only, "Online" for the rest.

## Checks done (step 9)
- All demos (marta, brazil, india, vietnam) render at 1440x900 and 390x844 with no horizontal scroll and no element wider than the viewport (automated check in headless Chrome).
- Rechecked after the last fixes: all four demos render at 1440 and 390, no horizontal scroll.
- Marta (clean `?demo=marta`): "Get your Finnish personal identity code at Vero on 1 December", 5 visits, 15 days sooner.
- Empty state, Map tab and activity panel reviewed at 1440; no stray borders or second link styles left.

## Skipped and why
- **Spanish and Portuguese demos:** there are none in `DEMO_SENTENCES` (marta, brazil, india, vietnam). All four were checked instead.
- Drafts still need "Prepare draft" before the subject shows: preparing them automatically would add model calls (a new feature).
- Kept on purpose: the "SET UP BY" uppercase label and the "Optional" tag (earlier design decisions); a few 4/12px gaps inside components (the 8px grid is kept for sections and cards).
- Root cause of "your application the" is in form extraction (`lib/agent/forms.ts`), which was off limits; only the display is guarded.

## Heads-up
- Your `next dev` on :3000 stopped hot-reloading `globals.css` earlier: **restart it** before the demo or the old styles show.

## Screenshots (`docs/morning/`)
marta-1440.png, marta-390-header.png, marta-390-timeline.png, empty-1440.png, empty-390.png, map-1440.png, activity-1440.png, india-390.png.
