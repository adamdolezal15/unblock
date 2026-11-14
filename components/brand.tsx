// The thin Finnish-blue stripe along the top of every screen. While planning it fills with progress (0..1).
// The logo itself is components/line/LineMark.tsx (static; the diamond turns while planning).
export function BrandStripe({ progress }: { progress?: number }) {
  if (progress === undefined) return <div className="h-[3px] w-full bg-accent" aria-hidden />;
  return (
    <div className="h-[3px] w-full bg-accent-soft" role="progressbar" aria-label="Planning progress" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.max(2, progress * 100)}%` }} />
    </div>
  );
}
