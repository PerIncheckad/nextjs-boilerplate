# CSV-import (BUHS “Skadefilen” och Bilkontroll)

Mål:
- Icke-destruktiv import (rör inte dokumenterade rader; tar aldrig bort Helsingborgs arbete).
- “N2 per datum”: Nya BUHS-rader med nytt datum ska kräva dokumentation; samma datum ska inte trigga igen.
- Snapshots före import.

Förutsättningar:
- Tidszon Europe/Stockholm.
- BUHS hämtas från public.damages (importerade rader har `damage_type_raw` ifylld).
- “Dokumenterade” rader har `legacy_damage_source_text IS NOT NULL`.
- “Nya skador” i appen har typiskt `legacy_damage_source_text IS NULL` och `damage_type_raw IS NULL` (rör inte dessa).

## 1) Snapshots (alltid innan import)

Kör i Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS public.damages_backup_{{YYYYMMDD}} AS TABLE public.damages WITH DATA;
CREATE TABLE IF NOT EXISTS public.vehicles_backup_{{YYYYMMDD}} AS TABLE public.vehicles WITH DATA;
```

Ersätt `{{YYYYMMDD}}` med dagens datum (t.ex. 20251114).

## 2) Skadefilen (BUHS)

### 2.1 Staging tömning + import

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

Töm staging:

```sql
TRUNCATE public.mabi_damage_data_raw_new;
```

Importera din CSV till `public.mabi_damage_data_raw_new` (kolumnnamnen ska matcha exakt).

### 2.2 Upsert till public.damages (icke-destruktiv)

- Normalisera regnr.
- “Import-rader” = rader med `damage_type_raw IS NOT NULL`.
- Dokumenterade rader (legacy_damage_source_text IS NOT NULL) rör vi aldrig.
- “Nya skador” (damage_type_raw IS NULL) rör vi aldrig.

```sql
WITH src AS (
  SELECT
    UPPER(TRIM(regnr)) AS regnr,
    damage_date::date AS damage_date,
    NULL::text AS region,
    NULL::text AS ort,
    NULL::text AS huvudstation_id,
    NULL::text AS station_id,
    NULL::text AS station_namn,
    NULL::text AS damage_type, -- normaliserad typ (app) = NULL för BUHS rå
    damage_type_raw,
    note_customer,
    note_internal,
    vehiclenote,
    saludatum
  FROM public.mabi_damage_data_raw_new
),
-- match befintliga import-rader på regnr + damage_date + råtext (tolerant jämförelse)
match_existing AS (
  SELECT d.id, d.regnr, d.damage_date, d.damage_type_raw, d.note_customer, d.note_internal, d.vehiclenote
  FROM public.damages d
  WHERE d.damage_type_raw IS NOT NULL
)
-- INSERT nya import-rader som inte finns
INSERT INTO public.damages (
  regnr, damage_date, region, ort, huvudstation_id, station_id, station_namn,
  damage_type, damage_type_raw, note_customer, note_internal, vehiclenote,
  saludatum, created_at
)
SELECT
  s.regnr, s.damage_date, s.region, s.ort, s.huvudstation_id, s.station_id, s.station_namn,
  s.damage_type, s.damage_type_raw, s.note_customer, s.note_internal, s.vehiclenote,
  s.saludatum, now()
FROM src s
LEFT JOIN match_existing m
  ON m.regnr = s.regnr
 AND m.damage_date = s.damage_date
 AND COALESCE(m.damage_type_raw,'') = COALESCE(s.damage_type_raw,'')
 AND COALESCE(m.note_customer,'')   = COALESCE(s.note_customer,'')
 AND COALESCE(m.note_internal,'')   = COALESCE(s.note_internal,'')
 AND COALESCE(m.vehiclenote,'')     = COALESCE(s.vehiclenote,'')
WHERE m.id IS NULL;

-- UPDATE befintliga import-rader (endast import-rader – rör ej dokumenterade eller nya skador)
UPDATE public.damages d
SET
  note_customer = s.note_customer,
  note_internal = s.note_internal,
  vehiclenote   = s.vehiclenote,
  saludatum     = s.saludatum,
  updated_at    = now()
FROM public.mabi_damage_data_raw_new s
WHERE d.damage_type_raw IS NOT NULL
  AND UPPER(TRIM(d.regnr)) = UPPER(TRIM(s.regnr))
  AND d.damage_date = s.damage_date
  AND COALESCE(d.damage_type_raw,'') = COALESCE(s.damage_type_raw,'');
```

Verifiering (valfritt):

```sql
-- Nya rader senaste 10 min
SELECT COUNT(*) FROM public.damages WHERE created_at > now() - interval '10 minutes';

-- Stickprov
SELECT regnr, damage_date, damage_type_raw, note_customer, note_internal, vehiclenote, saludatum
FROM public.damages
WHERE created_at > now() - interval '10 minutes'
ORDER BY regnr, damage_date DESC
LIMIT 50;
```

## 3) Bilkontroll (vehicles)

### 3.1 Staging tömning + import

Vi använder `public.vehicles_staging`. Skapa om saknas:

```sql
CREATE TABLE IF NOT EXISTS public.vehicles_staging (
  regnr text,
  brand text,
  model text,
  wheel_storage_location text
);
```

Töm staging:

```sql
TRUNCATE public.vehicles_staging;
```

Importera CSV (rubriker: regnr, brand, model, wheel_storage_location).

### 3.2 Rensa dubbletter i staging

```sql
DELETE FROM public.vehicles_staging a
USING public.vehicles_staging b
WHERE a.ctid < b.ctid
  AND UPPER(TRIM(a.regnr)) = UPPER(TRIM(b.regnr));
```

### 3.3 Upsert till public.vehicles

```sql
-- UPDATE befintliga
UPDATE public.vehicles v
SET brand = s.brand,
    model = s.model,
    wheel_storage_location = s.wheel_storage_location,
    created_at = v.created_at
FROM public.vehicles_staging s
WHERE UPPER(TRIM(v.regnr)) = UPPER(TRIM(s.regnr));

-- INSERT nya
INSERT INTO public.vehicles (regnr, brand, model, wheel_storage_location, created_at)
SELECT UPPER(TRIM(s.regnr)), s.brand, s.model, s.wheel_storage_location, now()
FROM public.vehicles_staging s
LEFT JOIN public.vehicles v ON UPPER(TRIM(v.regnr)) = UPPER(TRIM(s.regnr))
WHERE v.regnr IS NULL;
```

## 4) “N2 per datum” – kontrollfråga (valfri)

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
- Om “app‑standardiserade” texter (”Skadetyp - Placering - Position”) dyker upp i BUHS‑kolumnerna så är de redan app‑dokumenterade; dessa triggar inte ny dokumentation och filtreras även i UI.