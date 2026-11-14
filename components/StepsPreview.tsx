// Steps as they arrive (upserted by id), with skeletons for the ones still being researched.
// Shown until the dependency graph is ready. Ordered by scheduled start date once the schedule exists,
// else by the graph's topological order, else by arrival.
import type { ScheduledStep } from "@/lib/graph/types";
import type { Step, StepStub } from "@/lib/types";
import { fmtWeekday } from "@/lib/ui/format";
import { ModeIcon, MODE_LABEL } from "./icons";

const EXPECTED = 8;

type Props = {
  steps: Step[];
  stubs: StepStub[];
  running: boolean;
  items?: Record<string, ScheduledStep>;
  order?: string[];
};

export function sortSteps(steps: Step[], items?: Record<string, ScheduledStep>, order?: string[]): Step[] {
  const rank = new Map((order ?? []).map((id, i) => [id, i]));
  const arrival = new Map(steps.map((s, i) => [s.id, i]));
  return [...steps].sort((a, b) => {
    const da = items?.[a.id]?.startDate ?? "9999";
    const db = items?.[b.id]?.startDate ?? "9999";
    if (da !== db) return da < db ? -1 : 1;
    const ra = rank.get(a.id) ?? 1e6;
    const rb = rank.get(b.id) ?? 1e6;
    return ra !== rb ? ra - rb : arrival.get(a.id)! - arrival.get(b.id)!;
  });
}

export function StepsPreview({ steps, stubs, running, items, order }: Props) {
  const actionable = sortSteps(
    steps.filter((s) => !s.milestone),
    items,
    order,
  );
  const skeletons = running ? Math.max(0, EXPECTED - actionable.length - stubs.length) : 0;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
      {actionable.map((s) => {
        const at = items?.[s.id];
        return (
          <article key={s.id} className="rise rounded-md border border-rule bg-raised px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted">{s.authority}</p>
              {at ? (
                <p className="num text-[14px] font-medium text-ink" title={at.estimated ? "Date from a default estimate" : undefined}>
                  {fmtWeekday(at.startDate)}
                  {at.estimated ? <span className="text-muted">*</span> : null}
                </p>
              ) : (
                <span className="skeleton h-3.5 w-14 rounded" aria-label="Date pending" />
              )}
            </div>
            <h3 className="mt-0.5 text-[15px] font-medium leading-snug text-ink">{s.title}</h3>
            <p className="mt-2 flex items-center gap-1.5 text-[14px] text-muted">
              <ModeIcon mode={s.mode} className="h-4 w-4" />
              {MODE_LABEL[s.mode]}
              <span className="text-rule-strong">·</span>
              <span className="num">{s.claims?.length ?? s.citations.length} quotes</span>
            </p>
          </article>
        );
      })}
      {stubs.map((s) => (
        <article key={s.id} className="rise rounded-md border border-dashed border-rule-strong px-4 py-3">
          <h3 className="text-[15px] font-medium leading-snug text-ink">{s.label}</h3>
          <p className="mt-1 text-[14px] text-muted">{s.message}</p>
        </article>
      ))}
      {Array.from({ length: skeletons }, (_, i) => (
        <div key={`sk${i}`} className="rounded-md border border-rule px-4 py-3" aria-hidden>
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton mt-2 h-4 w-40 rounded" />
          <div className="skeleton mt-3 h-3 w-24 rounded" />
        </div>
      ))}
    </div>
  );
}
