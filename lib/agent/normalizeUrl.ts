// URL identity for citations: host without www, path without trailing slash, query kept. Pure (client-safe).
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}
