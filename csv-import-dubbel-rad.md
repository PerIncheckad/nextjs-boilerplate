# Hantering av dubbel-rad BUHS-import (Alternativ C)

**Problem:** CSV-import visar "NYA SKADOR" trots att samma BUHS-skador redan importerats via API. 

**Lösning:** Loose BUHS matching - tillåt dubbletter i DB, filtrera smart i `/check`.

---

## 1) Problemet

### Scenario: 
1.  Bil incheckas via `/check` → 10 BUHS-skador importeras automatiskt från API
2. Dessa 10 skador dokumenteras i `damages`-tabellen med:  
   - `source='BUHS'`
   - `legacy_damage_source_text='buhs_v1_api'` 
   - `original_damage_date='2025-11-15'`

3. Senare försöker användaren importera samma BUHS-data från CSV
4. `/check`-sidan visar **"NYA SKADOR:  10"** felaktigt (de är inte nya!)

### Orsak:  
Logiken i `lib/damages.ts` matchar endast exakt `legacy_damage_source_text`:
```typescript
const key = `${regnr}|${d.original_damage_date}`;
```

Men: 
- BUHS från CSV har:  `legacy_damage_source_text='buhs_csv_import'`  
- BUHS från API har: `legacy_damage_source_text='buhs_v1_api'`

→ **De matchar INTE**, så CSV-skadorna visas som "nya"!

---

## 2) Lösningen: Loose BUHS Matching

### Princip:
Importera CSV-skador som **SEPARATA RADER** med `legacy_damage_source_text='buhs_csv_import'`, men **filtrera bort dem från "NYA SKADOR" om matchande BUHS-rad redan finns**.

### Fördelar: 
✅ Bevara komplett revision history (alla datakällor synliga)  
✅ Ingen risk för dataförlust  
✅ Enkel felsökning (kan se båda raderna)  
✅ Fungerar med befintlig `/check`-logik  

---

## 3) Implementation

### Fil: `lib/damages.ts` (uppdatera befintlig funktion)

**Nuvarande kod** (rad ~115-135):
```typescript
// Bygg inventoried map (dokumenterade BUHS-skador)
const inventoriedMap = new Map<string, boolean>();

for (const d of allDocumentedDamages) {
  if (d.legacy_damage_source_text && d.original_damage_date) {
    const key = `${regnr. toUpperCase()}|${d.original_damage_date}`;
    inventoriedMap.set(key, true);
  }
}

// Filtrera BUHS-skador:  skippa om redan inventoried
const buhsDamages = rawBuhsDamages.filter(d => {
  const key = `${regnr.toUpperCase()}|${d.damage_date}`;
  return !inventoriedMap.has(key);
});
```

**ÄNDRING - uppdatera till LOOSE MATCHING:**

```typescript
// Bygg inventoried map (dokumenterade BUHS-skador)
const inventoriedMap = new Map<string, boolean>();

for (const d of allDocumentedDamages) {
  // LEGACY EXACT KEY (för exakt matchning)
  if (d.legacy_damage_source_text && d.original_damage_date) {
    const exactKey = `${regnr.toUpperCase()}|${d.original_damage_date}|${d.legacy_damage_source_text}`;
    inventoriedMap.set(exactKey, true);
  }
  
  // LOOSE BUHS KEY (matchar alla BUHS-källor för samma datum)
  if (d.legacy_damage_source_text?. startsWith('buhs_') && d.original_damage_date) {
    const looseBuhsKey = `${regnr.toUpperCase()}|${d.original_damage_date}|BUHS_LOOSE`;
    inventoriedMap.set(looseBuhsKey, true);
  }
}

// Filtrera BUHS-skador: skippa om redan inventoried (loose match)
const buhsDamages = rawBuhsDamages. filter(d => {
  const looseBuhsKey = `${regnr.toUpperCase()}|${d.damage_date}|BUHS_LOOSE`;
  return !inventoriedMap.has(looseBuhsKey);
});
```

**Förklaring:**
- **Exakt nyckel:** `JBK29K|2025-11-15|buhs_v1_api` (för framtida exakt matchning)
- **Loose nyckel:** `JBK29K|2025-11-15|BUHS_LOOSE` (matchar ALLA BUHS-källor)
- Vid filtrering kollar vi **endast loose-nyckeln** → skippar CSV-import om API-data redan finns

---

## 4) Testfall

### Test 1: CSV-import EFTER API-import

**Setup:**
1.  Incheckad via `/check` → 10 skador från BUHS API (`buhs_v1_api`)
2. Importera CSV med samma 10 skador

**Förväntat resultat:**
- ✅ CSV skapar 10 nya rader med `buhs_csv_import` i DB
- ✅ `/check` visar **"NYA SKADOR: 0"** (loose match hittar API-raderna)
- ✅ Båda raderna finns i `damages`-tabellen

**Verifiera med SQL:**
```sql
SELECT 
  regnr, 
  original_damage_date, 
  legacy_damage_source_text,
  COUNT(*) as antal
FROM damages
WHERE regnr = 'JBK29K' 
  AND original_damage_date = '2025-11-15'
GROUP BY regnr, original_damage_date, legacy_damage_source_text;
```

**Förväntat:**
```
JBK29K | 2025-11-15 | buhs_v1_api      | 10
JBK29K | 2025-11-15 | buhs_csv_import  | 10
```

---

### Test 2: CSV-import FÖRE API-import

**Setup:**
1. Importera CSV → 10 skador (`buhs_csv_import`)
2. Incheckad via `/check` 

**Förväntat resultat:**
- ✅ `/check` visar **"NYA SKADOR: 0"** (loose match hittar CSV-raderna)
- ✅ Ingen BUHS API-anrop görs (redan dokumenterat)

---

### Test 3: CSV med DELVIS överlapp

**Setup:**
1. API-import: 10 skador från 2025-11-15
2. CSV:  10 skador från 2025-11-15 + 5 skador från 2025-11-20

**Förväntat resultat:**
- ✅ CSV skapar 15 rader totalt
- ✅ `/check` visar:
  - NYA SKADOR: 5 (endast 2025-11-20)
  - Skippar 10st från 2025-11-15 (loose match)

---

## 5) Databas-struktur efter implementation

### `damages`-tabellen efter dubbel-import:
```
id   | regnr  | original_damage_date | legacy_damage_source_text | source | damage_type
-----|--------|---------------------|--------------------------|--------|------------
001  | JBK29K | 2025-11-15          | buhs_v1_api              | BUHS   | REPA
002  | JBK29K | 2025-11-15          | buhs_v1_api              | BUHS   | REPA
...   | ...    | ...                 | ...                      | ...    | ...
010  | JBK29K | 2025-11-15          | buhs_v1_api              | BUHS   | REPA
011  | JBK29K | 2025-11-15          | buhs_csv_import          | BUHS   | REPA  ← DUBBLETT
012  | JBK29K | 2025-11-15          | buhs_csv_import          | BUHS   | REPA  ← DUBBLETT
...   | ...    | ...                 | ...                      | ...    | ...
020  | JBK29K | 2025-11-15          | buhs_csv_import          | BUHS   | REPA  ← DUBBLETT
```

**VIKTIGT:**  
- Dubbletter är **AVSIKTLIGA** och **OKEJ**!  
- De ger revision history
- `/check` filtrerar automatiskt så de inte räknas som "nya"

---

## 6) Edge Cases & Lösningar

### Problem 1: Vad händer om användaren importerar CSV flera gånger?

**Svar:**  
Varje import skapar nya rader med `buhs_csv_import`.  
→ **Trippel-/quadruple-dubletter möjliga! **

**Lösning (rekommenderad):**  
Lägg till **CHECK VID IMPORT** i CSV-import-processen: 

```sql
-- Före UPSERT, kolla om buhs_csv_import redan finns för detta datum
SELECT COUNT(*) FROM damages
WHERE regnr = 'JBK29K'
  AND original_damage_date = '2025-11-15'
  AND legacy_damage_source_text = 'buhs_csv_import';
  
-- Om COUNT > 0: Varna användaren! 
```

**Alternativ (enklare):**  
Acceptera trippel-dubletter.  De filtreras ändå bort från "NYA SKADOR". 

---

### Problem 2: Vad händer om `original_damage_date` är NULL?

**Svar:**  
Loose key blir `JBK29K|null|BUHS_LOOSE` → matchar bara andra NULL-datum.    
**Fungerar som förväntat! **

---

### Problem 3: Vad händer med icke-BUHS-skador (CHECK-skador)?

**Svar:**  
De har `legacy_damage_source_text=null` → ingen loose key skapas.  
**Ingen påverkan! ** ✅

---

## 7) SQL-verifiering

### Kolla alla BUHS-källor för ett regnr:
```sql
SELECT 
  regnr, 
  original_damage_date, 
  legacy_damage_source_text,
  COUNT(*) as antal
FROM damages
WHERE regnr = 'JBK29K' 
  AND legacy_damage_source_text LIKE 'buhs_%'
GROUP BY regnr, original_damage_date, legacy_damage_source_text
ORDER BY original_damage_date, legacy_damage_source_text;
```

### Hitta trippel-dubletter:
```sql
SELECT 
  regnr,
  original_damage_date,
  damage_type_raw,
  COUNT(*) as antal_kopior
FROM damages
WHERE legacy_damage_source_text = 'buhs_csv_import'
GROUP BY regnr, original_damage_date, damage_type_raw
HAVING COUNT(*) > 1
ORDER BY antal_kopior DESC;
```

### Radera dubbla CSV-importer (om nödvändigt):
```sql
-- VARNING: Kör backup först!
DELETE FROM damages
WHERE id IN (
  SELECT id FROM (
    SELECT id, 
      ROW_NUMBER() OVER (
        PARTITION BY regnr, original_damage_date, damage_type_raw, legacy_damage_source_text 
        ORDER BY imported_at DESC
      ) as row_num
    FROM damages
    WHERE legacy_damage_source_text = 'buhs_csv_import'
  ) t
  WHERE row_num > 1
);
```

---

## 8) Checklista för implementation

- [ ] Backup av `damages`-tabellen skapad
- [ ] `lib/damages.ts` uppdaterad med loose BUHS matching
- [ ] Test 1 genomförd:  CSV efter API (NYA SKADOR:  0) ✅
- [ ] Test 2 genomförd: CSV före API (NYA SKADOR:  0) ✅
- [ ] Test 3 genomförd:  Delvis överlapp (korrekt antal nya) ✅
- [ ] SQL-verifiering klar (båda raderna synliga, rätt filtrering)
- [ ] Edge case-hantering beslutad (acceptera/förhindra trippel-dubletter)
- [ ] Dokumentation uppdaterad

---

## 9) Framtida förbättringar

- **Automatisk deduplicering:** Cron-jobb som tar bort exakta dubletter varje natt
- **Import-logg:** Spara metadata om varje CSV-import (datum, antal rader, källa)
- **UI-varning:** Visa i `/check` om samma skada finns från flera källor
- **Konsolidering:** Funktion för att slå ihop `buhs_v1_api` + `buhs_csv_import` till en rad

---

**Senast uppdaterad:** 2026-01-16  
**Ägare:** Per Andersson (per.andersson@mabi.se)  
**Version:** 1.0  
**Relaterad dokumentation:** [CSV-import. md](./CSV-import.md)