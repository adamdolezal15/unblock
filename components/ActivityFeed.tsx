"use client";
import { useEffect, useRef, useState } from "react";
import { isReplaying, type StatusLine } from "@/lib/ui/runState";
import { faviconUrl, fmtSeconds, plural } from "@/lib/ui/format";
import { IconChevron } from "./icons";

type Props = {
  statuses: StatusLine[];
  /** Recoverable problems, shown as plain lines in the log. */
  notes: string[];
  running: boolean;
  elapsedMs?: number;
  collapsed: boolean;
  onToggle: () => void;
};

/** What the agent is doing, newest at the bottom. Collapses to one line when the plan is done. */
export function ActivityFeed({ statuses, notes, running, elapsedMs, collapsed, onToggle }: Props) {
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [statuses.length, collapsed]);

  const sites = new Set(statuses.map((s) => s.domain).filter(Boolean)).size;
  const summary = `${plural(statuses.length, "action")} on ${plural(sites, "site")}${elapsedMs !== undefined ? ` in ${fmtSeconds(elapsedMs)}` : ""}`;

  return (
    <section aria-label="What I'm doing" className="flex min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
        <h2 className="text-[16px] font-semibold text-ink">{running ? "What I'm doing" : "How I worked this out"}</h2>
        {!running && (
          <button type="button" onClick={onToggle} aria-expanded={!collapsed} className="flex items-center gap-1 text-[14px] text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
            {collapsed ? "Show" : "Hide"} <IconChevron open={!collapsed} className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {collapsed ? (
        <p className="num pt-2 text-[14px] text-muted">{summary}.</p>
      ) : (
        <>
          <ol ref={list} className="max-h-[min(60vh,560px)] min-h-0 overflow-y-auto py-2" aria-live="polite">
            {statuses.map((s, i) => (
              <FeedLine key={s.id} line={s} live={running && i === statuses.length - 1} />
            ))}
            {notes.map((n, i) => (
              <li key={`n${i}`} className="py-1 pl-6 text-[14px] leading-5 text-muted">
                {n}
              </li>
            ))}
            {running && statuses.length === 0 && <li className="py-1 text-[14px] text-muted">Starting…</li>}
          </ol>
          <p className="num flex justify-between gap-3 border-t border-rule pt-2 text-[14px] text-muted">
            <span>{running ? `${plural(statuses.length, "action")} so far` : `${summary}.`}</span>
            {isReplaying(statuses) && <ReplayLabel />}
          </p>
        </>
      )}
    </section>
  );
}

/** Quiet, honest note: the activity is a saved run played back, not live work. */
export function ReplayLabel({ className = "" }: { className?: string }) {
  return <span className={`text-[13px] text-muted/80 ${className}`}>Replaying a saved run</span>;
}

function FeedLine({ line, live }: { line: StatusLine; live: boolean }) {
  return (
    <li className="rise flex items-start gap-2 py-1 text-[14px] leading-5">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        {line.domain ? <Favicon domain={line.domain} /> : <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-accent" : "bg-rule-strong"}`} />}
      </span>
      <span className={live ? "text-ink" : "text-muted"}>{line.message}</span>
    </li>
  );
}

export function Favicon({ domain, className = "h-4 w-4" }: { domain: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className={`${className} flex items-center justify-center rounded-sm bg-sunk text-[11px] font-semibold uppercase text-muted`}>{domain[0]}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny third-party favicon; next/image adds nothing here
    <img src={faviconUrl(domain)} alt="" width={16} height={16} className={`${className} rounded-sm`} onError={() => setFailed(true)} loading="lazy" />
  );
}
