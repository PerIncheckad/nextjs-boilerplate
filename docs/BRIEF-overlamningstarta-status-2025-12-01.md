# BRIEF: Projekt Incheckad. se – Överlämning

**Datum:** 2025-12-01  
**Författare:** GitHub Copilot  
**Syfte:** Sömlös överlämning till nästa utvecklare

---

## 1.  PROJEKTÖVERSIKT

### 1.1 Vad är Incheckad.se? 
Ett internt system för MABI Syd (biluthyrning) med fyra huvuddelar:

| Modul | Syfte | Status |
|-------|-------|--------|
| `/check` | Incheckningsformulär vid återlämning av fordon | ✅ Fungerar |
| `/nybil` | Registrering av nya bilar som anländer till vagnparken | ✅ Fungerar (med förbättringar i PR #163-165) |
| `/status` | Läs/redigera-sida för fordonsinfo + dubbletthantering | 🔴 Ej påbörjad |
| `/rapport` | Statistik och rapporter baserat på incheckningsdata | 🟡 Påbörjad men pausad |

### 1.2 Dataflöde
```
NYA BILAR:
/nybil → Supabase (nybil_inventering) → /status → /check

BEFINTLIGA BILAR:
Bilkontroll-filen → /status → /check

SKADOR:
Skadefilen (BUHS) → damages-tabell → /check (faktaruta)

RAPPORTER:
checkins + damages + nybil_inventering → /rapport
```

---

## 2.  VAD VI ÅSTADKOMMIT I SENASTE SESSION (2025-12-01)

### 2.1 PR #163 – Dubbletthantering för /nybil
- ✅ Dubblettregistrering fungerar (samma regnr flera gånger)
- ✅ `duplicate_group_id` sätts på båda registreringar (samma UUID)
- ✅ `is_duplicate: true` på efterföljande registreringar
- ✅ Varningsmodaler (konstigt regnr + dubblettvarning)
- ✅ Blå "DUBBLETT SKAPAD" banner i Bilkontroll-mejl
- ✅ Lila "DUBBLETT" banner i Huvudstation-mejl
- ✅ Förenklat Huvudstation-mejl (borttagen köparinformation)

### 2.2 PR #164 – Mejl och labels
- ✅ "NYBILSFOTON" sektion i både Huvudstation och Bilkontroll mejl
- ✅ "Mätarställning vid inköp" → "Mätarställning vid leverans"
- ✅ SQL policies för `nybil-photos` bucket (körd manuellt i Supabase)

### 2.3 PR #165 – Mappstruktur och banners
- ✅ Ny mappstruktur: `REGNR/NYBIL-REFERENS/` + `REGNR/SKADOR/`
- ✅ Korrekta e-postlänkar (NYBILSFOTON → referensbilder, skador → skademapp)
- ✅ Grön "KLAR FÖR UTHYRNING!" banner högst upp i Huvudstation-mejl
- ✅ Röda skadebannern länkar till rätt mapp

### 2.4 Manuellt körda SQL-kommandon
```sql
-- Policy för nybil-photos bucket (SELECT)
CREATE POLICY "Allow public to list nybil-photos"
ON storage. objects FOR SELECT TO public
USING (bucket_id = 'nybil-photos');

-- Policy för nybil-photos bucket (INSERT)
CREATE POLICY "Allow authenticated users to upload nybil-photos"
ON storage. objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'nybil-photos');

-- Policy för nybil-photos bucket (UPDATE)
CREATE POLICY "Allow authenticated users to update nybil-photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'nybil-photos');
```

---

## 3. KVARSTÅENDE UPPGIFTER

### 3.1 /status – Ej påbörjad (HUVUDPRIORITET)

#### Syfte
- Primärt en **läs-sida** för fordonsinfo
- Sökfunktion med autocomplete
- Redigering och komplettering
- **Dubbletthantering** – slå ihop dubbletter
- Manuell inmatning av befintliga bilar

#### UI-struktur (föreslagen)

**Standardvy (fokus på nuläge):**
| Fält | Beskrivning |
|------|-------------|
| Märke & Modell | T.ex. "VW T-Cross" |
| Var är bilen nu? | Ort + Station |
| Saludatum | Om satt |
| Hjultyp (monterade) | Sommardäck / Vinterdäck |
| Antal registrerade skador | Med länk till skadesektion |
| Senaste mätarställning | Km |
| Klar för uthyrning | Ja/Nej |

**Detaljerad vy / Utvikning:**
- All information från /nybil-registrering
- Avtalsvillkor (serviceintervall, max km/månad, etc.)
- Saluprocess-detaljer (köpare, returort, attention, etc.)
- Utrustning (laddkablar, insynsskydd, nycklar, etc.)
- Historik (incheckningar, ändringar)

**Skadesektion:**
- Lista över alla skador med datum och typ
- Länk till respektive skademapp i media browser
- "Visa alla skador"-knapp → öppnar `REGNR/SKADOR/` i media browser

**Dubbletthantering:**
- Om `duplicate_group_id` finns → visa alla relaterade registreringar
- Möjlighet att slå ihop/merge dubbletter
- Välj vilken data som ska behållas

**Bakgrundsbild:**
```
https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MB%20300%20SL%20Roadster%201962/MB%20300-SL-Roadster_1962.jpg
```

#### Datakällor
- `nybil_inventering` (nya bilar via /nybil)
- `vehicles` (Bilkontroll-filen)
- `damages` (Skadefilen/BUHS + app-skador)
- `checkins` (incheckningshistorik)

### 3.2 Koppling /check ↔ /status

När /status är klar ska /check:
1. Läsa data från /status (istället för Bilkontroll-filen)
2. Visa **varningsmodal** vid avvikelser:
   - Laddkabel saknas
   - Insynsskydd saknas
   - Fel däcktyp
3. Skicka **bannrar i mejl** vid avvikelser:
   - Till BÅDE Bilkontroll OCH Huvudstation
   - Röd banner för kritiska avvikelser (laddkabel, insynsskydd)
   - Blå banner för info (fel däck)

### 3.3 /rapport – Pausad

**Syfte:** Statistik och rapporter baserat på incheckningsdata över tid. 

**Möjliga rapporter:**
- Antal incheckningar per station/period
- Vanligaste skadetyper
- Genomsnittlig mätarställning
- Bilar som behöver service snart
- Etc.

**Status:** Påbörjad men pausad.  Prioriteras efter /status.

### 3.4 Noterat men ej åtgärdat
- `original_registration_id` kolumnen i `nybil_inventering` är alltid tom – **OK**, vi använder `duplicate_group_id` istället.  Kan städas bort senare.

---

## 4. TEKNISK ÖVERSIKT

### 4.1 Stack
- **Frontend:** Next.js (App Router)
- **Backend:** Supabase (PostgreSQL + Storage + Auth)
- **Hosting:** Vercel
- **E-post:** Resend

### 4.2 Viktiga filer
| Fil | Syfte |
|-----|-------|
| `app/nybil/form-client.tsx` | Nybil-formuläret |
| `app/api/nybil-email/route.ts` | E-postbyggare för /nybil |
| `app/check/form-client.tsx` | Incheckningsformuläret |
| `app/api/notify/route.ts` | API för /check (e-post + DB) |
| `app/public-media/[...path]/page.tsx` | Media browser |
| `app/rapport/` | Rapport-sidan (pausad) |

### 4.3 Supabase-tabeller (aktiva)
| Tabell | Syfte |
|--------|-------|
| `nybil_inventering` | Nya bilar från /nybil |
| `vehicles` | Fordon från Bilkontroll-filen |
| `damages` | Skador (BUHS + nya från app) |
| `checkins` | Incheckningar |
| `checkin_damages` | Koppling incheckning ↔ skador |
| `stations` | Stationer |
| `allowed_plates` | Tillåtna reg.nr |

### 4.4 Supabase Storage Buckets
| Bucket | Syfte |
|--------|-------|
| `nybil-photos` | Foton från /nybil |
| `damage-photos` | Skadefoton från /check |

### 4.5 Mappstruktur i Storage (ny från PR #165)
```
REGNR/
├── NYBIL-REFERENS/
│   └── YYYYMMDD-NYBIL/
│       ├── framifran.jpeg
│       ├── bakifran.jpeg
│       └── ovriga/
└── SKADOR/
    └── YYYYMMDD-skadetyp-placering-namn/
        └── foto.jpeg
```

---

## 5. CSV-IMPORT (dokumenterat i docs/wiki/CSV-import.md)

### 5.1 Skadefilen (BUHS)
- **Källa:** Mejlas till per. andersson@mabi.se varje vardag kl 8
- **Format:** Excel → CSV-UTF-8
- **Kolumner:** regnr, saludatum, damage_date, damage_type_raw, note_customer, note_internal, vehiclenote
- **Staging-tabell:** `mabi_damage_data_raw_new`
- **UPSERT till:** `damages`

### 5. 2 Bilkontroll-filen
- **Källa:** MABI Syds OneDrive, flik "NYA MOTTAGNA Q3-4"
- **Format:** Excel → CSV-UTF-8
- **Kolumner:** regnr, brand, model, wheel_storage_location
- **Staging-tabell:** `vehicles_staging`
- **UPSERT till:** `vehicles`

---

## 6.  E-POSTLOGIK

### 6.1 /nybil – Mottagare
| Situation | Mottagare |
|-----------|-----------|
| Alltid | Bilkontroll |
| Om "Klar för uthyrning" = Ja | Bilkontroll + Huvudstation |

### 6.2 /nybil – Bannrar
| Färg | Villkor | Text |
|------|---------|------|
| 🟢 Grön | Klar för uthyrning | "✅ KLAR FÖR UTHYRNING!" |
| 🔴 Röd | Skador vid leverans | "⚠ SKADOR VID LEVERANS (X)" |
| 🔵 Blå | Dubblett | "DUBBLETT SKAPAD" |
| 🟣 Lila | Dubblett (Huvudstation) | "DUBBLETT" |

### 6.3 /check – Avvikelse-bannrar (framtida, efter /status)
| Färg | Villkor | Mottagare |
|------|---------|-----------|
| 🔴 Röd | Laddkabel saknas | Bilkontroll + Huvudstation |
| 🔴 Röd | Insynsskydd saknas | Bilkontroll + Huvudstation |
| 🔵 Blå | Fel däcktyp | Bilkontroll + Huvudstation |

### 6.4 Subject-format
```
NY BIL REGISTRERAD: ABC123 - VW T-Cross - till Malmö | HUVUDSTATION
NY BIL REGISTRERAD: ABC123 - VW T-Cross - till Malmö - ! !!  | BILKONTROLL  (vid röd banner)
```

---

## 7.  KÄNDA BEGRÄNSNINGAR

1. **Under utveckling:** Alla mejl skickas till `per@incheckad.se` (inte faktiska mottagare)
2. **/status existerar inte än:** Länkar till /status i mejl är placeholders
3. **Transition-plan:** Bilkontroll-filen används parallellt tills /status är klart
4. **/rapport pausad:** Prioriteras efter /status

---

## 8. REKOMMENDERAD NÄSTA STEG

### Fas 1: /status (grundläggande)
1. Skapa `app/status/page. tsx` med sökfunktion (autocomplete)
2. Visa nuläges-data (märke, modell, plats, saludatum, hjul, skador, mätarställning)
3. Implementera visningsläge (read-only)
4. Lägg till bakgrundsbild (MB 300 SL Roadster)

### Fas 2: /status (detaljerad vy + redigering)
1.  Lägg till "Visa detaljer" / utvikning för all info
2. Skadesektion med länkar till media browser
3. "Redigera"-knapp med bekräftelsemodal
4.  Manuell inmatning av befintliga bilar

### Fas 3: /status (dubbletthantering)
1. Visa relaterade dubbletter via `duplicate_group_id`
2. Merge-funktionalitet
3. Välj vilken data som ska behållas

### Fas 4: Koppling /check ↔ /status
1. /check läser data från /status
2. Varningsmodaler vid avvikelser i /check
3. Bannrar i mejl till BÅDE Bilkontroll OCH Huvudstation

### Fas 5: /rapport
1. Återuppta pausat arbete
2.  Definiera rapporttyper
3.  Implementera filter och export

---

## 9. VIKTIGA DOKUMENT I REPOT

| Fil | Innehåll |
|-----|----------|
| `docs/SPEC-nybil-och-status-20251126.md` | Komplett specifikation för /nybil och /status |
| `docs/wiki/CSV-import. md` | CSV-importguide |
| `docs/Brief notify-status-2025-11-20.md` | Status för /check vid tidpunkt |
| `docs/wiki/*. md` | Övrig dokumentation |
| `docs/Konversation med bot *. txt` | Historiska konversationer (med datum) |

---

## 10.  VARNINGAR TILL EFTERTRÄDARE

⚠️ **Gör INGA ändringar utan att diskutera först**  
Per har upplevt att tidigare bottar orsakat regressioner. Alla ändringar ska diskuteras och godkännas. 

⚠️ **Testa alltid efter merge**  
Verifiera att funktionalitet fungerar i Vercel-preview innan du går vidare. 

⚠️ **Dokumentera**  
Uppdatera relevanta docs-filer vid ändringar. 

⚠️ **Läs konversationshistorik**  
Tidigare konversationer finns i `docs/` med datum i filnamnen.

⚠️ **Ta inga egna initiativ**  
Gör endast det som explicit efterfrågas.  Lägg inte till, ta inte bort, "förbättra" inte saker utan godkännande.

---

## 11.  KONTAKTINFO

- **Per Andersson:** per.andersson@mabi.se / per@incheckad.se
- **Repo:** github.com/PerIncheckad/nextjs-boilerplate
- **Produktion:** incheckad.se

---

*Denna brief är skapad 2025-12-01 baserat på konversation och SPEC-dokument.*
