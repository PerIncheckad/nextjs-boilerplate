# CSV-import (BUHS "Skadefilen" och Bilkontroll)

Mål: 
- Icke-destruktiv import (rör inte dokumenterade rader; tar aldrig bort Helsingborgs arbete).
- "N2 per datum":  Nya BUHS-rader med nytt datum ska kräva dokumentation; samma datum ska inte trigga igen.
- Snapshots före import. 

Förutsättningar:
- Tidszon Europe/Stockholm.
- BUHS hämtas från public.damages (importerade rader har `damage_type_raw` ifylld).
- "Dokumenterade" rader har `legacy_damage_source_text IS NOT NULL`.
- "Nya skador" i appen har typiskt `legacy_damage_source_text IS NULL` och `damage_type_raw IS NULL` (rör inte dessa).

---

## 1) Källfiler och förberedelse

Innan du kan importera data behöver du förbereda källfilerna korrekt. 

### 1.1 Skadefilen (BUHS)

**Originalfil:** `Skador Albarone[dagens datum]. xlsx`

**Källa:** Mejlas till per. andersson@mabi.se varje vardag kl 8. 

**Förbered filen:**

1. Öppna filen i Excel
2. **Behåll endast följande kolumner** och byt namn på dem: 
   | Originalnamn | Nytt namn |
   |--------------|-----------|
   | `RegNr` | `regnr` |
   | `Salu datum` | `saludatum` |
   | `Skadedatum` | `damage_date` |
   | `Skadetyp` | `damage_type_raw` |
   | `Skada Notering på avtal/faktura` | `note_customer` |
   | `Intern notering` | `note_internal` |
   | `VehicleNote` | `vehiclenote` |
3. **Ta bort alla andra kolumner**
4. Spara som **"CSV UTF-8 (kommaavgränsad)"** (. csv)

### 1.2 Bilkontrollfilen

**Originalfil:** `MABISYD Bilkontroll 2024-2025.xlsx`

**Källa:** Finns på MABI Syds OneDrive, ägs av Bilkontroll.  Uppdateras oregelbundet (ibland flera gånger i veckan).

**Förbered filen:**

1. Öppna filen i Excel
2. Gå till fliken **`NYA MOTTAGNA Q3-4`**
3. **Behåll endast följande kolumner** och byt namn på dem:
   | Originalnamn | Nytt namn |
   |--------------|-----------|
   | `Regnr` | `regnr` |
   | `Märke` | `brand` |
   | `MODELL` | `model` |
   | `FÖRVARING` | `wheel_storage_location` |
4. **OBS!  Ta bort ALLA andra kolumner**, även de som ser tomma ut till höger (dessa genererar fel i Supabase)
5. Spara som **"CSV UTF-8 (kommaavgränsad)"** (.csv)

---

## 2) Importera Skadefilen (BUHS)

### Steg 1: Skapa backup

**VIKTIGT:  Kör alltid backup INNAN import!**

```sql
CREATE TABLE IF NOT EXISTS public.damages_backup_YYYYMMDD AS 
TABLE public.damages WITH DATA;
```

*(Byt ut `YYYYMMDD` mot dagens datum, t.ex. `damages_backup_20260114`)*

---

### Steg 2: Töm staging-tabellen

```sql
TRUNCATE public.mabi_damage_data_raw_new;
```

---

### Steg 3: Importera CSV till staging

1.  Gå till **Table Editor** → `mabi_damage_data_raw_new`
2. Klicka **Insert** → **Import data from CSV**
3. Ladda upp din förberedda CSV-fil
4. Verifiera att kolumnerna matchar (regnr, saludatum, damage_date, etc.)

---

### Steg 4: Radera dubbletter i staging

```sql
DELETE FROM public.mabi_damage_data_raw_new
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM public.mabi_damage_data_raw_new
  GROUP BY regnr, damage_date, damage_type_raw, COALESCE(note_customer, '')
);
```

**Verifiera:**
```sql
SELECT COUNT(*) FROM public.mabi_damage_data_raw_new;
-- Kontrollera att antalet rader är rimligt (t.ex. 200-600 st)
```

---

### Problem:  CSV-import visar "NYA SKADOR" fast de redan importerats via API

**Se:** [Hantering av dubbel-rad BUHS-import](./csv-import-dubbel-rad.md)

### Steg 5: UPSERT från staging till damages

**⚠️ KRITISKT:  Denna SQL sätter `source='BUHS'` OCH bygger `legacy_damage_source_text`! **

```sql
INSERT INTO public.damages (
  regnr,
  saludatum,
  damage_date,
  damage_type_raw,
  note_customer,
  note_internal,
  vehiclenote,
  source,
  legacy_damage_source_text,  -- KRITISKT FÄLT!
  imported_at
)
SELECT 
  UPPER(TRIM(regnr)),
  saludatum,
  damage_date,
  damage_type_raw,
  note_customer,
  note_internal,
  vehiclenote,
  'BUHS',  -- ← Sätt source till BUHS (inte CHECK!)
  -- ↓ Bygg legacy_damage_source_text från kolumner D-G
  damage_type_raw || 
    CASE 
      WHEN note_customer IS NOT NULL 
           AND note_customer != '' 
           AND note_customer != damage_type_raw
      THEN ' - ' || note_customer 
      ELSE '' 
    END ||
    CASE 
      WHEN note_internal IS NOT NULL 
           AND note_internal != '' 
           AND note_internal != '-'
      THEN ' (' || note_internal || ')'
      ELSE '' 
    END ||
    CASE 
      WHEN vehiclenote IS NOT NULL 
           AND vehiclenote != '' 
           AND vehiclenote != '-'
      THEN ' [' || vehiclenote || ']'
      ELSE '' 
    END,
  NOW()
FROM public.mabi_damage_data_raw_new
ON CONFLICT (regnr, damage_date, damage_type_raw, COALESCE(note_customer, ''))
DO UPDATE SET
  saludatum = EXCLUDED.saludatum,
  note_internal = EXCLUDED.note_internal,
  vehiclenote = EXCLUDED.vehiclenote,
  source = 'BUHS',  -- Uppdatera även vid konflikt
  legacy_damage_source_text = EXCLUDED.legacy_damage_source_text,  -- Uppdatera även vid konflikt
  imported_at = NOW();
```

---

### Steg 6: Verifiera importen

```sql
-- Kontrollera antal nya rader
SELECT COUNT(*) FROM public.damages WHERE DATE(imported_at) = CURRENT_DATE;

-- Kontrollera att source är korrekt
SELECT source, COUNT(*) 
FROM public.damages 
WHERE DATE(imported_at) = CURRENT_DATE
GROUP BY source;
-- Förväntat: alla rader ska ha source='BUHS'

-- Kontrollera specifika regnr (byt ut SAM31A mot ett regnr från din import)
SELECT regnr, damage_type_raw, legacy_damage_source_text
FROM public.damages 
WHERE regnr = 'SAM31A' 
ORDER BY damage_date DESC;
-- Förväntat: legacy_damage_source_text ska vara ifylld (t.ex. "Lackskada - Lackskada, båda stötfångarna bak")
```

---

### Steg 7: Uppdatera damages_external (RPC-källa)

**OBS! `/check` läser BUHS-skador från `damages_external` via RPC `get_damages_by_trimmed_regnr`**

```sql
-- Töm damages_external
TRUNCATE public.damages_external;

-- Kopiera alla BUHS-skador från damages
INSERT INTO public.damages_external (
  regnr,
  saludatum,
  damage_date,
  damage_type_raw,
  note_customer,
  note_internal,
  vehiclenote
)
SELECT 
  regnr,
  saludatum,
  damage_date,
  damage_type_raw,
  note_customer,
  note_internal,
  vehiclenote
FROM public.damages
WHERE source = 'BUHS';
```

**Verifiera:**
```sql
SELECT COUNT(*) FROM public.damages_external;
-- Ska matcha antalet BUHS-skador i damages

SELECT COUNT(*) FROM public.damages WHERE source = 'BUHS';
-- Dessa två COUNT ska vara samma! 
```

---

## 3) Importera Bilkontrollfilen

### Steg 1: Skapa backup

```sql
CREATE TABLE IF NOT EXISTS public.vehicles_backup_YYYYMMDD AS 
TABLE public.vehicles WITH DATA;
```

---

### Steg 2: Töm staging-tabellen

```sql
-- Skapa staging om den inte finns
CREATE TABLE IF NOT EXISTS public. vehicles_staging (
  regnr text,
  brand text,
  model text,
  wheel_storage_location text
);

-- Töm staging
TRUNCATE public.vehicles_staging;
```

---

### Steg 3: Importera CSV till staging

1. Gå till **Table Editor** → `vehicles_staging`
2. Klicka **Insert** → **Import data from CSV**
3. Ladda upp din förberedda CSV-fil
4. Verifiera att kolumnerna matchar (regnr, brand, model, wheel_storage_location)

---

### Steg 4: Radera dubbletter i staging

```sql
DELETE FROM public.vehicles_staging
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM public.vehicles_staging
  GROUP BY UPPER(TRIM(regnr))
);
```

---

### Steg 5: UPSERT från staging till vehicles

```sql
INSERT INTO public.vehicles (
  regnr,
  brand,
  model,
  wheel_storage_location,
  updated_at
)
SELECT 
  UPPER(TRIM(regnr)),
  brand,
  model,
  wheel_storage_location,
  NOW()
FROM public.vehicles_staging
ON CONFLICT (regnr)
DO UPDATE SET
  brand = COALESCE(NULLIF(EXCLUDED.brand, ''), vehicles.brand),  -- Behåll befintlig om ny är tom
  model = COALESCE(NULLIF(EXCLUDED. model, ''), vehicles.model),
  wheel_storage_location = EXCLUDED.wheel_storage_location,  -- Uppdatera alltid (viktig info!)
  updated_at = NOW();
```

---

### Steg 6: Verifiera importen

```sql
-- Kontrollera antal uppdaterade rader
SELECT COUNT(*) FROM public.vehicles WHERE DATE(updated_at) = CURRENT_DATE;

-- Kontrollera specifika regnr
SELECT * FROM public.vehicles WHERE regnr IN ('SAM31A', 'PJO748', 'MJA22G');
```

---

## 4) Felsökning

### Problem: "duplicate key value violates unique constraint"

**Orsak:** Dubbletter i CSV-filen eller staging-tabellen.

**Lösning:** Kör dedup-SQL (Steg 4) igen.

---

### Problem: "column 'source' not found" vid Skadefil-import

**Orsak:** Äldre version av `damages`-tabellen saknar `source`-kolumnen.

**Lösning:**
```sql
-- Lägg till source-kolumnen om den saknas
ALTER TABLE public. damages 
ADD COLUMN IF NOT EXISTS source text DEFAULT 'CHECK';
```

---

### Problem: "column 'legacy_damage_source_text' not found"

**Orsak:** Äldre version av `damages`-tabellen saknar `legacy_damage_source_text`-kolumnen.

**Lösning:**
```sql
-- Lägg till kolumnen om den saknas
ALTER TABLE public.damages 
ADD COLUMN IF NOT EXISTS legacy_damage_source_text text;
```

---

### Problem:  Befintliga BUHS-skador har `source='CHECK'` (fel)

**Orsak:** Tidigare importer gjordes INNAN `source`-fältet lades till i UPSERT-SQL.

**Lösning:**
```sql
-- Fixa befintliga BUHS-skador
UPDATE public.damages
SET 
  source = 'BUHS',
  legacy_damage_source_text = 
    damage_type_raw || 
    CASE 
      WHEN note_customer IS NOT NULL 
           AND note_customer != '' 
           AND note_customer != damage_type_raw
      THEN ' - ' || note_customer 
      ELSE '' 
    END ||
    CASE 
      WHEN note_internal IS NOT NULL 
           AND note_internal != '' 
           AND note_internal != '-'
      THEN ' (' || note_internal || ')'
      ELSE '' 
    END
WHERE source = 'CHECK'
  AND user_type IS NULL
  AND user_positions IS NULL
  AND uploads IS NULL
  AND DATE(imported_at) IN ('2025-11-03', '2025-11-26', '2025-12-04');

-- Verifiera
SELECT source, COUNT(*) FROM public.damages GROUP BY source;
```

---

## 5) Checklista efter import

- [ ] Backup skapad (damages_backup_YYYYMMDD / vehicles_backup_YYYYMMDD)
- [ ] CSV-fil förberedd (rätt kolumnnamn, UTF-8, kommaavgränsad)
- [ ] Import till staging klar (mabi_damage_data_raw_new / vehicles_staging)
- [ ] Dubbletter raderade i staging
- [ ] UPSERT till huvudtabell klar (damages / vehicles)
- [ ] Verifiering klar (rätt antal rader, rätt source för BUHS, legacy_damage_source_text ifylld)
- [ ] `damages_external` uppdaterad (endast för Skadefil)
- [ ] Testregistreringsnummer kontrollerat i `/check` och `/status`

---

## 6) Framtida förbättringar

- **Automatisera CSV-import:** Skapa script som läser CSV direkt och kör alla SQL-steg automatiskt
- **Validering:** Lägg till kontroller för obligatoriska fält (regnr, damage_date, etc.)
- **Loggning:** Spara import-loggar i en separat tabell (import_log) för att kunna spåra historik
- **Notifikationer:** Skicka mejl när import är klar med sammanfattning (antal nya rader, fel, etc.)

---

**Senast uppdaterad:** 2026-01-14  
**Ägare:** Per Andersson (per.andersson@mabi. se)  
**Version:** 2.1 (fixad legacy_damage_source_text-byggande i UPSERT)
