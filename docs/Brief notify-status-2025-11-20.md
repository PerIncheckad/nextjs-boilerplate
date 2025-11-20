# Notify/checkin – nuläge 2025‑11‑20

_Kompletterad och uppdaterad brief baserad på “Brief notify-checkin 2025‑11‑19.md” och efterföljande arbete i PR #124, #125, #126, #127, #128._

Senast uppdaterad: **2025‑11‑20**  
Författare: Copilot (sammanställning baserad på dialog med Per)

Syfte:  
Den här filen ska vara den **allomfattande sanningen** om:

- hur flödet `/check` → `/api/notify` → Supabase → mejl fungerar idag,
- hur `checkins`, `damages`, `checkin_damages` används,
- vad som är implementerat,
- vilka constraints/buggar vi stött på,
- vad nästa utvecklare/bot behöver göra härnäst.

Målet är att du ska kunna ge den här filen till en efterträdare (människa eller Copilot‑agent) och säga:  
“Läs denna och fortsätt härifrån” – utan att behöva återberätta alla tidigare konversationer.

---

## 1. Övergripande målbild (oförändrad från 2025‑11‑19)

### 1.1 Flödet `/check` → `/api/notify` → Supabase → mejl

När en användare slutför en incheckning via `/check` ska följande ske:

1. **Klient (form-client)**

   - Laddar upp media (foto/video) till Supabase Storage med strukturen:

     - Bucket: `damage-photos`
     - Path:  
       `REGNR/REGNR-YYYYMMDD/EVENEMANG-MAPP`
       där “evenemangsmapp” varierar:
       - för **nya skador**: typ + placering + position + incheckare,
       - för **BUHS-dokumentation**: datum + typ + incheckare,
       - för **Rekond/Husdjur/Rökning**: t.ex. `REKOND-...`, `HUSDJUR`, `ROKNING`.

   - Bygger upp payload (`finalPayloadForNotification`) med:
     - metadata:
       - `regnr`, `ort`, `station`,
       - `bilen_star_nu.ort`, `bilen_star_nu.station`, `bilen_star_nu.kommentar`,
       - `drivmedel`, `matarstallning`, hjultyp, tankning/laddning m.m.,
       - checklistflaggor (Tvättad, Övriga kontroller OK, Rekond, Husdjur, Rökning, Varningslampa, Går inte att hyra ut, Insynsskydd saknas),
       - `notering` (fri kommentar längst ned i formuläret).
     - skador:
       - `nya_skador`: nya skador dokumenterade vid incheckningen.
       - `dokumenterade_skador`: BUHS‑skador som nu **dokumenteras** (med foto/video).
       - `åtgärdade_skador`: BUHS‑skador där incheckaren valt “Går inte att dokumentera” / “Åtgärdade/Hittas ej” (med kommentar).
     - uploads:
       - varje skada/rekond/husdjur/rökning har:
         - `uploads.folder` (Storage‑path),
         - `uploads.photo_urls` (array),
         - `uploads.video_urls` (array).

   - Anropar `notifyCheckin` (`lib/notify.ts`) som skickar:

     ```jsonc
     {
       "region": "...",          // används sparsamt idag
       "subjectBase": "...",     // historisk
       "meta": { ...payload... } // se ovan
     }
     ```

2. **Server (API: `/app/api/notify/route.ts`)**

   _Nuläge efter PR #125 + följd‑PR:ar #126–#128._

   - Läser `meta` (kallad `payload`).
   - Loggar mediastatistik:

     ```ts
     console.log('Media counts received:', {
       nya_skador: { photos, videos },
       dokumenterade_skador: { photos, videos },
       rekond: payload.rekond?.hasMedia ? 'yes' : 'no',
       husdjur: payload.husdjur?.hasMedia ? 'yes' : 'no',
       rokning: payload.rokning?.hasMedia ? 'yes' : 'no',
     });
     ```

   - Räknar ut datum/tid i svensk tid (Europe/Stockholm) snyggt formaterat (`date`, `time`).
   - Bygger **checkinData** och skriver till `public.checkins`.
   - Bygger **damageInserts** och **checkinDamageInserts** och försöker skriva till:
     - `public.damages`,
     - `public.checkin_damages`.
   - Bygger mejl för:
     - Huvudstation,
     - Bilkontroll.
   - Skickar mejl via Resend.
   - Loggar fel detaljerat (inkl. constraintfel från Supabase), men låter mejlen gå iväg även om DB‑skrivningarna faller.

3. **Resultat (önskat läge)**

   - Användaren får en bekräftelse på att incheckningen lyckades.
   - `checkins` har en ny rad för varje slutförd incheckning.
   - `damages`/`checkin_damages` har nya rader för relevanta skador.
   - Rätt personer får tydliga mejl med varningsflaggor, bilder och BUHS‑info.

---

## 2. Datamodell i Supabase – praktiskt nyttjad del

Grunden är densamma som i ursprungsbriefen, men här fokuserar vi på fält som i praktiken används av `/api/notify` idag.

### 2.1 `public.checkins`

Viktiga fält (används *aktivt* av `/api/notify` i november 2025):

- **Identitet & tid**

  - `id` (uuid, PK)
  - `created_at`, `updated_at`, `started_at`, `completed_at`
  - I insert från `/api/notify`:

    ```ts
    completed_at: now.toISOString(),
    ```

- **Bil & plats**

  - `regnr` (text, NOT NULL)
  - `region` (text) – mappas från `payload.region` (kan vara `null`).
  - `city` (text) – incheckningsort (`payload.ort`).
  - `station` (text) – incheckningsstation (`payload.station`).
  - `current_city` (text) – “Bilen står nu” ort (`payload.bilen_star_nu?.ort`).
  - `current_station` (text) – “Bilen står nu” station (`payload.bilen_star_nu?.station`).
  - `current_location_note` (text) – parkeringsinfo (`payload.bilen_star_nu?.kommentar`).

- **Inchecker**

  - `checker_name` (text) – från `payload.fullName/full_name/incheckare`.
  - `checker_email` (text) – från `payload.email` eller `payload.user_email`.

- **Status & flaggor**

  - `status` (text) – **viktigt constraint**:

    ```sql
    CHECK (
      status IS NULL
      OR status = ANY(ARRAY['checked_in', 'COMPLETED'])
    )
    ```

    Nuläge: `/api/notify` sätter **`status: 'COMPLETED'`** (VERSALER) för slutförd incheckning.

  - `has_new_damages` (boolean)
  - `has_documented_buhs` (boolean)
  - `plate_video_confirmed` (boolean) – används ej här.

- **Fordonsstatus**

  - `odometer_km` (integer) – `payload.matarstallning` parsas till int.
  - `fuel_type` (text) – `payload.drivmedel`.
  - `fuel_level_percent` (smallint) – 100 om `tankning.tankniva === 'återlämnades_fulltankad'`, annars `null`.
  - `fuel_liters`, `fuel_price_per_liter`, `fuel_currency` – lämnas `null` / `'SEK'` enligt nuläget.
  - `charge_level_percent` (smallint) – parsas från `payload.laddning?.laddniva`.
  - `charge_cables_count` (smallint) – från `payload.laddning?.antal_laddkablar`.
  - `hjultyp` (text) – från `payload.hjultyp`.

- **Checklistor**

  - `tvattad` (boolean) – `payload.washed`.
  - `rekond_behov` (boolean) – `payload.rekond?.behoverRekond`.
  - `wash_needed` (boolean) – `payload.rekond?.utvandig`.
  - `vacuum_needed` (boolean) – `payload.rekond?.invandig`.

  - `checklist` (jsonb) – samlar:

    ```jsonc
    {
      "washed": true/false,
      "otherChecklistItemsOK": true/false,
      "rekond": {
        "behoverRekond": ...,
        "utvandig": ...,
        "invandig": ...,
        "text": null|string
      },
      "husdjur": {
        "sanerad": ...,
        "text": null|string
      },
      "rokning": {
        "sanerad": ...,
        "text": null|string
      },
      "varningslampa": {
        "lyser": ...,
        "beskrivning": null|string
      },
      "rental": {
        "unavailable": ...,
        "comment": null|string
      },
      "status": {
        "insynsskyddSaknas": ...
      }
    }
    ```

- **Övrigt**

  - `notes` (text) – binds till `payload.notering` (fri kommentar längst ned i formuläret).
  - `photo_urls`, `station_id`, `employee_id` etc. – lämnas orörda av notify‑steget.

**Nulägesstatus (efter 2025‑11‑20)**

- `/api/notify` **skriver nu framgångsrikt** till `checkins` i preview:
  - `status = 'COMPLETED'` (godkänt av constrainten).
  - `has_new_damages` / `has_documented_buhs` sätts utifrån payload.
  - `checklist` innehåller tvätt/recond/husdjur/rökning/varningslampa/går inte att hyra ut/etc.
- Detta verifierades via Vercel‑loggar och Supabase‑UI (nya rader för RXJ02Y).

---

### 2.2 `public.damages`

Fält enligt ursprungsbriefen, men här fokuserar vi på det notify faktiskt skriver.

Per november 2025:

- Vid **nya skador** (`payload.nya_skador`):

  ```ts
  damageInserts.push({
    regnr: regNr,
    damage_date: todayDate,             // incheckningsdatum
    region: payload.region || null,
    ort: payload.ort || null,
    station_namn: payload.station || null,
    damage_type: normalized.typeCode,   // t.ex. 'BUCKLA'
    damage_type_raw: rawType,           // t.ex. 'Buckla'
    user_type: rawType,                 // samma som ovan
    description: skada.text || skada.userDescription || null,
    inchecker_name: checkinData.checker_name,
    inchecker_email: checkinData.checker_email,
    status: 'complete',                 // VIKTIGT: gemener, se constraint nedan
    uploads: skada.uploads || null,
    created_at: now.toISOString(),
    original_damage_date: null,
    legacy_loose_key: null
  });
  ```

- Vid **dokumenterade BUHS‑skador** (`payload.dokumenterade_skador`):

  ```ts
  const originalDamageDate =
    skada.originalDamageDate || skada.damage_date || null;
  const resolvedDamageDate = originalDamageDate || todayDate;

  const legacyLooseKey =
    regNr && originalDamageDate && rawType
      ? `${regNr}|${originalDamageDate}|${rawType}`
      : null;

  damageInserts.push({
    regnr: regNr,
    damage_date: resolvedDamageDate,       // BUHS-datum om finns, annars incheckningsdatum
    region: payload.region || null,
    ort: payload.ort || null,
    station_namn: payload.station || null,
    damage_type: normalized.typeCode,
    damage_type_raw: rawType,
    user_type: rawType,
    description: skada.userDescription || skada.text || null,
    inchecker_name: checkinData.checker_name,
    inchecker_email: checkinData.checker_email,
    status: 'complete',                     // OBS: 'complete' (gemener)
    uploads: skada.uploads || null,
    legacy_damage_source_text: skada.fullText || null,
    original_damage_date: originalDamageDate,
    legacy_loose_key: legacyLooseKey,
    created_at: now.toISOString()
  });
  ```

**Constraint på `status` i `damages`**

- SQL‑inspektion gav:

  ```sql
  CHECK (status = ANY(ARRAY['draft', 'complete']))
  ```

- Tidigare försök med `'COMPLETED'` gav constraint‑fel:

  ```text
  new row for relation "damages" violates check constraint "damages_status_check"
  ```

- Detta är nu löst genom att använda `'complete'` (gemener) i notify‑koden.
- **`damages`‑insert fungerar nu** (fel 23514 är åtgärdat).

---

### 2.3 `public.checkin_damages`

Notify bygger `checkinDamageInserts` parallellt med `damageInserts`.

För nya skador:

```ts
checkinDamageInserts.push({
  checkin_id: checkinId,
  regnr: regNr,
  type: 'new',
  damage_type: normalized.typeCode,
  car_part: pos.carPart || null,
  position: pos.position || null,
  description: skada.text || skada.userDescription || null,
  photo_urls: skada.uploads?.photo_urls || [],
  video_urls: skada.uploads?.video_urls || [],
  positions: [pos],
  created_at: now.toISOString()
});
```

För dokumenterade BUHS‑skador:

```ts
checkinDamageInserts.push({
  checkin_id: checkinId,
  regnr: regNr,
  type: 'documented',
  damage_type: normalized.typeCode,
  car_part: pos.carPart || null,
  position: pos.position || null,
  description: skada.userDescription || skada.text || null,
  photo_urls: skada.uploads?.photo_urls || [],
  video_urls: skada.uploads?.video_urls || [],
  positions: [pos],
  created_at: now.toISOString()
});
```

**Constraint‑problem (NOT NULL på `description`)**

- Den 2025‑11‑20 noterades följande fel i Vercel‑loggar vid RXJ02Y‑test:

  ```text
  Error inserting checkin_damages: {
    code: '23502',
    message: 'null value in column "description" of relation "checkin_damages" violates not-null constraint',
    details: 'Failing row contains (..., documented, BUCKLA, Annan del, null, {}, [...], RXJ02Y).'
  }
  ```

- Orsak:  
  `description` i `checkin_damages` är NOT NULL i Supabase, men det finns fall där:

  - `skada.userDescription` saknas,
  - `skada.text` saknas,
  - vi ändå skapade en rad (främst BUHS‑skador dokumenterade utan extra text).

**Detta är inte åtgärdat i DB ännu** (vid tidpunkten för denna brief).

### 2.3.1 Rekommenderad lösning för nästa utvecklare/bot

Det finns två huvudsakliga alternativ:

1. **Göra `description` nullable i DB (en ren schemaändring):**

   ```sql
   ALTER TABLE public.checkin_damages
   ALTER COLUMN description DROP NOT NULL;
   ```

   - Fördel: enkel åtgärd; vi kan fortsätta skicka `null` när ingen kommentar finns.
   - Nackdel: `description` blir semantiskt svagare – men vi har ändå positions‑info + `damage_type` etc.

2. **Bibehålla NOT NULL och alltid fylla något (rekommenderad väg):**

   - Justera notify‑koden, t.ex.:

     ```ts
     const desc =
       skada.userDescription ||
       skada.text ||
       skada.fullText ||        // BUHS-heltext om det finns
       '';                      // fallback: tom sträng
     ```

     och använda `desc` för både `damages.description` och `checkin_damages.description`.

   - Fördel:
     - håller DB‑constraint intakt,
     - garanterar att `checkin_damages.description` alltid har **någon** text (även om det bara är original BUHS‑text).
   - Nackdel:
     - kräver en liten ändring i `/api/notify/route.ts`.

**Rekommendation i denna brief:**

> Nästa PR som rör notify bör:
>
> - **inte** ändra schema direkt, utan
> - justera notify‑koden enligt alternativ 2 så att `description` alltid fylls med minst en tom sträng eller `fullText`.

---

## 3. BUHS & skadeflödet (mål + nuläge)

Detta avsnitt är i stort sett oförändrat från ursprungsbriefen, men kompletterat med hur mejlen beter sig nu.

### 3.1 Varför BUHS‑skador dokumenteras i ert system

- Ni vill:
  - ha egna bilder/filmer på skador,
  - kunna bygga statistik,
  - undvika dubbelarbete där BUHS ändras men ni inte ser skillnaden.

- Därför:
  - BUHS‑export (Skadefilen) hämtas regelbundet,
  - befintliga skador laddas in som “befintliga BUHS‑skador” i `/check`,
  - incheckaren får välja per BUHS‑skada:
    - dokumentera nu (med media),
    - markera “Går inte att dokumentera” (t.ex. lagad, går inte att hitta etc.).

### 3.2 Hur detta nu speglas i mejlen

Efter notify‑PR:erna (#125–#128) ser mejlen nu ut så här:

- Sektioner i både Huvudstation- och Bilkontrollmejl:

  1. **NYA SKADOR**

     - rubrik: `NYA SKADOR`.
     - text: lista över `nya_skador`.
     - om inga nya skador: text “Inga nya skador”.

  2. **Befintliga skador (från BUHS) som dokumenterades**

     - rubrik: `Befintliga skador (från BUHS) som dokumenterades`.
     - innehåller de BUHS‑skador där incheckaren valde att **dokumentera** dem.
     - används `hasAnyFiles(d)` för att avgöra vad som räknas som “dokumenterad”:
       - i nuläget: de med media (foto/video) hamnar här.

  3. **Befintliga skador (från BUHS) som inte dokumenterades**

     - rubrik: `Befintliga skador (från BUHS) som inte dokumenterades`.
     - innehåller BUHS‑skador där incheckaren valt “Går inte att dokumentera” / “Åtgärdade/Hittas ej”.
     - texten hämtas i princip från BUHS‑beskrivning (`fullText`) och eventuellt kommentar (t.ex. “Borta”).

- Mejlämnen:

  - `INCHECKAD: REGNR – [station] – !!! – HUVUDSTATION`
  - `INCHECKAD: REGNR – [station] – !!! – BILKONTROLL`

  där `!!!` används när det finns något att agera på, bl.a.:

  - nya skador,
  - dokumenterade eller icke dokumenterade BUHS‑skador,
  - rekondbehov,
  - Går inte att hyra ut,
  - varningslampa,
  - husdjur/rökning,
  - låg laddnivå / ej upptankad.

---

## 4. Mejlinnehåll – detaljerat nuläge

### 4.1 Huvudstationsmejl

Rubrik inne i mejlet:

- `REGNR incheckad`

Faktaruta:

- Bilmodell.
- Mätarställning (km).
- Hjultyp.
- (Antingen) Tankning eller Laddnivå + Laddkablar beroende på drivmedel.
- **Plats för incheckning:**
  - rad: `Plats för incheckning: ORT / STATION` (från `payload.ort` / `payload.station`).
- `Bilen står nu: ORT / STATION` (från `bilen_star_nu`).
- `Parkeringsinfo: ...` endast om `bilen_star_nu.kommentar` är ifyllt.

Varningsflaggor (överkant, gula och ev. blå) – i korthet:

- Nya skador dokumenterade.
- Går inte att hyra ut.
- Varningslampa.
- Låg laddnivå.
- Ej upptankad.
- Rekond behövs.
- Husdjur (sanering).
- Rökning (sanering).
- Insynsskydd saknas.
- **Saludatum** (endast Huvudstation):

  - Om Saludatum är < idag eller ≤ 10 dagar fram:
    - Banner med text enligt:

      - `Saludatum passerat! ...`
      - `Kontakta Bilkontroll ... Undvik långa hyror ...`

  - Ingen rad “Saludatum: …” i faktarutan (den togs bort per produktönskemål).

Sektioner:

1. `NYA SKADOR` (se 3.2 ovan).
2. `Befintliga skador (från BUHS) som dokumenterades`.
3. `Befintliga skador (från BUHS) som inte dokumenterades`.
4. `Kommentar` – rubrik (tidigare “Övrigt”), innehåller `payload.notering` om satt.
5. Längst ned:

   ```text
   Incheckad av: Per Andersson
   Datum: YYYY‑MM‑DD
   Tid: HH:MM
   ```

### 4.2 Bilkontrollmejl

Liknar Huvudstation men med några skillnader:

- Rubrik: `REGNR incheckad`.
- Faktaruta:

  - Bilmodell.
  - Mätarställning.
  - `Bilen står nu: ORT / STATION`.
  - `Parkeringsinfo` om ifyllt.

- Samma tre sektioner för skador:

  1. `NYA SKADOR`.
  2. `Befintliga skador (från BUHS) som dokumenterades`.
  3. `Befintliga skador (från BUHS) som inte dokumenterades`.

- `Kommentar`‑sektion finns här också (efter skadeavsnitten) med `payload.notering`.

- Signatur längst ned med “Incheckad av / Datum / Tid”.

---

## 5. Mottagare & routing – nuläge

### 5.1 Huvudstation

I `/api/notify/route.ts`:

- Basadress: `per@incheckad.se`.
- Om “Bilen står nu”‑ort (`payload.bilen_star_nu.ort`) är Helsingborg eller Ängelholm:
  - läggs även `helsingborg@mabi.se` till.

### 5.2 Bilkontroll

- Alltid: `per@incheckad.se`.
- Om ort är Helsingborg eller Ängelholm:
  - även `latif@incheckad.se`.

---

## 6. Kvarstående kända problem och TODOs

Detta är den viktigaste delen för din efterträdare.

### 6.1 Frontend‑bugg: “Buckla – Annan del” → “Skrapad fälg – Annan del”

Symptom:

- In `/check`, om en befintlig BUHS‑skada markeras som **Buckla – Annan del**:
  - i bekräftelsemodalen visas fortfarande “Skrapad fälg – Annan del”,
  - samma felaktiga text syns i mejlen.

Slutsats:

- `form-client.tsx` / sammanfattningslogiken använder inte användarens valda typ (`Buckla`) utan återanvänder en gammal text (troligen BUHS‑rawtext, t.ex. “Skrapad fälg”).
- Det innebär att `payload.dokumenterade_skador` som skickas till notify innehåller fel etikett redan innan backend får den.

Åtgärd (separat PR, frontend):

- Hitta där dokumenterade BUHS‑skador samlas inför:

  - bekräftelsemodalen,
  - `finalPayloadForNotification`.

- Säkerställ att:

  - `userType` / `userPositions` / `userDescription` från användarens val (typ, placering, kommentar) används,
  - inte en gammal `fullText`/`damage_type_raw` från BUHS som “titel”.

Denna bugg är **utanför** `/api/notify` och ingår inte i notify‑steget i backend, men påverkar användarupplevelsen och mejltexterna.

---

### 6.2 `checkin_damages.description` – NOT NULL‑fel

Se 2.3.1 ovan.

Kort:

- DB kräver NON NULL `description`.
- Notify kan i vissa fall försöka skriva `null`.
- Felkoden var 23502.

**Rekommenderad fix för nästa PR:**

- I `/api/notify/route.ts`, innan `damageInserts` och `checkinDamageInserts` byggs, införa en hjälpfunktion:

  ```ts
  const getDescription = (skada: any): string => {
    return (
      skada.userDescription ||
      skada.text ||
      skada.fullText ||
      ''
    );
  };
  ```

- Använd `getDescription(skada)` konsekvent för:

  - `damages.description`,
  - `checkin_damages.description`.

Det gör:

- att `description` aldrig är `null` i inserts,
- att constrainten får vara kvar,
- att vi kan se åtminstone BUHS‑texten när användaren inte skrivit någon extra kommentar.

---

### 6.3 SQL‑förslaget från tidigare bot: **gör inte något blint**

I en tidigare konversation föreslogs SQL av typen:

```sql
-- Alternativ A: DROP NOT NULL
ALTER TABLE public.checkin_damages
ALTER COLUMN description DROP NOT NULL;

-- Alternativ B: SET DEFAULT ''
ALTER TABLE public.checkin_damages
ALTER COLUMN description SET DEFAULT '';
```

Användaren (Per) har **inte** kört dessa kommandon ännu, eftersom det är oklart vilket alternativ som är bäst långsiktigt.

Rekommendation i denna brief:

- **Gör först kodfixen** enligt 6.2 (alltid sätta description ≠ null).
- Behåll gärna NOT NULL + ev. default `''`.
- Gör schemaändringar i DB medvetet och dokumenterat (ändringslogg, migrationsfil etc.), inte direkt via SQL‑klipp i UI utan spårbarhet.

---

### 6.4 Ytterligare småsaker att verifiera

1. **Saludatum‑logiken**

   - Är Saludatum‑varningsbannern nu visad endast i Huvudstationsmejlet?
   - Visas den bara när Saludatum är passerat eller inom 10 dagar?
   - Ingen “Saludatum: …”‑rad i faktadelen?

2. **“Plats för incheckning”**

   - Visas ovanför “Bilen står nu” i Huvudstationsmejlet.
   - Text: `Plats för incheckning: ORT / STATION` – inte datum/tid.

3. **Kommentar‑sektionen**

   - Rubrik: `Kommentar`.
   - Samma text (`payload.notering`) i både Huvudstation och Bilkontroll.

4. **Subject med “!!!”**

   - Kontrollera att `hasFarligaConditions` inkluderar:
     - nya skador,
     - dokumenterade/ej dokumenterade BUHS‑skador,
     - rekond, husdjur, rökning, varningslampa, Går inte att hyra ut, låg laddnivå/ej upptankad, insynsskydd saknas.
   - RXJ02Y‑scenariot med dokumenterade/ej dokumenterade BUHS‑skador bör ge `- !!! -`.

---

## 7. Sammanfattning för nästa utvecklare/bot

Du kan se detta som en “uppdragslista” från Per + tidigare Copilot.

### 7.1 Backend (notify/API)

Status 2025‑11‑20:

- `/api/notify`:

  - Skapar `checkins` med `status = 'COMPLETED'` (OK enligt constraint).
  - Skapar `damages` med `status = 'complete'` (OK enligt constraint).
  - Försöker skapa `checkin_damages` men kan stöta på NOT NULL‑fel på `description` i vissa fall.
  - Skickar mejl som i huvudsak uppfyller produktönskemålen.

Att göra härnäst (högst prio):

1. Justera beskrivningslogik för `description` (se 6.2).
2. Eventuellt snygga upp/återanvända hjälpfunktioner så att:

   - damage‑inserts och checkin_damages‑inserts delar kod för description/media.

### 7.2 Frontend (`/check`)

Status:

- Formuläret fungerar.
- Bekräftelsemodalen visar felaktig text för vissa BUHS‑skador (Buckla → Skrapad fälg).

Att göra:

1. Spåra var `existingDamages`/`dokumenterade_skador` byggs.
2. Se till att när användaren:

   - väljer “Buckla” och “Annan del”,
   - anger kommentar,

   så används just dessa värden i:

   - bekräftelsemodalen,
   - `finalPayloadForNotification`.
3. Verifiera att notify‑mejlen följer med på köpet (de läser bara payload).

### 7.3 Databas (Supabase) – disciplin

- Constraints på `status`‐kolumner i `checkins`/`damages` är nu kända och respekteras.

- RLS/policies:

  - `checkins` har RLS på, men `service_role` har redan full access via policy
    `"Allow service_role full access to checkins"`.
  - RLS är **inte** roten till tidigare insert‑fel (det var status/constraints).

- Framöver:

  - Var noga med att inspektera constraints **innan** du sätter hårdkodade statusvärden i koden.
  - Håll schemaändringar och kodändringar synkade och dokumenterade.

---

## 8. Hur den här briefen är tänkt att användas

Per (produktägare/användare) kan:

- ge denna fil till nästa Copilot‑agent/människa,
- säga:

  > Utgå från `docs/notify-status-2025-11-20.md`.  
  > Backend‑notify fungerar i stort, men fixa TODO‑punkterna i 6.x, framför allt:
  > 
  > - `checkin_damages.description` (NOT NULL),
  > - frontend‑buggen med fel skadeetikett,
  > - eventuella små mejljusteringar om något fortfarande saknas.

Allt arbete framåt bör referera tillbaka hit, så den här filen hålls uppdaterad vid större ändringar.
