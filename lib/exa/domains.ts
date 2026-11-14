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

// Banks and service providers stating their own rules.
export const PROVIDER = [
  "op.fi",
  "nordea.fi",
  "s-pankki.fi",
  "danskebank.fi",
  "spankki.fi",
  "poppankki.fi",
  "aktia.fi",
] as const;

export const NEWS = ["yle.fi", "hs.fi", "helsinkitimes.fi"] as const;

/** Conflict ranking: higher number = more trusted. official > provider > university > news > community. */
export const TRUST_RANK: Record<Trust, number> = {
  official: 4,
  provider: 3,
  university: 2,
  news: 1,
  community: 0,
};

// Whitelist: the ~20 largest Finnish municipalities and their real municipal domains (Finnish and
// Swedish names). A city not on the list gets no city domain, so nothing of it is labelled official.
// Never guess "<city>.fi": oulu.fi is the university, not the City of Oulu (ouka.fi).
export const CITY_DOMAINS: Readonly<Record<string, string>> = {
  helsinki: "hel.fi",
  helsingfors: "hel.fi",
  espoo: "espoo.fi",
  esbo: "espoo.fi",
  tampere: "tampere.fi",
  tammerfors: "tampere.fi",
  vantaa: "vantaa.fi",
  vanda: "vantaa.fi",
  oulu: "ouka.fi",
  uleaborg: "ouka.fi",
  turku: "turku.fi",
  abo: "turku.fi",
  jyvaskyla: "jyvaskyla.fi",
  kuopio: "kuopio.fi",
  lahti: "lahti.fi",
  lahtis: "lahti.fi",
  pori: "pori.fi",
  bjorneborg: "pori.fi",
  kouvola: "kouvola.fi",
  joensuu: "joensuu.fi",
  lappeenranta: "lappeenranta.fi",
  villmanstrand: "lappeenranta.fi",
  hameenlinna: "hameenlinna.fi",
  tavastehus: "hameenlinna.fi",
  vaasa: "vaasa.fi",
  vasa: "vaasa.fi",
  seinajoki: "seinajoki.fi",
  rovaniemi: "rovaniemi.fi",
  mikkeli: "mikkeli.fi",
  kotka: "kotka.fi",
  salo: "salo.fi",
  porvoo: "porvoo.fi",
  borga: "porvoo.fi",
  kokkola: "kokkola.fi",
  karleby: "kokkola.fi",
  hyvinkaa: "hyvinkaa.fi",
  lohja: "lohja.fi",
  lojo: "lohja.fi",
};

function slugify(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[äå]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]/g, "");
}

/** Municipal domain for a known Finnish city, e.g. "Tampere" -> ["tampere.fi"]. Treated as official. Unknown city -> []. */
export function cityDomains(city: string | undefined): string[] {
  if (!city) return [];
  const domain = CITY_DOMAINS[slugify(city)];
  return domain ? [domain] : [];
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
  if (PROVIDER.some((d) => hostMatches(host, d))) return "provider";
  if (NEWS.some((d) => hostMatches(host, d))) return "news";
  return "community";
}
