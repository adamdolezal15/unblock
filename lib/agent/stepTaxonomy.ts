// Canonical step ids + how to look them up. This file carries NO facts about the steps
// (no requirements, documents, deadlines, offices). `appliesTo` only decides what to search for;
// a step reaches the user only if a live source sentence confirms it applies (an `applies` claim).
import type { Profile } from "../types";

export type StepDef = {
  id: string;
  /** Neutral label used for progress messages and stubs; the shown title comes from sources. */
  label: string;
  appliesTo: (p: Profile) => boolean;
  /** Search query (Exa auto + the deep extraction query). */
  query: (p: Profile) => string;
  /** Exa `objective` for the auto search. */
  objective: string;
  /** Also search bank / provider domains. */
  provider?: true;
  /** Also allow university domains. */
  university?: true;
  /** Additional targeted searches for this step (run in parallel with the main one). */
  extraSearches?: { layer: "official" | "provider"; query: string; objective: string }[];
  /**
   * Searches run by detectConflicts to get both sides of a fact sources are known to state differently.
   * `domains` narrows an official search (e.g. to the regulator). Search hints only, no facts.
   */
  conflictSearches?: { layer: "official" | "provider"; query: string; objective: string; domains?: string[] }[];
};

const studying = (p: Profile) => p.purpose.includes("study");
const working = (p: Profile) => p.purpose.includes("work") || !!p.monthlySalaryEur;
const shortStay = (p: Profile) => p.stayMonths !== undefined && p.stayMonths < 12;

export const STEP_TAXONOMY: StepDef[] = [
  {
    id: "eu_registration",
    label: "Register EU citizen's right of residence",
    appliesTo: (p) => p.citizenship === "EU",
    query: (p) => `How does an EU citizen register their right of residence after moving to ${p.city}, Finland`,
    objective: "Official pages explaining how and when an EU citizen registers the right of residence in Finland, what to bring and what it is needed for.",
  },
  {
    id: "nordic_registration",
    label: "Nordic citizen registration",
    appliesTo: (p) => p.citizenship === "NORDIC",
    query: (p) => `How does a citizen of a Nordic country register as a resident after moving to ${p.city}, Finland`,
    objective: "Official pages on registration for Nordic citizens moving to Finland, including the Nordic move notification and what to bring.",
  },
  {
    id: "residence_permit",
    label: "Residence permit",
    appliesTo: (p) => p.citizenship === "NON_EU" && !p.temporaryProtection,
    query: (p) =>
      `Residence permit for a non-EU citizen moving to Finland for ${p.purpose.join(" and ")}: how to apply, residence permit card, identification visit`,
    objective: "Official pages on applying for a first residence permit in Finland, the residence permit card and what the permit is needed for.",
  },
  {
    id: "temporary_protection",
    label: "Temporary protection",
    appliesTo: (p) => !!p.temporaryProtection,
    query: () => "Applying for temporary protection in Finland: where to apply, residence permit card, municipality of residence",
    objective: "Official pages on applying for temporary protection in Finland and what it gives access to.",
  },
  {
    id: "family_member_permit",
    label: "Family member's residence",
    appliesTo: (p) => !!p.hasFamily,
    query: (p) =>
      p.citizenship === "NON_EU"
        ? "Residence permit for a spouse and children of a person moving to Finland: family ties permit"
        : "Registering the right of residence of a family member of an EU citizen in Finland",
    objective: "Official pages on residence for family members of someone moving to Finland.",
  },
  {
    id: "dvv_registration",
    label: "Register as a resident and get a Finnish personal identity code",
    appliesTo: () => true,
    query: (p) =>
      `Registering as a resident in the Finnish Population Information System and getting a personal identity code after moving to ${p.city}`,
    objective: "Official pages on registering foreign residents in Finland (DVV), getting a Finnish personal identity code, municipality of residence and what you need to bring.",
  },
  {
    id: "tax_card",
    label: "Tax card",
    appliesTo: working,
    query: () => "How to get a Finnish tax card when moving to Finland to work, and what happens if you do not have one",
    objective: "Official Finnish Tax Administration pages on getting a tax card as a newcomer, where to apply, what is needed, and the withholding rate without a tax card.",
  },
  {
    id: "vero_identity_code",
    label: "Personal identity code from a Vero tax office",
    appliesTo: working,
    query: () =>
      "Getting a Finnish personal identity code at a Tax Administration (Vero) tax office when arriving in Finland to work",
    objective:
      "Official Finnish Tax Administration pages on tax offices that issue Finnish personal identity codes to people arriving to work: who can get one there, what to bring, and when the code is issued.",
  },
  {
    id: "bank_account",
    label: "Bank account",
    appliesTo: () => true,
    provider: true,
    query: () => "Opening a bank account in Finland as a newcomer: what you need, personal identity code, basic banking services",
    objective: "Official and bank pages stating what a newcomer needs to open a bank account in Finland, whether a Finnish personal identity code is required, and the right to basic banking services.",
    conflictSearches: [
      {
        layer: "official",
        domains: ["finanssivalvonta.fi"],
        query: "right to basic banking services without a Finnish personal identity code, opening a bank account",
        objective:
          "Finnish Financial Supervisory Authority (FIN-FSA) pages on the right to basic banking services and whether a bank may require a Finnish personal identity code to open an account.",
      },
      {
        layer: "provider",
        query: "open a bank account without a Finnish personal identity code requirements foreigner",
        objective: "Bank pages stating whether a Finnish personal identity code is required to open an account or get basic banking services.",
      },
    ],
  },
  {
    id: "strong_identification",
    label: "Strong electronic identification (online banking codes)",
    appliesTo: () => true,
    provider: true,
    query: () => "How to get strong electronic identification (online banking credentials) in Finland as a foreigner",
    objective: "Official and bank pages on getting strong electronic identification in Finland, what is required, and what services need it.",
    extraSearches: [
      {
        layer: "official",
        query: "online banking credentials strong electronic identification requirements",
        objective:
          "Official pages stating what is required to get online banking credentials / strong electronic identification in Finland, including whether you must first be a customer of the bank with a bank account.",
      },
      {
        layer: "provider",
        query: "online banking credentials strong electronic identification requirements for a new customer bank account",
        objective:
          "Bank pages stating the requirements for getting online banking credentials and a strong electronic ID, including whether you need a bank account or customer relationship with the bank first.",
      },
    ],
  },
  {
    id: "kela_registration",
    label: "Finnish social security coverage (Kela)",
    appliesTo: (p) => !shortStay(p),
    query: () => "Applying for Finnish social security coverage from Kela when moving to Finland, and the Kela card",
    objective: "Official Kela pages on applying for coverage under Finnish social security when moving to Finland, the Kela card, and what you need first.",
  },
  {
    id: "police_id_card",
    label: "Identity card for a foreigner",
    appliesTo: (p) => !shortStay(p),
    query: () => "Identity card for a foreigner living in Finland from the police: who can apply and what is needed",
    objective: "Official police pages on the identity card for foreigners in Finland, who can apply, prerequisites and how to apply.",
  },
  {
    id: "university_enrolment",
    label: "University enrolment and arrival steps",
    appliesTo: studying,
    university: true,
    query: (p) => `New international degree student arriving in ${p.city}: enrolment, registration and practical arrival steps`,
    objective: "University pages for incoming international students on enrolment and the practical arrival steps (registration, residence, Kela, bank).",
  },
];

/**
 * Milestones: states a step can need ("has a Finnish personal identity code") that several different
 * steps can produce. Never searched directly; a source must say which steps provide them.
 */
export const MILESTONES: Record<string, { label: string }> = {
  personal_identity_code: { label: "Finnish personal identity code" },
};
export const MILESTONE_IDS: ReadonlySet<string> = new Set(Object.keys(MILESTONES));

/** Ids a `requires` claim may name: steps and milestones. */
export const STEP_IDS: ReadonlySet<string> = new Set([...STEP_TAXONOMY.map((s) => s.id), ...MILESTONE_IDS]);

export function selectSteps(profile: Profile): StepDef[] {
  return STEP_TAXONOMY.filter((s) => s.appliesTo(profile));
}
