import type { Trust } from "../types";

// SPEC.md "Official domains" + "University / semi-official".
export const OFFICIAL = [
  "dvv.fi",
  "vero.fi",
  "migri.fi",
  "enterfinland.fi",
  "kela.fi",
  "poliisi.fi",
  "suomi.fi",
  "infopankki.fi",
  "ihhelsinki.fi",
  "finanssivalvonta.fi",
  "hel.fi",
  "myhelsinki.fi",
] as const;

export const UNIVERSITY = [
  "aalto.fi",
  "helsinki.fi",
  "studies.helsinki.fi",
  "hanken.fi",
  "uniarts.fi",
  "tuni.fi",
] as const;

// Cities whose municipal domain is not simply <slug>.fi.
const CITY_DOMAIN_OVERRIDES: Record<string, string> = {
  helsinki: "hel.fi",
  helsingfors: "hel.fi",
  esbo: "espoo.fi",
  vanda: "vantaa.fi",
  tammerfors: "tampere.fi",
  åbo: "turku.fi",
  abo: "turku.fi",
  uleåborg: "oulu.fi",
};

function slugify(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9-]/g, "");
}

/** Municipal domain for a Finnish city, e.g. "Tampere" -> ["tampere.fi"]. Treated as official. */
export function cityDomains(city: string | undefined): string[] {
  if (!city) return [];
  const key = city.trim().toLowerCase();
  const domain = CITY_DOMAIN_OVERRIDES[key] ?? `${slugify(city)}.fi`;
  return domain === ".fi" ? [] : [domain];
}

/** Official includeDomains for a profile's city: fixed list + municipal domain, deduped. */
export function officialDomains(city?: string): string[] {
  return [...new Set([...OFFICIAL, ...cityDomains(city)])];
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Trust label for a URL. `extraOfficial` = city domains added for this run. */
export function trustOf(url: string, extraOfficial: string[] = []): Trust {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "community";
  }
  // University list first: helsinki.fi (university) must not be swallowed by hel.fi rules,
  // and studies.helsinki.fi is a subdomain of helsinki.fi.
  if (UNIVERSITY.some((d) => hostMatches(host, d))) return "university";
  if ([...OFFICIAL, ...extraOfficial].some((d) => hostMatches(host, d))) return "official";
  return "community";
}
