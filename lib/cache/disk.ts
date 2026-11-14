// Generic JSON disk cache shared by the Exa layer (EXA_CACHE) and lib/llm (LLM_CACHE).
// Modes:
//   write (default) - return cached response if present, otherwise call and store it
//   read            - cache only; a miss throws (offline demo)
//   off             - always call, never read or write
// A miss in `dir` falls back to `fallbackDir` (the git-tracked demo-cache/) before calling or failing.
// On Vercel (env VERCEL): the filesystem is read-only, so nothing is ever written and only `fallbackDir`
// (demo-cache/) is read. With the env var unset the mode there is "read" for a demo sentence (never a live
// call), "off" for a live run, and outside a run (e.g. /api/drafts) demo-cache first, then live.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runContext } from "../events/context";

export type CacheMode = "read" | "write" | "off";

export type CacheEntry<T> = { fetchedAt: string; request: unknown; response: T };

export type CachedResult<T> = CacheEntry<T> & { hit: boolean; ms: number };

/** Every cache file read or written in this process, so a demo run can export exactly what it used. */
const used = new Map<string, { label: string; file: string; name: string }>();
export function usedCacheEntries(): { label: string; file: string; name: string }[] {
  return [...used.values()];
}
export function resetUsedCacheEntries(): void {
  used.clear();
}
function markUsed(label: string, file: string) {
  used.set(file, { label, file, name: path.basename(file) });
}

/** Deployed on Vercel: read-only filesystem, demo-cache/ only. */
export const onVercel = (): boolean => !!process.env.VERCEL;

export function modeFromEnv(envVar: string): CacheMode {
  const set = process.env[envVar]?.trim();
  if (onVercel() && !set) {
    const ctx = runContext();
    return !ctx ? "write" : ctx.demo ? "read" : "off";
  }
  const m = (set || "write").toLowerCase();
  return m === "read" || m === "off" ? m : "write";
}

/** Stable JSON: sorted keys, so semantically equal requests share a cache file. */
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha(value: unknown, length = 32): string {
  return createHash("sha256").update(typeof value === "string" ? value : stable(value)).digest("hex").slice(0, length);
}

/**
 * Run `call` through a cache in `dir`. `request` must fully describe the call and must never
 * contain an API key. `label` names the cache in error messages.
 */
export async function cachedCall<T>(
  opts: { dir: string; mode: CacheMode; label: string; fallbackDir?: string },
  request: unknown,
  call: () => Promise<T>,
): Promise<CachedResult<T>> {
  const name = `${sha(request)}.json`;
  const file = path.join(opts.dir, name);
  const t0 = Date.now();
  const vercel = onVercel();

  if (opts.mode !== "off") {
    for (const candidate of [...(vercel ? [] : [file]), ...(opts.fallbackDir ? [path.join(opts.fallbackDir, name)] : [])]) {
      try {
        const entry = JSON.parse(await readFile(candidate, "utf8")) as CacheEntry<T>;
        markUsed(opts.label, candidate);
        return { ...entry, hit: true, ms: Date.now() - t0 };
      } catch {
        // try the next location
      }
    }
    if (opts.mode === "read") {
      throw new Error(`${opts.label}=read and no cached response for ${stable(request).slice(0, 200)}`);
    }
  }

  const response = await call();
  const entry: CacheEntry<T> = { fetchedAt: new Date().toISOString(), request, response };

  if (opts.mode === "write" && !vercel) {
    try {
      await mkdir(opts.dir, { recursive: true });
      await writeFile(file, JSON.stringify(entry, null, 2), "utf8");
      markUsed(opts.label, file);
    } catch (e) {
      // Read-only filesystem (e.g. serverless): serve the live result anyway.
      console.warn(`[${opts.label.toLowerCase()}] could not write ${path.basename(file)}: ${(e as Error).message}`);
    }
  }
  return { ...entry, hit: false, ms: Date.now() - t0 };
}
