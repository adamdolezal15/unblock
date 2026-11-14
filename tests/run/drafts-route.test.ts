// POST /api/drafts: input checks, offers re-derived on the server, and the template fallback when the model's
// draft is not cached (LLM_CACHE=read, no network): still only verified facts, each with its footnote.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

process.env.LLM_CACHE = "read";
process.env.LLM_PROVIDER = "anthropic";
process.env.EXA_LOG = "0";

import { POST } from "../../app/api/drafts/route";
import type { Draft, DraftSource } from "../../lib/agent/draftOffers";

const run = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/run-mwgiunwf-37c4f9759584.json"), "utf8"));
const source: DraftSource = { profile: run.profile, steps: run.steps, conflicts: [], dates: { bank_account: "2027-02-05" } };
const post = (body: unknown) => POST(new Request("http://x/api/drafts", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("POST /api/drafts", () => {
  it("400 on a malformed body", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ offerId: "bank" })).status).toBe(400);
  });

  it("404 for a draft the plan has no facts for (a student has no employer email)", async () => {
    expect((await post({ offerId: "employer", source })).status).toBe(404);
  });

  it("falls back to the template from the same verified facts when no model draft is cached", async () => {
    const res = await post({ offerId: "bank", source });
    expect(res.status).toBe(200);
    const { draft } = (await res.json()) as { draft: Draft };
    expect(draft.by).toBe("template");
    expect(draft.sources.length).toBeGreaterThan(0);
    expect(draft.body).toMatch(/\[Your name\]/);
    expect(draft.body).not.toMatch(/[\w.+-]+@[\w-]+\.\w+/);
    for (const s of draft.sentences.filter((x) => /\d/.test(x.text.replace(/\[[^\]]*\]/g, "")) && !/^I (arrive|plan|am)\b/.test(x.text))) {
      expect(s.refs.length, s.text).toBeGreaterThan(0);
    }
  });
});
