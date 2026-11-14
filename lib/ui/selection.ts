/** What the details drawer shows: a step (or milestone), or the requirement between two steps. */
export type Selection = { kind: "step"; id: string } | { kind: "edge"; id: string; source: string; target: string } | null;
