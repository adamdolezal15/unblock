// Word lists for the deterministic profile parser. Lowercase. Matched on word boundaries;
// entries ending in "*" are stems (match any continuation, e.g. "relocat*" -> relocating).

export const EU_TERMS = [
  "austria", "austrian", "belgium", "belgian", "bulgaria", "bulgarian", "croatia", "croatian",
  "cyprus", "cypriot", "czech", "czechia", "germany", "german", "estonia", "estonian",
  "spain", "spanish", "france", "french", "greece", "greek", "hungary", "hungarian", "ireland", "irish",
  "italy", "italian", "latvia", "latvian", "lithuania", "lithuanian", "luxembourg", "luxembourgish",
  "malta", "maltese", "netherlands", "dutch", "poland", "polish", "portugal", "portuguese",
  "romania", "romanian", "slovakia", "slovak", "slovenia", "slovenian", "slovene",
  "eu citizen", "eu national", "eu passport",
];

/** Nordic citizens (other than Finns) use the Nordic registration path. */
export const NORDIC_TERMS = [
  "sweden", "swedish", "swede", "norway", "norwegian", "denmark", "danish", "dane", "iceland", "icelandic", "icelander",
];

/** EEA / Swiss: registration works like EU, flagged as an assumption. */
export const EEA_TERMS = ["liechtenstein", "switzerland", "swiss"];

export const FINNISH_CITIZEN_TERMS = ["finnish citizen", "finnish passport", "i am finnish", "i'm finnish"];

export const NON_EU_TERMS = [
  "brazil", "brazilian", "india", "indian", "ukraine", "ukrainian", "russia", "russian", "china", "chinese",
  "united states", "usa", "american", "canada", "canadian", "mexico", "mexican", "british", "united kingdom",
  "scottish", "turkey", "turkish", "iran", "iranian", "pakistan", "pakistani", "bangladesh", "bangladeshi",
  "nepal", "nepali", "nepalese", "vietnam", "vietnamese", "philippines", "filipino", "nigeria", "nigerian",
  "kenya", "kenyan", "egypt", "egyptian", "japan", "japanese", "korea", "korean", "australia", "australian",
  "new zealand", "south africa", "south african", "argentina", "argentinian", "colombia", "colombian",
  "indonesia", "indonesian", "thailand", "thai", "sri lanka", "sri lankan", "syria", "syrian", "iraq", "iraqi",
  "afghanistan", "afghan", "somalia", "somali", "ethiopia", "ethiopian", "ghana", "ghanaian", "serbia", "serbian",
  "belarus", "belarusian", "georgian", "armenia", "armenian", "moldova", "moldovan", "albania", "albanian",
  "non-eu", "third-country",
];

/** Finnish municipalities a newcomer is likely to name. Swedish names map to the Finnish name. */
export const FINNISH_CITIES: Record<string, string> = {
  helsinki: "Helsinki", helsingfors: "Helsinki",
  espoo: "Espoo", esbo: "Espoo",
  vantaa: "Vantaa", vanda: "Vantaa",
  kauniainen: "Kauniainen", grankulla: "Kauniainen",
  tampere: "Tampere", tammerfors: "Tampere",
  turku: "Turku", "åbo": "Turku",
  oulu: "Oulu", "uleåborg": "Oulu",
  "jyväskylä": "Jyväskylä", jyvaskyla: "Jyväskylä",
  lahti: "Lahti", lahtis: "Lahti",
  kuopio: "Kuopio",
  pori: "Pori", "björneborg": "Pori",
  joensuu: "Joensuu",
  lappeenranta: "Lappeenranta", villmanstrand: "Lappeenranta",
  "hämeenlinna": "Hämeenlinna", hameenlinna: "Hämeenlinna", tavastehus: "Hämeenlinna",
  vaasa: "Vaasa", vasa: "Vaasa",
  rovaniemi: "Rovaniemi",
  "seinäjoki": "Seinäjoki", seinajoki: "Seinäjoki",
  kotka: "Kotka",
  mikkeli: "Mikkeli",
  kajaani: "Kajaani",
  porvoo: "Porvoo", "borgå": "Porvoo",
  kerava: "Kerava",
  "järvenpää": "Järvenpää", jarvenpaa: "Järvenpää",
  lohja: "Lohja",
  kokkola: "Kokkola",
  rauma: "Rauma",
  mariehamn: "Mariehamn", maarianhamina: "Mariehamn",
};

/** Universities -> city, used only when no city is named. */
export const UNIVERSITY_CITY: Record<string, string> = {
  aalto: "Espoo",
  "university of helsinki": "Helsinki",
  hanken: "Helsinki",
  uniarts: "Helsinki",
  "tampere university": "Tampere",
  "university of turku": "Turku",
  "åbo akademi": "Turku",
  "university of oulu": "Oulu",
  "university of jyväskylä": "Jyväskylä",
};

export const FINLAND_TERMS = ["finland", "finnish", "suomi"];

export const MOVE_TERMS = [
  "moving", "move", "relocat*", "arriv*", "coming to", "starting", "settl*", "immigrat*",
  "register*", "bank account", "residence permit", "live in", "living in",
];

export const PURPOSE_TERMS = {
  work: [
    "job", "work", "working", "employ*", "salary", "hired", "position", "contract",
    "engineer", "developer", "nurse", "doctor", "researcher", "postdoc",
  ],
  study: [
    "student", "study", "studies", "studying", "master's", "masters", "master", "bachelor's", "bachelor",
    "phd", "doctoral", "degree", "exchange", "semester",
  ],
  family: [
    "wife", "husband", "spouse", "partner", "child", "children", "kids", "son", "daughter", "family", "baby",
  ],
} as const;

export const TEMPORARY_PROTECTION_TERMS = ["temporary protection", "fleeing the war"];

export const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};
