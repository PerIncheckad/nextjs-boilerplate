# Testing Email UI Improvements

## Overview
This document describes how to test the email UI improvements implemented in this PR.

## Changes to Test

### 1. New Red Banner: "Befintliga skador har hanterats"
**Location**: Both Huvudstation and Bilkontroll emails  
**When displayed**: When dokumenterade_skador OR åtgärdade_skador are present  
**Expected appearance**:
- Background color: `#B30E0E` (red)
- Text color: White
- Text: `⚠️ BEFINTLIGA SKADOR HAR HANTERATS ([antal])`
- `[antal]` = total count of dokumenterade_skador + åtgärdade_skador

### 2. Banner Color Updates
**All warning banners (createAlertBanner)**:
- Background: `#B30E0E` (red)
- Text: White
- Applies to:
  - Nya skador dokumenterade
  - Befintliga skador har hanterats
  - Ej upptankad
  - Låg laddnivå
  - Går inte att hyra ut
  - Varningslampa ej släckt
  - Rekond behövs
  - Husdjur/Rökning (sanering)
  - Insynsskydd saknas
  - Saludatum warnings

**Admin banners (createAdminBanner)**:
- Background: `#15418C` (blue)
- Text: White
- Applies to informational flags like "Reg.nr saknas i MABISYD Bilkontroll"

### 3. Previous Damage Info for Documented BUHS Damages
**Location**: "Befintliga skador (från BUHS) som dokumenterades" section  
**Expected behavior**:
- First line shows NEW structured description: `[Type]: [Positions]`
  - Example: `Buckla: Skärm (Höger bak)`
- If `fullText` exists and differs from the new description, shows additional line:
  - `Tidigare information om skadan: [fullText]`
  - Displayed in `<small>` tag

### 4. Footer Signature
**Location**: End of both Huvudstation and Bilkontroll emails (before copyright)  
**Expected text**: `Incheckad av [namn] kl [HH:MM], [YYYY-MM-DD]`  
**Example**: `Incheckad av Per Andersson kl 14:30, 2025-11-21`

### 5. Subject Line Marker
**Expected behavior**: Subject lines should include `- !!! -` when any of these conditions are true:
- Nya skador exist
- Dokumenterade OR åtgärdade skador exist
- Rental unavailable
- Varningslampa lyser
- Rekond behövs
- Not refueled (bensin/diesel)
- Low charge (elbil < 95%)
- Insynsskydd saknas
- Husdjur/Rökning sanerad

## Test Scenarios

### Scenario 1: Basic Check-in with Documented BUHS Damage
1. Navigate to `/check`
2. Enter a registration number with existing BUHS damages
3. Document at least one existing damage with photos
4. Complete the check-in
5. Verify emails:
   - ✅ Red banner "BEFINTLIGA SKADOR HAR HANTERATS (1)" appears
   - ✅ Banner has red background (#B30E0E) and white text
   - ✅ Documented damage shows structured text + "Tidigare information om skadan" if applicable
   - ✅ Footer shows: "Incheckad av [namn] kl [HH:MM], [YYYY-MM-DD]"
   - ✅ Subject includes "- !!! -"

### Scenario 2: Check-in with Multiple Handled Damages
1. Navigate to `/check`
2. Enter registration number with multiple BUHS damages
3. Document some damages with photos
4. Mark others as "Går inte att dokumentera" with comments
5. Complete check-in
6. Verify emails:
   - ✅ Red banner shows correct total count (e.g., "BEFINTLIGA SKADOR HAR HANTERATS (3)")
   - ✅ Both documented and non-documented damages are listed in separate sections
   - ✅ Subject includes "- !!! -"

### Scenario 3: Check-in with New Damages Only
1. Navigate to `/check`
2. Enter registration number with no existing BUHS damages
3. Add new damages with photos
4. Complete check-in
5. Verify emails:
   - ✅ "NYA SKADOR DOKUMENTERADE ([count])" banner appears in red
   - ✅ No "BEFINTLIGA SKADOR HAR HANTERATS" banner
   - ✅ Footer signature present
   - ✅ Subject includes "- !!! -"

### Scenario 4: Clean Check-in (No Issues)
1. Navigate to `/check`
2. Enter registration number
3. Complete check-in with no damages, no warnings
4. Verify emails:
   - ✅ No red warning banners
   - ✅ Footer signature present
   - ✅ Subject does NOT include "- !!! -" (just " - ")

## Visual Verification Checklist

For each email received:
- [ ] All warning banners have red background (#B30E0E)
- [ ] All admin banners have blue background (#15418C)
- [ ] All banner text is white and clearly readable
- [ ] "Befintliga skador har hanterats" banner displays when applicable
- [ ] Count in brackets is correct
- [ ] Documented BUHS damages show structured format
- [ ] "Tidigare information om skadan" appears when appropriate
- [ ] Footer signature is present and correctly formatted
- [ ] Subject line has "- !!! -" when dangerous conditions exist

## Notes

- All database logic remains unchanged
- No changes to the `/check` form UI
- No changes to getDescription or normalizeDamageType functions
- Changes are purely visual/email presentation
