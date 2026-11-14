// Generic JSON disk cache shared by the Exa layer (EXA_CACHE) and lib/llm (LLM_CACHE).
// Modes:
//   write (default) - return cached response if present, otherwise call and store it
//   read            - cache only; a miss throws (offline demo)
//   off             - always call, never read or write
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type CacheMode = "read" | "write" | "off";

export type CacheEntry<T> = { fetchedAt: string; request: unknown; response: T };

export type CachedResult<T> = CacheEntry<T> & { hit: boolean; ms: number };

export function modeFromEnv(envVar: string): CacheMode {
  const m = (process.env[envVar] ?? "write").toLowerCase();
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
  opts: { dir: string; mode: CacheMode; label: string },
  request: unknown,
  call: () => Promise<T>,
): Promise<CachedResult<T>> {
  const file = path.join(opts.dir, `${sha(request)}.json`);
  const t0 = Date.now();

  if (opts.mode !== "off") {
    try {
      const entry = JSON.parse(await readFile(file, "utf8")) as CacheEntry<T>;
      return { ...entry, hit: true, ms: Date.now() - t0 };
    } catch {
      if (opts.mode === "read") {
        throw new Error(`${opts.label}=read and no cached response for ${stable(request).slice(0, 200)}`);
      }
    }
  }

  const response = await call();
  const entry: CacheEntry<T> = { fetchedAt: new Date().toISOString(), request, response };

  if (opts.mode === "write") {
    try {
      await mkdir(opts.dir, { recursive: true });
      await writeFile(file, JSON.stringify(entry, null, 2), "utf8");
    } catch (e) {
      // Read-only filesystem (e.g. serverless): serve the live result anyway.
      console.warn(`[${opts.label.toLowerCase()}] could not write ${path.basename(file)}: ${(e as Error).message}`);
    }
  }
  return { ...entry, hit: false, ms: Date.now() - t0 };
}
