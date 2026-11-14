// Builds a fake schedule for Marta (EU citizen, working in Helsinki) and writes demo-marta.ics.
// Run: npx tsx scripts/demo-calendar.ts
import { writeFileSync } from "node:fs";
import { buildGraph, schedule } from "../lib/graph";
import { eventsFromSchedule, googleTemplateUrl, toIcs } from "../lib/calendar";
import type { Citation, Step } from "../lib/types";

const fetchedAt = new Date().toISOString();
const cite = (url: string, quote: string): Citation => ({ url, quote, trust: "official", fetchedAt });

const steps: Step[] = [
  {
    id: "dvv_registration",
    title: "Register your residence at DVV",
    authority: "DVV",
    mode: "in_person",
    requires: [],
    visitPack: {
      address: "Maistraatti service point, Lintulahdenkuja 2, 00530 Helsinki",
      hours: "Mon-Fri 9:00-16:00",
      documents: ["Passport or EU ID card", "Rental contract", "EU registration certificate"],
      bookingUrl: "https://dvv.fi/en/book-an-appointment",
    },
    citations: [cite("https://dvv.fi/en/moving-to-finland", "Register your residence at a DVV service point.")],
    communityTips: [
      {
        url: "https://www.reddit.com/r/Suomi/example",
        quote: "Cancelled slots appear on the booking page around 23:00.",
        trust: "community",
        fetchedAt,
        kind: "trick",
        text: "Check DVV for cancelled slots",
        remindAt: "23:00",
      },
    ],
  },
  {
    id: "tax_card",
    title: "Get a tax card (verokortti)",
    authority: "Vero",
    mode: "online",
    requires: ["dvv_registration"],
    citations: [cite("https://www.vero.fi/en/individuals/tax-cards/", "You can order a tax card in OmaVero.")],
  },
  {
    id: "bank_account",
    title: "Open a bank account",
    authority: "OP Bank",
    mode: "in_person",
    requires: ["dvv_registration"],
    visitPack: {
      address: "Mannerheimintie 14, 00100 Helsinki",
      hours: "Mon-Fri 10:00-16:00",
      documents: ["Passport", "Finnish personal identity code", "Proof of address; salary, if asked"],
    },
    citations: [cite("https://www.op.fi/en/personal-customers/accounts", "Bring a valid ID and your personal identity code.")],
  },
  {
    id: "kela_card",
    title: "Apply for a Kela card",
    authority: "Kela",
    mode: "in_person",
    requires: ["dvv_registration", "bank_account"],
    visitPack: {
      address: "Kela office, Nordenskiöldinkatu 12, 00250 Helsinki",
      documents: ["Passport", "Finnish personal identity code", "IBAN of your Finnish account"],
      bookingUrl: "https://www.kela.fi/book-an-appointment",
    },
    citations: [cite("https://www.kela.fi/residence-in-finland", "Kela will tell you whether you are covered by Finnish social security.")],
  },
];

// Known estimate for DVV; everything else falls back to defaults (flagged as estimated).
const sched = schedule(buildGraph(steps), { arrivalDate: "2026-11-16" }, {
  estimates: { dvv_registration: { durationDays: 1, waitDays: 3 } },
});
const events = eventsFromSchedule(steps, sched);

writeFileSync("demo-marta.ics", toIcs(events));
console.log(`Wrote demo-marta.ics (${events.length} events)\n`);
for (const e of events) {
  console.log(`${e.date} ${e.startTime}  ${e.title}${e.estimated ? "  [estimated]" : ""}`);
  console.log(`  ${googleTemplateUrl(e)}\n`);
}
