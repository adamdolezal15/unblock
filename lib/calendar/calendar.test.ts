import { describe, expect, it } from "vitest";
import type { Step } from "../types";
import { buildGraph, schedule } from "../graph";
import { eventsFromSchedule, foldLine, googleTemplateUrl, helsinkiToUtc, toIcs, truncateDetails, DETAILS_SUFFIX } from "./index";
import type { CalEvent } from "./index";

// ---- a small RFC 5545 reader: unfold, split into components, unescape ----
type Comp = { name: string; props: { name: string; params: Record<string, string>; value: string }[]; children: Comp[] };

function unescapeText(s: string): string {
  return s.replace(/\\([nN,;\\])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

function parseIcs(ics: string): Comp {
  expect(ics.endsWith("\r\n")).toBe(true);
  const physical = ics.slice(0, -2).split("\r\n");
  const lines: string[] = [];
  for (const l of physical) {
    if (l.startsWith(" ")) lines[lines.length - 1] += l.slice(1);
    else lines.push(l);
  }
  const root: Comp = { name: "ROOT", props: [], children: [] };
  const stack = [root];
  for (const l of lines) {
    const colon = l.indexOf(":");
    const [name, ...paramParts] = l.slice(0, colon).split(";");
    const value = l.slice(colon + 1);
    if (name === "BEGIN") {
      const c: Comp = { name: value, props: [], children: [] };
      stack[stack.length - 1].children.push(c);
      stack.push(c);
    } else if (name === "END") {
      expect(stack.pop()!.name).toBe(value);
    } else {
      const params = Object.fromEntries(paramParts.map((p) => p.split("=") as [string, string]));
      stack[stack.length - 1].props.push({ name, params, value });
    }
  }
  expect(stack).toHaveLength(1);
  return root.children[0];
}

const prop = (c: Comp, n: string) => c.props.find((p) => p.name === n);
const vevents = (cal: Comp) => cal.children.filter((c) => c.name === "VEVENT");

function ev(over: Partial<CalEvent> = {}): CalEvent {
  return {
    uid: "x@unblock",
    kind: "visit",
    stepId: "x",
    title: "Visit",
    date: "2026-09-01",
    startTime: "10:00",
    durationMinutes: 60,
    details: "What: thing",
    estimated: false,
    ...over,
  };
}

const NOW = new Date("2026-08-01T12:00:00Z");

describe("helsinkiToUtc", () => {
  it("uses +3 in summer and +2 in winter", () => {
    expect(helsinkiToUtc("2026-07-01", "10:00").toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(helsinkiToUtc("2026-12-01", "10:00").toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });
});

describe("googleTemplateUrl", () => {
  it("encodes text, details and location and uses UTC dates", () => {
    const url = googleTemplateUrl(
      ev({ title: "DVV & Maistraatti: ä/ö, 100%", details: "Line1\nLine2 #tag", location: "Lintulahdenkuja 2, Helsinki" }),
    );
    expect(url.startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE&")).toBe(true);
    const u = new URL(url);
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("text")).toBe("DVV & Maistraatti: ä/ö, 100%");
    expect(u.searchParams.get("details")).toBe("Line1\nLine2 #tag");
    expect(u.searchParams.get("location")).toBe("Lintulahdenkuja 2, Helsinki");
    expect(u.searchParams.get("dates")).toBe("20260901T070000Z/20260901T080000Z");
    expect(url).not.toMatch(/\s/);
    expect(url).not.toContain("+"); // spaces are %20
  });

  it("truncates long details with the suffix", () => {
    const u = new URL(googleTemplateUrl(ev({ details: "x".repeat(5000) })));
    const d = u.searchParams.get("details")!;
    expect(Array.from(d).length).toBeLessThanOrEqual(1500);
    expect(d.endsWith(DETAILS_SUFFIX)).toBe(true);
    expect(truncateDetails("short")).toBe("short");
  });

  it("does not split surrogate pairs when truncating", () => {
    const d = truncateDetails("😀".repeat(2000));
    expect(d).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("omits location when absent", () => {
    expect(googleTemplateUrl(ev())).not.toContain("location=");
  });
});

describe("toIcs", () => {
  it("round-trips through the parser with CRLF, UID, DTSTAMP, TZID and a 1-day alarm", () => {
    const ics = toIcs([ev({ location: "Somewhere 1", url: "https://example.fi/book" })], NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    const cal = parseIcs(ics);
    expect(cal.name).toBe("VCALENDAR");
    expect(cal.children.find((c) => c.name === "VTIMEZONE")).toBeTruthy();
    const [e] = vevents(cal);
    expect(prop(e, "UID")!.value).toBe("x@unblock");
    expect(prop(e, "DTSTAMP")!.value).toBe("20260801T120000Z");
    expect(prop(e, "DTSTART")).toMatchObject({ params: { TZID: "Europe/Helsinki" }, value: "20260901T100000" });
    expect(prop(e, "DTEND")!.value).toBe("20260901T110000");
    expect(unescapeText(prop(e, "LOCATION")!.value)).toBe("Somewhere 1");
    expect(prop(e, "URL")!.value).toBe("https://example.fi/book");
    const alarm = e.children.find((c) => c.name === "VALARM")!;
    expect(prop(alarm, "TRIGGER")!.value).toBe("-P1D");
    expect(prop(alarm, "ACTION")!.value).toBe("DISPLAY");
  });

  it("puts all events in one calendar", () => {
    const cal = parseIcs(toIcs([ev({ uid: "a@u" }), ev({ uid: "b@u" }), ev({ uid: "c@u" })], NOW));
    expect(vevents(cal).map((e) => prop(e, "UID")!.value)).toEqual(["a@u", "b@u", "c@u"]);
  });

  it("escapes commas, semicolons, backslashes and newlines, and restores them on parse", () => {
    const title = "Kela; DVV, and C:\\path";
    const details = "Bring:\n- passport, ID\n- form A; form B\n\nLast line";
    const ics = toIcs([ev({ title, details })], NOW);
    expect(ics).toContain("SUMMARY:Kela\\; DVV\\, and C:\\\\path");
    expect(ics).toContain("\\n- passport\\, ID");
    const [e] = vevents(parseIcs(ics));
    expect(unescapeText(prop(e, "SUMMARY")!.value)).toBe(title);
    expect(unescapeText(prop(e, "DESCRIPTION")!.value)).toBe(details);
  });

  it("folds lines at 75 octets without splitting multibyte characters", () => {
    const details = "Pankkitili ä ö å €uro ".repeat(40) + "😀".repeat(30);
    const ics = toIcs([ev({ details })], NOW);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics).not.toContain("\uFFFD");
    const [e] = vevents(parseIcs(ics));
    expect(unescapeText(prop(e, "DESCRIPTION")!.value)).toBe(details);
    expect(foldLine("short")).toBe("short");
  });

  it("marks estimated events tentative", () => {
    const [a, b] = vevents(parseIcs(toIcs([ev({ estimated: true }), ev({ uid: "k@u" })], NOW)));
    expect(prop(a, "STATUS")!.value).toBe("TENTATIVE");
    expect(prop(b, "STATUS")).toBeUndefined();
  });
});

describe("Helsinki DST boundary (last Sunday of October)", () => {
  // 2026-10-25 is the last Sunday of October: clocks go back 04:00 EEST -> 03:00 EET.
  it("declares the transition rules in the VTIMEZONE", () => {
    const tz = parseIcs(toIcs([ev()], NOW)).children.find((c) => c.name === "VTIMEZONE")!;
    const standard = tz.children.find((c) => c.name === "STANDARD")!;
    expect(prop(standard, "RRULE")!.value).toBe("FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU");
    expect(prop(standard, "TZOFFSETFROM")!.value).toBe("+0300");
    expect(prop(standard, "TZOFFSETTO")!.value).toBe("+0200");
    const daylight = tz.children.find((c) => c.name === "DAYLIGHT")!;
    expect(prop(daylight, "RRULE")!.value).toBe("FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU");
  });

  it("keeps 10:00 wall-clock in ICS on both sides, while UTC shifts by an hour in Google links", () => {
    const fri = ev({ date: "2026-10-23" });
    const mon = ev({ date: "2026-10-26" });
    const cal = parseIcs(toIcs([fri, mon], NOW));
    expect(vevents(cal).map((e) => prop(e, "DTSTART")!.value)).toEqual(["20261023T100000", "20261026T100000"]);
    expect(new URL(googleTemplateUrl(fri)).searchParams.get("dates")).toBe("20261023T070000Z/20261023T080000Z");
    expect(new URL(googleTemplateUrl(mon)).searchParams.get("dates")).toBe("20261026T080000Z/20261026T090000Z");
  });

  it("converts times on the transition day itself correctly", () => {
    expect(helsinkiToUtc("2026-10-25", "02:00").toISOString()).toBe("2026-10-24T23:00:00.000Z"); // EEST
    expect(helsinkiToUtc("2026-10-25", "12:00").toISOString()).toBe("2026-10-25T10:00:00.000Z"); // EET
    expect(helsinkiToUtc("2026-03-29", "12:00").toISOString()).toBe("2026-03-29T09:00:00.000Z"); // EEST after spring forward
  });

  it("rolls a reminder crossing midnight into the next day", () => {
    const e = ev({ startTime: "23:50", durationMinutes: 30, date: "2026-10-24" });
    const [p] = vevents(parseIcs(toIcs([e], NOW)));
    expect(prop(p, "DTEND")!.value).toBe("20261025T002000");
  });
});

describe("eventsFromSchedule", () => {
  const cite = { url: "https://dvv.fi/x", quote: "Register at DVV.", trust: "official" as const, fetchedAt: "2026-01-01T00:00:00Z" };
  const steps: Step[] = [
    {
      id: "dvv",
      title: "DVV registration",
      authority: "DVV",
      mode: "in_person",
      requires: [],
      visitPack: { address: "Addr 1, Helsinki", hours: "9-16", documents: ["Passport", "Lease"], bookingUrl: "https://dvv.fi/book" },
      citations: [cite],
      communityTips: [
        { url: "https://forum.example/t", quote: "Cancellations appear at 23:00", trust: "community", fetchedAt: cite.fetchedAt, kind: "trick", text: "Check DVV for cancelled slots", remindAt: "23:00" },
        { url: "https://forum.example/w", quote: "Takes 3 weeks", trust: "community", fetchedAt: cite.fetchedAt, kind: "wait_time" },
      ],
    },
    { id: "tax", title: "Tax card", authority: "Vero", mode: "online", requires: ["dvv"], citations: [cite] },
    { id: "bank", title: "Bank account", authority: "OP", mode: "in_person", requires: ["dvv"], citations: [cite] },
  ];
  const sched = schedule(buildGraph(steps), { arrivalDate: "2026-09-01" }, { today: "2026-08-01", estimates: { dvv: { durationDays: 1, waitDays: 2 } } });
  const events = eventsFromSchedule(steps, sched);

  it("creates one visit per in_person step and a reminder per trick tip only", () => {
    expect(events.map((e) => e.uid).sort()).toEqual(["bank@unblock", "dvv-trick-0@unblock", "dvv@unblock"]);
  });

  it("builds the visit pack with what, why, address, hours, documents, booking and sources", () => {
    const dvv = events.find((e) => e.uid === "dvv@unblock")!;
    expect(dvv.date).toBe("2026-09-01");
    expect(dvv.location).toBe("Addr 1, Helsinki");
    expect(dvv.url).toBe("https://dvv.fi/book");
    expect(dvv.estimated).toBe(false);
    for (const s of ["What: DVV registration (DVV)", "Why: unblocks Tax card, Bank account", "Address: Addr 1, Helsinki", "Hours: 9-16", "- Passport", "- Lease", "Booking: https://dvv.fi/book", "- https://dvv.fi/x"]) {
      expect(dvv.details).toContain(s);
    }
    expect(dvv.details).not.toContain("estimate");
  });

  it("flags estimated dates", () => {
    const bank = events.find((e) => e.uid === "bank@unblock")!;
    expect(bank.estimated).toBe(true);
    expect(bank.details).toContain("Date is an estimate");
    expect(bank.details).toContain("Why: nothing else depends on this step");
    expect(bank.details).not.toContain("Address");
  });

  it("derives the reminder with its citation", () => {
    const r = events.find((e) => e.kind === "reminder")!;
    expect(r.title).toBe("Tip: Check DVV for cancelled slots");
    expect(r.startTime).toBe("23:00");
    expect(r.citation?.url).toBe("https://forum.example/t");
    expect(r.details).toContain("Cancellations appear at 23:00");
    expect(r.details).toContain("https://forum.example/t");
  });

  it("skips steps the schedule could not place", () => {
    const cyc: Step[] = [
      { id: "a", title: "A", authority: "X", mode: "in_person", requires: ["b"], citations: [] },
      { id: "b", title: "B", authority: "X", mode: "in_person", requires: ["a"], citations: [] },
    ];
    expect(eventsFromSchedule(cyc, schedule(buildGraph(cyc), {}, { today: "2026-08-03" }))).toEqual([]);
  });
});
