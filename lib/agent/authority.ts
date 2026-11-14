// Display name of the organisation behind a source URL. A label, not a claim about the step.
const AUTHORITY_BY_DOMAIN: Record<string, string> = {
  "dvv.fi": "DVV",
  "vero.fi": "Vero (Tax Administration)",
  "migri.fi": "Migri",
  "enterfinland.fi": "Migri (Enter Finland)",
  "kela.fi": "Kela",
  "poliisi.fi": "Police",
  "suomi.fi": "Suomi.fi",
  "infopankki.fi": "InfoFinland",
  "ihhelsinki.fi": "International House Helsinki",
  "finanssivalvonta.fi": "FIN-FSA",
  "hel.fi": "City of Helsinki",
  "myhelsinki.fi": "MyHelsinki",
  "aalto.fi": "Aalto University",
  "helsinki.fi": "University of Helsinki",
  "hanken.fi": "Hanken",
  "uniarts.fi": "Uniarts Helsinki",
  "tuni.fi": "Tampere University",
  "op.fi": "OP",
  "nordea.fi": "Nordea",
  "s-pankki.fi": "S-Bank",
  "danskebank.fi": "Danske Bank",
  "spankki.fi": "Säästöpankki",
  "poppankki.fi": "POP Bank",
  "aktia.fi": "Aktia",
};

export function authorityOf(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown";
  }
  for (const [domain, name] of Object.entries(AUTHORITY_BY_DOMAIN)) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return host;
}
