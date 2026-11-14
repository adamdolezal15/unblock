// Steps as they arrive (upserted by id), with skeletons for the ones still being researched.
// Shown until the dependency graph is ready.
import type { Step, StepStub } from "@/lib/types";
import { ModeIcon, MODE_LABEL } from "./icons";

const EXPECTED = 8;

export function StepsPreview({ steps, stubs, running }: { steps: Step[]; stubs: StepStub[]; running: boolean }) {
  const actionable = steps.filter((s) => !s.milestone);
  const skeletons = running ? Math.max(0, EXPECTED - actionable.length - stubs.length) : 0;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
      {actionable.map((s) => (
        <article key={s.id} className="rise rounded-md border border-rule bg-raised px-4 py-3">
          <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted">{s.authority}</p>
          <h3 className="mt-0.5 text-[15px] font-medium leading-snug text-ink">{s.title}</h3>
          <p className="mt-2 flex items-center gap-1.5 text-[14px] text-muted">
            <ModeIcon mode={s.mode} className="h-4 w-4" />
            {MODE_LABEL[s.mode]}
            <span className="text-rule-strong">·</span>
            <span className="num">{s.claims?.length ?? s.citations.length} quotes</span>
          </p>
        </article>
      ))}
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
