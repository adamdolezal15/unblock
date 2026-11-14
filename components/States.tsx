// Non-result states, written as prose in the letter column. Each should look intentional.

export function OutOfScopeState({ message }: { message: string }) {
  return (
    <Note title="That's outside what I can plan">
      <p>{message}</p>
      <p>I plan the paperwork for moving to Finland: registration, tax card, bank, Kela and permits. Use “Edit your situation” to try again.</p>
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
    <section className="mx-auto max-w-[620px] px-6 pt-20 text-center">
      <h1 className="font-serif text-[34px] font-semibold leading-tight text-ink">{title}</h1>
      <div className="mt-4 space-y-4 text-[18px] leading-[1.65] text-ink">{children}</div>
    </section>
  );
}
