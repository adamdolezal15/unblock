// Non-result states. Each one should look intentional, not like a broken page.
import { IconCheck } from "./icons";

export function EmptyState() {
  const points = [
    ["Tell us your situation", "Citizenship, city, when you arrive, why you are coming. One sentence is enough."],
    ["We read the official sources", "DVV, Vero, Migri, Kela, the Police and your city, plus people who have done it."],
    ["You get the order and the dates", "Which step unblocks which, every visit in your calendar, and a quote behind every claim."],
  ] as const;
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pb-16 pt-10" aria-label="How it works">
      <ol className="grid gap-6 border-t border-rule pt-8 sm:grid-cols-3">
        {points.map(([title, body], i) => (
          <li key={title}>
            <span className="num text-[14px] font-semibold text-accent">0{i + 1}</span>
            <h2 className="mt-1 text-[17px] font-semibold text-ink">{title}</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">{body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-10 flex items-center gap-2 text-[14px] text-muted">
        <IconCheck className="h-4 w-4 text-done" />
        Every quote is checked word for word against the source page. If we cannot find a source, we say so.
      </p>
    </section>
  );
}

export function OutOfScopeState({ message }: { message: string }) {
  return (
    <Notice title="That one is outside what Unblock plans">
      <p>{message}</p>
      <p className="mt-2">Unblock plans the paperwork for moving to Finland: registration, tax card, bank, Kela, permits. Try one of the examples above.</p>
    </Notice>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Notice title="The plan could not be finished">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 rounded-md bg-accent px-4 py-2 text-[15px] font-medium text-white hover:bg-accent-hover">
          Try again
        </button>
      )}
    </Notice>
  );
}

export function PartialNotice({ message, missing }: { message: string; missing: string[] }) {
  return (
    <div role="status" className="rounded-md border border-rule-strong bg-raised px-4 py-3 text-[15px] text-ink">
      <span className="font-semibold">Partial plan. </span>
      {message}
      {missing.length > 0 && <span className="text-muted"> Not finished: {missing.join(", ")}.</span>}
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto mt-10 w-full max-w-2xl px-6">
      <div className="rounded-md border border-rule-strong bg-raised px-6 py-5">
        <h2 className="text-[18px] font-semibold text-ink">{title}</h2>
        <div className="mt-2 text-[15px] leading-relaxed text-muted">{children}</div>
      </div>
    </section>
  );
}
