# Database - Supabase

Detta dokument beskriver databasstrukturen för Incheckad-systemet.

## Översikt

Systemet använder Supabase (PostgreSQL) med följande huvudtabeller: 

| Tabell | Syfte |
|--------|-------|
| `checkins` | Incheckningar av fordon |
| `checkin_damages` | Skador kopplade till en specifik incheckning |
| `damages` | Konsoliderad skadehistorik per fordon |
| `nybil_inventering` | Nybilsregistreringar vid leverans |
| `vehicles` | Fordonsmaster från Bilkontroll-filen (BUHS) |

---

## Tabeller

### checkins

Lagrar varje incheckning av ett fordon. 

| Kolumn | Typ | Nullable | Default | Beskrivning |
|--------|-----|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | Primärnyckel |
| `created_at` | timestamptz | NO | now() | Skapad tidpunkt |
| `regnr` | text | NO | - | Registreringsnummer |
| `notes` | text | YES | - | Anteckningar |
| `photo_urls` | text[] | YES | '{}' | Foto-URLer |
| `station_id` | uuid | YES | - | Stations-ID (FK) |
| `station_other` | text | YES | - | Annan station (fritext) |
| `employee_id` | uuid | YES | - | Anställd-ID |
| `regnr_valid` | boolean | YES | - | Regnr validerat |
| `no_damage` | boolean | YES | false | Inga skador |
| `odometer_km` | integer | YES | - | Mätarställning i km |
| `fuel_full` | boolean | YES | - | Fulltankad |
| `adblue_ok` | boolean | YES | - | AdBlue OK |
| `washer_ok` | boolean | YES | - | Spolarvätska OK |
| `cargo_cover_ok` | boolean | YES | - | Lastskydd OK |
| `charge_cables_count` | smallint | YES | - | Antal laddkablar |
| `no_new_damage` | boolean | YES | - | Inga nya skador |
| `tires_type` | text | YES | - | Däcktyp (legacy) |
| `privacy_cover_ok` | boolean | YES | - | Insynsskydd OK |
| `wheel_type` | text | YES | - | Hjultyp (constraint:  'sommar' \| 'vinter') |
| `chargers_count` | integer | YES | - | Antal laddare |
| `parcel_shelf_ok` | boolean | YES | - | Hatthylla OK |
| `wheels_on` | USER-DEFINED | YES | - | Monterade hjul |
| `charging_cables` | smallint | YES | - | Laddkablar |
| `wash_needed` | boolean | YES | - | Tvätt behövs |
| `vacuum_needed` | boolean | YES | - | Dammsugning behövs |
| `region` | text | YES | - | Region |
| `city` | text | YES | - | Stad för incheckning |
| `station` | text | YES | - | Station för incheckning |
| `status` | text | YES | - | Status |
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
| `current_city` | text | YES | - | Bilen står nu:  Ort |
| `current_station` | text | YES | - | Bilen står nu: Station |
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
  "smoking_sanitation_comment": string,
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
| `regnr` | text | YES | - | Registreringsnummer |

#### type-värden

| Värde | Beskrivning |
|-------|-------------|
| `new` | Ny skada dokumenterad vid denna incheckning |
| `documented` | Befintlig BUHS-skada dokumenterad med foton |
| `existing` | Befintlig BUHS-skada bekräftad |
| `not_found` | Befintlig BUHS-skada kunde inte hittas |

#### positions (jsonb) struktur

```json
[
  {
    "id": "pos-1768219789568",
    "carPart": "Dörr utsida",
    "position": "Höger bak"
  }
]
```

---

### damages

Konsoliderad skadehistorik per fordon.  Innehåller både BUHS-importerade skador och skador från incheckningar.

| Kolumn | Typ | Nullable | Default | Beskrivning |
|--------|-----|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | Primärnyckel |
| `regnr` | text | NO | - | Registreringsnummer |
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
| `legacy_damage_source_text` | text | YES | - | Original BUHS-text för matchning |
| `user_type` | text | YES | - | Skadetyp vald av användare (Jack, Repa, etc.) |
| `user_positions` | jsonb | YES | - | Positioner (samma format som checkin_damages) |
| `original_damage_date` | date | YES | - | Ursprungligt skadedatum |
| `legacy_loose_key` | text | YES | - | Legacy matchningsnyckel |
| `uploads` | jsonb | YES | - | Media-uploads (se struktur nedan) |
| `imported_at` | timestamptz | YES | now() | Importerad tidpunkt |
| `source` | text | YES | 'CHECK' | Källa:  'CHECK' \| 'NYBIL' \| 'BUHS' |
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

| Värde | Beskrivning |
|-------|-------------|
| `CHECK` | Skada från incheckning |
| `NYBIL` | Skada från nybilsinventering |
| `BUHS` | Skada importerad från BUHS-systemet |

---

### nybil_inventering

Nybilsregistreringar vid leverans till MABI. 

| Kolumn | Typ | Nullable | Default | Beskrivning |
|--------|-----|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | Primärnyckel |
| `created_at` | timestamptz | NO | now() | Skapad tidpunkt |
| `updated_at` | timestamptz | NO | now() | Uppdaterad tidpunkt |
| `regnr` | text | NO | - | Registreringsnummer |
| `ankomstdatum` | date | YES | - | Ankomstdatum |
| `fordonstyp` | text | YES | - | Fordonstyp |
| `bilmarke` | text | YES | - | Bilmärke |
| `bilmodell` | text | YES | - | Bilmodell (legacy) |
| `modell` | text | YES | - | Modell |
| `vaxel` | text | YES | - | Växellåda |
| `bransletyp` | text | YES | - | Bränsletyp |
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
| `tankstatus` | text | YES | - | Tankstatus vid leverans |
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
| `regnr` | text | NO | - | Primärnyckel (registreringsnummer) |
| `brand` | text | YES | - | Bilmärke |
| `model` | text | YES | - | Modell |
| `wheel_storage_location` | text | YES | - | Hjulförvaringsplats |
| `created_at` | timestamptz | YES | now() | Skapad tidpunkt |
| `is_sold` | boolean | YES | false | Är såld |
| `sold_date` | date | YES | - | Såld datum |

---

## Storage Buckets

### damage-photos

Offentlig bucket för skadefoton.

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

---

## RPC-funktioner

### get_vehicle_by_trimmed_regnr

Hämtar fordonsinfo från `vehicles`-tabellen med trimmad sökning.

```sql
get_vehicle_by_trimmed_regnr(p_regnr text)
```

### get_damages_by_trimmed_regnr

Hämtar BUHS-skador för ett fordon. 

```sql
get_damages_by_trimmed_regnr(p_regnr text)
```

---

## Constraints

### checkins. wheel_type

```sql
CHECK ((wheel_type = ANY (ARRAY['sommar'::text, 'vinter'::text])))
```

---

## Dataflöde

### Vid incheckning (/check → /api/notify)

1. **checkins**:  Ny rad skapas med fordons- och incheckarinfo
2. **checkin_damages**:  Rad per skada (nya + hanterade BUHS)
3. **damages**: Rad per NY skada (source = 'CHECK')

### Vid nybilsinventering (/nybil → /api/notify-nybil)

1. **nybil_inventering**:  Ny rad med all fordonsinfo
2. **damages**: Rad per skada (source = 'NYBIL')

### Vid /status-sökning

1. Hämtar data från:  `nybil_inventering`, `vehicles`, `damages`, `checkins`, `checkin_damages`
2. Prioritetsordning för fordonsinfo: `checkins` (senaste) → `nybil_inventering` → `vehicles`
3. Skador hämtas från både `damages` och legacy BUHS via RPC

---

## Viktigt att veta

### damage_type vs user_type vs damage_type_raw

| Kolumn | Innehåll | Användning |
|--------|----------|------------|
| `damage_type` | Normaliserad (UPPERCASE): JACK, REPA, REPOR | Matchning, filtrering |
| `damage_type_raw` | Originaltext:  Jack, Repa, Repor | Visning i /status |
| `user_type` | Användarens val: Jack, Repa, Repor | Legacy, samma som damage_type_raw |

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
  "folder":  "GFX46X/GFX46X-20251216/20251216-jack-dorr-utsida-hoger-fram-oliwer",
  "photo_urls": ["https://..."],
  "video_urls": []
}
```

`folder` används för att bygga "Visa media"-länken i /status. 