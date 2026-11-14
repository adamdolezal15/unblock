import { describe, expect, it } from "vitest";
import { findQuote, MATCH_THRESHOLD } from "../../lib/agent/verifyCitations";
import { formsFromPages, guidanceOf, linkFor, sentences, type FormPage } from "../../lib/agent/forms";
import { allForms, formLine, requiredForms } from "../../lib/ui/forms";
import { initialRunState, type RunState } from "../../lib/ui/runState";
import type { Step, StepForm } from "../../lib/types";

const VERO = "https://www.vero.fi/en/individuals/tax-cards/";
const TEXT = [
  "Tax card for a new employee.",
  "If you are moving to Finland, you can apply for a tax card with form 6150e (Tax card application for a person arriving in Finland).",
  "The form must be filled in beforehand but signed only at the tax office.",
  "Form 6150e can be filled in beforehand but it is signed only at the tax office when you show your identity document.",
  "You can read about the 2 forms of tax in our guide to taxation in general terms.",
].join("\n");
const PDF = "https://www.vero.fi/globalassets/lomakkeet/6150e_en.pdf";
const page = (over: Partial<FormPage> = {}): FormPage => ({ url: VERO, text: TEXT, links: [PDF, "https://example.com/6150e.pdf", "https://www.vero.fi/en/"], fetchedAt: "2026-11-14T00:00:00Z", ...over });

describe("forms: finding them", () => {
  const forms = formsFromPages([page()]);
  it("finds the form named by a verified sentence, with its official PDF link", () => {
    expect(forms).toHaveLength(1);
    const f = forms[0];
    expect(f.id).toBe("6150e");
    expect(f.url).toBe(PDF);
    expect(f.type).toBe("pdf");
    expect(f.guidance).toBe("fill in before you go, sign at the office");
    expect(f.citation).toMatchObject({ url: VERO, trust: "official" });
  });
  it("only keeps a sentence that is really on the page", () => {
    for (const f of forms) expect(findQuote(f.citation.quote, TEXT).score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });
  it("never uses a link from a non-official domain, and never invents one", () => {
    const f = formsFromPages([page({ links: ["https://example.com/6150e.pdf"] })])[0];
    expect(f.url).toBeNull();
    expect(f.type).toBeNull();
    expect(formsFromPages([page({ links: [] })])[0].url).toBeNull();
  });
  it("needs the number to stand alone in the link (16150e is not 6150e)", () => {
    expect(linkFor("6150e", ["https://www.vero.fi/x/16150e.pdf"], [])).toBeNull();
    expect(linkFor("6150e", ["https://www.vero.fi/x/6150e_sv.pdf", "https://www.vero.fi/x/6150e"], [])).toBe("https://www.vero.fi/x/6150e_sv.pdf");
  });
  it("ignores pages that are not official and counts like '2 forms'", () => {
    expect(formsFromPages([page({ url: "https://www.expat-blog.com/tax" })])).toEqual([]);
    expect(formsFromPages([page({ text: "There are 2 forms of tax in Finland and you pay both of them every year." })])).toEqual([]);
  });
  it("needs a sentence that says the form is needed, not just one that names it (live: Migri MP_1)", () => {
    const text = "Response to possible denial of admittance or stay and to entry ban (the form MP_1)";
    expect(formsFromPages([page({ url: "https://migri.fi/en/x", text, links: ["https://migri.fi/documents/MP_1.pdf"] })])).toEqual([]);
  });
  it("says nothing about what to do when the sentence does not", () => {
    expect(guidanceOf("The tax office offers form 6150e for people who arrive from abroad.")).toBeNull();
    expect(guidanceOf("Fill in the application online with OmaVero.")).toBe("fill in online");
  });
  it("splits sentences without breaking on markdown links", () => {
    expect(sentences("See [form 6150e](https://www.vero.fi/a.pdf) for details about the card you need.")[0]).toBe("See form 6150e for details about the card you need.");
  });
});

const step = (id: string, over: Partial<Step> = {}, form?: Partial<StepForm>): Step =>
  ({ id, title: id, authority: "Vero", mode: "in_person", requires: [], citations: [], ...over, forms: form ? [{ id: "6150e", name: "Form 6150e", url: PDF, type: "pdf", guidance: "fill in before you go, sign at the office", citation: { url: VERO, quote: "The form must be filled in beforehand but signed only at the tax office.", trust: "official", fetchedAt: "" }, ...form }] : undefined }) as Step;

describe("forms: showing them", () => {
  const ref = (c: { url: string }) => ({ n: 1, citation: c as never });
  it("is one line with a footnote and an official link", () => {
    const l = formLine(step("a", {}, {}).forms![0], ref as never);
    expect(l.segs[0]).toEqual({ t: "Form 6150e: fill in before you go, sign at the office" });
    expect(l.segs[1]).toHaveProperty("ref");
    expect(l.href).toBe(PDF);
    expect(l.linkLabel).toBe("Open official form (PDF)");
  });
  it("points at the official page when the form has no link", () => {
    const l = formLine(step("a", {}, { url: null, type: null }).forms![0], ref as never);
    expect(l.href).toBe(VERO);
    expect(l.linkLabel).toBe("Open the official page");
  });
  it("lists a form once, only for steps a person has to do", () => {
    const steps = { a: step("a", {}, {}), b: step("b", {}, {}), c: step("c", { necessity: "optional" }, { id: "9999" }), d: step("d", { done: true }, { id: "8888" }) };
    const state = { ...initialRunState, steps, stepOrder: ["a", "b", "c", "d"] } as RunState;
    expect(requiredForms(state).map((x) => x.form.id)).toEqual(["6150e", "6150e"]);
    const all = allForms(state);
    expect(all).toHaveLength(1);
    expect(all[0].steps.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
