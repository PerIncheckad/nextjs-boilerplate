# Testing Plan: Check-in Persistence Implementation

## Overview
This document outlines the testing plan for the server-side persistence implementation in the `/api/notify` endpoint for the check-in flow.

## Prerequisites
- Run the SQL migration from `docs/sql/migrations_checkins_damages.sql` on the database
- Ensure the following tables exist and have proper structure:
  - `public.checkins`
  - `public.damages`
  - `public.checkin_damages`

## Test Cases

### 1. DryRun Mode Test
**Objective**: Verify that dryRun mode performs validation and sends emails but skips database writes.

**Steps**:
1. Submit a check-in with `?dryRun=1` query parameter
2. Include:
   - 1 new damage (nya_skador)
   - 1 documented BUHS damage (dokumenterade_skador)
3. Verify:
   - ✅ Response includes `{ ok: true, dryRun: true }`
   - ✅ Console logs show "🔶 DRY RUN MODE ACTIVE"
   - ✅ Emails sent ONLY to `per@incheckad.se`
   - ✅ No new rows in `checkins` table
   - ✅ No new rows in `damages` table
   - ✅ No new rows in `checkin_damages` table

**SQL Verification**:
```sql
-- Count should not increase during dryRun
SELECT COUNT(*) FROM public.checkins WHERE regnr = 'ABC123';
SELECT COUNT(*) FROM public.damages WHERE regnr = 'ABC123';
SELECT COUNT(*) FROM public.checkin_damages WHERE regnr = 'ABC123';
```

---

### 2. Normal Mode Test
**Objective**: Verify that normal mode creates all expected database rows.

**Steps**:
1. Submit the same check-in WITHOUT `?dryRun=1` parameter
2. Use a unique regnr (e.g., `TEST001`)
3. Include:
   - 1 new damage with 2 positions
   - 1 documented BUHS damage with 1 position
4. Verify:
   - ✅ Response includes `{ ok: true, dryRun: false }`
   - ✅ Emails sent to normal recipients (not just per@incheckad.se)
   - ✅ 1 new row in `checkins` table
   - ✅ 2 new rows in `damages` table (1 new, 1 documented)
   - ✅ 2 new rows in `checkin_damages` table

**SQL Verification**:
```sql
-- Verify checkin record
SELECT 
  id,
  regnr,
  has_new_damages,
  has_documented_buhs,
  status,
  completed_at,
  checker_name,
  checker_email
FROM public.checkins 
WHERE regnr = 'TEST001'
ORDER BY created_at DESC
LIMIT 1;

-- Verify damages (should have 2 rows)
SELECT 
  id,
  regnr,
  damage_date,
  legacy_damage_source_text,
  user_type,
  user_positions,
  description
FROM public.damages 
WHERE regnr = 'TEST001'
ORDER BY created_at DESC;

-- Verify checkin_damages (should have 2 rows)
SELECT 
  id,
  checkin_id,
  regnr,
  type,
  positions,
  photo_urls,
  video_urls
FROM public.checkin_damages 
WHERE regnr = 'TEST001'
ORDER BY created_at DESC;
```

**Expected Results**:
- `checkins.has_new_damages` = `true`
- `checkins.has_documented_buhs` = `true`
- `checkins.status` = `'COMPLETED'`
- `damages` row with `legacy_damage_source_text = NULL` (new damage)
- `damages` row with `legacy_damage_source_text = <fullText>` (documented)
- `checkin_damages` rows with `type = 'new'` and `type = 'documented'`

---

### 3. Idempotency Test
**Objective**: Verify that duplicate documented BUHS damages are not re-inserted.

**Steps**:
1. Submit a check-in with a documented BUHS damage (regnr: `TEST002`, originalDamageDate: `2024-01-15`)
2. Note the damage count in the database
3. Submit the SAME documented BUHS damage again (same regnr, date, and fullText)
4. Verify:
   - ✅ Console logs show "⚠️ Skipping duplicate documented damage"
   - ✅ Damage count in `damages` table remains the same
   - ✅ A new `checkin_damages` row IS created (for statistics)
   - ✅ A new `checkins` row IS created (for the check-in)

**SQL Verification**:
```sql
-- Count damages - should be 1 after both submissions
SELECT COUNT(*) 
FROM public.damages 
WHERE regnr = 'TEST002'
  AND original_damage_date = '2024-01-15'
  AND legacy_damage_source_text IS NOT NULL;

-- Count checkins - should be 2 (one per submission)
SELECT COUNT(*) 
FROM public.checkins 
WHERE regnr = 'TEST002';

-- Count checkin_damages - should be 2 (one per submission)
SELECT COUNT(*) 
FROM public.checkin_damages 
WHERE regnr = 'TEST002';
```

---

### 4. Field Mapping Test
**Objective**: Verify that all fields are correctly mapped from payload to database.

**Steps**:
1. Submit a comprehensive check-in with all fields populated:
   - Basic info: regnr, ort, station, bilen_star_nu
   - Vehicle: matarstallning, hjultyp
   - Fuel (bensin_diesel): tankniva, liters, bransletyp, literpris
   - Electric (elbil): laddniva, antal_laddkablar
   - Checker: fullName, user_email
   - Notes: notering
2. Verify field mapping in `checkins` table:

**SQL Verification**:
```sql
SELECT 
  regnr,
  current_city,
  current_station,
  odometer_km,
  hjultyp,
  drivmedel,
  checker_name,
  checker_email,
  notes,
  checklist
FROM public.checkins 
WHERE regnr = '<test_regnr>'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Results**:
- `current_city` = `bilen_star_nu.ort` or fallback to `ort`
- `current_station` = `bilen_star_nu.station` or fallback to `station`
- `odometer_km` = integer value from `matarstallning`
- `drivmedel` = JSONB with structured fuel/charging data
- `checker_name` = `fullName`
- `checker_email` = `user_email`
- `checklist` = full payload as JSONB

---

### 5. Edge Cases

#### 5.1 Only New Damages
- Submit check-in with ONLY new damages (no documented)
- Verify: `has_new_damages = true`, `has_documented_buhs = false`

#### 5.2 Only Documented Damages
- Submit check-in with ONLY documented damages (no new)
- Verify: `has_new_damages = false`, `has_documented_buhs = true`

#### 5.3 No Damages
- Submit check-in with NO damages
- Verify: Both boolean flags are `false`, no rows in `damages` or `checkin_damages`

#### 5.4 Missing Optional Fields
- Submit with minimal data (only required fields)
- Verify: NULL values are stored correctly for optional fields

---

## Validation Checklist

Before marking this feature as complete, verify:
- [ ] SQL migration has been run on the database
- [ ] dryRun mode works correctly (emails only to per@incheckad.se, no DB writes)
- [ ] Normal mode creates all expected rows
- [ ] Idempotency prevents duplicate documented damages
- [ ] Field mapping is accurate
- [ ] Boolean flags (`has_new_damages`, `has_documented_buhs`) are set correctly
- [ ] Console logs provide useful debugging information
- [ ] No security vulnerabilities (verified with CodeQL)
- [ ] Build succeeds without errors

---

## Troubleshooting

### Issue: Database errors during insertion
**Solution**: Check that the SQL migration has been run and all columns exist.

### Issue: Idempotency not working
**Solution**: Verify that `original_damage_date` and `legacy_damage_source_text` are being set correctly in the payload.

### Issue: Email recipients not overridden in dryRun
**Solution**: Ensure query parameter is exactly `?dryRun=1` (case-sensitive).

### Issue: Missing data in checklist JSONB
**Solution**: This is expected - the full payload is stored. Use the TODO comment to track the destillat optimization.

---

## Performance Considerations

- Bulk inserts are used for `damages` and `checkin_damages` to minimize database round-trips
- Idempotency check adds one SELECT query per documented damage
- Consider adding database indexes if query performance degrades (indexes provided in migration)

---

## Future Improvements (Out of Scope)

1. Switch from full `checklist` JSON to destillat (tracked in follow-up issue)
2. Add retry logic for database failures
3. Implement batch processing for large check-ins
4. Add database transaction support for atomicity
5. Implement webhooks or events for downstream systems
