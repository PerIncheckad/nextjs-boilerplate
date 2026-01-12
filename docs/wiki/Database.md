# Supabase Databasöversikt

## 1. Tabellöversikt

### Huvudtabeller

| Tabell | Beskrivning |
|--------|-------------|
| `vehicles` | Bilkontroll-filen - importeras via CSV. Innehåller alla tillåtna reg.nr och bildata |
| `nybil_inventering` | Nya bilar registrerade via /nybil-formuläret |
| `checkins` | Alla incheckningar via /check |
| `damages` | Alla skador (från CHECK, NYBIL, och dokumenterade BUHS) |
| `damages_external` | Skadefilen (BUHS) - importeras via CSV, 566 rader |
| `checkin_damages` | En rad per skadeposition (för statistik/rapporter) |

### Viktiga kolumner i `damages`
- `source`: Varifrån skadan kommer - 'CHECK', 'NYBIL', eller 'BUHS'
- `user_type`: Skadetyp vald av användaren (t.ex. "Buckla", "Repa", "Stenskott")
- `legacy_damage_source_text`: Originaltext från Skadefilen när BUHS-skada dokumenteras
- `legacy_loose_key`: Format `REGNR|datum` för matchning

### Viktiga kolumner i `checkins`
- `regnr`, `checker_name`, `checker_email`
- `current_city`, `current_station`, `current_location_note`
- `odometer_km` (äldre) / via drivmedel-jsonb (nyare)
- `wheel_type`, `fuel_type`
- `completed_at`

### Viktiga kolumner i `nybil_inventering`
- `regnr`, `bilmarke`, `modell`, `bransletyp`
- `registrerad_av`, `registreringsdatum`
- `hjultyp`, `matarstallning_inkop`
- `is_sold`, `sold_date`

### Viktiga kolumner i `vehicles`
- `regnr`, `brand`, `model`
- `wheel_storage_location`
- `is_sold`, `sold_date`

## 2. Dataflöden

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  CSV-import     │     │   /nybil        │     │   /check        │
│  (Bilkontroll)  │     │   (formulär)    │     │   (formulär)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         ▼                       ▼                       ▼
   ┌──────────┐          ┌──────────────────┐    ┌──────────────┐
   │ vehicles │          │ nybil_inventering│    │   checkins   │
   └──────────┘          └────────┬─────────┘    └──────┬───────┘
                                  │                     │
                                  ▼                     ▼
                         ┌─────────────────────────────────┐
                         │            damages              │
                         │  (source = 'NYBIL' / 'CHECK')   │
                         └─────────────────────────────────┘

┌─────────────────┐
│  CSV-import     │
│  (Skadefilen)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      Vid dokumentering      ┌─────────────┐
│damages_external │  ──────────────────────►    │   damages   │
│   (BUHS-data)   │                             │(source=BUHS)│
└─────────────────┘                             └─────────────┘
```

## 3. RPC-funktioner

| Funktion | Beskrivning |
|----------|-------------|
| `get_all_allowed_plates()` | Returnerar alla tillåtna reg.nr (UNION av vehicles + nybil_inventering). Används för autocomplete |
| `get_vehicle_by_trimmed_regnr(p_regnr)` | Hämtar bildata från vehicles med normaliserat reg.nr |
| `damages_lookup_any(p_car_id, p_reg)` | Dynamisk sökning i alla skade-tabeller |
| `get_damages_by_trimmed_regnr(p_regnr)` | Hämtar skador för ett reg.nr |
| `get_nybil_baseline(p_regnr)` | Hämtar baseline-data från nybil_inventering |

## 4. Storage Buckets

| Bucket | Beskrivning | Mappstruktur |
|--------|-------------|--------------|
| `damage-photos` | Skadebilder från /check | `{REGNR}/{REGNR}-{DATUM}/{filnamn}` |
| `nybil-photos` | Bilder från /nybil | `{REGNR}/{REGNR}-{DATUM}-NYBIL/{filnamn}` |

## 5. Source-värden i damages

| Source | Beskrivning | Antal (jan 2026) |
|--------|-------------|------------------|
| `CHECK` | Skador registrerade via /check | ~680+ |
| `BUHS` | Dokumenterade BUHS-skador | ~37 |
| `NYBIL` | Skador registrerade via /nybil | 0 (rensade testdata) |

## 6. Vanliga SQL-frågor för felsökning

```sql
-- Räkna rader i viktiga tabeller
SELECT 
  (SELECT COUNT(*) FROM vehicles) as vehicles,
  (SELECT COUNT(*) FROM nybil_inventering) as nybil,
  (SELECT COUNT(*) FROM damages) as damages,
  (SELECT COUNT(*) FROM checkins) as checkins;

-- Source-fördelning i damages
SELECT source, COUNT(*) FROM damages GROUP BY source;

-- Hitta skador för ett specifikt reg.nr
SELECT * FROM damages WHERE UPPER(REPLACE(regnr, ' ', '')) = 'ABC123';

-- Hitta senaste incheckning för ett reg.nr
SELECT * FROM checkins 
WHERE UPPER(REPLACE(regnr, ' ', '')) = 'ABC123' 
ORDER BY completed_at DESC LIMIT 1;

-- Rensa testdata (exempel)
DELETE FROM damages WHERE regnr IN ('TESTXX', 'AAAAAA');
DELETE FROM checkins WHERE regnr IN ('TESTXX', 'AAAAAA');
DELETE FROM nybil_inventering WHERE regnr IN ('TESTXX', 'AAAAAA');
```

## 7. Index

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_damages_regnr_legacy_text
  ON public.damages (regnr, legacy_damage_source_text)
  WHERE legacy_damage_source_text IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_damages_legacy_loose_key
  ON public.damages (legacy_loose_key)
  WHERE legacy_loose_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_damages_regnr_loose
  ON public.damages (regnr, original_damage_date, legacy_loose_key);
```

## 8. Noteringar

- **ESN24G**: Äkta test-incheckning gjord 2025-12-02 av Per Andersson. Ska behållas.
- **Testdata**: Alla fake reg.nr (AAAAAA, 111111, etc.) har rensats januari 2026.
- **BUHS**: "Befintliga Uppkomna Historiska Skador" - skador som fanns före systemets lansering.
