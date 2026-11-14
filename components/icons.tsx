// Small line icons (inline SVG, currentColor). No icon library.
type P = { className?: string; title?: string };

function Svg({ className = "h-4 w-4", title, children }: P & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Online: a screen. */
export const IconOnline = (p: P) => (
  <Svg {...p}>
    <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1" />
    <path d="M5.5 13.75h5M8 11.25v2.5" />
  </Svg>
);

/** In person: a building with a door. */
export const IconInPerson = (p: P) => (
  <Svg {...p}>
    <path d="M2.25 14.25h11.5M3.25 14.25V6.5L8 2.75l4.75 3.75v7.75" />
    <path d="M6.5 14.25v-3.5h3v3.5" />
  </Svg>
);

/** Either online or in person. */
export const IconEither = (p: P) => (
  <Svg {...p}>
    <rect x="1.75" y="3.25" width="7" height="5" rx="0.75" />
    <path d="M4 10.5h2.5M9.75 13.75h4.5M10.5 13.75V9.5L12 8.25l1.5 1.25v4.25" />
  </Svg>
);

export const IconExternal = (p: P) => (
  <Svg {...p}>
    <path d="M9.25 2.75h4v4M13.25 2.75 7.5 8.5M11.75 9.5v3.25a.75.75 0 0 1-.75.75H3.25a.75.75 0 0 1-.75-.75V5a.75.75 0 0 1 .75-.75H6.5" />
  </Svg>
);

/** An official form: a page with a folded corner and lines. */
export const IconDocument = (p: P) => (
  <Svg {...p}>
    <path d="M9.25 1.75H4a.75.75 0 0 0-.75.75v11a.75.75 0 0 0 .75.75h8a.75.75 0 0 0 .75-.75V5.25z" />
    <path d="M9.25 1.75v3.5h3.5M5.75 8.25h4.5M5.75 10.75h4.5" />
  </Svg>
);

export const IconPencil = (p: P) => (
  <Svg {...p}>
    <path d="m10.5 2.75 2.75 2.75L6 12.75l-3.25.5.5-3.25z" />
  </Svg>
);

export const IconChevron = ({ open, ...p }: P & { open?: boolean }) => (
  <Svg {...p}>
    <path d={open ? "m4 6 4 4 4-4" : "m6 4 4 4-4 4"} />
  </Svg>
);

export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1" />
    <path d="M2.25 6.5h11.5M5.5 1.75v3M10.5 1.75v3" />
  </Svg>
);

export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M8 2.25v8M4.75 7.25 8 10.5l3.25-3.25M2.75 13.25h10.5" />
  </Svg>
);

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="m3.75 3.75 8.5 8.5M12.25 3.75l-8.5 8.5" />
  </Svg>
);

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m3 8.5 3.25 3.25L13 4.75" />
  </Svg>
);

export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M4 11.25V7a4 4 0 0 1 8 0v4.25l1.25 1.25H2.75zM6.5 14h3" />
  </Svg>
);

export function ModeIcon({ mode, className }: { mode: "online" | "in_person" | "either"; className?: string }) {
  if (mode === "online") return <IconOnline className={className} title="Online" />;
  if (mode === "in_person") return <IconInPerson className={className} title="In person" />;
  return <IconEither className={className} title="Online or in person" />;
}

export const MODE_LABEL = { online: "Online", in_person: "In person", either: "Online or in person" } as const;

/** Speech bubble: what people who did it say. */
export const IconSpeech = (p: P) => (
  <Svg {...p}>
    <path d="M2.75 4.25a1.5 1.5 0 0 1 1.5-1.5h7.5a1.5 1.5 0 0 1 1.5 1.5v4.5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5v-2.5h0a1.25 1.25 0 0 1-1.25-1.25z" />
  </Svg>
);

/** Clock: no fixed date. */
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 4.75V8l2.25 1.5" />
  </Svg>
);

/** Bank: a building with columns. */
export const IconBank = (p: P) => (
  <Svg {...p}>
    <path d="M2 6 8 2.75 14 6M3 13.25h10M4 6.75v5M6.67 6.75v5M9.33 6.75v5M12 6.75v5" />
  </Svg>
);

/** Graduation cap: university. */
export const IconCap = (p: P) => (
  <Svg {...p}>
    <path d="M1.75 6.25 8 3.25l6.25 3L8 9.25z" />
    <path d="M4.5 7.75v3c1 .9 2.2 1.5 3.5 1.5s2.5-.6 3.5-1.5v-3M14.25 6.25v3.5" />
  </Svg>
);

/** Shield: insurance, social security. */
export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M8 1.75 13 3.5v4c0 3.1-2.1 5.4-5 6.75C5.1 12.9 3 10.6 3 7.5v-4z" />
  </Svg>
);

/** Envelope: an email. */
export const IconEnvelope = (p: P) => (
  <Svg {...p}>
    <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.25" />
    <path d="m2.25 4 5.75 4.5L13.75 4" />
  </Svg>
);
