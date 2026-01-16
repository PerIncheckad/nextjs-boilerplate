# CSV-import:  BUHS Skadedata

**Senast uppdaterad:** 2026-01-16  
**Författare:** System Documentation  
**Relaterade filer:** `docs/wiki/Database.md`, `docs/wiki/database-constraints.md`

---

## 📋 ÖVERSIKT

Denna guide beskriver hur du importerar BUHS skadedata från CSV-fil till produktionsdatabasen. 

**Källa:** MABI BUHS-system (manuell CSV-export)  
**Frekvens:** Vid behov (när nya skador tillkommit i BUHS)  
**Målformat:** `public.damages` + `public.damages_external`

---

## ⚠️ FÖRUTSÄTTNINGAR

1. **CSV-fil från BUHS** med kolumner:  
   - `regnr` (registreringsnummer)
   - `saludatum` (försäljningsdatum)
   - `damage_date` (skadedatum)
   - `damage_type_raw` (skadetyp)
   - `note_customer` (kundnotering)
   - `note_internal` (intern notering)
   - `vehiclenote` (fordonsnotering)

2. **Supabase-åtkomst** med rättigheter att köra SQL

3. **Backup tagen** (rekommenderat före större importer)

---

## 🚀 IMPORTPROCESS

### **STEG 1: Ladda CSV-fil**

1.  Öppna Supabase Dashboard
2. Navigera till **Table Editor** → `mabi_damage_data_raw_new`
3. Klicka **Import data from CSV**
4. Välj din CSV-fil
5. Verifiera kolumnmappning
6. Importera

**Förväntat:** X rader importerade (där X = antal rader i CSV)

---

### **STEG 2: Deduplicera raw_new**

Kör denna SQL för att ta bort exakta dubbletter:

```sql
-- Ta bort dubbletter (behåll äldsta raden per unik kombination)
DELETE FROM public. mabi_damage_data_raw_new a USING (
  SELECT MIN(ctid) as ctid, regnr, damage_date, damage_type_raw, note_customer
  FROM public.mabi_damage_data_raw_new 
  GROUP BY regnr, damage_date, damage_type_raw, note_customer
  HAVING COUNT(*) > 1
) b
WHERE a.regnr = b. regnr 
  AND a.damage_date = b.damage_date
  AND a.damage_type_raw = b.damage_type_raw
  AND COALESCE(a.note_customer, '') = COALESCE(b.note_customer, '')
  AND a.ctid <> b.ctid;

-- Verifiera antal efter dedup
SELECT COUNT(*) as antal_efter_dedup FROM public.mabi_damage_data_raw_new;
```

**Förväntat:** Y rader kvar (Y ≤ X)

---

### **STEG 3: Upsert till damages**

Kör denna SQL för att importera till huvudtabellen:

```sql
INSERT INTO public.damages (
  regnr,
  saludatum,
  damage_date,
  damage_type_raw,
  note_customer,
  note_internal,
  vehiclenote,
  source,
  legacy_damage_source_text,
  original_damage_date,
  imported_at
)
SELECT 
  UPPER(TRIM(regnr)),
  saludatum,
  damage_date,
  damage_type_raw,
  note_customer,
  note_internal,
  vehiclenote,
  'BUHS',
  'buhs_csv_import|' || damage_date || '|' || damage_type_raw || COALESCE('|' || note_customer, ''),
  damage_date,
  NOW()
FROM public.mabi_damage_data_raw_new
ON CONFLICT (regnr, damage_date, damage_type_raw, note_customer)
DO UPDATE SET
  saludatum = EXCLUDED.saludatum,
  note_internal = EXCLUDED.note_internal,
  vehiclenote = EXCLUDED.vehiclenote,
  source = 'BUHS',
  legacy_damage_source_text = EXCLUDED. legacy_damage_source_text,
  imported_at = NOW();
```

**Förväntat:** "INSERT 0 Z" där Z = antal nya + uppdaterade rader

---

### **STEG 4: Synkronisera damages_external**

Kör denna SQL för att uppdatera externa skador:

```sql
-- Töm och återskapa damages_external
TRUNCATE public.damages_external;

INSERT INTO public.damages_external (
  regnr,
  saludatum,
  damage_date,
  damage_type_raw,
  note_customer,
  note_internal,
  vehiclenote
)
SELECT 
  regnr,
  saludatum,
  damage_date,
  damage_type_raw,
  note_customer,
  note_internal,
  vehiclenote
FROM public.damages
WHERE source = 'BUHS';

-- Verifiera att antal matchar
SELECT 
  (SELECT COUNT(*) FROM public.damages_external) as damages_external_count,
  (SELECT COUNT(*) FROM public.damages WHERE source = 'BUHS') as damages_buhs_count;
```

**Förväntat:** Båda kolumnerna visar samma antal

---

### **STEG 5: Verifiera importen**

Kör dessa SQL för att verifiera: 

```sql
-- 1. Antal CSV-skador totalt
SELECT COUNT(*) as antal_csv_skador
FROM damages
WHERE legacy_damage_source_text LIKE 'buhs_csv_import%';

-- 2. Senaste importerade skador
SELECT 
  regnr,
  damage_date,
  damage_type_raw,
  imported_at
FROM damages
WHERE legacy_damage_source_text LIKE 'buhs_csv_import%'
ORDER BY imported_at DESC
LIMIT 10;

-- 3. Verifiera inga exakta dubbletter
SELECT 
  regnr,
  damage_date,
  damage_type_raw,
  note_customer,
  COUNT(*) as antal
FROM damages
WHERE legacy_damage_source_text LIKE 'buhs_%'
GROUP BY regnr, damage_date, damage_type_raw, note_customer
HAVING COUNT(*) > 1;
```

**Förväntat:**
- SQL 1: Totalt antal CSV-skador
- SQL 2: 10 senaste skadorna med dagens datum i `imported_at`
- SQL 3: **Inga rader** (inga dubbletter)

---

## 🧪 TESTNING

Testa att odokumenterade BUHS-skador visas korrekt:

1.  Välj ett regnr från CSV-filen som INTE har checkats in tidigare
2. Öppna `https://incheckad.se/check? reg=REGNR`
3. Verifiera att befintliga skador visas under "Befintliga skador att hantera"

---

## 🔧 TROUBLESHOOTING

### **FEL: `duplicate key value violates unique constraint "ux_damages_regnr_legacy_text"`**

**Orsak:** Du försöker importera samma skada två gånger med exakt samma `legacy_damage_source_text`.

**Lösning:** Detta är normalt vid re-import.  UPSERT kommer uppdatera befintliga rader.

---

### **FEL: `there is no unique or exclusion constraint matching the ON CONFLICT specification`**

**Orsak:** Constraint `damages_regnr_date_type_customer_unique` saknas.

**Lösning:** Kör constraint-skapande SQL från `database-constraints.md`

---

### **VARNING: "Success.  No rows returned"**

**Orsak:** Alla rader i CSV: en finns redan i databasen (ingen uppdatering gjordes).

**Åtgärd:** Verifiera att CSV-filen är ny och innehåller uppdaterad data.

---

## 📊 DATAFLÖDE

```
BUHS CSV-fil
    ↓
mabi_damage_data_raw_new (staging)
    ↓ (dedup + upsert)
damages (legacy_damage_source_text = 'buhs_csv_import|.. .')
    ↓ (filter WHERE source='BUHS')
damages_external
    ↓
/check API (lib/damages. ts - loose matching)
```

---

## 🔑 NYCKELFÄLT

| Fält | Värde | Syfte |
|------|-------|-------|
| `source` | `'BUHS'` | Identifierar extern källa |
| `legacy_damage_source_text` | `'buhs_csv_import\|YYYY-MM-DD\|Typ\|Notering'` | Unik nyckel per CSV-skada |
| `original_damage_date` | Samma som `damage_date` | Används för loose matching |
| `imported_at` | `NOW()` | Tidsstämpel för import |

---

## 📚 RELATERAD DOKUMENTATION

- `Database.md` - Databasschema
- `database-constraints.md` - Constraints och index
- `Operations.md` - Operationella rutiner
- `Check-in-flow.md` - Hur skador visas i appen

---

## ✅ CHECKLISTA

- [ ] CSV-fil mottagen från BUHS
- [ ] Backup av produktionsdatabas tagen
- [ ] CSV importerad till `mabi_damage_data_raw_new`
- [ ] Deduplicering körd
- [ ] Upsert till `damages` körd
- [ ] `damages_external` synkroniserad
- [ ] Verifieringsfrågor körda
- [ ] Testning i `/check` genomförd
- [ ] Antal skador dokumenterat i changelog

---

**Genomförd import 2026-01-16:**
- **Importerad CSV:** 524 rader
- **Efter dedup:** 489 rader
- **Resultat:** 143 nya + 346 uppdaterade
- **Totalt BUHS-skador:** 727