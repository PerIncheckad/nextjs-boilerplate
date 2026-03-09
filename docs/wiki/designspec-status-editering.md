# Designspec: /status-editering + skadekategorisering

## Senast uppdaterad: 2026-03-09
## Status: Godkänd design, redo för implementation

---

## 1. SAMMANFATTNING

Denna spec beskriver tre sammanhängande funktioner:

1. **Editerbar /status** — alla fordonsfakta kan redigeras direkt i webbläsaren
2. **Skadekategorisering** — skador delas upp i fyra kategorier i SKADOR-sektionen och utskrift
3. **Skadekommentarer** — kommentarer kan läggas på enskilda skador

Alla ändringar loggas i historiken. Utskrift stödjer svartvitt.

---

## 2. DATABAS — NYA TABELLER

### 2a. `vehicle_edits` — Manuella ändringar av fordonsfakta

Sparar varje ändring som en egen rad. Överlever CSV-reimporter (vehicles/nybil_inventering rörs inte).

```sql
CREATE TABLE vehicle_edits (
  id BIGSERIAL PRIMARY KEY,
  regnr TEXT NOT NULL,
  field_name TEXT NOT NULL,        -- t.ex. 'hjultyp', 'is_sold', 'matarstallning'
  new_value TEXT,                   -- nytt värde (NULL tillåtet, t.ex. för att "nolla" ett fält)
  old_value TEXT,                   -- tidigare värde (för historikvisning)
  edited_by TEXT NOT NULL,          -- e-postadress från magic link
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comment TEXT                      -- valfri kommentar, t.ex. "Däckskifte utfört av verkstad"
);

-- Index för snabb lookup per reg.nr
CREATE INDEX idx_vehicle_edits_regnr ON vehicle_edits(regnr);

-- Index för att hämta senaste edit per fält
CREATE INDEX idx_vehicle_edits_regnr_field ON vehicle_edits(regnr, field_name, edited_at DESC);
```

**Fältnamn som används (field_name):**

| field_name | Beskrivning | Värde-format |
|---|---|---|
| `hjultyp` | Däck som sitter på | Fritext, t.ex. "Sommardäck" |
| `matarstallning` | Mätarställning i km | Numeriskt, t.ex. "48500" |
| `drivmedel` | Bränsletyp | En av: Bensin, Diesel, Hybrid (bensin), Hybrid (diesel), 100% el |
| `bilmarke_modell` | Bilmärke & Modell | Fritext, t.ex. "MB SPRINTER" |
| `serviceintervall` | Serviceintervall | Fritext, t.ex. "30000 km" |
| `max_km_manad` | Max km/månad | Fritext, t.ex. "2500 km" |
| `avgift_over_km` | Avgift över-km | Fritext, t.ex. "1.50 kr" |
| `planerad_station` | Planerad station | Fritext |
| `is_sold` | Såld-markering | "true" eller "false" |
| `saludatum` | Saludatum | ISO-datum, t.ex. "2026-03-15" |
| `salu_kommentar` | Kommentar vid försäljning | Fritext |
| `anteckningar` | Generell kommentar | Fritext |
| `stold_gps` | Stöld-GPS | "Ja", "Nej", eller "Ja (spec)" |
| `klar_for_uthyrning` | Redo att hyras ut | "true" eller "false" |

Listan kan utökas utan schemaändring — `field_name` är fritext.

### 2b. `damage_comments` — Kommentarer på enskilda skador

```sql
CREATE TABLE damage_comments (
  id BIGSERIAL PRIMARY KEY,
  damage_id BIGINT NOT NULL,       -- referens till damages.id
  comment TEXT NOT NULL,
  created_by TEXT NOT NULL,         -- e-postadress från magic link
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index för snabb lookup per skada
CREATE INDEX idx_damage_comments_damage_id ON damage_comments(damage_id);
```

**Viktigt:** `damage_id` refererar till `damages.id`. Varje kommentar knyts till en specifik skada, som i sin tur tillhör ett reg.nr via `damages.regnr`.

---

## 3. SKADEKATEGORISERING I /STATUS

### 3a. Fyra kategorier

SKADOR-sektionen och utskriftsvyn delas in i fyra underrubriker. Varje kategori sorteras kronologiskt, nyast först.

**1. Dokumenterade skador**
- Skador som verifierats med foto i incheckad.se
- Inkluderar:
  - BUHS-skador med `type=documented` i checkin_damages
  - Nya skador med `type=new` i checkin_damages
  - Legacy `type=existing` (9 rader från 2025-12-16, behandlas som dokumenterade)
- Har medialänk om `folder` finns

**2. Ej återfunna skador**
- BUHS-skador med `type=not_found` i checkin_damages
- EXKLUSIVE däck-/fälgskador (se TIRE_WHEEL_MAPPING nedan)
- Troligaste förklaring: skadan har reparerats (t.ex. polerats bort)
- Ingen medialänk

**3. Ej återfunna däck-/fälgskador**
- BUHS-skador med `type=not_found` i checkin_damages
- Skadetyp matchar TIRE_WHEEL_MAPPING i `normalizeDamageType.ts`
- Troligaste förklaring: skadan sitter på hjul som inte var monterade vid incheckningstillfället
- Ingen medialänk

**4. Ej hanterade i incheckad.se**
- BUHS-skador som aldrig processats i appen
- Identifieras via `is_unmatched_buhs = true` i DamageRecord (inget matchande checkin_damages-rad)
- Orsak: bilen har inte checkats in sedan skadan importerades, eller skadan missades vid incheckning

### 3b. TIRE_WHEEL_MAPPING (från `app/api/notify/normalizeDamageType.ts`)

Följande skadetyper räknas som däck-/fälgskador:

| Skadetyp (Swedish) | typeCode |
|---|---|
| Däckskada | DACKSKADA |
| Däckskada sommarhjul | DACKSKADA_SOMMAR |
| Däckskada vinterhjul | DACKSKADA_VINTER |
| Fälgskada sommarhjul | FALGSKADA_SOMMARHJUL |
| Fälgskada vinterhjul | FALGSKADA_VINTERHJUL |
| Skrapad fälg | SKRAPAD_FALG |
| Punktering | PUNKTERING |

### 3c. Utskrift

- Svartvitt — inga färger, inga ikoner
- Varje kategori får sin egen rubrik
- Kronologisk ordning per kategori (nyast först)
- Kommentarer (från `damage_comments`) visas under respektive skada

---

## 4. /STATUS-EDITERING — UI-DESIGN

### 4a. Principer

- Följer befintligt grafiskt format på incheckad.se
- Namn istället för e-post i UI (använd `getFullNameFromEmail()`)
- Batch-editering: användaren gör flera ändringar → trycker "Spara ändringar" → bekräftelse-modal → spara
- Ingen ångra-knapp (bekräftelse-modalen är tillräcklig)

### 4b. Redigeringsflöde

1. Användaren klickar "Redigera" (knapp synlig för inloggade)
2. Editerbara fält blir interaktiva (inline-redigering eller dropdown)
3. Ändringar markeras visuellt (t.ex. fält med ändrad bakgrundsfärg)
4. Användaren klickar "Spara ändringar"
5. Bekräftelse-modal visar alla ändringar:
   ```
   Du har gjort följande ändringar:
   
   • Däck som sitter på: Vinterdäck → Sommardäck
     Kommentar: Däckskifte utfört av verkstad
   • Mätarställning: 48 230 km → 48 500 km
   
   Vill du spara?
   [Avbryt]  [Spara]
   ```
6. Vid "Spara": en INSERT per ändring i `vehicle_edits`
7. Sidan laddas om och visar uppdaterade värden

### 4c. "Markera som såld"

- Egen prominent knapp (inte del av den generella redigeringen)
- Klick öppnar modal:
  ```
  Markera [REG.NR] som såld
  
  Saludatum (valfritt): [datumfält]
  Kommentar (valfritt): [fritextfält]
  
  [Avbryt]  [Markera som såld]
  ```
- Sparar tre rader i `vehicle_edits`:
  - `field_name='is_sold'`, `new_value='true'`
  - `field_name='saludatum'`, `new_value='2026-03-15'` (om angivet)
  - `field_name='salu_kommentar'`, `new_value='...'` (om angivet)
- Banner "SÅLD" (+ ev. datum) visas högst upp i /status
- **Reverserbar**: om bilen är markerad som såld visas knapp "Ta bort såld-markering" med ny bekräftelse-modal
  - Sparar ny rad: `field_name='is_sold'`, `new_value='false'`, `old_value='true'`

### 4d. Skadekommentarer

- Under varje skada i SKADOR-sektionen: länk "Lägg till kommentar"
- Klick expanderar ett textfält + "Spara kommentar"-knapp
- Sparar till `damage_comments`-tabellen
- Kommentarer visas under skadan med namn och datum:
  ```
  Repa - Dörr utsida (Höger fram) — 2025-09-25
  Dokumenterad av Nimet Mecaj 2026-01-19
  📁 Visa media
  
    💬 Polerad av verkstad, inte längre synlig. — Per Andersson, 2026-03-10
    💬 Bekräftat vid besiktning. — Anders Larsson, 2026-03-12
  ```
- Varje ny kommentar skapar också en händelse i Historik

---

## 5. VEHICLE-STATUS.TS — ÄNDRINGAR

### 5a. Ny datahämtning

`getVehicleStatus()` behöver hämta ytterligare två tabeller i sin `Promise.all`:

```typescript
// vehicle_edits — manuella ändringar
supabase
  .from('vehicle_edits')
  .select('*')
  .eq('regnr', cleanedRegnr)
  .order('edited_at', { ascending: false }),

// damage_comments — skadekommentarer
supabase
  .from('damage_comments')
  .select('*')
  .order('created_at', { ascending: true }),
```

### 5b. Prioriteringskedja med edits

Nuvarande kedja: `latestCheckin → nybilData → vehicleData`

Ny kedja: **`vehicle_edits (senaste per fält) → latestCheckin → nybilData → vehicleData`**

Implementation: Bygg en Map av senaste edit per fält:
```typescript
const latestEdits = new Map<string, { value: string; date: string; editedBy: string }>();
for (const edit of vehicleEditsData) {
  if (!latestEdits.has(edit.field_name)) {
    latestEdits.set(edit.field_name, {
      value: edit.new_value,
      date: edit.edited_at,
      editedBy: edit.edited_by,
    });
  }
}
```

Sedan i vehicle-bygget:
```typescript
hjultyp: latestEdits.get('hjultyp')?.value
  || latestCheckin?.hjultyp
  || nybilData?.hjultyp
  || '---',
```

### 5c. matarstallningKalla vid edit

```typescript
matarstallningKalla: latestEdits.has('matarstallning')
  ? `redigerad ${formatDate(latestEdits.get('matarstallning')!.date)}`
  : latestCheckin?.odometer_km && (latestCheckin?.completed_at || latestCheckin?.created_at)
    ? `incheckning ${formatDate(latestCheckin.completed_at || latestCheckin.created_at)}`
    : ...
```

### 5d. BÅDA kodvägarna

**KRITISKT:** Alla ändringar ovan måste implementeras i BÅDA kodvägarna:
- Kodväg 1 (~rad 1375): `source === 'checkins'`
- Kodväg 2 (~rad 2278): nybilData finns

### 5e. Ny historiktyp: manuell_andring

Varje rad i `vehicle_edits` blir en HistoryRecord:
```typescript
{
  id: `edit-${edit.id}`,
  datum: formatDateTime(edit.edited_at),
  rawTimestamp: edit.edited_at,
  typ: 'manual',
  sammanfattning: `${fieldDisplayName}: ${edit.old_value || '---'} → ${edit.new_value || '---'}`,
  utfordAv: getFullNameFromEmail(edit.edited_by),
}
```

Varje rad i `damage_comments` blir också en HistoryRecord:
```typescript
{
  id: `damage-comment-${comment.id}`,
  datum: formatDateTime(comment.created_at),
  rawTimestamp: comment.created_at,
  typ: 'manual',
  sammanfattning: `Kommentar på skada: "${comment.comment.substring(0, 80)}..."`,
  utfordAv: getFullNameFromEmail(comment.created_by),
}
```

### 5f. Skadekategorisering i DamageRecord

Ny egenskap på DamageRecord:
```typescript
damageCategory: 'documented' | 'not_found' | 'not_found_tire_wheel' | 'unhandled';
```

Logik:
```typescript
function getDamageCategory(damage: DamageRecord): string {
  // Nya skador och documented = "Dokumenterade"
  if (damage.source === 'checkin') return 'documented';  // type=new
  if (damage.is_handled && !damage.status?.startsWith('Gick ej')) return 'documented';  // type=documented/existing
  
  // not_found: kolla om däck/fälg
  if (damage.status?.startsWith('Gick ej')) {
    const isTireWheel = TIRE_WHEEL_TYPES.includes(
      normalizeDamageTypeForKey(damage.skadetyp)
    );
    return isTireWheel ? 'not_found_tire_wheel' : 'not_found';
  }
  
  // Omatchad BUHS
  if (damage.is_unmatched_buhs) return 'unhandled';
  
  // Fallback
  return 'documented';
}
```

TIRE_WHEEL_TYPES (från TIRE_WHEEL_MAPPING):
```typescript
const TIRE_WHEEL_TYPES = [
  'DACKSKADA', 'DACKSKADA_SOMMAR', 'DACKSKADA_VINTER',
  'FALGSKADA_SOMMARHJUL', 'FALGSKADA_VINTERHJUL',
  'SKRAPAD_FALG', 'PUNKTERING'
];
```

---

## 6. FORM-CLIENT.TSX — ÄNDRINGAR

### 6a. Nytt API-endpoint

Ny API-route: `app/api/vehicle-edits/route.ts`
- POST: Spara batch av edits
- Autentisering via Supabase auth (magic link)
- Returnerar inserted rows

Ny API-route: `app/api/damage-comments/route.ts`
- POST: Spara enskild kommentar
- Returnerar inserted row

### 6b. SKADOR-sektionen — Fyra underrubriker

```jsx
{/* Dokumenterade skador */}
{documentedDamages.length > 0 && (
  <>
    <h3>Dokumenterade skador</h3>
    {documentedDamages.map(d => <DamageItem ... />)}
  </>
)}

{/* Ej återfunna skador */}
{notFoundDamages.length > 0 && (
  <>
    <h3>Ej återfunna skador</h3>
    {notFoundDamages.map(d => <DamageItem ... />)}
  </>
)}

{/* Ej återfunna däck-/fälgskador */}
{notFoundTireWheelDamages.length > 0 && (
  <>
    <h3>Ej återfunna däck-/fälgskador</h3>
    {notFoundTireWheelDamages.map(d => <DamageItem ... />)}
  </>
)}

{/* Ej hanterade i incheckad.se */}
{unhandledDamages.length > 0 && (
  <>
    <h3>Ej hanterade i incheckad.se</h3>
    {unhandledDamages.map(d => <DamageItem ... />)}
  </>
)}
```

### 6c. Utskrift (print view)

Samma indelning som ovan. Svartvitt, rubriker ger tillräcklig distinktion.

---

## 7. IMPLEMENTATIONSORDNING

### Fas 1: vehicle_edits + grundläggande editering (MVP)

1. Skapa `vehicle_edits`-tabell i Supabase (SQL ovan)
2. Skapa API-route `app/api/vehicle-edits/route.ts`
3. Uppdatera `lib/vehicle-status.ts`:
   - Hämta vehicle_edits i Promise.all
   - Bygga latestEdits Map
   - Applicera edits i prioriteringskedjan (BÅDA kodvägarna)
   - Bygga HistoryRecord för varje edit
4. Uppdatera `app/status/form-client.tsx`:
   - "Redigera"-knapp
   - Inline-editering av fordonsfakta-fält
   - Bekräftelse-modal
   - "Spara ändringar" → POST till API

### Fas 2: "Markera som såld"

5. "Markera som såld"-knapp med modal (datum + fritext)
6. Banner "SÅLD" högst upp i /status
7. "Ta bort såld-markering"-knapp
8. Utöka PR #279 att filtrera `vehicles.is_sold` (inte bara `nybil_inventering`)

### Fas 3: Skadekategorisering

9. Skapa `damage_comments`-tabell i Supabase
10. Skapa API-route `app/api/damage-comments/route.ts`
11. Uppdatera vehicle-status.ts:
    - Hämta damage_comments
    - Beräkna damageCategory per DamageRecord
    - Koppla kommentarer till skador
12. Uppdatera form-client.tsx:
    - Fyra underrubriker i SKADOR-sektionen
    - "Lägg till kommentar" per skada
    - Kommentarer i utskriftsvyn

---

## 8. TEKNISKA PÅMINNELSER

- **BÅDA kodvägarna** — vehicle-status.ts rad ~1375 OCH ~2278
- **Namn, inte e-post** — använd `getFullNameFromEmail()` i all UI
- **Sök-och-ersätt** — Per arbetar via GitHub web editor; ge exakta söksträngar
- **Små PR:er** — en funktion per PR, testa i Vercel preview
- **SQL-verifiering** — kör COUNT/SELECT innan features som beror på data
- **RLS** — Supabase Row Level Security kan blockera writes; testa alltid
- **Testreg.nr** — ZAG53Y, LRA75R, JBU34P (MB elbil), NGW96M (MB diesel)

---

## 9. ÖPPNA FRÅGOR (inga kvar)

Alla designbeslut är fattade. Specen är redo för implementation.

---

*Designspec skapad 2026-03-09 av Claude Opus 4.6. Baserad på diskussioner med Per 2026-02-25 till 2026-03-09.*
