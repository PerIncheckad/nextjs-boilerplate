# Unified Damage Model Implementation

## Overview
This document describes the implementation of the unified damage model that consolidates BUHS (external/legacy) damages with user-documented and newly created damages from `public.damages`.

## Implementation Date
2025-11-14

## Scope of Changes

### 1. lib/damages.ts
**Purpose**: Core logic for fetching and consolidating damage data.

**Key Changes**:
- Updated type definitions:
  - `ConsolidatedDamage`: Extended with `source`, `fullText`, `originalDamageDate`, `legacyKey`, `userType`, `userPositions`, `userDescription`, `isInventoried`, `status`
  - `VehicleInfo`: Added `hasUndocumentedBUHS`, `needsDocumentationCount`, `newDamagesCount`
  - Added `UserDamage` type for public.damages rows
  - Removed obsolete `InventoriedDamage` type

- Implemented `createDocumentedKey()` function:
  - Creates unique key: `regnr|original_damage_date|legacy_text`
  - Used for matching BUHS damages with documented entries
  - Handles edge case of missing dates (`no-date` placeholder)

- Enhanced `getVehicleInfo()` function:
  - Fetches BUHS damages via RPC `get_damages_by_trimmed_regnr`
  - Fetches ALL user damages from `public.damages` (both documented and new)
  - Builds `documentedKeys` set for O(1) lookup
  - Separates undocumented BUHS from new user damages
  - Returns consolidated list with proper flags

**Performance Optimizations**:
- 2 queries total (was 2 before, maintained)
- Leverages existing indexes: `idx_damages_regnr`, `idx_damages_regnr_date`
- No N+1 queries
- Single regnr scope (upper trimmed)

### 2. app/check/form-client.tsx
**Purpose**: UI rendering based on damage state.

**Key Changes**:
- Updated damage mapping to use new `ConsolidatedDamage` structure:
  - Maps `fullText` instead of `text`
  - Maps `originalDamageDate` instead of `damage_date`
  - Maps `isInventoried` instead of `is_inventoried`
  - Maps additional fields: `status`, `userType`, `userPositions`, `userDescription`

- Conditional rendering logic:
  - Changed from: `vehicleData && existingDamages.some(d => !d.isInventoried)`
  - Changed to: `vehicleData && vehicleData.hasUndocumentedBUHS`
  - More explicit and efficient (no need to iterate damages array)

**UI Behavior**:
- "Befintliga skador att hantera" section:
  - Shown ONLY when `hasUndocumentedBUHS === true`
  - Hidden automatically when all BUHS are documented
- "Nya skador" section:
  - Always visible (unchanged behavior)
  - Independent of BUHS status

### 3. Documentation Updates

**docs/wiki/Database.md**:
- Added "Unified Damage Model" section
- Documented matching strategy
- Explained return values
- Described idempotence mechanism
- Listed performance characteristics

**README.md**:
- Added "Unified Damage Model" section
- High-level overview for developers
- Reference to detailed wiki documentation

## Matching Strategy

### Primary Matching
A BUHS damage is considered "documented" when a row exists in `public.damages` with:
1. Same `regnr` (always required)
2. Same `original_damage_date` (if available)
3. Same `legacy_damage_source_text` (exact match)

### Edge Cases

#### Missing originalDamageDate
- Key format: `regnr|no-date|legacy_text`
- First documented row with matching text wins
- Subsequent attempts prevented by unique index

#### Text Changes Upstream
- Existing documented rows retain their original text
- Changed text in BUHS appears as new undocumented item
- Users must document again (by design - ensures data accuracy)

## Idempotence

### Database Level
Unique index prevents duplicate documentation:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_damages_regnr_legacy_text
  ON public.damages (regnr, legacy_damage_source_text)
  WHERE legacy_damage_source_text IS NOT NULL;
```

### Application Level
1. User documents BUHS damage via `/check` form
2. API inserts row with `legacy_damage_source_text` = original BUHS text
3. If duplicate, unique index prevents insert (409 or similar error)
4. Next `getVehicleInfo()` call marks BUHS as documented
5. UI automatically hides section when all documented

## Testing Plan

### Automated Testing
- [x] TypeScript compilation: ✅ Passed
- [x] Next.js build: ✅ Passed
- [x] CodeQL security scan: ✅ No alerts

### Manual Testing Scenarios

#### Scenario 1: Regnr with Undocumented BUHS
**Setup**: Vehicle has BUHS damages, none documented
**Expected**:
- "Befintliga skador att hantera" section visible
- All BUHS damages listed
- Each has "Dokumentera" and "Går inte att dokumentera" buttons

#### Scenario 2: Document BUHS Damage
**Setup**: From Scenario 1, document one damage
**Actions**:
1. Click "Dokumentera" on a BUHS damage
2. Fill in damage type, position, upload media
3. Save (not dry run)
4. Reload `/check?reg=<REGNR>`
**Expected**:
- Documented damage no longer in "Befintliga skador" list
- If more undocumented exist, section still visible
- If all documented, section hidden

#### Scenario 3: All BUHS Documented
**Setup**: Vehicle with all BUHS damages previously documented
**Expected**:
- "Befintliga skador att hantera" section NOT visible
- "Nya skador" section visible
- Form can be submitted without documenting anything

#### Scenario 4: New User Damages Only
**Setup**: Vehicle with only user-created damages (no BUHS)
**Expected**:
- "Befintliga skador att hantera" section NOT visible
- "Nya skador" section visible
- Historical user damages visible in info box (if applicable)

#### Scenario 5: Idempotence - Double Documentation
**Setup**: Attempt to document same BUHS damage twice
**Actions**:
1. Document a BUHS damage (save)
2. Attempt to document it again via API (if possible)
**Expected**:
- Second attempt fails with unique constraint error
- UI shows damage as already documented
- No duplicate rows in database

#### Scenario 6: Missing originalDamageDate
**Setup**: BUHS damage with NULL damage_date
**Expected**:
- Damage still shows in UI
- Can be documented
- Key uses "no-date" placeholder
- After documentation, marked as documented

#### Scenario 7: Text Changes Upstream
**Setup**: BUHS text changes after documentation
**Actions**:
1. Document BUHS with text "Repa höger dörr"
2. External system changes text to "Repa höger dörr - stor"
3. Reload form
**Expected**:
- New text appears as undocumented BUHS
- Old documentation remains in database
- User must document new version (by design)

## Performance Validation

### Query Count
- **Before**: 2 queries (vehicle/BUHS RPC + inventoried damages)
- **After**: 2 queries (vehicle/BUHS RPC + all user damages)
- ✅ No regression

### Query Efficiency
- Both queries use indexed fields (`regnr`)
- Second query changed from filtered (WHERE legacy_damage_source_text IS NOT NULL) to full scan
- Trade-off: Slightly more data transferred, but:
  - Enables new user damages tracking
  - Simplifies application logic
  - Still O(n) where n = damages for this regnr
  - Acceptable given damages rarely exceed 10-20 per vehicle

### Memory Usage
- Additional fields in `ConsolidatedDamage` type
- Impact: ~100 bytes per damage (negligible)
- Typical vehicle: 5-10 damages = 500-1000 bytes total
- ✅ Acceptable

## Migration Path

### Database Schema
**No changes required**. Implementation uses existing schema:
- `public.damages` table (already exists)
- `legacy_damage_source_text` column (already exists)
- `original_damage_date` column (already exists)
- Unique indexes (already exist)

### Backward Compatibility
**Fully compatible**. Changes are additive:
- New fields in response types (optional)
- Existing API consumers continue to work
- UI gracefully handles missing fields

### Deployment Steps
1. Deploy code to staging
2. Verify manual testing scenarios
3. Monitor logs for errors
4. Deploy to production
5. Monitor for 24 hours

## Future Optimizations

### Potential Payload Slimming (Future Issue)
As noted in code comments, future optimization could:
- Return only undocumented BUHS in `existing_damages`
- Add separate `newUserDamages` array if needed by UI
- Reduce payload size for vehicles with many documented damages

**Recommendation**: Implement only if performance metrics show need.

## References
- Problem Statement: Original issue/requirements document
- Database Schema: `docs/wiki/Database.md`
- Code: `lib/damages.ts`, `app/check/form-client.tsx`
- Indexes: `docs/wiki/Database.md` (Index section)

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2025-11-14 | Copilot | Initial implementation |

## Security Considerations
- ✅ CodeQL scan passed (0 alerts)
- ✅ No SQL injection risks (using parameterized queries)
- ✅ No XSS risks (React auto-escapes)
- ✅ Idempotence protects against duplicate writes
- ✅ BUHS data read-only from external source
