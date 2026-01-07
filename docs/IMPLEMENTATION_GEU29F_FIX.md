# GEU29F Special Handling and Documented-Skador Mapping Fix

## Overview
This document describes the implementation of special handling for vehicle GEU29F and improvements to the general mapping of inventoried/documented damages.

## Problem Statement
1. **GEU29F Issue**: Vehicle GEU29F had invalid previous documentation that should be treated as never documented. The system needed to:
   - Show BUHS raw text (not structured text from invalid documentation)
   - Hide media (folder = null)
   - Re-enable "Dokumentera befintliga skador" section in /check
   - Clear all handled_* fields

2. **General Mapping Issue**: When BUHS skador were inventoried/documented, the system wasn't always populating handled_* fields correctly, especially when media was in damages.uploads.folder instead of checkin_damages.photo_urls.

## Solution Implemented

### 1. GEU29F Force-Undocumented Flag
**File**: `app/api/vehicle-info/route.ts`

Added a special constant `SPECIAL_FORCE_UNDOCUMENTED` that lists vehicles requiring special handling:

```typescript
const SPECIAL_FORCE_UNDOCUMENTED = ['GEU29F'];
const isForceUndocumented = SPECIAL_FORCE_UNDOCUMENTED.includes(cleanedRegnr);
```

**Effects for GEU29F**:
- `is_inventoried` = `false` (enables "Dokumentera befintliga skador" section)
- All `handled_*` fields set to `null` or empty arrays
- `folder` = `null` (no media displayed)
- `text` = BUHS raw text (legacy format, not structured)

### 2. General Mapping Improvements
**File**: `app/api/vehicle-info/route.ts`

Improved the consolidation logic to:

1. **Populate handled_* fields properly**:
   - When handledInfo exists (from checkin_damages), all fields are populated
   - Includes: type, damage_type, car_part, position, comment, by

2. **Media fallback logic**:
   - **Primary**: Use `checkin_damages.photo_urls/video_urls` if present
   - **Fallback**: Use `damages.uploads.folder` if checkin_damages media is empty
   - This ensures media is shown even when documentation was saved differently

3. **Force-undocumented override**:
   - For vehicles in `SPECIAL_FORCE_UNDOCUMENTED`, all handled fields are overridden to null/empty
   - This prevents any structured data from being shown

## Code Changes

### Key Variables Added
```typescript
let finalPhotoUrls: string[] = [];
let finalVideoUrls: string[] = [];
let finalFolder: string | null = null;
```

### Logic Flow
```typescript
if (handledInfo) {
  // Primary: Use checkin_damages media if available
  if (handledInfo.photo_urls && handledInfo.photo_urls.length > 0) {
    finalPhotoUrls = handledInfo.photo_urls;
  }
  if (handledInfo.video_urls && handledInfo.video_urls.length > 0) {
    finalVideoUrls = handledInfo.video_urls;
  }
  
  // Fallback: Use damages.uploads.folder if checkin_damages media is missing
  if (finalPhotoUrls.length === 0 && finalVideoUrls.length === 0) {
    const folderFromDamages = folderMap.get(normalizedKey);
    if (folderFromDamages) {
      finalFolder = folderFromDamages;
    }
  }
} else {
  // No handledInfo: use folder from damages table if available
  finalFolder = folderMap.get(normalizedKey) || null;
}

// Apply force-undocumented override for special vehicles (e.g., GEU29F)
const finalIsInventoried = isForceUndocumented ? false : (isInventoried || (handledInfo !== null));
const finalHandledType = isForceUndocumented ? null : (handledInfo?.type || null);
// ... etc for all handled_* fields
```

## Handover Note

### IMPORTANT: Removing GEU29F Special Flag

Once GEU29F has been correctly documented in /check with proper photos and structured data:

1. Remove `'GEU29F'` from the `SPECIAL_FORCE_UNDOCUMENTED` array in `app/api/vehicle-info/route.ts`
2. The array should be empty or contain only other vehicles needing special handling
3. This will allow GEU29F to be treated like any other vehicle with documented damages

**Location**: `app/api/vehicle-info/route.ts`, line ~139

```typescript
// BEFORE (current state):
const SPECIAL_FORCE_UNDOCUMENTED = ['GEU29F'];

// AFTER (after GEU29F is correctly documented):
const SPECIAL_FORCE_UNDOCUMENTED = []; // or other vehicles if needed
```

## Testing Checklist

### For GEU29F (Force-Undocumented)
- [ ] Navigate to `/check` with GEU29F
- [ ] Verify "Dokumentera befintliga skador" section is visible
- [ ] Verify damage text shows raw BUHS format (not structured)
- [ ] Verify no media links are shown
- [ ] Verify `is_inventoried` = false in API response

### For Other Vehicles (General Mapping)
- [ ] Verify vehicles with `checkin_damages.photo_urls` show media correctly
- [ ] Verify vehicles with only `damages.uploads.folder` also show media (fallback works)
- [ ] Verify `handled_type`, `handled_damage_type`, etc. are populated when available
- [ ] Verify structured text is shown when handled_* fields are present

## Related Files
- `app/api/vehicle-info/route.ts` - Main implementation
- `lib/vehicle-status.ts` - Contains related GEU29F handling for /status page
- `app/check/form-client.tsx` - UI that consumes the API data

## Security Considerations
No security vulnerabilities introduced. The changes only affect:
- Data display logic (which fields are shown/hidden)
- Media fallback logic (using existing data sources)
- Special handling for specific vehicle registrations

All database queries and access patterns remain unchanged.
