# Brief: Incheckningsflöde, /api/notify, Supabase & mejl

_Kortfattad men detaljerad sammanställning av nuläge och mål för flödet `/check` → `/api/notify` → Supabase + mejl, samt hur detta samspelar med Bilkontroll‑filen och Skadefilen._

Senast uppdaterad: 2025‑11‑19  
Författare: Copilot (sammanfattning baserad på dialog med Per)

---

## 1. Övergripande målbild

### 1.1 Flödet `/check` → `/api/notify` → Supabase → mejl

När en användare slutför en incheckning via `/check` ska följande alltid ske:

1. **Klient (form-client)**:
   - Laddar upp media (foto/video) till Supabase Storage med strukturen:

     - Bucket: `damage-photos`
     - Path:  
       `REGNR/REGNR-YYYYMMDD/EVENEMANG-MAPP`
       där "evenemangsmapp" varierar:
       - för nya skador: typ + placering + position + incheckare,
       - för BUHS-dokumentation: datum + typ + incheckare,
       - för Rekond/Husdjur/Rökning: `REKOND-...`, `HUSDJUR`, `ROKNING` etc.

   - Bygger upp payload (`finalPayloadForNotification`) med:
     - all metadata (ort, station, bilen står nu, drivmedel, mätarställning, checklistor, noteringar),
     - strukturerade skador:
       - `nya_skador`: nya skador dokumenterade vid incheckningen,
       - `dokumenterade_skador`: BUHS-skador som nu dokumenteras,
       - `åtgärdade_skador`: BUHS-skador som incheckaren valt att inte dokumentera (”går inte att dokumentera”),
     - Rekond/Husdjur/Rökning, varningslampa, Går inte att hyra ut, Insynsskydd saknas, parkeringsinfo, övriga kommentarer.
     - `uploads.folder` + `photo_urls` + `video_urls` för varje skada/sanering.

   - Anropar `notifyCheckin` (`lib/notify.ts`), som skickar en POST till `/api/notify` med:
     - `{ region, subjectBase, meta: finalPayloadForNotification }`.

2. **Server (API: `/app/api/notify/route.ts`)**:

   - Läser `meta` (kallad `payload` i koden).
   - Räknar media (logg).
   - Bestämmer datum/tid i svensk tid (Europe/Stockholm).
   - Sparar data till Supabase:
     - **checkins**: en rad per incheckning.
     - **damages**: en rad per skada (både nya + BUHS-relaterade).
     - **checkin_damages**: koppling mellan checkin och skador + positioner.
   - Bygger och skickar två mejl via Resend:
     - Huvudstationsmejl.
     - Bilkontrollmejl.
   - Loggar fel och fortsätter skicka mejl även om DB-skrivningar skulle fallera (dock ska vi försöka göra DB robust).

3. **Resultat**:
   - Användaren ser en “incheckning klar”-bekräftelse.
   - Datan ligger i Supabase med rätt struktur.
   - Rätt personer får tydliga mejl med info och länkar till media.

---

## 2. Datamodell idag (Supabase)

### 2.1 Tabell: `checkins`

Nyckel-fält (en rad per incheckning):

- `id` (uuid, PK)
- `created_at`, `updated_at`, `started_at`, `completed_at`
- `regnr` (text, NOT NULL)
- Plats:
  - `region` (text)
  - `city` (text) – var incheckningen gjordes
  - `station` (text) – station för incheckning
  - `current_city` (text) – “Bilen står nu” ort
  - `current_station` (text) – “Bilen står nu” station
  - `current_location_note` (text) – parkeringsinfo
- Inchecker:
  - `checker_name` (text)
  - `checker_email` (text)
- Status:
  - `status` (text) – t.ex. `checked_in` / `complete` etc.
  - `has_new_damages` (boolean, default false)
  - `has_documented_buhs` (boolean)
  - `plate_video_confirmed` (boolean)
- Fordonsstatus:
  - `odometer_km` (integer)
  - `fuel_type` (text) – bensin/diesel/el
  - `fuel_level_percent` (smallint)
  - `fuel_liters` (numeric)
  - `fuel_price_per_liter` (numeric)
  - `fuel_currency` (text, default `SEK` – praktiskt taget onödig då MABI Syd är i Sverige)
  - `charge_level_percent` (smallint)
  - `hjultyp` (text) – Sommar/Vinter (från formuläret)
  - Ett antal historiska fält:
    - `tires_type`, `wheel_type`, `wheels_on` – nu överflödiga/”legacy”.
- Laddkablar:
  - `charge_cables_count` (smallint)
  - `charging_cables`, `chargers_count` – överflödiga historiska varianter.
- Checklistor / utrustning:
  - `adblue_ok`, `washer_ok`, `cargo_cover_ok`, `privacy_cover_ok`, `parcel_shelf_ok` (bools)
  - `checklist` (jsonb) – generellt JSON-fält för fler flaggor.
  - `tvattad` (boolean) – motsvarar “Tvättad” i formulärets checklista.
  - `rekond_behov` (boolean) – övergripande rekondbehov.
  - `wash_needed`, `vacuum_needed` (boolean) – kan mappa mot “Rekond utvändig” / “Rekond invändig”.
- Övrigt:
  - `notes` (text), `photo_urls` (text[]), `station_id`, `employee_id` etc. – historiska/legacy-fält.
  - `user_type` (text) – ny kolumn, för framtida roller, men ej aktivt använd ännu.

**Viktigt:**  
- `checkins` är platsen där vi på sikt vill kunna göra statistik:
  - andel incheckningar med skador,
  - frekvens Rekond/Husdjur/Rökning per station,
  - mönster i laddnivåer, hjultyp, osv.

I notify‑steg 1 ska vi **inte** ändra schemat, utan utnyttja befintliga fält + `checklist` (jsonb) för ny information.

---

### 2.2 Tabell: `damages`

Nyckel-fält (en rad per skada – både BUHS + era egna):

- `id` (uuid, PK)
- `regnr` (text, NOT NULL)
- `damage_date` (date) – det datum skadan inträffade.
- `saludatum` (date) – när bilen ska lämna vagnparken (”saludatum”), främst från BUHS/Skadefilen.
- Plats & station:
  - `region`, `ort`, `huvudstation_id`, `station_id`, `station_namn` (text)
- Skadeinformation:
  - `damage_type` (text) – normaliserad typ (kod/konstant).
  - `damage_type_raw` (text) – text som kommer från BUHS/Skadefilen eller formuläret.
  - `description` (text) – beskrivning använd i incheckningen.
  - `user_type` (text) – ibland samma som `damage_type_raw`.
  - `user_positions` (jsonb) – strukturerad info om placering/positioner (carPart/position).
- Noteringar:
  - `note_customer` (text)
  - `note_internal` (text)
  - `vehiclenote` (text)
  - `notering` (text) – “generell kommentar”.
  - `legacy_damage_source_text` (text) – text från BUHS/Skadefilen.
- Datum & nycklar:
  - `original_damage_date` (date) – viktigt: det **ursprungliga** skadedatumet från BUHS.
  - `legacy_loose_key` (text) – används för att matcha skador mellan CSV-rådata och `damages`.
- Media:
  - `media_url` (text) – legacy.
  - `uploads` (jsonb) – innehåller:
    - `photo_urls`: []
    - `video_urls`: []
    - `folder`: "REGNR/REGNR-YYYYMMDD/eventfolder" – används för mejllänkning.

**Viktigt om skadedatum:**

- För **BUHS-/Skadefil–skador**:
  - `damage_date` = `damage_date` från CSV = ”sanna skadedatumet”.
  - Detta får **inte** skrivas över med incheckningsdatum.
- För **nya skador** som uppstår/dokumenteras i `/check`:
  - `damage_date` kan sättas till incheckningsdatum (”skadan upptäcktes idag”).
  - `original_damage_date` kan vara `NULL`.

---

### 2.3 Tabell: `checkin_damages`

Nyckel-fält (kopplar en incheckning till en eller flera skador och deras positioner):

- `id` (uuid, PK)
- `created_at` (timestamp)
- `checkin_id` (uuid, NOT NULL) – FK till `checkins.id`
- `regnr` (text)
- Beskrivning/media:
  - `description` (text, NOT NULL, default '')
  - `photo_urls` (text[] NOT NULL, default `{}`)
  - `video_urls` (text[])
  - `positions` (jsonb) – array med strukturerade positioner.
- Typ/klass:
  - `type` (varchar) – t.ex. `new`, `existing`, `documented`, `resolved`, etc.
  - `damage_type` (varchar) – normaliserad typkod, samma logik som i `damages.damage_type`.
- Plats:
  - `car_part` (varchar) – Placering (t.ex. “Dörr utsida”, “Skärm”, “Fälg”).
  - `position` (varchar) – Position och ev. sida (t.ex. “Höger bak”, “Fram”, osv).

**Viktigt:**

- En incheckning kan ha N skador, och en skada kan ha flera positioner.
- `checkin_damages` är där vi kan se:

  - “Vid incheckning X, fanns skada S, med positionerna (Skärm, Höger bak) och (Dörr utsida, Höger bak)” etc.

---

## 3. Bilkontroll-fil och Skadefil: roller & krav

### 3.1 Bilkontroll (”MABISYD Bilkontroll 2024–2025.csv”)

- Innehåll:
  - `regnr;brand;model;wheel_storage_location`
- Roll:
  - Berättar:
    - var bilen finns (ort/station),
    - hjulförvaring,
    - ibland annan metadata (såld, inga hjul, osv.).
- Användning:
  - Data importeras till en råtabell (exakt namn att verifiera i repo) och sedan vidare till lämpliga tabeller (t.ex. `vehicles` eller liknande).
  - Uppgifter används för:
    - `/nybil` och `/check` (hjulförvaring, var bilen står, m.m.),
    - rapporter.

### 3.2 Skadefilen (”Skador Albarone2025-11-03.csv”)

- Innehåll (per rad, förenklat):

  - `regnr`
  - `saludatum`
  - `damage_date`
  - `damage_type_raw`
  - `note_customer`
  - `note_internal`
  - `vehiclenote`

- Roll:
  - Är **BUHS-export** – MABIs centrala skadeinformation utan bilder.
  - Laddas upp till en *råtabell* (t.ex. `mabi_damage_data_raw`, `mabi_damages_raw_new`) i Supabase,
    inte direkt till `damages`.
  - Därefter kör ni (eller ska köra) ett steg som:
    - matchar mot befintliga `damages`,
    - uppdaterar/kompletterar utan att skapa dubbletter.

- Viktigt krav:

  - När personal uppdaterar skador i BUHS i efterhand (byter eller lägger till kommentar, notering etc.), vill ni **inte**:
    - att samma skada ska tolkas som en “ny odokumenterad skada” i ert system,
    - och alltså inte dyka upp igen i `/check` som något som måste dokumenteras en gång till, om ni redan har dokumenterat den.

- Grundidé (diskuterad tidigare):

  - Kombinera:
    - `regnr`
    - `damage_date` (CSV:s `damage_date`)
    - `damage_type_raw`
  - Detta ger en ganska unik signatur för en skada.
  - Om en rad i Skadefilen har samma signatur som en redan känd rad i `damages`, ska den typiskt:
    - tolkas som en **update** (uppdatera textfält, saludatum, noteringar),
    - inte som en helt ny skada.

  - Därav fälten `original_damage_date` och `legacy_loose_key` i `damages`.

---

## 4. BUHS, legacy-skador och incheckningsflödet

### 4.1 Varför BUHS-skador måste dokumenteras "om" i ert system

- Idag:
  - BUHS innehåller historik (inkl. tidigare foton, centralt).
  - Skadefilen ger er textinfo, men inga bilder.
- Mål:
  - Eget system (incheckad.se) ska:
    - ha full historik över skador (inkl. bilder i er egen Storage),
    - kunna byggas statistik på (Skade + Rekond + Laddnivå + m.m.),
    - bli ett “andrahjärna”-system bredvid BUHS (mer anpassat för MABI Syds behov).

Konsekvens:

- Alla **befintliga BUHS-skador** måste någon gång:
  - “gås igenom” av er personal på plats (incheckare),
  - dokumenteras via `/check` (foto/video),
  - eller bedömas “kan inte dokumenteras” med kommentar (t.ex. skada är lagad).

Efter detta vill ni:

- att en sådan skada **inte** längre dyker upp som odokumenterad i sektionen “Befintliga skador att hantera”.
- den ska bara synas i faktarutan under reg.nr (”befintliga skador”) som historikinformation.

### 4.2 Hur det syns i formuläret `/check`

I `app/check/form-client.tsx`:

- När reg.nr matas in:
  - `getVehicleInfo(regnr)` hämtar:
    - fordonsinfo,
    - befintliga skador (`existing_damages`), både från BUHS och ert eget system.
  - Dessa hamnar i `existingDamages` med:
    - `db_id` (id i `damages`),
    - `fullText` (sammanfattning),
    - `originalDamageDate`,
    - `isInventoried` (om den anses dokumenterad/inventerad),
    - `status` (`not_selected`, `documented`, `resolved`).

Vid incheckning:

- Incheckaren kan:
  - dokumentera en befintlig skada → `status: 'documented'`.
  - markera “Går inte att dokumentera” → `status: 'resolved'` med kommentar.
- Objekten hamnar i payloaden:

  - `dokumenterade_skador`: befintliga skador som nu dokumenterats.
  - `åtgärdade_skador`: befintliga skador som inte går att dokumentera.

Notify‑logik i `/api/notify`:

- Ska:
  - skapa lämpliga rader i `damages`/`checkin_damages` för dessa,
  - uppdatera/informera BUHS-logik på ett sätt som inte rubbar CSV-importen.

---

## 5. Mejllogik och mottagare

### 5.1 Mottagare

Nuvarande/instruktionsläge:

- **Bilkontroll-mejl**:
  - Går till:
    - `per@incheckad.se`
    - `latif@incheckad.se`
  - Correction: Latif ska **endast** ha Bilkontroll-mejl om incheckningen sker i Helsingborg eller Ängelholm.
  - För andra orter: enbart Per (plus ev. andra Bilkontroll-adresser, men i nuläget är det i praktiken Per).

- **Huvudstationsmejl**:
  - Alla incheckningar:
    - ska alltid gå till `per@incheckad.se`.
  - Om ort = Helsingborg eller Ängelholm:
    - ska även gå till `helsingborg@mabi.se`.
  - För andra orter:
    - tills vidare bara `per@incheckad.se` (vi “släpper på” fler stationer successivt).

### 5.2 Mejlinnehåll (layout & flaggor)

- Två mejl per incheckning:
  - Huvudstation:
    - ämne: `INCHECKAD: REGNR - [station] - !!! - HUVUDSTATION` (eller liknande).
    - innehåll:
      - Faktaruta om bil, mätarställning, var bilen står, uthyrbarhet, m.m.
      - Lista över:
        - Nya skador.
        - Dokumenterade BUHS-skador.
        - Rekond/Husdjur/Rökning-länkar.
      - “Incheckad av” med namn + datum + klockslag längst ned.
      - Varningsbanners (gula) för:
        - Nya skador dokumenterade.
        - Låg laddnivå / ej upptankad.
        - Går inte att hyra ut.
        - Rekond/Husdjur/Rökning.
        - Saludatum-varning (se nedan).

  - Bilkontroll:
    - liknande struktur, men fokus på skador, varningsflaggar relevant för Latif/Bilkontroll.

- **Saludatum-flagga i Huvudstationsmejlet**:

  - Data:
    - `saludatum` från `damages` (BUHS/Skadefil),
    - i vissa fall från `/nybil` (framöver).
  - Logik:
    - Beräkna antal dagar mellan dagens datum (incheckningsdatum) och Saludatum.
    - Om Saludatum är inom 10 dagar (>= idag, <= idag+10):
      - Visa:
        - `Kontakta Bilkontroll - saludatum: YYYY-MM-DD. Undvik långa hyror på detta reg.nr!`
    - Om Saludatum har passerat (Saludatum < idag):
      - Visa:
        - `Saludatum passerat (YYYY-MM-DD)! Kontakta Bilkontroll! Undvik långa hyror.`
  - Endast Huvudstationsmejlet får denna flagga (inte Bilkontroll-mejlet).

---

## 6. Status & sanering (Rekond, Husdjur, Rökning m.m.)

I formuläret (`Status & Sanering`-sektionen) finns:

- `Går inte att hyra ut` (med obligatorisk kommentar):
  - Vill du på sikt ha möjlighet att bifoga foto/video även här.
- `Varningslampa ej släckt` (med obligatorisk kommentar).
- `Rekond`:
  - kräver val av typ:
    - “Utvändig”
    - “Invändig”
  - kräver minst ett foto (video frivillig).
- `Husdjur`:
  - valfri kommentar.
  - foto/video frivilligt men möjligt.
- `Rökning`:
  - liknande Husdjur.
- `Insynsskydd saknas`:
  - idag en enkel knapp (JA/NEJ),
  - på sikt vill du istället/också fråga efter **antal** insynsskydd (0/1/2) både i `/nybil` och `/check`.

Krav:

- På **kort sikt** (notify–steg 1):
  - Ingen förändring i UI.
  - All denna info ska speglas i databasen:
    - Egenskaper som kan mapparas mot befintliga bool-fält (`rekond_behov`, `wash_needed`, `vacuum_needed` etc.) bör göra det.
    - Nya bool-flaggor/kommentarer läggs i `checklist` (jsonb) i `checkins` i första steget.
- På **längre sikt**:
  - Dedikerade kolumner för:
    - `needs_rekond` (utöver `rekond_behov`),
    - `husdjur_sanerad`, `rokning_sanerad`,
    - `varningslampa_lyser`,
    - `gar_inte_att_hyra_ut`,
    - `insynsskydd_antal` (0/1/2),
  - rapporter/statistik på dessa.

---

## 7. Notify‑steg 1: vad ska göras (övergripande)

Notify–steg 1 PR (kommande):

1. `/api/notify/route.ts` ska:
   - Alltid skapa en rad i `checkins` för varje incheckning.
   - Skapa rader i `damages` och `checkin_damages` för:
     - nya skador (`nya_skador`),
     - dokumenterade BUHS–skador (`dokumenterade_skador`),
   - Respektera:
     - `original_damage_date` (BUHS-skadedatum),
     - `damage_date` från CSV för legacy-skador,
     - incheckningsdatum endast för helt nya skador.
   - Skriva relevanta saneringsflaggor + kommentarer in i `checkins` (befintliga boolfält + `checklist` JSON).
   - Skicka mejl:
     - rätt mottagare,
     - korrekt layout (tidigare fungerande),
     - med Saludatum-flagga enligt reglerna ovan.

2. **Ingen** schemaändring i Supabase i detta steg.

3. **Ingen** ändring i `/check`-UX i detta steg.

---

## 8. Senare steg (kort översikt)

Efter notify–steg 1, i separata PR:ar:

1. **/nybil–förbättringar**:
   - Fler fält (kablar, insynsskydd antal, köpare, returort/adress, m.m.).
   - Koppling till `vehicles`/liknande tabell som håller “förväntad utrustning” (hjul, insynsskydd, kablar).

2. **CSV-importer** (Bilkontroll + Skadefil):
   - Klargöra:
     - exakta råtabeller (t.ex. `mabi_damage_data_raw`, `mabi_vehicles_raw` etc.).
     - hur UPSERT‑logiken ska fungera för att:
       - undvika dubbletter,
       - uppdatera text/Saludatum för existerande skador,
       - inte återmarkera redan dokumenterade BUHS-skador som odokumenterade.
   - Bygga/justera SQL‑views eller funktioner enligt [CSV-import.md](../docs/wiki/CSV-import.md).

3. **Insynsskydd & utrustning**:
   - Införa `expected_insynsskydd_count` från `/nybil` + CSV.
   - Införa `actual_insynsskydd_count` i `/check`.
   - Flagga “för få insynsskydd” (actual < expected).

4. **Admin-/logg-sida (/logg)**:
   - Möjlighet att manuellt uppdatera:
     - Saludatum,
     - hjulinfomation,
     - laddkabelstatus,
     - andra fält som ska “trumfa” både CSV och BUHS data.

5. **Roller / user_type**:
   - Bestämma vilka användartyper som ska finnas,
   - hur `user_type` i `checkins` sätts baserat på Supabase Auth/roller,
   - hur olika roller påverkar vad man ser/gör i `/check`, `/nybil`, rapporter.

---

Denna brief är underlag både för:
- notify–PR steg 1 (akut stabilisering),
- och för framtida “steg 2–3” (CSV-import, /nybil, utrustning, roller).
