// Disk cache for every Exa call. EXA_CACHE:
//   write (default) - return cached response if present, otherwise call Exa and store it
//   read            - cache only; a miss throws (offline demo)
//   off             - always call Exa, never read or write
// Files: .cache/exa/<sha256(request)>.json, committed so the demo works offline.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type CacheMode = "read" | "write" | "off";

export type CacheEntry<T> = { fetchedAt: string; request: unknown; response: T };

export type CachedResult<T> = CacheEntry<T> & { hit: boolean; ms: number };

const CACHE_DIR = path.join(process.cwd(), ".cache", "exa");

export function cacheMode(): CacheMode {
  const m = (process.env.EXA_CACHE ?? "write").toLowerCase();
  return m === "read" || m === "off" ? m : "write";
}

/** Stable JSON: sorted keys, so semantically equal requests share a cache file. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function cacheKey(request: unknown): string {
  return createHash("sha256").update(stable(request)).digest("hex").slice(0, 32);
}

/**
 * Run `call` through the cache. `request` must fully describe the call (endpoint + args)
 * and must never contain the API key.
 */
export async function cached<T>(request: unknown, call: () => Promise<T>): Promise<CachedResult<T>> {
  const mode = cacheMode();
  const file = path.join(CACHE_DIR, `${cacheKey(request)}.json`);
  const t0 = Date.now();

  if (mode !== "off") {
    try {
      const entry = JSON.parse(await readFile(file, "utf8")) as CacheEntry<T>;
      return { ...entry, hit: true, ms: Date.now() - t0 };
    } catch {
      if (mode === "read") {
        throw new Error(`EXA_CACHE=read and no cached response for ${stable(request).slice(0, 200)}`);
      }
    }
  }

  const response = await call();
  const entry: CacheEntry<T> = { fetchedAt: new Date().toISOString(), request, response };

  if (mode === "write") {
    try {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, JSON.stringify(entry, null, 2), "utf8");
    } catch (e) {
      // Read-only filesystem (e.g. serverless): serve the live result anyway.
      console.warn(`[exa-cache] could not write ${path.basename(file)}: ${(e as Error).message}`);
    }
  }
  return { ...entry, hit: false, ms: Date.now() - t0 };
}
