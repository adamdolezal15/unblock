// The invariant matrix (scripts/eval-invariants.ts, tests/golden/invariants.test.ts): citizenship class ×
// purpose × city × "already has X". The four demo sentences are reused as-is (their runs are already cached).
import { DEMO_SENTENCES } from "../demo/sentences";

export type EvalProfile = {
  key: string;
  text: string;
  /** What the row is meant to cover; the checks themselves read the parsed profile, not this. */
  covers: string;
};

export const EVAL_TODAY = "2026-11-14";

export const EVAL_PROFILES: EvalProfile[] = [
  { key: "marta", text: DEMO_SENTENCES.marta, covers: "EU · work+study · Helsinki" },
  { key: "brazil", text: DEMO_SENTENCES.brazil, covers: "non-EU · study+family · Tampere" },
  { key: "india", text: DEMO_SENTENCES.india, covers: "non-EU · work · Helsinki · no permit card yet" },
  { key: "vietnam", text: DEMO_SENTENCES.vietnam, covers: "non-EU · work · Oulu" },
  { key: "swede", text: "Swedish citizen moving to Tampere in January for a new job", covers: "Nordic · work · Tampere" },
  { key: "brit", text: "British citizen moving to Turku in February to work as a teacher", covers: "UK post-Brexit · work · Turku" },
  { key: "ukraine", text: "Ukrainian under temporary protection moving to Helsinki in December, I want to find work", covers: "temporary protection · work · Helsinki" },
  { key: "german", text: "German exchange student coming to Turku for 5 months from January", covers: "EU · study (short) · Turku" },
  { key: "polish", text: "Polish nurse moving to Oulu in March with two kids", covers: "EU · work+family · Oulu" },
  { key: "norwegian", text: "Norwegian citizen moving to Helsinki in January to live with my Finnish husband", covers: "Nordic · family · Helsinki" },
  { key: "american", text: "American software developer moving to Tampere in March, I already have a residence permit", covers: "non-EU · work · Tampere · has permit" },
  {
    key: "french",
    text: "French citizen moving to Helsinki in January for work, I already have a Finnish personal identity code and a bank account",
    covers: "EU · work · Helsinki · has ID code + bank",
  },
];
