# Prompt till nästa AI-assistent — /status-editering fas 1

Hej! Jag vill med dig arbeta vidare med incheckad.se. Vi ska implementera fas 1 av /status-editering.

## Bakgrund

incheckad.se är en webbapplikation för fordonshantering (incheckning av hyresbilar, skadedokumentation, nybilsinventering, ankomstregistrering). Stack: Next.js, TypeScript, Supabase, Vercel, GitHub. Jag kan ingenting om kodning och arbetar via GitHub web editor med exakta sök-och-ersätt-instruktioner från dig.

## Viktiga dokument att läsa FÖRST

Följande filer finns i projektbiblioteket (Project Knowledge) och/eller i repot under /docs/wiki. Läs dem innan du gör NÅGONTING:

1. **projektjournal-incheckad-v6.md** — Fullständig projekthistorik sep 2025 – mar 2026. Alla kända buggar, specialfall, regler, fallgropar, testregister. LÄS HELA.

2. **designspec-status-editering.md** — Komplett designspecifikation för det vi ska bygga. Alla beslut fattade, inga öppna frågor. LÄS HELA.

3. **handoff-status-editering-20260227.md** — Handoff från föregående session (27 feb). Äldre än designspecen men innehåller nyttig teknisk kontext om koden.

## Vad vi ska göra (fas 1)

Implementera grundläggande editering av fordonsfakta i /status:

1. **Skapa `vehicle_edits`-tabell i Supabase** — SQL finns i designspecen (sektion 2a). Jag kör SQL:en manuellt i Supabase SQL editor; ge mig den exakta SQL:en.

2. **Skapa API-route `app/api/vehicle-edits/route.ts`** — POST-endpoint som tar emot en batch av edits och inserterar i vehicle_edits. Autentisering via Supabase auth (magic link).

3. **Uppdatera `lib/vehicle-status.ts`** — CENTRAL FIL, ~2800 rader:
   - Hämta vehicle_edits i Promise.all (ny query)
   - Bygga en Map med senaste edit per fält
   - Applicera edits som HÖGSTA PRIORITET i prioriteringskedjan (före incheckning, nybil, vehicles)
   - **KRITISKT: Ändringar måste göras i BÅDA kodvägarna** (kodväg 1 ~rad 1375, kodväg 2 ~rad 2278)
   - Bygga HistoryRecord-poster av typen 'manual' för varje edit
   - matarstallningKalla: visa "redigerad [datum]" om mätarställning ändrats

4. **Uppdatera `app/status/form-client.tsx`** — ~2200+ rader:
   - "Redigera"-knapp (synlig för alla inloggade)
   - Editerbara fält (inline eller modal)
   - Visuell markering av ändrade fält
   - "Spara ändringar"-knapp
   - Bekräftelse-modal som listar alla ändringar
   - Visa namn (inte e-post) med `getFullNameFromEmail()`

## Kritiska regler

- **Inga gissningar.** Sök i koden tills du har 100% koll. Fråga mig eller be mig köra SQL om något är oklart.
- **Små PR:er.** En funktion per PR. Jag testar varje PR i Vercel preview innan merge.
- **Exakta sök-och-ersätt-instruktioner.** Jag arbetar i GitHub web editor med Ctrl+F. Ge mig "Sök efter: [exakt text]" och "Ersätt med: [exakt text]". ALDRIG radnummer (de skiftar mellan PR:er).
- **BÅDA kodvägarna.** vehicle-status.ts har TWÅ separata byggen av VehicleStatusData. Sök ALLA förekomster.
- **Testa med specifika reg.nr.** Bra testfall: ZAG53Y (KIA EV6 elbil, har saludatum), JBU34P (MB elbil, har nybilsregistrering), NGW96M (MB diesel). Se journalen sektion 11 för fler.
- **Namn, inte e-post** i all UI. Funktionen `getFullNameFromEmail()` finns redan i koden.
- **Koden har tillgång via project knowledge** — GitHub-repot är kopplat till projektets kunskapsbas. Sök med `project_knowledge_search` för att läsa kodfiler. Sökningar med specifika funktionsnamn eller typnamn ger bäst resultat.

## Arbetsmetod som fungerar

1. Läs journalen och designspecen FÖRST
2. Sök i koden tills du förstår strukturen
3. Beskriv exakt vad du ska ändra — jag bekräftar innan kodning
4. Ge mig steg-för-steg sök-och-ersätt-instruktioner
5. Jag gör ändringen i GitHub web editor, committar, och kollar Vercel preview
6. Vi verifierar tillsammans, sedan merge

## Föreslagen ordning för fas 1

**PR 1:** SQL för vehicle_edits-tabell (jag kör i Supabase)
**PR 2:** API-route vehicle-edits/route.ts (ny fil)
**PR 3:** vehicle-status.ts — hämta edits + applicera i prioriteringskedjan + HistoryRecords (BÅDA kodvägarna!)
**PR 4:** form-client.tsx — "Redigera"-knapp + inline-editering + bekräftelse-modal + spara

Säkerställ att du verkligen har läst journalen (v6) och designspecen innan vi börjar. Bekräfta vad du förstått och ställ frågor tills du har 100% koll.
