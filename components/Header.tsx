export function Header({ onHome }: { onHome?: () => void }) {
  return (
    <header className="flex items-baseline gap-4 border-b border-rule px-6 py-3">
      <button type="button" onClick={onHome} className="text-[22px] font-semibold tracking-tight text-ink" aria-label="Unblock, start over">
        Unblock
      </button>
      <p className="text-[15px] text-muted">Your move to Finland, untangled. Every step sourced.</p>
    </header>
  );
}
