// Steps as they arrive (upserted by id), shown until the map is ready: a quiet list with hairline rules,
// placeholder rows for steps still being researched. Ordered by scheduled start, then topological order.
import type { ScheduledStep } from "@/lib/graph/types";
import type { Step, StepStub } from "@/lib/types";
import { fmtWeekday } from "@/lib/ui/format";
import { nodeLabel } from "@/lib/ui/labels";
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
  const placeholders = running ? Math.max(0, EXPECTED - actionable.length - stubs.length) : 0;
  return (
    <ol className="max-w-[860px] divide-y divide-rule border-y border-rule">
      {actionable.map((s) => {
        const at = items?.[s.id];
        return (
          <li key={s.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-baseline gap-4 py-3">
            <span className="num text-[15px] text-muted">{at ? `${fmtWeekday(at.startDate)}${at.estimated ? "*" : ""}` : "date pending"}</span>
            <span className="min-w-0 text-[17px] text-ink">
              <span className="font-semibold">{nodeLabel(s.id, s.title)}</span>
              <span className="text-muted">, {s.authority}</span>
            </span>
            <span className="flex items-center gap-2 text-[13px] text-muted">
              <ModeIcon mode={s.mode} className="h-4 w-4" />
              {MODE_LABEL[s.mode]}
            </span>
          </li>
        );
      })}
      {stubs.map((s) => (
        <li key={s.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4 py-3 text-[17px]">
          <span className="text-muted">not found</span>
          <span className="text-muted">
            <span className="font-semibold text-ink">{s.label}</span>: {s.message}
          </span>
        </li>
      ))}
      {Array.from({ length: placeholders }, (_, i) => (
        <li key={`p${i}`} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4 py-4" aria-hidden>
          <span className="skeleton h-3.5 w-16 rounded" />
          <span className="skeleton h-3.5 rounded" style={{ width: `${40 + ((i * 17) % 35)}%` }} />
        </li>
      ))}
    </ol>
  );
}
