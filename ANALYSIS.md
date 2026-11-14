# Analýza projektu Unblock (verze `a0cae0e`, druhé kolo)

Hackathon, málo času: jen věci, které mohou rozbít demo, verdikt poroty nebo rozpočet.
Testy: 403 z 404 prochází. Padá `tests/golden/vietnam.test.ts` (krok 3, identifikace na policii: čeká `mode: in_person`, dostane `undefined`). Na `master` je to tedy červené před demem.

## Co se od první analýzy opravilo (ověřeno v kódu)

- Negace a omezení (`not`, `no`, `only`, `ei`…) musí ve fuzzy shodě sedět přesně (`verifyCitations.ts`, `CRITICAL_TOKENS`).
- Stažené stránky jdou do promptu jako `<untrusted_page>`, značky se neutralizují, system prompt říká „data, ne instrukce“ (`anthropicProvider.ts`).
- Města: whitelist ~20 obcí, neznámé město nedostane žádnou oficiální doménu. `oulu.fi` už není City of Oulu (`domains.ts`).
- Demo replay se dá vypnout `DEMO_REPLAY=off` a UI řekne „Replaying a saved run“.
- Nové: filtr podle třídy občanství u dokumentů, kontrola tvaru adresy/hodin/doby, invariantní eval nad 12 profily, Exa Monitors s podepsaným webhookem.

## 1. Soulad se zadáním: The Internet Butler (Exa), id 298

Zadání je výzva **The Internet Butler / Your Personal Assistant** od Exa (tým ji má mezi oblíbenými). Na platformě existuje jen prázdný koncept „Butler Joe“ (projekt 2196, výzva 298, bez odkazů). Unblock tam zatím není. Odevzdání: do 2026-11-15 08:00 UTC.

Hodnocení po 20 % (srovnáno s kódem):

| Kritérium | Stav | Poznámka |
|---|---|---|
| Use of Exa | Silné | Živé stránky úřadů (`includeDomains`), highlights i plný text, monitory. Informace v tréninku modelu být nemusí (aktuální pravidla a lhůty). Nevyužito: Websets, `deep` režim, historie verzí stránek (hodilo by se k „co se změnilo“). |
| Usefulness | Dobré, ale slabší u „hotovo za uživatele“ | Konkrétní skupina (lidé stěhující se do Finska). Zadání chce agenta, který úkol dotáhne co nejblíž k hotovému a nechá uživateli jen schválení. Unblock dnes dělá **plán + kalendář + sada na návštěvu**, ale nic nepřipraví k odeslání (koncept žádosti, e-mailu, předvyplněný seznam dokladů, odkaz na rezervaci s termínem). |
| Clarity of sources | Nejsilnější stránka | Poznámky pod čarou, ověřené citáty, štítky důvěry, odkaz na větu na stránce. |
| Originality | Dobré | Graf závislostí, „zkratka“ oproti obvyklému pořadí, rozpory mezi zdroji. |
| Working implementation | **Největší riziko** | Porota zkouší vlastní dotazy naživo. Studený běh stojí $0,55 až 0,80 a každý účastník má jen $50 kreditů Exa (asi 60 až 90 běhů celkem). `/api/run` nemá rate limit. Běh má strop 75 s. Neznámé město a dotazy mimo Finsko skončí hláškou. Na masteru padá vietnam test. |

**Co udělat:**
1. Přejmenovat koncept „Butler Joe“ na Unblock a vyplnit repo a demo (nebo založit nový projekt k výzvě 298).
2. Do příběhu a UI dostat „butler“ prvek: u každé návštěvy tlačítko „připravit koncept“ (e-mail na úřad, seznam dokladů k vytištění), které ukáže, že agent úkol dotáhl, a schválení nechá na uživateli.
3. Chránit živé dotazy porotců (rate limit, denní strop, ukázka z cache jako záloha).
4. Doplnit do `CLAUDE.md` správný název výzvy.

## 2. Rizika pro demo a rozpočet

- **`/api/run` pořád nemá rate limit ani autentizaci.** Podle `SPEC` stojí studený běh $0,55 až 0,80. Veřejná URL na demu = někdo (nebo bot) vypálí kredity Exa a Anthropicu. Rychlé řešení: limit na IP (v paměti stačí) a denní strop počtu živých běhů.
- **Monitory jsou nový nechráněný zdroj nákladů.** `POST /api/monitors` pro libovolné platné `runId` vytvoří až 7 týdenních monitorů na Exa a `POST /api/monitors/check` je spouští. Smazání (`deletePlanMonitors`) se volá jen při selhání vytvoření, jinak monitory běží navždy. Stačí: tlačítko jen pro demo běhy nebo strop počtu aktivních monitorů a TTL.
- **Stav je v souborech na disku a v paměti jednoho procesu** (`.cache/runs`, `.cache/monitors`, fronta `withStore`). Na serverless hostingu (Vercel) `.ics` a monitory po dalším požadavku mohou vrátit 404. Pro demo z notebooku je to v pořádku, jen na Vercel nasazovat nejdřív s vyzkoušením.
- **Monitory potřebují veřejnou webhook URL** (`MONITOR_WEBHOOK_URL`). Bez ní vrací 409. Na pódiu ověřit tunel předem nebo mít připravený plán bez monitorů.
- Cache bez TTL zůstává (zastaralá pravidla úřadů se podávají jako ověřená). Pro hackathon přijatelné, jen vědět, že demo-cache je snímek.

## 3. Kvalita výstupu (co porota uvidí)

- **Citace dokazuje existenci věty, ne její smysl** (u `requires` se nekontroluje, že věta opravdu říká danou závislost). Negace jsou opravené, sémantika ne. Kdo se zeptá „jak to víte?“, dostane odpověď „citát je pravý“, ne „citát potvrzuje vztah“. Stačí to říct poctivě v demu.
- Text komunitních tipů je volný text LLM a jde do kalendáře jako „Tip: …“. Verifikuje se jen citát, ne text tipu.
- Taxonomie je pořád úzká (bez víza, školky, TE-služeb, řidičáku, bydlení) a chybí oficiální domény `um.fi` / `finlandabroad.fi` (žádost o povolení z velvyslanectví u non-EU) a `oph.fi`. Neznámé město navíc nedostane žádný municipální zdroj (`CITY_DOMAINS` má ~35 klíčů), takže plán pro menší obec bude jen z národních stránek.
- Události v kalendáři jsou pořád v 10:00 a ignorují otevírací dobu.
- `CLAUDE.md` zmiňuje React Flow, který byl odstraněn, a „Exa challenge“ (viz bod 1).

## 4. Co neřešit

Retence uložených běhů, GDPR, `tsc` chyba `LayoutProps` (jde o generované typy z `next typegen`), závislosti v dev řetězci, velikost repa. Na hackathonu to nic nezmění.

## Doporučené pořadí (hodiny, ne dny)

1. Rozhodnout výzvu a založit projekt na platformě (bod 1).
2. Spravit červený test `vietnam.test.ts`, protože je to zlatý test non-EU.
3. Rate limit a denní strop na `/api/run`, strop na monitory.
4. Předem vyzkoušet demo-cache offline (`EXA_CACHE=read LLM_CACHE=read`) a tunel pro webhook.
5. Připravit větu pro porotu o tom, co citát ověřuje a co ne.
