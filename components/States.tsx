// Non-result states, written as prose in the letter column. Each should look intentional.

export function LandingNote() {
  return (
    <div className="mt-10 max-w-[620px] space-y-3 text-[17px] leading-[1.65] text-muted">
      <p>Tell me where you&apos;re moving and why. I&apos;ll work out which office comes first, what each one needs from you, and when you can be done.</p>
      <p>Every claim links to the sentence on the page it came from. If I can&apos;t find a source, I&apos;ll say so.</p>
    </div>
  );
}

export function OutOfScopeState({ message }: { message: string }) {
  return (
    <Note title="That's outside what I can plan">
      <p>{message}</p>
      <p>I plan the paperwork for moving to Finland: registration, tax card, bank, Kela and permits. Try one of the examples above.</p>
    </Note>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Note title="I couldn't finish your plan">
      <p>{message}</p>
      {onRetry && (
        <p>
          <button type="button" onClick={onRetry} className="rounded-[5px] bg-accent px-5 py-2 text-[16px] font-semibold text-white hover:bg-accent-hover">
            Try again
          </button>
        </p>
      )}
    </Note>
  );
}

export function PartialNotice({ missing }: { message: string; missing: string[] }) {
  return (
    <p className="border-l-2 border-rule-strong pl-4 text-[17px] leading-[1.65] text-ink" role="status">
      I ran out of time before I finished {missing.length ? missing.join(", ") : "everything"}. What is here is checked; it just isn&apos;t complete.
    </p>
  );
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="max-w-[680px] px-8 pt-10">
      <h1 className="font-serif text-[34px] font-semibold leading-tight text-ink">{title}</h1>
      <div className="mt-4 space-y-4 text-[18px] leading-[1.65] text-ink">{children}</div>
    </section>
  );
}
