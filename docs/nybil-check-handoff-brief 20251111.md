# Handoff Brief: /nybil och /check – Dataflöde, Skador, Import & Root Cause Analys

För efterträdande bot/utvecklare. Syftet: Omedelbart kunna fortsätta arbetet med att:
1. Säkerställa att “Nya skador” dokumenterade via `/check` blir “Befintliga skador” vid nästa uppslag.
2. Slutföra kopplingen mellan `/nybil` och `/check` (bilmodell, hjulförvaring m.m.).
3. Genomföra CSV-import (Skadefilen, Bilkontroll) till Supabase utan att duplicera eller förlora data.
4. Implementera ny bakgrund på `/nybil`.
5. Utföra en metodisk, bevisbaserad root cause-analys av varför skador som dokumenterats i `/check` inte återfinns som “Befintliga” senare.

---

## 0. Kontextsammanfattning

- Systemet har två centrala gränssnitt:
  - `/nybil`: Registrering av ny bil (inventering) inklusive hjulstatus, låsbultar, mätare, drivmedel, hjulförvaring, etc.
  - `/check`: Incheckning / kontroll av bil; visar befintliga skador och låter användaren lägga till nya skador.
- “Befintliga skador” ska inkludera både:
  1. Historiska skador importerade från extern källa (BUHS / Skadefilen CSV).
  2. Nya skador som dokumenterats via `/check` vid tidigare sessioner (de blir därefter “befintliga”).

Aktuellt problem: Skador som dokumenterats via `/check` (exempel WJB01P med två skador) återges inte som “Befintliga” vid ny uppslagning av samma reg.nr; UI visar “Inga kända skador”.

---

## 1. Begreppsdefinitioner

| Begrepp | Definition |
|---------|------------|
| Befintliga skador | Skador som redan är kända för fordonet innan pågående session. Ska visas direkt vid reg.nr input. |
| Nya skador | Skador som läggs till under aktuell `/check`-session. Efter sparning ska de bli “befintliga” vid nästa uppslag (omedelbart eller efter reload). |
| Promotion | Övergången från “ny” till “befintlig” status (kan vara implicit genom lagring i samma tabell eller via en statusflagga). |
| Normalisering av reg.nr | `UPPER(TRIM(regnr))` + ev. borttagning av mellanrum och oönskade tecken. |
| Källa (source) | Värde som anger ursprung: `BUHS`, `CHECK`, ev. `NYBIL` (om vi väljer att synka skador som registreras där). |

---

## 2. Önskat slutläge

1. En enhetlig logisk vy eller tabell som vid SELECT för reg.nr ger en komplett lista av befintliga skador (historiska + tidigare incheckade).
2. Nya skador som sparas under en `/check`-session ska omedelbart (eller vid ny fetch) synas i listan för “Befintliga skador”.
3. Reg.nr-normalisering konsistent på ALLA läs- och skrivoperationer.
4. Inga dubbletter (samma skada definierad två gånger med identiska attribut).
5. Integrerad bilfakta (modell, hjulförvaring) från `/nybil` och Bilkontroll-CSV – konsumeras av `/check`-gränssnittet.
6. Klar och dokumenterad root cause för nuvarande avvikelse.

---

## 3. Hypoteser (Root Cause Kandidater)

| ID | Hypotes | Kort beskrivning | Testmetod |
|----|---------|------------------|-----------|
| H1 | Skilda tabeller | Insert sker i tabell A, UI läser tabell B | Jämför SELECT från båda tabeller för ett reg.nr |
| H2 | Regnr mismatch | Insert sparar variant med extra tecken | Kontrollera längd & hexdump/byte av regnr |
| H3 | Miljöglidning | Produktion vs staging Supabase-projekt | Verifiera Supabase project id/URL för klient init |
| H4 | RLS-blockering | Policy tillåter INSERT men inte SELECT | Lista policies; test SELECT med identisk session |
| H5 | Status-filter | SELECT filtrerar på status=‘existing’ men insert sätter ‘new’ | SELECT med och utan filter; se diff |
| H6 | Källa-filter | SELECT bara `source='BUHS'` | Inspektera querytext i kod |
| H7 | Cache | UI visar initial cache, ej revalidate | Hard reload + Network logg; jämför svar |
| H8 | Vy saknar union | Vy exkluderar `CHECK`-skador | `\d+ v_befintliga_skador` + vydefinition |
| H9 | Transaktionsfel | Insert rollback eller tyst fel | Kontrollera insert-response & ny SELECT direkt |
| H10 | Datum/tidsfilter | SELECT exkluderar skador med “för nytt” datum | Studera WHERE villkor i SELECT |
| H11 | Fel typfält | UI filtrerar på t.ex. `damage_type='paint'` | SELECT alla typer; diff mot UI |
| H12 | Deploy mismatch | Kod i produktion äldre än antagningar | Versionsjämförelse / commit SHA i byggd container |

---

## 4. Bevisinsamling – Sekvens

1. Identifiera exakta tabellnamn:
   - Trolig: `check_skador` (eller liknande) – där nya skador från `/check` sparas.
   - BUHS import staging: t.ex. `buhs_skador_staging`.
   - Bilfakta staging: t.ex. `bilkontroll_staging`.
2. Utför SQL (för reg.nr WJB01P):
   ```sql
   -- A: Nya skador (förmodad tabell – justera:
   SELECT * FROM check_skador WHERE UPPER(TRIM(regnr)) = 'WJB01P';

   -- B: BUHS-staging
   SELECT * FROM buhs_skador_staging WHERE UPPER(TRIM(regnr)) = 'WJB01P';

   -- C: Eventuell vy (justera namn)
   SELECT * FROM v_befintliga_skador WHERE UPPER(TRIM(regnr)) = 'WJB01P';

   -- D: Kontrollera regnr-format
   SELECT regnr, length(regnr), octet_length(regnr)
   FROM check_skador WHERE regnr ILIKE 'WJB01P%';

   -- E: Policies
   SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
   FROM pg_policies
   WHERE tablename IN ('check_skador', 'buhs_skador_staging');

   -- F: Finns index / unik constraint (dedupe)
   \d+ check_skador
   \d+ buhs_skador_staging
   \d+ v_befintliga_skador
   ```
3. Nätverksinspektion i webbläsaren:
   - Ladda `/check`, skriv “WJB01P”.
   - Fånga XHR/fetch som hämtar skador → se endpoint (RPC, table.select, vy).
4. Jämför dataset från punkt 2 med nätverkssvar.
5. Logga i kod (temporärt) resultatlängd: “Fetched existing damages: N”.
6. Klassificera root cause baserat på utfallstabell (se avsnitt 5).

---

## 5. Root Cause Klassificering (Schema)

| Utfallsobservation | Root cause kategori | Åtgärdsinriktning |
|--------------------|---------------------|-------------------|
| A har rader, C tom | Vy/union saknas | Ändra vy eller byt SELECT-källa |
| A & C har rader, UI tom | Klientfiltrering/logik | Uppdatera render-/filterkod |
| A tom, Insert rapporterat OK | Insert-fel (kod eller RLS) | Debugga insert, kontrollera response/rollback |
| A & C tom, BUHS har rader | Endast historik – promotion saknas | Introducera promotion/upsert |
| Regnr-format differerar | Normaliseringsbrist | Inför normalizeRegnr() i både insert & select |
| Policy blockerar SELECT | RLS | Justera eller skapa `USING`/`WITH CHECK` policy |
| Cache visar gammalt | Revalidate-problem | Force revalidate på regnr change / disable stale cache |

---

## 6. Arkitektur Rekommendation

### 6.1 Datamodell (mål)
En enhetlig vy: `v_befintliga_skador`
```sql
CREATE OR REPLACE VIEW v_befintliga_skador AS
SELECT
  UPPER(TRIM(s.regnr)) AS regnr,
  s.skade_typ,
  s.position,
  s.beskrivning,
  s.source,
  s.skapat_tid,
  s.status
FROM (
  SELECT regnr, skade_typ, position, beskrivning, 'BUHS'::text AS source, skapat_tid, 'aktiv'::text AS status
  FROM buhs_skador_staging
  UNION ALL
  SELECT regnr, skade_typ, position, beskrivning, 'CHECK'::text AS source, skapat_tid, 
         CASE WHEN status IN ('ny','aktiv') THEN 'aktiv' ELSE status END AS status
  FROM check_skador
) s
WHERE s.status = 'aktiv';
```
Vid behov ersätt `skade_typ`, `position`, `beskrivning` med verkliga kolumnnamn.

### 6.2 Normalisering Helper (klientsida – TypeScript)
```ts
export function normalizeRegnr(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}
```

### 6.3 Insert-flöde (/check)
1. Normalisera regnr.
2. Insert i `check_skador` med status='ny'.
3. (Valfritt) Direkt update: `UPDATE check_skador SET status='aktiv' WHERE id = $id;` eller skriv `aktiv` från start.
4. UI re-fetch mot `v_befintliga_skador` efter confirmation → “Befintliga skador” lista ska visa även denna.

### 6.4 Dedup-hantering
Unik constraint (exempel):
```sql
ALTER TABLE check_skador
ADD CONSTRAINT check_skador_unique_key
UNIQUE (regnr, skade_typ, position, coalesce(trim(beskrivning), ''));
```
Ev. justera att `beskrivning` hash: `md5(regnr || skade_typ || position || coalesce(trim(beskrivning),'') )`.

### 6.5 RLS Policies (exempel)
```sql
-- Tillåt SELECT & INSERT för autentiserade användare på relevanta skador-tabeller
CREATE POLICY select_check_skador ON check_skador
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY insert_check_skador ON check_skador
FOR INSERT WITH CHECK (auth.role() = 'authenticated');
```
Justeras efter befintligt auth-schema.

---

## 7. CSV-Import – Process

### 7.1 Staging → Kanonisering
1. Ladda CSV till staging (`buhs_skador_staging_raw`, `bilkontroll_staging_raw`).
2. Transformation:
   ```sql
   INSERT INTO buhs_skador_staging (regnr, skade_typ, position, beskrivning, skapat_tid)
   SELECT
     UPPER(TRIM(regnr)),
     skade_typ,
     position,
     NULLIF(TRIM(beskrivning), ''),
     COALESCE(parsed_datum, now())
   FROM buhs_skador_staging_raw
   ON CONFLICT DO NOTHING; -- eller merge-logik
   ```

3. Bilkontroll (modell & hjulförvaring):
   ```sql
   INSERT INTO bil_fakta (regnr, modell, hjul_forvaring, updated_at)
   SELECT
     UPPER(TRIM(regnr)),
     NULLIF(TRIM(modell), ''),
     NULLIF(TRIM(hjul_forvaring), ''),
     now()
   FROM bilkontroll_staging_raw
   ON CONFLICT (regnr) DO UPDATE
     SET modell = EXCLUDED.modell,
         hjul_forvaring = EXCLUDED.hjul_forvaring,
         updated_at = now();
   ```

### 7.2 Verifiering efter import
```sql
SELECT COUNT(*) FROM buhs_skador_staging;
SELECT COUNT(*) FROM bil_fakta;
SELECT regnr, COUNT(*) FROM v_befintliga_skador GROUP BY regnr ORDER BY COUNT(*) DESC LIMIT 20;
```

---

## 8. Koppling /nybil → /check

- `/nybil` inskick: bilmodell & hjul_forvaring sparas i (trolig) tabell `nybil_inventering`.
- Säkerställ att `/check` vid regnr-lookup gör fallback:
  1. Läs från `bil_fakta` (som matas av Bilkontroll-import + ev. `/nybil` sync).
  2. Om saknas där, hämta senaste rad från `nybil_inventering`:
     ```sql
     SELECT modell, hjul_forvaring
     FROM nybil_inventering
     WHERE regnr = $regnr
     ORDER BY registreringsdatum DESC
     LIMIT 1;
     ```
- Överväg en materialiserad synk:
  ```sql
  INSERT INTO bil_fakta (regnr, modell, hjul_forvaring, updated_at)
  SELECT regnr, modell, hjul_forvaring, now()
  FROM nybil_inventering
  WHERE NOT EXISTS (SELECT 1 FROM bil_fakta bf WHERE bf.regnr = nybil_inventering.regnr);
  ```

---

## 9. UI-Justeringar

### 9.1 /check – laddning av befintliga skador
Pseudo:
```ts
async function loadExistingDamages(regnrRaw: string) {
  const regnr = normalizeRegnr(regnrRaw);
  const { data, error } = await supabase
    .from('v_befintliga_skador')
    .select('*')
    .eq('regnr', regnr);

  if (error) throw error;
  return data;
}
```

### 9.2 Promotion (om status används)
Direkt efter insert:
```ts
await supabase
  .from('check_skador')
  .update({ status: 'aktiv' })
  .eq('id', insertedId);
```

### 9.3 /nybil – Bakgrundsbild
CSS (kan lämnas som är, eller Just-In-Time):
```css
.nybil-page {
  position: relative;
  min-height: 100vh;
  background-color: #fff;
  background-image: url("https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/Silver%20logo%20white%20bkgrd/mercedes-benz-logo-silver.png");
  background-repeat: no-repeat;
  background-position: center 90px;
  background-size: 240px auto;
}
.nybil-page::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(7,125,73,0.06) 0%, rgba(7,125,73,0.10) 100%);
  pointer-events: none;
}
```

---

## 10. Testfall (inkl. WJB01P)

| Test | Beskrivning | Förväntan |
|------|-------------|-----------|
| T1 | Skriv WJB01P i `/check` | Visar 2 befintliga skador (tidigare dokumenterade) |
| T2 | Lägg till ny skada på WJB01P, spara | Omedelbar re-fetch visar nu 3 skador |
| T3 | Reload /check sida, skriv WJB01P | Fortfarande 3 skador |
| T4 | Importera BUHS-skador för nytt reg.nr X | Efter import, skriv X → historiska skador syns |
| T5 | Lägg till en duplicate skada (identisk) | Insert stoppas eller dubblett ej skapas |
| T6 | RLS-policy test med vanlig användare | SELECT fungerar, inga 403/denied |
| T7 | Regnr med whitespace “ WJB01P ” | Normaliseras och fungerar lika |
| T8 | Nybil registrerar bilmodell och hjulförvaring | Direkt synligt i `/check`-faktapanel |

---

## 11. Risker & Mitigation

| Risk | Beskrivning | Mitigation |
|------|-------------|------------|
| Felaktig vydefinition | Missar kolumner eller statusfilter | Dokumentera vy + review före deploy |
| Dubblettskador | Samma skada flera gånger | Unik constraint / md5-hash nyckel |
| RLS-blockering | Nya policies hindrar SELECT | Test med produktions-session innan release |
| Regnr-anomali | Ovanliga tecken (Å, Ä, Ö, bindestreck) | Definiera teckenmodell; logga avvikande tecken |
| Felkälla i UI-filtrering | Frontend filtrerar bort `source='CHECK'` | Temporära debug-logs på filtersteget |
| Import felmapping | Kolumnskifte vid CSV | Först torrkör 10 rader + diff mot spec |

---

## 12. Föreslagen arbetsordning

1. Inventera faktiska tabellnamn & vyer.
2. Kör SQL från avsnitt 4 (A–F) mot problemreg.nr (WJB01P).
3. Fastställ root cause (dokumentera 3–5 meningar).
4. Implementera ev. vy–justering eller SELECT-källbyte.
5. Inför regnr-normalisering helper i både insert och fetch.
6. Lägg till unik constraint för dubblettskydd.
7. Testa T1–T8 lokalt/staging.
8. PR 1: Skadeflöde & befintliga skador-fix.
9. PR 2: /nybil bakgrund + koppling bilmodell/hjulförvaring (om ej redan).
10. CSV-import i staging + transform + slutlig kontroll.
11. Produktion: rullande verifikation på 2–3 olika reg.nr.
12. Dokumentera slutrapport (root cause + lösning).

---

## 13. Slutrapport Mall (att fylla i när klart)

```md
# Root Cause Rapport – Befintliga skador

Reg.nr testfall: WJB01P

Root Cause:
- (Exempel) SELECT mot endast buhs_skador_staging; check_skador aldrig inkluderades i vy → nya skador syntes inte som befintliga.

Åtgärder:
1. Skapade/uppdaterade `v_befintliga_skador` med UNION ALL på båda källor.
2. Infört normalizeRegnr() i insert och fetch.
3. Lagt till unik constraint för att hindra dubbletter.
4. Re-fetch i UI efter insert.

Resultat:
- WJB01P visar nu tidigare skador direkt.
- Nya skador blir omedelbart “befintliga” vid ny uppslagning.
- CSV-import av BUHS syns korrekt.

Verifikation:
- Testfall T1–T8 grönt 2025-11-xx.
```

---

## 14. Data som efterträdaren bör aktivt inhämta (om ej redan känd)

- Exakta tabellnamn:
  - Skador via /check
  - BUHS import staging
  - Bilkontroll staging
  - Nybil inventering
  - Bilfakta (om finns)
- Vydefinitioner (LISTA i psql: `\dv`, `\d+ v_*`).
- RLS policies (främst SELECT/INSERT/UPDATE).
- Supabase projekt-ID (för att kontrollera att UI pekar på rätt projekt).
- Eventuella edge functions / RPC (ex: `rpc_get_existing_damages`).
- Frontend filer där damage fetch sker (söksträng “Befintliga skador” eller regnr fetch hook).

---

## 15. Rekommenderad kodstädning (vid lämpligt tillfälle)

| Punkt | Beskrivning |
|-------|-------------|
| Konsolidera helpers | En enda `normalizeRegnr()` i en shared util |
| Typdefinitioner | Definiera `DamageRecord` interface med fälten: regnr, skadeTyp, position, beskrivning, source, status, skapatTid |
| Error logging | Standardisera Supabase error-hantering för skador |
| Kommentarer | Lägg kort doc-block ovan vydefinition i repo (SQL) |
| Monitoring (framtid) | Logga antal nya skador per dag; larma om 0 (driftskontroll) |

---

## 16. Handlingssignal

Systemet är redo för root cause analys enligt stegen ovan. Ingen kodändring bör göras innan root cause är säkerställd genom A/B/C SELECT-jämförelse.

---

## 17. Sammanfattning i en mening

Vi behöver bevisa datamismatchen mellan skrivning och läsning av skador, normalisera regnr konsekvent, och sedan förena källor (historik + nya) i en vy eller SELECT för att göra nya skador direkt synliga som “befintliga”.

---

## 18. Kontaktpunkter / Ny bot Start

Efterträdaren bör börja med:
1. Lista tabeller och vyer i Supabase.
2. Köra WJB01P–test-SQL.
3. Dokumentera root cause resultat.
4. Fortsätta enligt arbetsordning (punkt 12).

Lycka till – dokumentet ska ge full fart utan vidare frågor.
