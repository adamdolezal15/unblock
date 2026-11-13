# Exa response shapes (observed, exa-js 2.28, 2026-11-14)

Captured from real calls made by `scripts/exa-smoke-test.ts`. The raw JSON is in `.cache/exa/*.json`, stored as `{ fetchedAt, request, response }`. `lib/exa/search.ts` types the subset we rely on as `RawSearchResponse`.

## `/search`, `type: "auto"`, `contents: { highlights: true }`, `includeDomains`, `objective`
```jsonc
{
  "requestId": "…",
  "resolvedSearchType": "",          // empty string, don't rely on it
  "searchTime": 1994.1,              // ms, server side
  "costDollars": { "total": 0.007, "search": { "neural": 0.007 } },
  "results": [{
    "id": "https://…",               // same as url
    "url": "https://www.myhelsinki.fi/live-work/plan-your-move/opening-a-finnish-bank-account/",
    "title": "Opening a Finnish Bank Account: A Step-by-Step Guide",   // can be null per types
    "publishedDate": "2024-11-20T09:37:29.000Z",   // optional
    "author": "…",                                  // optional
    "image": "https://…",                           // optional
    "highlights": ["## What do you need to open an Finnish bank account?\n\nThe process …"]
  }]
  // "warnings" / "notices" appear only when non-empty
}
```
**Highlights in practice:** exactly **one highlight per result**, **1–5k characters**. It is a contiguous markdown excerpt (with `##` headings and line breaks), not a single sentence. That's good for citations: we split it into sentences, number them `[D{doc}.S{n}]`, and give Claude IDs. In the bank query, the edge sentence we need ("When you have a Finnish personal identity code, you can usually open a bank account", suomi.fi) was inside a highlight.

Latency observed: 1.3–2.5 s round trip. Cost $0.007 per call with 5 results.

## `/search`, `type: "deep"` + `outputSchema`
Same envelope plus `output`. In this sample the results carried only `id, title, url, highlights, image` (no dates).
```jsonc
"output": {
  "content": { "steps": [ { "id": "1", "title": "…", "requires": ["Valid passport or EU identity card", "…"] } ] },
  "grounding": [
    { "field": "steps[0].title", "confidence": "high",          // "low" | "medium" | "high"
      "citations": [ { "url": "https://migri.fi/en/eu-citizen", "title": "EU citizen | Maahanmuuttovirasto" } ] }
  ]
}
```
- `grounding` has one entry per **leaf field path** (`steps[i].id/title/requires`). Each citation is **url + title only, with no quote**, so `verifyCitations` has nothing to check. This confirms option B in docs/PLAN.md.
- Semantic drift: `requires` came back as documents ("Valid passport…"), not step IDs, despite the schema name.
- Latency 8.5–8.9 s. Cost $0.012.

## `/contents` (`getContents(urls, { text: { maxCharacters } })`)
`text` is a top-level option here, not inside `contents`.
```jsonc
{
  "requestId": "…",
  "searchTime": 5.5,
  "costDollars": { "total": 0.001, "contents": { "text": 0.001 } },
  "statuses": [ { "id": "https://…", "status": "success", "source": "cached" } ],
  "results": [ { "id", "url", "title", "publishedDate", "author", "image", "text": "Opening a Finnish Bank Account…" } ]
}
```
- About 270 ms when Exa has the page cached. The myhelsinki page was 3.9k chars.
- The first highlight of a search result was a substring of `text` after whitespace and case normalisation. So highlight text is page text, and either can be the verification source.
- Check `statuses[].status` per URL before trusting `text`.

## Observations relevant to the pipeline
- An official `includeDomains` query for bank requirements returned suomi.fi, dvv.fi, finanssivalvonta.fi, ihhelsinki.fi and myhelsinki.fi, all labelled `official`.
- The unfiltered community query returned FIN-FSA (PDF), nordicexpat.com, pankkitutka.com, studies.silta.helsinki.fi and yle.fi. **op.fi did not appear.** The demo conflict (OP vs FIN-FSA) needs a targeted bank-requirements query (risk 4 in PLAN.md).
- `studies.silta.helsinki.fi` is labelled `university`, through the `helsinki.fi` suffix match.
