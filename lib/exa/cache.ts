// Disk cache for every Exa call. EXA_CACHE=read|write|off (default write); see lib/cache/disk.ts.
// Files: .cache/exa/<sha256(request)>.json (not in git). Misses fall back to demo-cache/exa (in git).
import path from "node:path";
import { cachedCall, modeFromEnv, sha, type CachedResult, type CacheMode } from "../cache/disk";

export type { CacheMode, CachedResult } from "../cache/disk";

const CACHE_DIR = path.join(process.cwd(), ".cache", "exa");
/** Git-tracked entries for the demo sentences (npm run warm-demo). */
export const DEMO_CACHE_DIR = path.join(process.cwd(), "demo-cache", "exa");

export function cacheMode(): CacheMode {
  return modeFromEnv("EXA_CACHE");
}

export function cacheKey(request: unknown): string {
  return sha(request);
}

export async function cached<T>(request: unknown, call: () => Promise<T>): Promise<CachedResult<T>> {
  return cachedCall({ dir: CACHE_DIR, mode: cacheMode(), label: "EXA_CACHE", fallbackDir: DEMO_CACHE_DIR }, request, call);
}
