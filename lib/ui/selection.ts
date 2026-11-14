/** What the details drawer shows: a step (or milestone), or the requirement between two steps. */
// focus: "sources" opens the panel scrolled to the step's sources.
export type Selection = { kind: "step"; id: string; focus?: "sources" } | { kind: "edge"; id: string; source: string; target: string } | null;
