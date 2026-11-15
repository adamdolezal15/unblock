"use client";
import type { JourneyStop, JourneyWait } from "@/lib/ui/journey";
import { fmtDay, fmtDow } from "@/lib/ui/format";

type Props = { stops: JourneyStop[]; waits: JourneyWait[]; selected: number; onSelect: (i: number) => void };

/** The line runs between two 30px insets, so the first and last dots sit fully inside the card. */
const INSET = 30;
const at = (pos: number) => `calc(${INSET}px + (100% - ${INSET * 2}px) * ${pos})`;
const ariaOf = (s: JourneyStop) => `${s.finish ? "" : `${fmtDow(s.date)} `}${fmtDay(s.date)}, ${s.label}`;

/**
 * "Your route": one stop per visit day and the finish, placed by date. A stop is a button (aria-pressed);
 * choosing one fills the line up to it and shows that day's tickets below. Wide screens: the horizontal line
 * from the reference. Narrow screens: the same stops as a vertical list (the labels would not fit side by side).
 */
export function Route({ stops, waits, selected, onSelect }: Props) {
  if (!stops.length) return null;
  const fill = stops[selected]?.pos ?? 0;
  return (
    <section aria-label="Your route" className="mt-10 rounded-[28px] border border-j-hairline bg-white px-5 pb-6 pt-6 sm:mt-14 sm:px-12 sm:pb-8 sm:pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="font-sans text-[15px] font-semibold tracking-[2px] text-j-muted">YOUR ROUTE</h2>
        <p className="text-[14px] text-j-muted">Tap a stop to see what to do there</p>
      </div>

      {/* Wide: the horizontal line. */}
      <div className="relative mt-[34px] hidden h-[150px] md:block">
        <div aria-hidden className="absolute top-[30px] h-[6px] rounded-[3px] bg-j-hairline" style={{ left: INSET, right: INSET }} />
        <div
          aria-hidden
          className="absolute top-[30px] h-[6px] rounded-[3px] bg-j-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ left: INSET, width: `calc((100% - ${INSET * 2}px) * ${fill})` }}
        />
        {waits.map((w) => (
          <span
            key={w.from}
            className="num absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-j-chip px-2.5 py-[2px] text-[13px] text-j-muted"
            style={{ left: at(w.at) }}
          >
            {w.text}
          </span>
        ))}
        {stops.map((s, i) => {
          const first = i === 0;
          const last = i === stops.length - 1;
          const align = first ? "items-start text-left" : last ? "items-end text-right" : "items-center text-center";
          // The button's anchor (the dot's centre) is at the stop's position; the ends align to the card's edges.
          const shift = first ? `translateX(-${INSET / 2}px)` : last ? `translateX(calc(-100% + ${INSET / 2}px))` : "translateX(-50%)";
          return (
            <button
              key={s.date}
              type="button"
              onClick={() => onSelect(i)}
              aria-pressed={i === selected}
              aria-label={ariaOf(s)}
              className={`group absolute top-0 flex w-[150px] flex-col rounded-[12px] pt-[18px] ${align}`}
              style={{ left: at(s.pos), transform: shift }}
            >
              <span className="flex h-[30px] w-[30px] items-center justify-center">
                <Dot reached={i <= selected} current={i === selected} finish={s.finish} />
              </span>
              <StopText s={s} reached={i <= selected} />
            </button>
          );
        })}
      </div>

      {/* Narrow: the same stops, top to bottom. */}
      <ol className="mt-5 md:hidden">
        {stops.map((s, i) => {
          const wait = waits.find((w) => w.from === i);
          const last = i === stops.length - 1;
          return (
            <li key={s.date} className="relative">
              {!last && (
                <span
                  aria-hidden
                  className={`absolute bottom-0 left-[14px] top-[30px] w-[4px] -translate-x-1/2 rounded-full ${i < selected ? "bg-j-primary" : "bg-j-hairline"}`}
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-pressed={i === selected}
                aria-label={ariaOf(s)}
                className="relative flex w-full items-center gap-4 rounded-[12px] py-1.5 text-left"
              >
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center">
                  <Dot reached={i <= selected} current={i === selected} finish={s.finish} />
                </span>
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                  <StopText s={s} reached={i <= selected} inline />
                </span>
              </button>
              {!last && (
                <div className="flex min-h-[18px] items-center pl-[46px]">
                  {wait && <span className="num my-1 rounded-full bg-j-chip px-2.5 py-[2px] text-[13px] text-j-muted">{wait.text}</span>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Dot({ reached, current, finish }: { reached: boolean; current: boolean; finish: boolean }) {
  const size = current ? "h-[30px] w-[30px]" : "h-[22px] w-[22px] group-hover:scale-110";
  const fill = reached ? (finish ? "bg-j-done" : "bg-j-primary") : "border-[3px] border-[var(--j-unreached)] bg-white";
  const ring = current ? (finish ? "shadow-[0_0_0_8px_rgba(15,107,87,0.2)]" : "shadow-[0_0_0_8px_rgba(19,137,111,0.18)]") : "";
  return <span aria-hidden className={`block rounded-full transition-transform motion-reduce:transition-none ${size} ${fill} ${ring}`} />;
}

function StopText({ s, reached, inline = false }: { s: JourneyStop; reached: boolean; inline?: boolean }) {
  const color = reached ? (s.finish ? "text-j-done" : "text-j-primary") : "text-[#9AABA4]";
  return (
    <>
      <span className={`num block font-j-serif font-bold leading-tight ${color} ${inline ? "text-[22px]" : "mt-4 text-[26px]"}`}>{fmtDay(s.date)}</span>
      <span className="block text-[14px] text-j-muted">{s.label}</span>
    </>
  );
}
