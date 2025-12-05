# CSV-import (BUHS "Skadefilen" och Bilkontroll)

Mål:
- Icke-destruktiv import (rör inte dokumenterade rader; tar aldrig bort Helsingborgs arbete).
- "N2 per datum": Nya BUHS-rader med nytt datum ska kräva dokumentation; samma datum ska inte trigga igen.
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

**Originalfil:** `Skador Albarone[dagens datum].xlsx`

**Källa:** Mejlas till per.andersson@mabi.se varje vardag kl 8.

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
4. Spara som **"CSV UTF-8 (kommaavgränsad)"** (.csv)

### 1.2 Bilkontrollfilen

**Originalfil:** `MABISYD Bilkontroll 2024-2025.xlsx`

**Källa:** Finns på MABI Syds OneDrive, ägs av Bilkontroll. Uppdateras oregelbundet (ibland flera gånger i veckan).

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
4. **OBS! Ta bort ALLA andra kolumner**, även de som ser tomma ut till höger (dessa genererar fel i Supabase)
5. Spara som **"CSV UTF-8 (kommaavgränsad)"** (.csv)

---

## 2) Snapshots (alltid innan import)

Kör i Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS public.damages_backup_{{YYYYMMDD}} AS TABLE public.damages WITH DATA;
CREATE TABLE IF NOT EXISTS public.vehicles_backup_{{YYYYMMDD}} AS TABLE public.vehicles WITH DATA;
```

Ersätt `{{YYYYMMDD}}` med dagens datum (t.ex. 20251114).

---

## 3) Skadefilen (BUHS)

### 3.1 Staging-tabell tömning + import

Vi använder staging-tabellen `public.mabi_damage_data_raw_new`. Om den saknas, skapa den:

```sql
CREATE TABLE IF NOT EXISTS public.mabi_damage_data_raw_new (
  regnr text,
  damage_date date,
  damage_type_raw text,
  note_customer text,
  note_internal text,
  vehiclenote text,
  saludatum date
);
```

Töm staging innan import:

```sql
TRUNCATE public.mabi_damage_data_raw_new;
```

Importera din CSV till `public.mabi_damage_data_raw_new` via Supabase Table Editor (kolumnnamnen ska matcha exakt).

### 3.2 Dubbletthantering i staging

Ta bort eventuella dubbletter från staging-tabellen:

```sql
DELETE FROM public.mabi_damage_data_raw_new
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM public.mabi_damage_data_raw_new
  GROUP BY regnr, damage_date, damage_type_raw, note_customer
);
```

### 3.3 UPSERT till public.damages

**Förutsättning:** Tabellen `public.damages` måste ha en UNIQUE constraint `damages_regnr_date_type_customer_unique` på kolumnerna `(regnr, damage_date, damage_type_raw, note_customer)`.

Om constraint saknas, skapa den:

```sql
ALTER TABLE public.damages 
ADD CONSTRAINT damages_regnr_date_type_customer_unique 
UNIQUE (regnr, damage_date, damage_type_raw, note_customer);
```

Kör följande för att lägga till nya skador och uppdatera befintliga:

```sql
INSERT INTO public.damages (regnr, damage_date, damage_type, damage_type_raw, note_customer, note_internal, vehiclenote, saludatum, imported_at)
SELECT 
  regnr,
  damage_date,
  damage_type_raw AS damage_type,
  damage_type_raw,
  note_customer,
  note_internal,
  vehiclenote,
  saludatum,
  NOW() AS imported_at
FROM public.mabi_damage_data_raw_new
ON CONFLICT (regnr, damage_date, damage_type_raw, note_customer) 
DO UPDATE SET
  note_internal = EXCLUDED.note_internal,
  vehiclenote = EXCLUDED.vehiclenote,
  saludatum = EXCLUDED.saludatum,
  imported_at = NOW();
```

### 3.4 Verifiering

Kontrollera att importen lyckades:

```sql
SELECT COUNT(*) AS total_damages FROM public.damages;
```

---

## 4) Bilkontroll (vehicles)

### 4.1 Staging-tabell tömning + import

Vi använder `public.vehicles_staging`. Skapa om saknas:

```sql
CREATE TABLE IF NOT EXISTS public.vehicles_staging (
  regnr text,
  brand text,
  model text,
  wheel_storage_location text
);
```

Töm staging innan import:

```sql
TRUNCATE public.vehicles_staging;
```

Importera CSV via Supabase Table Editor (rubriker: regnr, brand, model, wheel_storage_location).

### 4.2 Dubbletthantering i staging

Ta bort eventuella dubbletter från staging-tabellen:

```sql
DELETE FROM public.vehicles_staging
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM public.vehicles_staging
  GROUP BY UPPER(TRIM(regnr))
);
```

### 4.3 UPSERT till public.vehicles

Uppdatera befintliga fordon och lägg till nya i två steg:

**Steg 1 - UPDATE befintliga fordon:**

```sql
UPDATE public.vehicles v
SET 
  brand = s.brand,
  model = s.model,
  wheel_storage_location = s.wheel_storage_location
FROM public.vehicles_staging s
WHERE UPPER(TRIM(v.regnr)) = UPPER(TRIM(s.regnr));
```

**Steg 2 - INSERT nya fordon:**

```sql
INSERT INTO public.vehicles (regnr, brand, model, wheel_storage_location)
SELECT UPPER(TRIM(s.regnr)), s.brand, s.model, s.wheel_storage_location
FROM public.vehicles_staging s
LEFT JOIN public.vehicles v ON UPPER(TRIM(v.regnr)) = UPPER(TRIM(s.regnr))
WHERE v.regnr IS NULL;
```

### 4.4 Verifiering

Kontrollera att importen lyckades:

```sql
SELECT COUNT(*) AS total_vehicles FROM public.vehicles;
```

---

## 5) "N2 per datum" – kontrollfråga (valfri)

Skador som fortfarande skulle kräva dokumentation per dagens data:

```sql
WITH documented AS (
  SELECT DISTINCT regnr, original_damage_date AS ddate
  FROM public.damages
  WHERE legacy_damage_source_text IS NOT NULL
),
buhs AS (
  SELECT regnr, damage_date AS ddate, damage_type_raw, note_customer, note_internal, vehiclenote
  FROM public.damages
  WHERE damage_type_raw IS NOT NULL
)
SELECT b.*
FROM buhs b
LEFT JOIN documented d ON UPPER(d.regnr)=UPPER(b.regnr) AND d.ddate = b.ddate
WHERE d.regnr IS NULL
ORDER BY b.regnr, b.ddate DESC
LIMIT 500;
```

Tips:
- Om "app‑standardiserade" texter ("Skadetyp - Placering - Position") dyker upp i BUHS‑kolumnerna så är de redan app‑dokumenterade; dessa triggar inte ny dokumentation och filtreras även i UI.

# UPPDATERING 2025-12-05

# CSV-import till Supabase

## Skadefilen (BUHS)

1. Exportera från BUHS
2. Ladda upp till staging-tabell `mabi_damage_data_raw_new`
3.  Kör UPSERT till `damages` via SQL

## Bilkontroll-filen

1.  Exportera från Bilkontroll
2. Ladda upp till `vehicles`-tabellen
3.  Använd RPC `get_vehicle_by_trimmed_regnr` för sökning

## Viktigt

- `legacy_damage_source_text` = NULL → tolkas som nybilsskada
- `legacy_damage_source_text` = text → tolkas som BUHS-skada
- Undvik dubletter genom att matcha på `regnr` + `damage_date`
