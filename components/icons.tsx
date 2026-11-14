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
