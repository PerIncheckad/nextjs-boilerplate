# Database Constraints & Giltiga Värden

**Syfte:** Snabbreferens för alla check constraints, enums och giltiga värden i Supabase-databasen.

**Användning:** Konsultera denna fil när du får constraint-fel vid SQL INSERT/UPDATE.

---

## 1) `checkins`-tabellen

### Check Constraints

| Constraint | Regel | Felmeddelande |
|-----------|-------|---------------|
| `checkins_charging_cables_check` | `charging_cables >= 0 AND charging_cables <= 2` | Antal laddkablar måste vara 0-2 |
| `checkins_odometer_km_check` | `odometer_km >= 0` | Mätarställning kan inte vara negativ |
| `checkins_region_chk` | Se Region-värden nedan | Ogiltig region |
| `checkins_status_chk` | Se Status-värden nedan | Ogiltig status |
| `checkins_tires_type_check` | Se Däcktyp-värden nedan | Ogiltig däcktyp |
| `checkins_wheel_type_check` | Se Hjultyp-värden nedan | Ogiltig hjultyp |

### Giltiga Värden

#### Region (`region`)
```sql
'NORR' | 'MITT' | 'SYD'
```

**Exempel:**
```sql
INSERT INTO checkins (region, .. .) VALUES ('SYD', ...);  -- ✅ OK
INSERT INTO checkins (region, ...) VALUES ('Syd', ...);  -- ❌ FEL (gemener)
INSERT INTO checkins (region, ...) VALUES ('VÄST', ...); -- ❌ FEL (finns ej)
```

---

#### Status (`status`)
```sql
NULL | 'checked_in' | 'COMPLETED'
```

**OBS!  Blandade versaler/gemener!  **

**Exempel:**
```sql
INSERT INTO checkins (status, ...) VALUES ('COMPLETED', ...);   -- ✅ OK
INSERT INTO checkins (status, ...) VALUES ('checked_in', ...);  -- ✅ OK
INSERT INTO checkins (status, ...) VALUES (NULL, ...);          -- ✅ OK
INSERT INTO checkins (status, ...) VALUES ('completed', ...);   -- ❌ FEL (gemener)
INSERT INTO checkins (status, ...) VALUES ('CHECKED_IN', ...);  -- ❌ FEL (versaler)
```

---

#### Däcktyp (`tires_type`)
```sql
'sommar' | 'vinter'
```

**OBS! Endast gemener! **

**Exempel:**
```sql
INSERT INTO checkins (tires_type, .. .) VALUES ('vinter', ...);     -- ✅ OK
INSERT INTO checkins (tires_type, ...) VALUES ('sommar', ...);     -- ✅ OK
INSERT INTO checkins (tires_type, ...) VALUES ('Vinterdäck', ...); -- ❌ FEL
INSERT INTO checkins (tires_type, ...) VALUES ('VINTER', ...);     -- ❌ FEL (versaler)
```

---

#### Hjultyp (`wheel_type`)
```sql
'sommar' | 'vinter'
```

**Samma som `tires_type` - endast gemener! **

---

#### Laddkablar (`charging_cables`)
```sql
0 | 1 | 2
```

**Exempel:**
```sql
INSERT INTO checkins (charging_cables, ...) VALUES (1, ...);  -- ✅ OK
INSERT INTO checkins (charging_cables, ...) VALUES (3, ...);  -- ❌ FEL (max 2)
INSERT INTO checkins (charging_cables, ...) VALUES (-1, ...); -- ❌ FEL (negativ)
```

---

#### Mätarställning (`odometer_km`)
```sql
>= 0
```

**Exempel:**
```sql
INSERT INTO checkins (odometer_km, .. .) VALUES (4256, ...);   -- ✅ OK
INSERT INTO checkins (odometer_km, ...) VALUES (0, ...);      -- ✅ OK
INSERT INTO checkins (odometer_km, ...) VALUES (-100, ...);   -- ❌ FEL (negativ)
```

---

## 2) `damages`-tabellen

### Source-värden (`source`)

```sql
'CHECK' | 'NYBIL' | 'BUHS'
```

**Default:** `'CHECK'`

**Användning:**
- `'CHECK'` = Skada dokumenterad via `/check`-formuläret
- `'NYBIL'` = Skada dokumenterad via `/nybil`-formuläret
- `'BUHS'` = Skada importerad från BUHS (CSV eller API)

**Exempel:**
```sql
-- Automatisk default
INSERT INTO damages (regnr, damage_type, .. .) 
VALUES ('ABC123', 'REPA', ...);
-- source blir automatiskt 'CHECK'

-- Explicit BUHS
INSERT INTO damages (regnr, damage_type, source, ...) 
VALUES ('ABC123', 'REPA', 'BUHS', ...);
```

---

### Legacy Damage Source Text (`legacy_damage_source_text`)

**Format:** Fritext (text)

**Typiska värden:**
- `'buhs_v1_api'` = Importerad via BUHS API (automatisk vid `/check`)
- `'buhs_csv_import'` = Importerad via CSV-fil (manuell import)
- `NULL` = Ny skada dokumenterad i appen (inte från BUHS)

**Användning:** Se [csv-import-dubbel-rad.md](./csv-import-dubbel-rad.md) för detaljer om loose matching.

---

## 3) `nybil_inventering`-tabellen

### Bränsletyp (`bransletyp`)

```sql
'bensin_diesel' | 'elbil' | 'hybrid' | 'laddhybrid'
```

**Används för:**
- Avgöra om laddnings- eller tankningsstatus ska visas
- Trigger för "Låg laddnivå"-varning (<95% för `'elbil'`)

---

### Tankstatus (`tankstatus`)

```sql
NULL | 'mottogs_fulltankad' | 'tankad_nu' | 'ej_upptankad'
```

**Endast för `bransletyp='bensin_diesel'`**

---

### Klar för uthyrning (`klar_for_uthyrning`)

```sql
true | false | NULL
```

**Används för:**
- Grön banner "KLAR FÖR UTHYRNING!" i mejl (om `true`)
- Röd banner "EJ KLAR FÖR UTHYRNING" i mejl (om `false`)

---

## 4) Vanliga Constraint-fel & Lösningar

### Fel:  `new row violates check constraint "checkins_status_chk"`

**Orsak:** Fel status-värde (t.ex. `'completed'` istället för `'COMPLETED'`)

**Lösning:**
```sql
-- RÄTT
INSERT INTO checkins (status, ...) VALUES ('COMPLETED', ... );

-- FEL
INSERT INTO checkins (status, ...) VALUES ('completed', ...);
```

---

### Fel: `new row violates check constraint "checkins_tires_type_check"`

**Orsak:** Fel däcktyp-värde (t.ex. `'Vinterdäck'` istället för `'vinter'`)

**Lösning:**
```sql
-- RÄTT
INSERT INTO checkins (tires_type, ...) VALUES ('vinter', ...);

-- FEL
INSERT INTO checkins (tires_type, ...) VALUES ('Vinterdäck', ...);
INSERT INTO checkins (tires_type, ...) VALUES (NULL, ...); -- NULL är inte tillåtet! 
```

**Tips:** Utelämna `tires_type` helt om du inte har värdet: 
```sql
INSERT INTO checkins (regnr, odometer_km, ...) 
VALUES ('ABC123', 4256, ...);
-- tires_type blir NULL automatiskt
```

---

### Fel: `new row violates check constraint "checkins_region_chk"`

**Orsak:** Fel region-värde (t.ex. `'Syd'` istället för `'SYD'`)

**Lösning:**
```sql
-- RÄTT
INSERT INTO checkins (region, ...) VALUES ('SYD', ...);

-- FEL
INSERT INTO checkins (region, ...) VALUES ('Syd', ...);
INSERT INTO checkins (region, ...) VALUES ('VÄST', ...); -- Finns inte!
```

**Mappning:**
- Helsingborg, Ängelholm, Malmö, Lund, Trelleborg → `'SYD'`
- Göteborg, Varberg → `'MITT'` (tidigare `'VÄST'`)
- Sundsvall, Umeå → `'NORR'`

---

## 5) Debugging-tips

### Visa alla constraints för en tabell

```sql
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.checkins':: regclass
  AND contype = 'c'  -- 'c' = CHECK constraint
ORDER BY conname;
```

---

### Hitta giltiga värden för ett fält

```sql
-- Exempel: Hitta alla unika status-värden som faktiskt används
SELECT DISTINCT status 
FROM public.checkins 
WHERE status IS NOT NULL
ORDER BY status;
```

---

### Testa constraint INNAN insert

```sql
-- Testa om värdet kommer att fungera
SELECT 
  CASE 
    WHEN 'vinter' IN ('sommar', 'vinter') THEN 'OK'
    ELSE 'FEL'
  END AS test_result;
```

---

## 6) Snabbreferens

| Fält | Tabell | Giltiga värden | Case-sensitive?  |
|------|--------|---------------|-----------------|
| `region` | checkins | `'NORR'`, `'MITT'`, `'SYD'` | Ja (versaler) |
| `status` | checkins | `NULL`, `'checked_in'`, `'COMPLETED'` | Ja (blandad) |
| `tires_type` | checkins | `'sommar'`, `'vinter'` | Ja (gemener) |
| `wheel_type` | checkins | `'sommar'`, `'vinter'` | Ja (gemener) |
| `charging_cables` | checkins | `0`, `1`, `2` | N/A (nummer) |
| `source` | damages | `'CHECK'`, `'NYBIL'`, `'BUHS'` | Ja (versaler) |
| `bransletyp` | nybil_inventering | `'bensin_diesel'`, `'elbil'`, `'hybrid'`, `'laddhybrid'` | Ja (gemener) |
| `tankstatus` | nybil_inventering | `NULL`, `'mottogs_fulltankad'`, `'tankad_nu'`, `'ej_upptankad'` | Ja (gemener) |

---

**Senast uppdaterad:** 2026-01-16  
**Ägare:** Per Andersson (per.andersson@mabi.se)  
**Version:** 1.0  
**Relaterad dokumentation:** [Database. md](./Database.md), [CSV-import.md](./CSV-import.md)
