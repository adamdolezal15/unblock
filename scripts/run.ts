// Print the POST /api/run event stream in the terminal (same code path: lib/agent/runStream).
//   npx tsx scripts/run.ts "I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR, and starting a master's at Aalto"
//   npx tsx scripts/run.ts --fast "<sentence>"     skip demo replay delays
//   npx tsx scripts/run.ts --json "<sentence>"     raw NDJSON
// EXA_CACHE / LLM_CACHE as usual (read = offline).
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.EXA_LOG ??= "0";

import { readEvents, runStream } from "../lib/agent/runStream";
import type { Citation, PipelineEvent } from "../lib/types";

const args = process.argv.slice(2);
const fast = args.includes("--fast");
const json = args.includes("--json");
const sentence = args.filter((a) => !a.startsWith("--")).join(" ").trim();

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = c(2), bold = c(1), green = c(32), yellow = c(33), red = c(31), cyan = c(36), magenta = c(35);

const BADGE: Record<Citation["trust"], string> = {
  official: green("OFFICIAL"),
  provider: cyan("PROVIDER"),
  university: magenta("UNIVERSITY"),
  news: "NEWS",
  community: yellow("COMMUNITY"),
};
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function print(e: PipelineEvent, t: number) {
  const ts = dim(`${(t / 1000).toFixed(1).padStart(5)}s`);
  const out = (s: string) => console.log(`${ts}  ${s}`);
  const more = (s: string) => console.log(`        ${s}`);
  switch (e.type) {
    case "status":
      return out(dim(`· ${e.message}${e.cached ? " (cached)" : ""}`));
    case "profile": {
      const p = e.profile;
      out(bold(`PROFILE  ${p.citizenship} · ${p.purpose.join("+")} · ${p.city}${p.arrivalDate ? ` · arrives ${p.arrivalDate}` : ""}${p.monthlySalaryEur ? ` · ${p.monthlySalaryEur} EUR/month` : ""}`) + dim(`  (${e.source})`));
      for (const a of e.assumptions) more(dim(`assumption: ${a}`));
      for (const n of e.partnerNotes) more(dim(`partner: ${n}`));
      return;
    }
    case "out_of_scope":
      return out(yellow(`OUT OF SCOPE  ${e.message}`));
    case "step": {
      const st = e.step;
      if (st.milestone) {
        out(`${bold("◆")} ${st.title}${st.done ? dim("  (you said: already done)") : dim(`  any of: ${(st.requiresAnyOf ?? []).flat().join(" | ")}`)}`);
        return;
      }
      const req = st.requires.length ? dim(`  requires ${st.requires.join(", ")}`) : "";
      out(`${bold("●")} ${bold(st.title)} ${dim(`(${st.authority} · ${st.mode.replace("_", " ")}${st.visitId ? " · shared visit" : ""})`)}${req}`);
      const cite = (st.claims ?? []).find((x) => x.kind === "applies")?.citation ?? st.citations[0];
      if (cite) more(`${dim(`"${cut(cite.quote, 110)}"`)} [${BADGE[cite.trust]}]`);
      return;
    }
    case "stub":
      return out(yellow(`○ not confirmed: ${e.stub.label}`) + dim(`  ${e.stub.message}`));
    case "graph": {
      const real = e.graph.nodes.filter((n) => !n.milestone);
      out(bold(`GRAPH  ${real.length} steps, ${e.graph.edges.length} edges, critical node: ${e.criticalNode ?? "none"}`));
      more(dim(`order: ${e.order.join(" → ")}`));
      for (const d of e.deadlocks) more(red(`deadlock: ${d.stepIds.join(" → ")}: ${d.explanation}`));
      return;
    }
    case "tip": {
      const tp = e.tip;
      out(`${yellow("✎")} tip ${dim(tp.stepId)} ${tp.kind}${tp.waitDays !== undefined ? ` (${tp.waitDays} working days)` : ""}: ${cut(tp.tip, 100)}`);
      more(`${dim(cut(tp.citation.url, 100))} [${BADGE[tp.citation.trust]}]`);
      return;
    }
    case "conflict": {
      const k = e.conflict;
      out(`${red("!")} ${bold("conflict")} ${dim(k.stepId)} ${k.topic}: ${cut(k.note, 110)}`);
      more(`a [${BADGE[k.a.trust]}] ${dim(`"${cut(k.a.quote, 90)}"`)} ${dim(k.a.url)}`);
      more(`b [${BADGE[k.b.trust]}] ${dim(`"${cut(k.b.quote, 90)}"`)} ${dim(k.b.url)}`);
      more(`→ ${cut(k.whatToDo, 140)}`);
      return;
    }
    case "schedule": {
      const sch = e.schedule;
      out(bold(`SCHEDULE  from ${fmtDate(sch.startDate)}; critical path ${e.criticalPath.totalDays} working days (${e.criticalPath.calendarDays} calendar days)`));
      for (const id of sch.order) {
        const it = sch.items[id];
        if (!it) continue;
        const src = it.waitSource === "community" ? yellow("community wait") : it.waitSource ? "cited wait" : it.estimated ? dim("estimated") : "";
        const crit = e.criticalPath.stepIds.includes(id) ? red("★") : " ";
        more(`${crit} ${fmtDate(it.startDate).padEnd(12)} ${id.padEnd(22)} ready ${fmtDate(it.readyDate).padEnd(12)} wait ${String(it.waitDays).padStart(2)}d ${src}${it.movedBy ? dim(`  moved: ${it.movedBy.holiday}`) : ""}`);
      }
      for (const v of e.visitChoices) more(dim(`visit ${v.members.join(" + ")}: ${v.chosen.mode}. ${v.description}`));
      return;
    }
    case "calendar":
      out(bold(`CALENDAR  ${e.events.length} event${e.events.length === 1 ? "" : "s"}  (.ics: ${e.icsUrl})`));
      for (const ev of e.events) {
        more(`${ev.kind === "visit" ? "📅" : "⏰"} ${fmtDate(ev.date)} ${ev.startTime}  ${cut(ev.title, 70)}${ev.estimated ? dim("  (date estimated)") : ""}`);
        more(dim(`   ${cut(ev.googleTemplateUrl, 110)}`));
      }
      return;
    case "partial":
      out(yellow(bold(`PARTIAL (${e.reason})  ${e.message}`)));
      for (const m of e.missing) more(yellow(`missing: ${m}`));
      return;
    case "error":
      return out(red(`ERROR${e.recoverable ? " (recoverable)" : ""}  ${e.message}`));
    case "done": {
      const s = e.summary;
      out(bold(green(`DONE  run ${s.runId}${s.partial ? " (partial)" : ""}`)));
      more(`${s.steps} steps: ${s.online} online, ${s.inPersonVisits} in-person visit${s.inPersonVisits === 1 ? "" : "s"}, ${s.inCalendar} in calendar (+${s.reminders} tip reminders)${s.alreadyDone ? `, ${s.alreadyDone} already done` : ""}${s.notFound ? `, ${s.notFound} not confirmed` : ""}`);
      more(`critical path: ${s.criticalPath.workingDays} working days / ${s.criticalPath.calendarDays} calendar days, done ${s.criticalPath.endDate ? fmtDate(s.criticalPath.endDate) : "-"}  (${s.criticalPath.stepIds.join(" → ")})`);
      more(`sources: ${Object.entries(s.sourcesByTrust).filter(([, n]) => n).map(([t, n]) => `${n} ${t}`).join(", ")}`);
      more(`quotes: ${s.verifiedQuotes} verified shown, ${s.droppedClaims} claims dropped (quote not found)  ·  ${s.tips} tips, ${s.conflicts} conflicts`);
      more(`time ${(s.totalMs / 1000).toFixed(1)} s  ·  cost $${s.costUsd.total.toFixed(3)} (exa $${s.costUsd.exa.toFixed(3)}, llm $${s.costUsd.llm.toFixed(3)})  ·  calls: exa ${s.calls.exa} (${s.calls.exaLive} live), llm ${s.calls.llm} (${s.calls.llmLive} live)`);
      return;
    }
  }
}

async function main() {
  if (!sentence) {
    console.error('usage: npx tsx scripts/run.ts [--fast] [--json] "<sentence>"');
    process.exit(1);
  }
  const t0 = Date.now();
  if (!json) console.log(dim(`input: ${sentence}\n`));
  const counts: Record<string, number> = {};
  for await (const e of readEvents(runStream(sentence, { fast }))) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (json) process.stdout.write(`${JSON.stringify(e)}\n`);
    else print(e, Date.now() - t0);
  }
  if (!json) console.log(dim(`\nevents: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(", ")}  ·  stream ${((Date.now() - t0) / 1000).toFixed(1)} s`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
