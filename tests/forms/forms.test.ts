import { describe, expect, it } from "vitest";
import { findQuote, MATCH_THRESHOLD } from "../../lib/agent/verifyCitations";
import { audienceFits, formsFromPages, guidanceOf, linkFor, sentences, type FormPage } from "../../lib/agent/forms";
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

describe("forms: two adjacent sentences, and unnumbered official links", () => {
  const VERO2 = "https://www.vero.fi/en/individuals/tax-cards-and-tax-returns/arriving_in_finland/work_in_finland/ids/";
  it("takes 'fill in the form in advance:' plus the title and number right after it as one piece of evidence", () => {
    const text = "Visit a tax office.\nMake sure to fill in the registration form in advance:\nRegistration information on a foreigner staying in Finland temporarily (6150e).\nDo not sign the form until at the tax office.";
    const [f] = formsFromPages([{ url: VERO2, text, links: [], fetchedAt: "" }]);
    expect(f).toMatchObject({ id: "6150e", url: null, type: null, guidance: "fill in before you go" });
    expect(f.name).toBe("Form 6150e (Registration information on a foreigner staying in Finland temporarily)");
    expect(f.citation.quote).toContain("fill in the registration form in advance");
    expect(findQuote(f.citation.quote, text).score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });
  it("does not pair a title with a sentence that is not an instruction to fill in a form", () => {
    const text = "Do not sign the form until at the tax office.\nNon-resident's application for tax at source card, tax card, tax prepayment or tax number (5057e)";
    expect(formsFromPages([{ url: VERO2, text, links: [], fetchedAt: "" }])).toEqual([]);
  });
  it("drops the Finnish-citizen-family supplement: conditional on a status the profile does not have", () => {
    const text = "If you are a family member of a Finnish citizen, fill in the supplement form Suomen kansalaisen vapaan liikkumisoikeuden käyttö (pdf).";
    const pdf = "https://migri.fi/documents/1/SK_LIITE_Suomen+kansalaisen+vapaan+liikkumisoikeuden+käyttö_en.pdf?t=1";
    const page = { url: "https://migri.fi/en/x", text, links: [pdf], fetchedAt: "" };
    expect(formsFromPages([page], [], undefined, { citizenship: "EU", purpose: ["work"] })).toEqual([]);
    expect(formsFromPages([page])).toEqual([]);
  });
  it("audienceFits: a form must match the profile's citizenship class and purpose", () => {
    const eu: { citizenship: "EU"; purpose: ("work" | "study" | "family")[] } = { citizenship: "EU", purpose: ["work"] };
    expect(audienceFits("If you are a non-EU citizen, fill in form 1234x.", eu)).toBe(false);
    expect(audienceFits("If you are a student, submit form 1234x.", eu)).toBe(false);
    expect(audienceFits("If you are a student, submit form 1234x.", { citizenship: "EU", purpose: ["study"] })).toBe(true);
    expect(audienceFits("If you are an EU citizen, fill in form 1234x.", { citizenship: "NON_EU", purpose: ["work"] })).toBe(false);
    expect(audienceFits("Fill in form 6150e before you go.", eu)).toBe(true);
  });
  it("accepts an unnumbered official PDF when an unconditional sentence names it and says to fill it in", () => {
    const text = "Fill in the application form Hakemus oleskelukortin saamiseksi (pdf) and attach it to your application.";
    const pdf = "https://migri.fi/documents/1/Hakemus+oleskelukortin+saamiseksi_en.pdf?t=1";
    const [f] = formsFromPages([{ url: "https://migri.fi/en/x", text, links: [pdf, "https://example.com/Hakemus+oleskelukortin+saamiseksi_en.pdf"], fetchedAt: "" }]);
    expect(f).toMatchObject({ id: "Hakemus oleskelukortin saamiseksi", url: pdf, type: "pdf" });
    expect(formsFromPages([{ url: "https://migri.fi/en/x", text, links: [], fetchedAt: "" }])).toEqual([]);
  });
  it("accepts one official online form when a sentence says to request something using it", () => {
    const text = "1. ### Request a personal identity code by filling out the online form";
    const web = "https://lomakkeet.dvv.fi/lomakkeet/wuY0J/lomake.html?rinnakkaislomake=en";
    const [f] = formsFromPages([{ url: "https://dvv.fi/en/foreigner-registration", text: `Intro text for the page about registering.\n${text}\nThe rest.`, links: [web], fetchedAt: "" }]);
    expect(f).toMatchObject({ id: "Request a personal identity code", url: web, type: "web" });
  });
  it("shows nothing when the page has no sentence about the form, however many links it has", () => {
    expect(formsFromPages([{ url: "https://migri.fi/en/x", text: "Opening hours of the service point are listed below for every day.", links: ["https://migri.fi/documents/1/SK_LIITE_Suomen+kansalaisen+vapaan+liikkumisoikeuden+käyttö_en.pdf"], fetchedAt: "" }])).toEqual([]);
  });
});
