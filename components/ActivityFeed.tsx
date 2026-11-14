"use client";
import { useEffect, useRef, useState } from "react";
import type { StatusLine } from "@/lib/ui/runState";
import { faviconUrl, fmtSeconds } from "@/lib/ui/format";
import { IconChevron } from "./icons";

type Props = {
  statuses: StatusLine[];
  running: boolean;
  /** ms from start to done, when done. */
  elapsedMs?: number;
  /** Controlled collapse (the page layout depends on it). */
  collapsed: boolean;
  onToggle: () => void;
};

export function ActivityFeed({ statuses, running, elapsedMs, collapsed, onToggle }: Props) {
  const list = useRef<HTMLOListElement>(null);

  // Newest at the bottom: keep the list scrolled to the end as lines arrive.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [statuses.length, collapsed]);

  const sources = new Set(statuses.map((s) => s.domain).filter(Boolean)).size;
  const summary = running
    ? `Working… ${statuses.length} actions`
    : `${statuses.length} actions · ${sources} source sites${elapsedMs !== undefined ? ` · ${fmtSeconds(elapsedMs)}` : ""}`;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 border-b border-rule px-6 py-2 text-left text-[14px] text-muted hover:text-ink"
        aria-expanded={false}
      >
        <IconChevron className="h-4 w-4" />
        <span className="font-medium text-ink">Agent activity</span>
        <span className="num">{summary}</span>
      </button>
    );
  }

  return (
    <section aria-label="Agent activity" className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Agent activity</h2>
        {!running && (
          <button type="button" onClick={onToggle} className="flex items-center gap-1 text-[14px] text-muted hover:text-ink" aria-expanded>
            Hide <IconChevron open className="h-4 w-4" />
          </button>
        )}
      </div>
      <ol ref={list} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-4 pb-4" aria-live="polite">
        {statuses.map((s, i) => (
          <FeedLine key={s.id} line={s} live={running && i === statuses.length - 1} />
        ))}
        {running && statuses.length === 0 && <li className="py-1 text-[14px] text-muted">Starting…</li>}
      </ol>
      <p className="num border-t border-rule px-4 py-2 text-[14px] text-muted">{summary}</p>
    </section>
  );
}

function FeedLine({ line, live }: { line: StatusLine; live: boolean }) {
  return (
    <li className="rise flex items-start gap-2 py-1 text-[14px] leading-5">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        {line.domain ? <Favicon domain={line.domain} /> : <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-accent" : "bg-rule-strong"}`} />}
      </span>
      <span className={live ? "text-ink" : "text-muted"}>{line.message}</span>
    </li>
  );
}

export function Favicon({ domain, className = "h-4 w-4" }: { domain: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className={`${className} flex items-center justify-center rounded-sm bg-sunk text-[10px] font-semibold uppercase text-muted`}>{domain[0]}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny third-party favicon; next/image adds nothing here
    <img src={faviconUrl(domain)} alt="" width={16} height={16} className={`${className} rounded-sm`} onError={() => setFailed(true)} loading="lazy" />
  );
}
