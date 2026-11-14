import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cachedCall, resetUsedCacheEntries, sha, usedCacheEntries } from "./disk";

describe("cachedCall with a demo-cache fallback", () => {
  it("reads the fallback on a primary miss (also in read mode), never calls, and records what it used", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "unblock-cache-"));
    const dir = path.join(root, "cache");
    const fallbackDir = path.join(root, "demo");
    await mkdir(fallbackDir, { recursive: true });
    const request = { endpoint: "search", q: "dvv" };
    await writeFile(
      path.join(fallbackDir, `${sha(request)}.json`),
      JSON.stringify({ fetchedAt: "2026-11-14T00:00:00Z", request, response: { from: "demo" } }),
    );

    resetUsedCacheEntries();
    const r = await cachedCall<{ from: string }>({ dir, mode: "read", label: "EXA_CACHE", fallbackDir }, request, () => {
      throw new Error("must not call");
    });
    expect(r).toMatchObject({ hit: true, response: { from: "demo" } });
    expect(usedCacheEntries().map((e) => [e.label, e.name])).toEqual([["EXA_CACHE", `${sha(request)}.json`]]);

    // a miss everywhere in write mode calls, writes to the primary dir, and is recorded too
    const other = { endpoint: "search", q: "kela" };
    const w = await cachedCall({ dir, mode: "write", label: "LLM_CACHE", fallbackDir }, other, async () => ({ from: "live" }));
    expect(w.hit).toBe(false);
    expect(await readdir(dir)).toEqual([`${sha(other)}.json`]);
    expect(usedCacheEntries()).toHaveLength(2);

    await expect(
      cachedCall({ dir, mode: "read", label: "LLM_CACHE", fallbackDir }, { q: "missing" }, async () => 1),
    ).rejects.toThrow(/LLM_CACHE=read and no cached response/);
  });
});
