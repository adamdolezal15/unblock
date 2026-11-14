// One passive scroll listener for every decorative motion on the page, batched into a single rAF per frame.
// Decoration only: subscribers write styles/attributes, never layout or content.

type Frame = (scrollY: number, viewportH: number) => void;

const subs = new Set<Frame>();
let queued = false;
let attached = false;

function run() {
  queued = false;
  const y = window.scrollY;
  const h = window.innerHeight;
  for (const f of subs) f(y, h);
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(run);
}

/** Motion is on at 640px and wider, and only without prefers-reduced-motion. */
export const MOTION_QUERY = "(min-width: 640px) and (prefers-reduced-motion: no-preference)";

/** Subscribe to scroll frames; returns an unsubscribe. Also fires once on subscribe and on resize. */
export function onScrollFrame(f: Frame): () => void {
  subs.add(f);
  if (!attached) {
    attached = true;
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
  }
  schedule();
  return () => {
    subs.delete(f);
    if (subs.size === 0 && attached) {
      attached = false;
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    }
  };
}

/** Request a frame without scrolling (content changed height). */
export const requestScrollFrame = () => {
  if (attached) schedule();
};
