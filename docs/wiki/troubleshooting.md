# Felsökning & Vanliga Problem

**Syfte:** Snabbreferens för vanliga fel och deras lösningar i MABI Syd Incheckningssystem. 

**Använd Ctrl+F för att söka efter felmeddelanden! **

---

## 📋 Innehåll

1. [Databas-fel (Supabase)](#1-databas-fel-supabase)
2. [CSV-import problem](#2-csv-import-problem)
3. [API-fel (BUHS, Vehicle API)](#3-api-fel-buhs-vehicle-api)
4. [Email-problem (Resend)](#4-email-problem-resend)
5. [Frontend-fel (/check, /nybil, /status)](#5-frontend-fel-check-nybil-status)
6. [Media-upload problem (Supabase Storage)](#6-media-upload-problem-supabase-storage)
7. [Deploy-problem (Vercel)](#7-deploy-problem-vercel)

---

## 1) Databas-fel (Supabase)

### ❌ `new row violates check constraint "checkins_status_chk"`

**Orsak:** Ogiltigt värde i `status`-fältet. 

**Giltiga värden:** `NULL`, `'checked_in'`, `'COMPLETED'`

**Lösning:**
```sql
-- RÄTT
INSERT INTO checkins (status, ...) VALUES ('COMPLETED', ...);

-- FEL
INSERT INTO checkins (status, ...) VALUES ('completed', ...);  -- gemener
INSERT INTO checkins (status, ...) VALUES ('Complete', ...);   -- fel format
```

**Se även:** [database-constraints.md](./database-constraints. md#status-status)

---

### ❌ `new row violates check constraint "checkins_tires_type_check"`

**Orsak:** Ogiltigt värde i `tires_type`-fältet.

**Giltiga värden:** `'sommar'`, `'vinter'`

**Lösning:**
```sql
-- RÄTT
INSERT INTO checkins (tires_type, ...) VALUES ('vinter', ...);

-- FEL
INSERT INTO checkins (tires_type, ...) VALUES ('Vinterdäck', ...);  -- fel text
INSERT INTO checkins (tires_type, ...) VALUES ('VINTER', ...);      -- versaler
INSERT INTO checkins (tires_type, ...) VALUES (NULL, ...);          -- NULL tillåts EJ
```

**Tips:** Utelämna fältet helt om värdet saknas: 
```sql
INSERT INTO checkins (regnr, odometer_km, status)
VALUES ('ABC123', 4256, 'COMPLETED');
-- tires_type blir NULL automatiskt
```

---

### ❌ `new row violates check constraint "checkins_region_chk"`

**Orsak:** Ogiltigt värde i `region`-fältet.

**Giltiga värden:** `'NORR'`, `'MITT'`, `'SYD'`

**Lösning:**
```sql
-- RÄTT
INSERT INTO checkins (region, ...) VALUES ('SYD', ...);

-- FEL
INSERT INTO checkins (region, .. .) VALUES ('Syd', ...);   -- gemener
INSERT INTO checkins (region, ...) VALUES ('VÄST', ...);  -- finns inte!
```

**Mappning:**
- **SYD:** Helsingborg, Ängelholm, Malmö, Lund, Trelleborg
- **MITT:** Göteborg, Varberg
- **NORR:** Sundsvall, Umeå

---

### ❌ `duplicate key value violates unique constraint`

**Orsak:** Försöker skapa rad som redan finns (baserat på unique constraint).

**Vanliga fall:**

#### Fall 1: Dubbel incheckning
```sql
-- Dubblettcheck FÖRE insert
SELECT * FROM checkins 
WHERE regnr = 'ABC123' 
  AND DATE(created_at) = CURRENT_DATE;

-- Om rader finns:  uppdatera istället för insert
```

#### Fall 2: CSV-import med dubbletter
```sql
-- Radera dubbletter i staging-tabell
DELETE FROM mabi_damage_data_raw_new
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM mabi_damage_data_raw_new
  GROUP BY regnr, damage_date, damage_type_raw, COALESCE(note_customer, '')
);
```

**Se även:** [CSV-import.md § 4 Felsökning](./CSV-import.md#4-felsökning)

---

### ❌ `column "note_customer" does not exist`

**Orsak:** Fel kolumnnamn i SQL-query.

**Lösning:** Kontrollera korrekt kolumnnamn i [Database.md](./Database.md)

**Vanliga misstag:**

| Fel namn | Korrekt namn | Tabell |
|----------|-------------|--------|
| `note_customer` | Finns EJ i `checkin_damages` | checkin_damages |
| `description` | `legacy_damage_source_text` (för BUHS) | damages |
| `brand_model` | `bilmodel` ELLER separata `brand`/`model` | Beroende på källa |

**Tips:** Visa alla kolumner för en tabell:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'checkin_damages' 
  AND table_schema = 'public'
ORDER BY ordinal_position;
```

---

### ❌ `foreign key constraint violation`

**Orsak:** Försöker referera till en rad som inte finns (t.ex. ogiltigt `checkin_id`).

**Lösning:**
```sql
-- Kontrollera att checkin finns FÖRE insert i checkin_damages
SELECT id FROM checkins WHERE id = 'abc-123-def-456';

-- Om tom:  skapa checkin först, använd sedan det ID:t
```

---

### ❌ `permission denied for table X`

**Orsak:** RLS (Row Level Security) blockerar åtkomst.

**Lösning (för development):**
```sql
-- Tillfälligt inaktivera RLS (endast för testing!)
ALTER TABLE damages DISABLE ROW LEVEL SECURITY;

-- Aktivera igen efter test
ALTER TABLE damages ENABLE ROW LEVEL SECURITY;
```

**Lösning (för production):** Lägg till RLS-policy för din användare/roll. 

---

## 2) CSV-import problem

### ❌ Import visar "NYA SKADOR" fast de redan importerats

**Orsak:** Samma BUHS-skador importerade från både API och CSV.

**Lösning:** Se [csv-import-dubbel-rad.md](./csv-import-dubbel-rad.md)

**Snabbfix:** Implementera loose BUHS matching i `lib/damages. ts`.

---

### ❌ "Columns don't match" vid CSV-import i Supabase UI

**Orsak:** CSV har fel kolumnnamn eller extra kolumner.

**Lösning:**

1. **Kontrollera kolumnnamn** mot [CSV-import.md § 1](./CSV-import.md#1-källfiler-och-förberedelse)

2. **Ta bort ALLA extra kolumner** i Excel (även tomma till höger!)

3. **Spara som "CSV UTF-8 (kommaavgränsad)"**

**Exempel (Skadefilen):**
```
Korrekt:  regnr,saludatum,damage_date,damage_type_raw,note_customer,note_internal,vehiclenote
Fel:      RegNr,Salu datum,Skadedatum,Skadetyp,...  (original Excel-namn)
```

---

### ❌ BUHS-skador har `source='CHECK'` istället för `'BUHS'`

**Orsak:** Gammal UPSERT-SQL som inte sätter `source`-fältet.

**Lösning:** 
```sql
-- Fixa befintliga rader
UPDATE damages
SET source = 'BUHS'
WHERE source = 'CHECK'
  AND damage_type_raw IS NOT NULL
  AND user_type IS NULL
  AND uploads IS NULL;

-- Verifiera
SELECT source, COUNT(*) FROM damages GROUP BY source;
```

**Framtida importer:** Använd korrekt UPSERT-SQL från [CSV-import.md § 2 Steg 5](./CSV-import.md#steg-5-upsert-från-staging-till-damages)

---

### ❌ Antal rader i `damages` ≠ antal rader i `damages_external`

**Orsak:** Glömt uppdatera `damages_external` efter BUHS-import.

**Lösning:**
```sql
-- Töm och återskapa damages_external
TRUNCATE damages_external;

INSERT INTO damages_external (
  regnr, saludatum, damage_date, damage_type_raw,
  note_customer, note_internal, vehiclenote
)
SELECT 
  regnr, saludatum, damage_date, damage_type_raw,
  note_customer, note_internal, vehiclenote
FROM damages
WHERE source = 'BUHS';

-- Verifiera
SELECT COUNT(*) FROM damages WHERE source = 'BUHS';
SELECT COUNT(*) FROM damages_external;
-- Båda ska vara samma! 
```

---

## 3) API-fel (BUHS, Vehicle API)

### ❌ `Failed to fetch BUHS damages:  404 Not Found`

**Orsak:** Registreringsnumret finns inte i BUHS-databasen. 

**Lösning:** Detta är OK!  Betyder att bilen inte har några BUHS-skador. 

**Logik i kod:**
```typescript
if (!response.ok) {
  if (response.status === 404) {
    return []; // Inga skador - detta är OK
  }
  throw new Error(`BUHS API error: ${response. status}`);
}
```

---

### ❌ `BUHS API returned 500 Internal Server Error`

**Orsak:** Problem på BUHS-servern (inte vårt fel).

**Lösning:** 
1. **Retry efter 30 sekunder**
2. Om fortsatt fel:  **Skippa BUHS-anrop** och fortsätt utan externa skador
3. Importera manuellt från CSV senare

**Kontakt:** MABI IT-support om problemet kvarstår >1 timme

---

### ❌ `Vehicle API timeout`

**Orsak:** Långsam respons från fordonsinformations-API.

**Lösning:**
```typescript
// Öka timeout i fetch-anrop
const response = await fetch(apiUrl, {
  signal: AbortSignal.timeout(10000) // 10 sekunder istället för 5
});
```

---

### ❌ `Invalid regnr format` från Vehicle API

**Orsak:** Registreringsnummer i fel format (innehåller mellanslag, bindestreck etc).

**Lösning:**
```typescript
// Normalisera regnr FÖRE API-anrop
const cleanRegnr = regnr. toUpperCase().replace(/[^A-Z0-9]/g, '');
```

---

## 4) Email-problem (Resend)

### ❌ `Email not sent:  403 Forbidden`

**Orsak:** Ogiltig eller utgången Resend API-nyckel.

**Lösning:**
1.  Kontrollera `RESEND_API_KEY` i Vercel Environment Variables
2. Generera ny API-nyckel på [resend.com](https://resend.com)
3. Uppdatera i Vercel → Redeploy

---

### ❌ Email skickas men kommer inte fram

**Möjliga orsaker:**

#### 1. Hamnar i spam
**Lösning:** Lägg till `@incheckad.se` i mottagarens safe senders

#### 2. Fel mottagaradress
**Lösning:** Kontrollera stationEmailMapping i `app/api/notify/route.ts`:
```typescript
const stationEmailMapping: Record<string, string> = {
  'Malmö': 'malmo@incheckad.se',
  'Helsingborg': 'helsingborg@incheckad.se',
  // ...
};
```

#### 3. Resend domain-verifiering saknas
**Lösning:** Verifiera `@incheckad.se` domain i Resend dashboard

---

### ❌ Email-formatering ser trasig ut (dark mode)

**Orsak:** Email-klient tvingar dark mode.

**Lösning:** Redan fixat i kod med `!important`-stilar:
```html
<body style="background:#f9fafb! important;color:#000! important;">
```

**Om problemet kvarstår:** Be mottagaren inaktivera dark mode för email. 

---

## 5) Frontend-fel (/check, /nybil, /status)

### ❌ `/check` visar "NYA SKADOR:  10" fast skadorna redan dokumenterats

**Orsak:** Dubbel-rad BUHS-import (API + CSV).

**Lösning:** Se [csv-import-dubbel-rad.md](./csv-import-dubbel-rad. md)

---

### ❌ `/status` visar "Ingen information" fast bilen finns i DB

**Orsak:** Registreringsnumret matchar inte exakt (mellanslag, bindestreck).

**Lösning:**
```sql
-- Kontrollera exakt format i DB
SELECT regnr FROM checkins WHERE regnr LIKE '%ABC%';

-- Om fel format: uppdatera
UPDATE checkins SET regnr = 'ABC123' WHERE regnr = 'ABC 123';
```

**Prevention:** Normalisera regnr vid insert: 
```typescript
const cleanRegnr = regnr.toUpperCase().replace(/[^A-Z0-9]/g, '');
```

---

### ❌ Saludatum-varning visas inte i `/check`

**Orsak:** `hasRiskSaludatum` inte satt i payload.

**Lösning:** Kontrollera att `lib/saludatum-utils.ts` anropas:
```typescript
const saludatumInfo = getSaludatumInfo(vehicleData?. saludatum);
const hasRiskSaludatum = saludatumInfo. hasRisk;
```

---

### ❌ Laddnivå-varning triggas inte vid <95%

**Orsak:** Fel tröskel i kod.

**Kontrollera:**
```typescript
// app/api/notify/route.ts
const showChargeWarning = 
  payload. drivmedel === 'elbil' && 
  parseInt(payload.laddning?. laddniva, 10) < 95; // Ska vara 95! 
```

---

### ❌ Bilder visas inte i `/status`

**Orsak:** Felaktig URL-konstruktion eller RLS-problem i Storage.

**Lösning:**

1. **Kontrollera URL-format:**
```typescript
// Korrekt
const url = `${supabaseUrl}/storage/v1/object/public/damage-photos/${folder}/${filename}`;

// Fel
const url = `${supabaseUrl}/storage/damage-photos/${folder}/${filename}`; // Saknar /v1/object/public/
```

2. **Kontrollera Storage RLS:**
   - Gå till Supabase → Storage → damage-photos
   - Säkerställ att mappen är `public`

---

## 6) Media-upload problem (Supabase Storage)

### ❌ `Upload failed: 413 Payload Too Large`

**Orsak:** Fil >50MB (Supabase limit på gratis plan).

**Lösning:**
1. **Komprimera bilder** före upload (max 10MB rekommenderat)
2. **Använd video endast för verkligt nödvändiga fall**

**Kod-fix:**
```typescript
// Lägg till validering
if (file.size > 10 * 1024 * 1024) {
  throw new Error('Filen är för stor (max 10MB)');
}
```

---

### ❌ `Upload failed: Invalid file type`

**Orsak:** Filtyp inte tillåten.

**Tillåtna typer:**
- Bilder:  `image/jpeg`, `image/png`, `image/heic`
- Video: `video/mp4`, `video/quicktime`

**Lösning:**
```typescript
const allowedTypes = ['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime'];
if (!allowedTypes.includes(file.type)) {
  throw new Error(`Filtyp ${file.type} är inte tillåten`);
}
```

---

### ❌ Bilder försvinner efter några dagar

**Orsak:** Storage lifecycle policy raderar gamla filer.

**Lösning:** Kontrollera Storage policies i Supabase:
```sql
-- Visa alla lifecycle policies
SELECT * FROM storage. buckets WHERE name = 'damage-photos';
```

**Inaktivera auto-delete om satt.**

---

## 7) Deploy-problem (Vercel)

### ❌ Build fails: `Module not found`

**Orsak:** Dependency saknas i `package.json`.

**Lösning:**
```bash
# Lokalt
npm install <package-name>
git add package.json package-lock.json
git commit -m "Add missing dependency"
git push

# Vercel kommer auto-redeploy
```

---

### ❌ `Environment variable NEXT_PUBLIC_SUPABASE_URL is not defined`

**Orsak:** Miljövariabel saknas i Vercel.

**Lösning:**
1. Gå till Vercel Dashboard → Project → Settings → Environment Variables
2. Lägg till variabel:
   - Key: `NEXT_PUBLIC_SUPABASE_URL`
   - Value: `https://xxxxx.supabase.co`
3. Redeploy

---

### ❌ Deploy OK men funktioner fungerar inte i production

**Orsak:** Använder development-variabler istället för production.

**Kontrollera:**
```typescript
// Fel (hårdkodat development)
const supabaseUrl = 'http://localhost:54321';

// Rätt (använd env)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL! ;
```

---

### ❌ Vercel Function Timeout (>10s)

**Orsak:** Långsam API-anrop (BUHS, Vehicle API).

**Lösning:**
1. **Implementera timeout:**
```typescript
const response = await fetch(apiUrl, {
  signal: AbortSignal.timeout(8000) // 8s max
});
```

2. **Cacha resultat** där möjligt

3. **Uppgradera till Vercel Pro** (60s timeout) om absolut nödvändigt

---

## 8) Generella debugging-tips

### SQL Debugging

```sql
-- Visa alla transactions från idag
SELECT * FROM checkins 
WHERE DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC;

-- Hitta dubbletter
SELECT regnr, COUNT(*) 
FROM checkins 
WHERE DATE(created_at) = CURRENT_DATE
GROUP BY regnr 
HAVING COUNT(*) > 1;

-- Visa alla fel-formatterade regnr
SELECT DISTINCT regnr 
FROM checkins 
WHERE regnr ~ '[^A-Z0-9]' -- Innehåller icke-alfanumeriska tecken
ORDER BY regnr;
```

---

### Frontend Debugging

**Browser Console:**
```javascript
// Visa full payload som skickas till API
console.log('Payload:', JSON.stringify(payload, null, 2));

// Verifiera regnr-normalisering
const regnr = "ABC 123";
console.log(regnr.toUpperCase().replace(/[^A-Z0-9]/g, '')); // "ABC123"
```

---

### API Debugging

**Testa BUHS API manuellt:**
```bash
curl -X POST https://your-api.com/buhs/damages \
  -H "Content-Type: application/json" \
  -d '{"regnr":  "ABC123"}'
```

---

## 9) Kontakt vid akuta problem

| Problem typ | Kontakt | Responstid |
|------------|---------|------------|
| Databas-fel | per@incheckad.se | <2h kontorstid |
| Email fungerar ej | per@incheckad. se | <1h |
| BUHS API nere | MABI IT-support | <4h |
| Akut systemkrasch | Ring Per:  070-XXX XX XX | Omedelbart |

---

## 10) Relaterad dokumentation

- [database-constraints.md](./database-constraints. md) - Check constraints & giltiga värden
- [CSV-import. md](./CSV-import.md) - CSV-import-guide
- [csv-import-dubbel-rad.md](./csv-import-dubbel-rad.md) - Dubbel-rad BUHS-hantering
- [Database.md](./Database.md) - Fullständig databasstruktur

---

**Senast uppdaterad:** 2026-01-16  
**Ägare:** Per Andersson (per@incheckad.se)  
**Version:** 1.0
