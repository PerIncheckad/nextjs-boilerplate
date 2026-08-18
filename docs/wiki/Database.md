# Database - Supabase

Detta dokument beskriver databasstrukturen för Incheckad-systemet.  

---

## 📋 Snabblänkar

- [Översikt](#översikt)
- [Tabeller](#tabeller)
- [Constraints & Giltiga Värden](#constraints--giltiga-värden) ⭐ NYA
- [Storage Buckets](#storage-buckets)
- [RPC-funktioner](#rpc-funktioner)
- [Dataflöde](#dataflöde)
- [Matchningslogik för BUHS-skador](#matchningslogik-för-buhs-skador)
- [Vanliga SQL-frågor](#vanliga-sql-frågor-för-felsökning)

**Se även:**
- [database-constraints.md](./database-constraints.md) - Detaljerad constraint-referens
- [CSV-import. md](./CSV-import.md) - CSV-import av BUHS & Bilkontroll
- [troubleshooting.md](./troubleshooting.md) - Felsökning

---

## Översikt

Systemet använder Supabase (PostgreSQL) med följande huvudtabeller:

| Tabell | Syfte | Källa |
|--------|-------|-------|
| `checkins` | Incheckningar av fordon | `/check`-formulär |
| `checkin_damages` | Skador kopplade till specifik incheckning | `/check`-formulär |
| `damages` | Konsoliderad skadehistorik per fordon | `/check`, `/nybil`, CSV-import |
| `damages_external` | Rollback-snapshot från före Steg 3.2B-1; inte live-källa | Ingen löpande skrivning |
| `nybil_inventering` | Nybilsregistreringar vid leverans | `/nybil`-formulär |
| `vehicles` | Fordonsmaster från Bilkontroll | CSV-import (manuell) |

---

## Tabeller

### checkins

Lagrar varje incheckning av ett fordon.  

| Kolumn | Typ | Nullable | Default | Beskrivning |
|--------|-----|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | Primärnyckel |
| `created_at` | timestamptz | NO | now() | Skapad tidpunkt |
| `regnr` | text | NO | - | Registreringsnummer (UPPERCASE) |
| `notes` | text | YES | - | Anteckningar |
| `photo_urls` | text[] | YES | '{}' | Foto-URLer |
| `station_id` | uuid | YES | - | Stations-ID (FK) |
| `station_other` | text | YES | - | Annan station (fritext) |
| `employee_id` | uuid | YES | - | Anställd-ID |
| `regnr_valid` | boolean | YES | - | Regnr validerat |
| `no_damage` | boolean | YES | false | Inga skador |
| `odometer_km` | integer | YES | - | Mätarställning i km (>=0) |
| `fuel_full` | boolean | YES | - | Fulltankad |
| `adblue_ok` | boolean | YES | - | AdBlue OK |
| `washer_ok` | boolean | YES | - | Spolarvätska OK |
| `cargo_cover_ok` | boolean | YES | - | Lastskydd OK |
| `charge_cables_count` | smallint | YES | - | Antal laddkablar (legacy) |
| `no_new_damage` | boolean | YES | - | Inga nya skador |
| `tires_type` | text | YES | - | Däcktyp:   'sommar' \| 'vinter' |
| `privacy_cover_ok` | boolean | YES | - | Insynsskydd OK |
| `wheel_type` | text | YES | - | Hjultyp:  'sommar' \| 'vinter' |
| `chargers_count` | integer | YES | - | Antal laddare |
| `parcel_shelf_ok` | boolean | YES | - | Hatthylla OK |
| `wheels_on` | USER-DEFINED | YES | - | Monterade hjul |
| `charging_cables` | smallint | YES | - | Laddkablar (0-2) |
| `wash_needed` | boolean | YES | - | Tvätt behövs |
| `vacuum_needed` | boolean | YES | - | Dammsugning behövs |
| `region` | text | YES | - | Region:   'NORR' \| 'MITT' \| 'SYD' ⭐ |
| `city` | text | YES | - | Stad för incheckning |
| `station` | text | YES | - | Station för incheckning |
| `status` | text | YES | - | Status:  NULL \| 'checked_in' \| 'COMPLETED' ⭐ |
| `checklist` | jsonb | YES | '{}' | Checklista (se struktur nedan) |
| `tvattad` | boolean | YES | - | Tvättad |
| `rekond_behov` | boolean | YES | - | Rekond behövs |
| `has_new_damages` | boolean | YES | false | Har nya skador |
| `plate_video_confirmed` | boolean | YES | false | Regskyltvideo bekräftad |
| `started_by` | uuid | YES | - | Startad av (user ID) |
| `completed_by` | uuid | YES | - | Slutförd av (user ID) |
| `started_at` | timestamptz | YES | now() | Starttid |
| `completed_at` | timestamptz | YES | - | Sluttid |
| `locked_by` | uuid | YES | - | Låst av |
| `locked_until` | timestamptz | YES | - | Låst till |
| `updated_at` | timestamptz | YES | now() | Uppdaterad |
| `adblue` | text | YES | - | AdBlue-status |
| `current_city` | text | YES | - | Bilen står nu:   Ort |
| `current_station` | text | YES | - | Bilen står nu:  Station |
| `current_location_note` | text | YES | - | Platsnotering |
| `checker_name` | text | YES | - | Incheckarens namn |
| `checker_email` | text | YES | - | Incheckarens email |
| `has_documented_buhs` | boolean | YES | - | Har dokumenterat BUHS-skador |
| `fuel_type` | text | YES | - | Bränsletyp (Bensin/Diesel/El) |
| `fuel_level_percent` | smallint | YES | - | Bränslenivå % |
| `fuel_liters` | numeric | YES | - | Tankade liter |
| `fuel_price_per_liter` | numeric | YES | - | Literpris |
| `fuel_currency` | text | YES | 'SEK' | Valuta |
| `charge_level_percent` | smallint | YES | - | Laddningsnivå % |
| `drivmedel` | jsonb | YES | - | Drivmedelsinfo |
| `hjultyp` | text | YES | - | Hjultyp (fritext för visning) |

#### checklist (jsonb) struktur

```json
{
  "rental_unavailable": boolean,
  "rental_unavailable_comment": string,
  "warning_light_on": boolean,
  "warning_light_comment": string,
  "pet_sanitation_needed": boolean,
  "pet_sanitation_comment": string,
  "pet_sanitation_folder": string,
  "smoking_sanitation_needed": boolean,
  "smoking_sanitation_comment":  string,
  "smoking_sanitation_folder": string,
  "privacy_cover_missing": boolean,
  "rekond_comment": string,
  "rekond_folder": string
}
```

---

### checkin_damages

Skador dokumenterade vid en specifik incheckning.

| Kolumn | Typ | Nullable | Default | Beskrivning |
|--------|-----|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | Primärnyckel |
| `created_at` | timestamptz | NO | now() | Skapad tidpunkt |
| `checkin_id` | uuid | NO | - | FK till checkins. id |
| `description` | text | NO | '' | Beskrivning/kommentar |
| `photo_urls` | text[] | NO | '{}' | Foto-URLer |
| `type` | varchar | YES | - | Typ:  'new' \| 'documented' \| 'not_found' \| 'existing' |
| `damage_type` | varchar | YES | - | Skadetyp (JACK, REPA, REPOR, etc.) |
| `car_part` | varchar | YES | - | Bildel (Dörr utsida, Motorhuv, etc.) |
| `position` | varchar | YES | - | Position (Höger fram, Vänster bak, etc.) |
| `video_urls` | text[] | YES | - | Video-URLer |
| `positions` | jsonb | YES | - | Positioner (array, se struktur nedan) |
| `regnr` | text | YES | - | Registreringsnummer (UPPERCASE) |

**OBS! ** `checkin_damages` har **INTE** kolumnen `note_customer` (finns endast i `damages`).

#### type-värden

| Värde | Beskrivning | När används |
|-------|-------------|-------------|
| `new` | Ny skada dokumenterad vid denna incheckning | `/check` - "Nya skador" |
| `documented` | Befintlig BUHS-skada dokumenterad med foton | `/check` - "Hantera befintliga" |
| `existing` | Befintlig BUHS-skada bekräftad | `/check` - "Hantera befintliga" |
| `not_found` | Befintlig BUHS-skada kunde inte hittas | `/check` - "Hantera befintliga" |

#### positions (jsonb) struktur

```json
[
  {
    "id": "pos-1768219789568",
    "carPart": "Dörr utsida",
    "position":  "Höger bak"
  }
]
```

---

### damages

Konsoliderad skadehistorik per fordon.   Innehåller både BUHS-importerade skador och skador från incheckningar.

| Kolumn | Typ | Nullable | Default | Beskrivning |
|--------|-----|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | Primärnyckel |
| `regnr` | text | NO | - | Registreringsnummer (UPPERCASE) |
| `damage_date` | date | YES | - | Skadedatum |
| `region` | text | YES | - | Region |
| `ort` | text | YES | - | Ort |
| `huvudstation_id` | text | YES | - | Huvudstation-ID |
| `station_id` | text | YES | - | Station-ID |
| `station_namn` | text | YES | - | Stationsnamn |
| `damage_type` | text | YES | - | Skadetyp (normaliserad, UPPERCASE) |
| `description` | text | YES | - | Beskrivning |
| `status` | text | YES | - | Status (complete, etc.) |
| `inchecker_name` | text | YES | - | Incheckarens namn |
| `inchecker_email` | text | YES | - | Incheckarens email |
| `created_at` | timestamptz | YES | now() | Skapad tidpunkt |
| `updated_at` | timestamptz | YES | now() | Uppdaterad tidpunkt |
| `saludatum` | date | YES | - | Saludatum (från BUHS) |
| `damage_type_raw` | text | YES | - | Skadetyp (rå, som användaren valde) |
| `note_customer` | text | YES | - | Kundnotering (från BUHS) |
| `note_internal` | text | YES | - | Intern notering (från BUHS) |
| `vehiclenote` | text | YES | - | Fordonsnotering |
| `media_url` | text | YES | - | Media-URL (legacy) |
| `notering` | text | YES | - | Notering |
| `legacy_damage_source_text` | text | YES | - | Original BUHS-text för matchning ⭐ |
| `user_type` | text | YES | - | Skadetyp vald av användare (Jack, Repa, etc.) |
| `user_positions` | jsonb | YES | - | Positioner (samma format som checkin_damages) |
| `original_damage_date` | date | YES | - | Ursprungligt skadedatum |
| `legacy_loose_key` | text | YES | - | Legacy matchningsnyckel |
| `uploads` | jsonb | YES | - | Media-uploads (se struktur nedan) |
| `imported_at` | timestamptz | YES | now() | Importerad tidpunkt |
| `source` | text | YES | 'CHECK' | Källa:   'CHECK' \| 'NYBIL' \| 'BUHS' ⭐ |
| `nybil_inventering_id` | uuid | YES | - | FK till nybil_inventering.id |

#### uploads (jsonb) struktur

```json
{
  "folder": "GFX46X/GFX46X-20251216/20251216-jack-dorr-utsida-hoger-fram-oliwer",
  "photo_urls": ["https://...supabase.co/storage/v1/object/public/damage-photos/... "],
  "video_urls": []
}
```

#### source-värden

| Värde | Beskrivning | Används när |
|-------|-------------|-------------|
| `CHECK` | Skada från incheckning | `/check`-formulär → `/api/notify` |
| `NYBIL` | Skada från nybilsinventering | `/nybil`-formulär → `/api/notify-nybil` |
| `BUHS` | Skada importerad från BUHS-systemet | CSV-import (manuell) |

#### legacy_damage_source_text - Matchning & Spårbarhet

**Typ:** `TEXT` (nullable)

**Värden:**
- `NULL` - Ny skada dokumenterad i appen (från `/check` eller `/nybil`)
- `'buhs_csv_import|YYYY-MM-DD|Typ|Notering'` - CSV-import från BUHS (manuell)
- `'buhs_v1_api|..  .'` - BUHS API-import (automatisk, framtida)
- `'Beskrivande text'` - Gamla BUHS-skador (före systematisk import, legacy)

**Används för:**
- **Loose matching** i `/check` - Identifierar och filtrerar BUHS-dubbletter från olika källor
- **Idempotens vid CSV-import** - Förhindrar duplicering via unique constraint
- **Spårbarhet** - Identifierar datakälla och tidpunkt för varje skada

**Exempel:**
```sql
-- CSV-import genererar unik text per skada:   
'buhs_csv_import|2025-12-22|Buckla|Buckla+ lack förarsida, 3 bucklor.'

-- Loose matching matchar alla som börjar med 'buhs_': 
SELECT * FROM damages 
WHERE legacy_damage_source_text LIKE 'buhs_%' 
  AND regnr = 'GDE67X'
  AND original_damage_date = '2025-12-22';
Se även:

csv-import-dubbel-rad. md - Loose matching-logik
CSV-import-skador - gör så här. md - Import-process
database-constraints.md - Unique constraint på detta fält

---

### damages_external

Tabellen innehåller den BUHS-snapshot som fanns när Steg 3.2B-1 förbereddes. Den behålls oförändrad under verifieringsperioden eftersom RPC:ns returtyp fortfarande är `SETOF damages_external`.

Live-data hämtas inte längre från tabellraderna. `get_damages_by_trimmed_regnr` projicerar samma sju kolumner från `damages WHERE source = 'BUHS'`.

| Kolumn | Typ | Nullable | Beskrivning |
|--------|-----|----------|-------------|
| `regnr` | text | NO | Registreringsnummer |
| `saludatum` | date | YES | Saludatum |
| `damage_date` | date | YES | Skadedatum |
| `damage_type_raw` | text | YES | Skadetyp |
| `note_customer` | text | YES | Kundnotering |
| `note_internal` | text | YES | Intern notering |
| `vehiclenote` | text | YES | Fordonsnotering |

**Driftregel:** skriv inte, töm inte och synkronisera inte `damages_external`. BUHS-importen skriver endast till `damages`.

---

### nybil_inventering

Nybilsregistreringar vid leverans till MABI.  

| Kolumn | Typ | Nullable | Default | Beskrivning |
|--------|-----|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | Primärnyckel |
| `created_at` | timestamptz | NO | now() | Skapad tidpunkt |
| `updated_at` | timestamptz | NO | now() | Uppdaterad tidpunkt |
| `regnr` | text | NO | - | Registreringsnummer (UPPERCASE) |
| `ankomstdatum` | date | YES | - | Ankomstdatum |
| `fordonstyp` | text | YES | - | Fordonstyp |
| `bilmarke` | text | YES | - | Bilmärke |
| `bilmodell` | text | YES | - | Bilmodell (legacy) |
| `modell` | text | YES | - | Modell |
| `vaxel` | text | YES | - | Växellåda |
| `bransletyp` | text | YES | - | Bränsletyp:   'bensin_diesel' \| 'elbil' \| 'hybrid' \| 'laddhybrid' ⭐ |
| `mabi_nr` | text | YES | - | MABI-nummer |
| `dragkrok` | boolean | YES | - | Har dragkrok |
| `gummimattor` | boolean | YES | - | Har gummimattor |
| `instruktionsbok` | boolean | YES | - | Har instruktionsbok |
| `coc` | boolean | YES | - | Har COC-dokument |
| `lasbultar_med` | boolean | YES | - | Låsbultar medföljer |
| `dackkompressor` | boolean | YES | - | Har däckkompressor |
| `serviceintervall` | integer | YES | - | Serviceintervall (km) |
| `max_km_manad` | integer | YES | - | Max km/månad |
| `avgift_over_km` | integer | YES | - | Avgift över-km (kr) |
| `antal_nycklar` | smallint | YES | - | Antal nycklar |
| `antal_laddkablar` | integer | YES | - | Antal laddkablar |
| `antal_insynsskydd` | smallint | YES | - | Antal insynsskydd |
| `hjultyp` | text | YES | - | Monterad hjultyp |
| `hjul_forvaring` | text | YES | - | Hjulförvaring (legacy) |
| `hjul_forvaring_ort` | text | YES | - | Hjulförvaring ort |
| `hjul_forvaring_spec` | text | YES | - | Hjulförvaring specifikation |
| `extranyckel_forvaring_ort` | text | YES | - | Extranyckel ort |
| `extranyckel_forvaring_spec` | text | YES | - | Extranyckel specifikation |
| `laddkablar_forvaring_ort` | text | YES | - | Laddkablar ort |
| `laddkablar_forvaring_spec` | text | YES | - | Laddkablar specifikation |
| `instruktionsbok_forvaring_ort` | text | YES | - | Instruktionsbok ort |
| `instruktionsbok_forvaring_spec` | text | YES | - | Instruktionsbok specifikation |
| `coc_forvaring_ort` | text | YES | - | COC ort |
| `coc_forvaring_spec` | text | YES | - | COC specifikation |
| `plats_mottagning_ort` | text | YES | - | Mottagningsplats ort |
| `plats_mottagning_station` | text | YES | - | Mottagningsplats station |
| `plats_aktuell_ort` | text | YES | - | Aktuell plats ort |
| `plats_aktuell_station` | text | YES | - | Aktuell plats station |
| `matarstallning_inkop` | integer | YES | - | Mätarställning vid inköp |
| `matarstallning_aktuell` | integer | YES | - | Aktuell mätarställning |
| `tankstatus` | text | YES | - | Tankstatus:   NULL \| 'mottogs_fulltankad' \| 'tankad_nu' \| 'ej_upptankad' ⭐ |
| `upptankning_liter` | numeric | YES | - | Upptankade liter |
| `upptankning_literpris` | numeric | YES | - | Literpris |
| `laddniva_procent` | smallint | YES | - | Laddningsnivå % |
| `planerad_station` | text | YES | - | Planerad station |
| `klar_for_uthyrning` | boolean | YES | - | Klar för uthyrning |
| `klar_for_uthyrning_notering` | text | YES | - | Notering om ej klar |
| `ej_uthyrningsbar_anledning` | text | YES | - | Anledning ej uthyrningsbar |
| `har_skador_vid_leverans` | boolean | YES | false | Hade skador vid leverans |
| `anteckningar` | text | YES | - | Anteckningar |
| `photo_urls` | text[] | YES | - | Foto-URLer |
| `video_urls` | text[] | YES | - | Video-URLer |
| `media_folder` | text | YES | - | Media-mapp |
| `registrerad_av` | text | YES | - | Registrerad av (email) |
| `fullstandigt_namn` | text | YES | - | Registrerarens fullständiga namn |
| `registreringsdatum` | date | NO | CURRENT_DATE | Registreringsdatum |
| `saludatum` | text | YES | - | Planerat saludatum |
| `salu_station` | text | YES | - | Salustation |
| `kopare_foretag` | text | YES | - | Köpare företag |
| `returort` | text | YES | - | Returort |
| `returadress` | text | YES | - | Returadress |
| `attention` | text | YES | - | Attention |
| `stold_gps` | text | YES | - | Stöld-GPS status |
| `stold_gps_spec` | text | YES | - | Stöld-GPS specifikation |
| `mbme_aktiverad` | boolean | YES | - | MB ME aktiverad |
| `vw_connect_aktiverad` | boolean | YES | - | VW Connect aktiverad |
| `is_duplicate` | boolean | YES | false | Är duplikat |
| `duplicate_group_id` | uuid | YES | - | Duplikatgrupp-ID |
| `is_sold` | boolean | YES | false | Är såld |
| `sold_date` | date | YES | - | Såld datum |

---

### vehicles

Fordonsmaster från Bilkontroll-filen (BUHS).

| Kolumn | Typ | Nullable | Default | Beskrivning |
|--------|-----|----------|---------|-------------|
| `regnr` | text | NO | - | Primärnyckel (registreringsnummer, UPPERCASE) |
| `brand` | text | YES | - | Bilmärke |
| `model` | text | YES | - | Modell |
| `wheel_storage_location` | text | YES | - | Hjulförvaringsplats |
| `created_at` | timestamptz | YES | now() | Skapad tidpunkt |
| `updated_at` | timestamptz | YES | now() | Uppdaterad tidpunkt ⭐ NYT |
| `is_sold` | boolean | YES | false | Är såld |
| `sold_date` | date | YES | - | Såld datum |

**Uppdateras via:** CSV-import från Bilkontrollfilen (MABISYD Bilkontroll 2024-2025.xlsx)

**Se:** [CSV-import.md § 3](./CSV-import.md#3-importera-bilkontrollfilen)

---

## Constraints & Giltiga Värden

### checkins-constraints

| Fält | Constraint | Giltiga värden |
|------|-----------|---------------|
| `region` | `checkins_region_chk` | `'NORR'`, `'MITT'`, `'SYD'` |
| `status` | `checkins_status_chk` | `NULL`, `'checked_in'`, `'COMPLETED'` |
| `tires_type` | `checkins_tires_type_check` | `'sommar'`, `'vinter'` |
| `wheel_type` | `checkins_wheel_type_check` | `'sommar'`, `'vinter'` |
| `charging_cables` | `checkins_charging_cables_check` | `0`, `1`, `2` |
| `odometer_km` | `checkins_odometer_km_check` | `>= 0` |

**OBS!  Case-sensitivity:**
- `region`: VERSALER (`'SYD'` ✅, `'Syd'` ❌)
- `status`: BLANDAD (`'COMPLETED'` ✅, `'checked_in'` ✅, `'completed'` ❌)
- `tires_type`, `wheel_type`: GEMENER (`'vinter'` ✅, `'VINTER'` ❌)

**Detaljerad referens:** [database-constraints.md](./database-constraints.md)

---

## Storage Buckets

### damage-photos

Offentlig bucket för skadefoton från `/check`.

**Mappstruktur:**
```
damage-photos/
└── {REGNR}/
    └── {REGNR}-{YYYYMMDD}/
        └── {YYYYMMDD}-{skadetyp}-{bildel}-{position}-{incheckare}/
            ├── {REGNR}-{YYYYMMDD}-{skadetyp}-{bildel}-{position}_1.jpg
            ├── {REGNR}-{YYYYMMDD}-{skadetyp}-{bildel}-{position}_2.jpg
            └── kommentar.txt
```

**Exempel:**
```
damage-photos/
└── GFX46X/
    └── GFX46X-20251216/
        └── 20251216-jack-dorr-utsida-hoger-fram-oliwer/
            ├── GFX46X-20251216-jack-dorr-utsida-hoger-fram_1.jpg
            └── kommentar.txt
```

### nybil-photos

Offentlig bucket för nybilsfoton från `/nybil`.

**Mappstruktur:**
```
nybil-photos/
└── {REGNR}/
    └── {REGNR}-{YYYYMMDD}/
        ├── {REGNR}-framifran. jpg
        ├── {REGNR}-bakifran.jpg
        └── skador/
            └── {skadetyp}-{position}/
                └── {REGNR}-{skadetyp}-{position}_1.jpg
```

---

## RPC-funktioner

### get_vehicle_by_trimmed_regnr

Hämtar fordonsinfo från `vehicles`-tabellen med trimmad sökning.

```sql
get_vehicle_by_trimmed_regnr(p_regnr text)
```

**Returnerar:** Första matchande rad från `vehicles` där `TRIM(UPPER(regnr)) = TRIM(UPPER(p_regnr))`

---

### get_damages_by_trimmed_regnr

Hämtar BUHS-skador från den kanoniska `damages`-tabellen.

```sql
get_damages_by_trimmed_regnr(p_regnr text)
```

**Returnerar:** De sju befintliga RPC-fälten för rader där `source = 'BUHS'` och `TRIM(UPPER(regnr)) = TRIM(UPPER(p_regnr))`.

RPC-signaturen är fortsatt `SETOF damages_external` för att bevara browserkontraktet, men tabellraderna i `damages_external` används inte som live-källa.

---

## Dataflöde

### Vid incheckning (/check → /api/notify)

1. **checkins**:  Ny rad skapas med fordons- och incheckarinfo
2. **checkin_damages**: Rad per skada (nya + hanterade BUHS)
3. **damages**: Rad per NY skada (source = 'CHECK')

### Vid nybilsinventering (/nybil → /api/notify-nybil)

1. **nybil_inventering**: Ny rad med all fordonsinfo
2. **damages**:  Rad per skada (source = 'NYBIL')

### Vid /status-sökning

1. Hämtar data från: `nybil_inventering`, `vehicles`, `damages`, `checkins`, `checkin_damages` samt BUHS-projektionen via RPC
2. Prioritetsordning för fordonsinfo: `checkins` (senaste) → `nybil_inventering` → `vehicles`
3. Alla skador hämtas från `damages`; BUHS-delen filtreras via RPC

### Vid /check-sökning (faktarutan)

1. Hämtar fordonsinfo via `get_vehicle_by_trimmed_regnr` (från `vehicles`)
2. Hämtar BUHS-skador via `get_damages_by_trimmed_regnr` (från `damages WHERE source = 'BUHS'`)
3. Hämtar dokumenterade skador från `damages` (för att avgöra `is_inventoried`)
4. Hämtar senaste `checkin_damages` för att visa hanteringsstatus

---

## Viktigt att veta

### damage_type vs user_type vs damage_type_raw

| Kolumn | Innehåll | Användning |
|--------|----------|------------|
| `damage_type` | Normaliserad (UPPERCASE): JACK, REPA, REPOR | Matchning, filtrering |
| `damage_type_raw` | Originaltext:  Jack, Repa, Repor | Visning i /status |
| `user_type` | Användarens val:  Jack, Repa, Repor | Legacy, samma som damage_type_raw |

### user_positions (jsonb)

Används för att lagra strukturerade positioner för skador: 

```json
[{"id": "pos-123", "carPart": "Dörr utsida", "position": "Höger fram"}]
```

Koden i `/status` använder detta för att bygga skadetyp-strängen:  `"Jack - Dörr utsida - Höger fram"`

### uploads (jsonb)

Innehåller referens till media i Storage: 

```json
{
  "folder": "GFX46X/GFX46X-20251216/20251216-jack-dorr-utsida-hoger-fram-oliwer",
  "photo_urls": ["https://..."],
  "video_urls":  []
}
```

`folder` används för att bygga "Visa media"-länken i /status. 

---

## Matchningslogik för BUHS-skador

### Hur `is_inventoried` bestäms (lib/damages.ts)

En BUHS-skada markeras som `is_inventoried = true` (och visas INTE i "Befintliga skador att hantera") om **någon** av följande villkor uppfylls:

1. **Textmatchning (primär):** Det finns en rad i `damages`-tabellen med matchande `legacy_damage_source_text`

2. **Loose BUHS Matching (NY!):** Om `legacy_damage_source_text` börjar med `'buhs_'` matchas alla källor med samma datum

3. **Checkin_damage-matchning:** Skadan matchas mot en `checkin_damage` via textlikhet eller skadetyp

4. **Datum-baserad backup (PR #234):** Om: 
   - `senaste_incheckning > BUHS_skadedatum`
   - OCH det finns minst en `checkin_damage` för fordonet med type IN ('documented', 'not_found', 'existing')
   - → Då antas alla BUHS-skador från det datumet eller tidigare vara hanterade

**Varför datum-backup behövs:** Om någon ändrar BUHS-texten i källsystemet efter att skadan dokumenterats, misslyckas textmatchningen.  Datum-logiken förhindrar att skadan dyker upp som "att hantera" igen.

**Detaljerad dokumentation:** [csv-import-dubbel-rad.md](./csv-import-dubbel-rad.md)

### Normalisering av skadetexter för matchning

För att matcha skador mellan olika källor (BUHS och checkin_damages) normaliseras texterna via två funktioner:

#### `normalizeTextForMatching()`

Används för att jämföra beskrivningar och skadetyper mellan källor. Hanterar:

- **Svenska tecken:** Konverterar ä→a, ö→o, å→a
- **Underscore:** Konverterar underscore till mellanslag (FALGSKADA_SOMMARHJUL → falgskada sommarhjul)
- **Whitespace:** Normaliserar mellanslag
- **Gemener:** Konverterar till lowercase
- **Varianter:** Repor → Repa

**Exempel:**
- BUHS-format: "Fälgskada sommarhjul" → "falgskada sommarhjul"
- checkin_damages-format: "FALGSKADA_SOMMARHJUL" → "falgskada sommarhjul"
- Dessa matchar nu korrekt!

#### `normalizeDamageTypeForKey()`

Används för looser nyckelbaserad matchning. Tar bort alla mellanslag och underscores för kompakt jämförelse:

- **Svenska tecken:** ä→a, ö→o, å→a
- **Underscore:** Tas bort helt
- **Whitespace:** Tas bort helt
- **Synonymer:** skrapmärke→skrap, stenskott→sten, repa→rep

**Exempel:**
- "Övrig skada" → "ovrigskada"
- "OVRIGT" → "ovrigt"

**Varför behövs detta?**

BUHS-systemet lagrar skador med:
- Svenska tecken (ä, ö, å)
- Mellanslag mellan ord
- Mixade versaler/gemener

checkin_damages-tabellen lagrar skador med:
- Inga svenska tecken (ä→A, ö→O, å→A)
- Underscores istället för mellanslag
- VERSALER

Utan denna normalisering skulle "Fälgskada sommarhjul" och "FALGSKADA_SOMMARHJUL" aldrig matcha, vilket leder till:
- Dubbletter i HISTORIK-sektionen
- Fel hanteringsstatus
- Saknade skador

---

## Matchningslogik för BUHS-/CHECK-skador (dedup + historik)

**Stabil nyckel (stableKey)**  
- `stableKey = normalize(legacy_damage_source_text) + "_" + toDateOnly(original_damage_date || damage_date)`  
- `normalize`: gemener, trim, komprimerar whitespace, “repor” → “repa”.  
- `toDateOnly`: tar YYYY-MM-DD och strippar tidsdel (om “T” finns).  
- BUHS (legacy/RPC): datum = `damage_date`.  
- CHECK (damages med `legacy_damage_source_text`): datum = `original_damage_date` || (fallback: BUHS text→date-map) || `damage_date` || `created_at`.

**Merge-regler (Map-baserad dedup)**  
- Lägg BUHS först (stableKey ovan).  
- Lägg CHECK:  
  - Om stableKey finns → MERGE (CHECK vinner på titel/positions/media).  
  - Om stableKey saknas → ADD.  
- Ignorera nybil/newDamage utan `legacy_damage_source_text` när legacy finns (för att undvika falska matchningar).  
- `antalSkador = size(damageMap)` efter merge (används för “Antal registrerade skador”).

**Media-prio**  
- Media/folder/photo_urls: CHECK först, annars BUHS.  
- Visa “Visa media” endast om folder/photo_urls finns; ingen länk till tom mapp.

**checkin_damages**  
- Används för documented/not_found/existing/new.  
- Om tabellen är tom → inga spökrader.  
- Matchning till BUHS/CHECK via stableKey + text/typ (enligt kod i lib/vehicle-status.ts).

**Historik**  
- En SKADA-händelse per stableKey:  
  - Dokumenterad BUHS: “Dokumenterad <datum> av <checker>” (+ ev. BUHS-ursprungstext).  
  - not_found: visar status med kommentar.  
  - Unmatched BUHS: visas utan status (bara skadetext).  
  - Media-länk om folder finns.  
- Incheckningshändelse visar “Skador hanterade” för skador som matchar incheckningen (documented/not_found/existing) via stableKey/date-match.

**Datumformat**  
- All matching använder date-only (YYYY-MM-DD) utan tidsdel för att undvika drift (t.ex. “2025-04-16” vs “2025-04-16T00:00:00Z”).

**Speciella fall**  
- GEU29F: särskild hantering i koden (kan noteras separat); annars gäller reglerna ovan.

---

## Om `checkinWhereDocumented` och korrekt damage matchning

Vid visning av incheckningshistorik används **fältet** `checkinWhereDocumented` i damageRecords (byggt i JavaScript/TypeScript ��� **ej samma som något fysiskt fält i Supabase**) för att visa vilka BUHS-skador som “hanterades” vid en viss incheckning. Det är denna logik som avgör vilka befintliga skador som visas under t.ex.:

```
Befintliga skador hanterade:
3. Övrig skada - Bagagelucka - Utsida [...datum...]
...osv...
```

### Kritisk logik & vanligt fel

- Om endast exempelvis **1 av 3** BUHS-skador får denna flagg (`checkinWhereDocumented = checkin.id`), kommer endast en att synas vid rendering, även om flera i praktiken “hanterats”.
- Det är **vid byggandet av damageRecords i “PASS 1”** i `lib/vehicle-status.ts` detta kopplas ihop mot checkin_damages (ex. via textmatch, typmatch, mm). Om loopen på något sätt endast “ger bort” samma checkin_damage till en skada (via t.ex. set-mekanism eller flagga som förhindrar multipla matchningar) blir UI:t ofullständigt.

### Vanlig felslut

Att ersätta `.map().find()` med `.filter()` löser inga fel om inte det finns rätt antal damageRecords som fått rätt `checkinWhereDocumented` först. Det är alltså **kopplingen/matchningen mellan checkin_damages och BUHS-damages i minnet** som är själva flaskhalsen, och det är här felsökning/loggning måste börja.

**Tips för felsökning:** Lägg konsolloggar efter varje damageRecord-bygg för att visualisera exakt vilka “damage” som får rätt flagga.

---

#### Exempel på konsekvens:

Om UI:t endast visar en skada fast tre är förväntat, undersök:

- Hur många damageRecords har `damage.source === 'legacy' && damage.checkinWhereDocumented === checkin.id`?
- Hur många “får” egentligen flaggan i, t.ex., LRA75R vid incheckning 2026-01-19?
- Är det t.ex. en unik “not_found”/“existing” checkin_damage per BUHS-skada, eller återanvänds samma objekt?

### Sammantaget

Att felsöka rätt antal BUHS-skador per incheckning måste ALLTID börja i den **interna JS/TS-modellen** – se till att bygget av damageRecords ger verkliga, 1:1-kopplingar för vad du vill visa.



---

## Vanliga SQL-frågor för felsökning

### Visa alla incheckningar för ett fordon
```sql
SELECT id, regnr, checker_name, current_station, completed_at
FROM checkins
WHERE UPPER(TRIM(regnr)) = 'ABC123'
ORDER BY completed_at DESC;
```

### Visa BUHS-skador för ett fordon
```sql
SELECT * FROM get_damages_by_trimmed_regnr('ABC123');
```

### Visa checkin_damages för en specifik incheckning
```sql
SELECT cd.*, c.checker_name, c.completed_at
FROM checkin_damages cd
JOIN checkins c ON cd.checkin_id = c.id
WHERE UPPER(TRIM(c.regnr)) = 'ABC123'
ORDER BY cd.created_at DESC;
```

### Kontrollera om BUHS-skador skulle hanteras av datum-logik
```sql
SELECT
  d.regnr,
  d.damage_date AS buhs_datum,
  c.completed_at AS senaste_incheckning,
  CASE
    WHEN c.completed_at > d.damage_date THEN 'Datum-backup aktiveras ✅'
    ELSE 'Förlitar sig på textmatchning'
  END AS status
FROM damages d
JOIN checkins c ON UPPER(TRIM(d.regnr)) = UPPER(TRIM(c.regnr))
WHERE d.source = 'BUHS'
  AND d.regnr = 'ABC123'
ORDER BY d.damage_date;
```

### Kontrollera source-distribution i damages
```sql
SELECT source, COUNT(*) 
FROM damages 
GROUP BY source;
```

**Förväntat:**
```
CHECK | ~X antal
NYBIL | ~Y antal
BUHS  | aktuellt antal i den kanoniska källan
```

### Hitta dubbletter (samma skada från flera källor)
```sql
SELECT 
  regnr, 
  original_damage_date, 
  legacy_damage_source_text,
  COUNT(*) as antal
FROM damages
WHERE legacy_damage_source_text LIKE 'buhs_%'
GROUP BY regnr, original_damage_date, legacy_damage_source_text
HAVING COUNT(*) > 1
ORDER BY antal DESC;
```

---

**Senast uppdaterad:** 2026-01-16  
**Ägare:** Per Andersson (per@incheckad.se)  
**Version:** 3.0 (komplettering efter overnight-analys)
