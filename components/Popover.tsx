"use client";
// Opaque overlay anchored to the element that opened it (position fixed, portalled to <body>, so no
// container clips it). Closes on Escape, a click outside, scroll and resize.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type Anchor = { top: number; bottom: number; left: number; right: number };

export function anchorOf(el: Element): Anchor {
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}

type Props = { anchor: Anchor; onClose: () => void; width?: number; label: string; children: React.ReactNode };

export function Popover({ anchor, onClose, width = 440, label, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const onMove = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [onClose]);

  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 720 : window.innerHeight;
  const w = Math.min(width, vw - 24);
  const left = Math.max(12, Math.min(anchor.left - 16, vw - w - 12));
  const below = vh - anchor.bottom > 280 || anchor.top < 280;
  const style: React.CSSProperties = below
    ? { position: "fixed", left, top: anchor.bottom + 8, width: w, maxHeight: vh - anchor.bottom - 20 }
    : { position: "fixed", left, bottom: vh - anchor.top + 8, width: w, maxHeight: anchor.top - 20 };

  return createPortal(
    <div ref={ref} role="dialog" aria-label={label} tabIndex={-1} style={style} className="overlay overflow-y-auto p-4 text-left focus:outline-none">
      {children}
    </div>,
    document.body,
  );
}
