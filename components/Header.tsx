export const PROMISE = "Your move to Finland, untangled. Every step sourced.";

/** Slim bar above results. The landing page shows the name large instead (see Landing in App). */
export function Header({ onHome }: { onHome?: () => void }) {
  return (
    <header className="flex items-baseline gap-4 px-8 pb-2 pt-5">
      <button type="button" onClick={onHome} className="font-serif text-[24px] font-semibold text-ink hover:text-accent" aria-label="Unblock, start over">
        Unblock
      </button>
      <p className="text-[15px] text-muted">{PROMISE}</p>
    </header>
  );
}
