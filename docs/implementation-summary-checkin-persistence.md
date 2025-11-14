# Implementation Summary: Check-in Persistence

## Overview
This document summarizes the implementation of server-side persistence for the `/check` (incheckning) flow in `app/api/notify/route.ts`.

## Problem Statement
All POSTs to `/api/notify` must (in non-dryRun mode) create database records for check-ins, damages, and normalized statistics. The implementation includes:
- Idempotency for documented BUHS damages
- dryRun mode for testing without database writes
- Full checklist JSON storage for future optimization

## Implementation Details

### Files Modified
1. **app/api/notify/route.ts** (260 lines added)
   - Added `persistCheckinData()` function for database operations
   - Added dryRun mode detection from query parameters
   - Added email recipient override for dryRun mode
   - Integrated database persistence into the POST handler

2. **docs/sql/migrations_checkins_damages.sql** (18 lines added)
   - SQL migration for adding `has_new_damages` and `has_documented_buhs` columns
   - Indexes for improved query performance
   - Must be run manually on the database

3. **docs/testing-plan-checkin-persistence.md** (254 lines added)
   - Comprehensive testing plan with 5 test cases
   - SQL verification queries
   - Troubleshooting guide

### Key Features

#### 1. dryRun Mode
- **Detection**: Query parameter `?dryRun=1`
- **Behavior**: 
  - Skips all database writes
  - Overrides email recipients to `['per@incheckad.se']`
  - Returns `{ ok: true, dryRun: true }` in response
  - Logs "🔶 DRY RUN MODE ACTIVE"

#### 2. Database Persistence

##### checkins Table
- **One row per check-in** (always created, even with zero damages)
- **Fields mapped**:
  - `regnr`: Upper/trimmed registration number
  - `current_city`: From `bilen_star_nu.ort` or fallback to `ort`
  - `current_station`: From `bilen_star_nu.station` or fallback to `station`
  - `odometer_km`: Parsed from `matarstallning`
  - `hjultyp`: Wheel type
  - `drivmedel`: JSONB with structured fuel/charging data
  - `checker_name`: From `fullName` or `incheckare`
  - `checker_email`: From `user_email`
  - `notes`: From `notering`
  - `has_new_damages`: Boolean (true if nya_skador.length > 0)
  - `has_documented_buhs`: Boolean (true if dokumenterade_skador.length > 0)
  - `status`: Always 'COMPLETED'
  - `completed_at`: Timestamp of check-in
  - `checklist`: Full payload as JSONB (TODO: optimize to destillat)

##### damages Table
- **New damages** (nya_skador):
  - `regnr`: Registration number
  - `damage_date`: Current date
  - `legacy_damage_source_text`: NULL
  - `user_type`: Damage type
  - `user_positions`: Array of positions
  - `description`: User description
  - `uploads.photo_urls`: Array of photo URLs
  - `uploads.video_urls`: Array of video URLs
  - `inchecker_name`, `inchecker_email`: Checker information

- **Documented BUHS damages** (dokumenterade_skador):
  - `regnr`: Registration number
  - `original_damage_date`: From `originalDamageDate`
  - `legacy_damage_source_text`: From `fullText`
  - `legacy_loose_key`: Format `REGNR|original_damage_date`
  - `user_positions`: Array of positions
  - `description`: User description
  - `uploads`: Photo/video URLs
  - `inchecker_name`, `inchecker_email`: Checker information

##### checkin_damages Table
- **One row per damage** (not per position)
- **Fields**:
  - `checkin_id`: Foreign key to checkins
  - `regnr`: Registration number
  - `type`: 'new' or 'documented'
  - `positions`: Array of position objects
  - `description`: Damage description
  - `photo_urls`: Array of photo URLs
  - `video_urls`: Array of video URLs

#### 3. Idempotency Logic
Prevents duplicate documented BUHS damages:
```javascript
if (original_damage_date && legacy_damage_source_text) {
  SELECT id FROM damages 
  WHERE regnr = ? 
    AND original_damage_date = ? 
    AND legacy_damage_source_text = ?
  LIMIT 1;
  
  if (found) {
    console.log('⚠️ Skipping duplicate documented damage');
    skip insertion into damages;
  }
}
// Always insert into checkin_damages for statistics
```

#### 4. Validation
- **Basic sanity checks**:
  - `regnr` must be present
  - Arrays must be typed correctly
  - Photo URLs length >= 1 for each damage (logged as error if missing)

#### 5. Structured Fuel Data
The `drivmedel` field in checkins table stores structured JSONB:
```json
{
  "typ": "bensin_diesel" | "elbil",
  "tankniva": "...",
  "liters": "...",
  "bransletyp": "...",
  "literpris": "...",
  "laddniva": "...",
  "antal_laddkablar": "..."
}
```

### Error Handling
- Database errors are logged but don't prevent email sending
- The persistence function catches and logs errors without throwing
- This ensures emails are sent even if database writes fail

### Performance Considerations
- **Bulk inserts** used for damages and checkin_damages
- **One SELECT per documented damage** for idempotency check
- **Indexes provided** in migration for query optimization
- **No transactions** currently (could be added in future)

## Testing Requirements

### Prerequisites
1. Run SQL migration: `docs/sql/migrations_checkins_damages.sql`
2. Verify tables exist: `checkins`, `damages`, `checkin_damages`

### Test Cases (see testing-plan-checkin-persistence.md)
1. **dryRun test**: Verify no database writes, emails only to per@incheckad.se
2. **Normal test**: Verify all database rows created correctly
3. **Idempotency test**: Verify duplicates are prevented
4. **Field mapping test**: Verify all fields mapped correctly
5. **Edge cases**: Only new, only documented, no damages

## Security & Quality Assurance
- ✅ **CodeQL scan**: No vulnerabilities detected
- ✅ **Build successful**: No compilation errors
- ✅ **Type safety**: No new TypeScript errors introduced
- ✅ **Minimal changes**: Only 3 files modified
- ✅ **Error handling**: Graceful degradation if DB fails

## Known Limitations & Future Work
1. **TODO**: Optimize checklist storage to destillat (follow-up issue)
2. **No transactions**: Database writes are not atomic
3. **No retry logic**: Failed DB writes are logged but not retried
4. **Manual migration**: SQL must be run manually (not auto-executed)
5. **No webhooks**: No downstream notification on successful persistence

## Deployment Checklist
- [ ] Run SQL migration on production database
- [ ] Verify migration successful (check columns and indexes)
- [ ] Deploy code to production
- [ ] Test dryRun mode in production: `/api/notify?dryRun=1`
- [ ] Test normal mode with test vehicle
- [ ] Monitor logs for errors
- [ ] Verify database records created correctly
- [ ] Test idempotency with duplicate submission

## Support & Troubleshooting
See `docs/testing-plan-checkin-persistence.md` for:
- Detailed test procedures
- SQL verification queries
- Common issues and solutions
- Performance considerations

## References
- **Problem statement**: See original issue/requirements
- **Testing plan**: `docs/testing-plan-checkin-persistence.md`
- **SQL migration**: `docs/sql/migrations_checkins_damages.sql`
- **Database documentation**: `docs/wiki/Database.md`
- **Implementation**: `app/api/notify/route.ts`
