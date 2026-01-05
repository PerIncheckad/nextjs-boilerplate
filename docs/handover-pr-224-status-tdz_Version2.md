# Handover / Debug log — PR #224 `/status` aggregation & persistent TDZ crash

Date: 2026-01-05  
Repo: `PerIncheckad/nextjs-boilerplate`  
PR: #224 (title has varied; topic is `/status` damage retrieval + crash recovery)  
User goal: `/status` must show **all available info** for a registration number, regardless of source:
- `/nybil` (nybil_inventering)
- `/check` (checkins + checkin_damages)
- Bilkontroll file (vehicles table via RPC)
- Skadefil / BUHS (legacy damages via RPC)
…and unify this into:
- Fordonsinformation
- Skador (deduped, correct media links, correct status)
- Historik (checkins + nybil + BUHS events), plus “Senaste händelser”.

Primary blocker across many iterations: **runtime TDZ crash** in `getVehicleStatus()` in the preview bundle, e.g.
> `ReferenceError: Cannot access 'ee' before initialization`  
with stage marker e.g. `build_vehicle_data:check_source`.

This crash forces fallback (graceful degradation) to BUHS-only rendering, hiding checkins and checkin_damages.

---

## 0) Key files / references

### PR #224 main file under change
- `lib/vehicle-status.ts`

### “Green deploy” file state (used in debugging)
Provided by user as a permalink (commit):
- Source URL: https://github.com/PerIncheckad/nextjs-boilerplate/blob/726fdd2215e67e2bd0c7c583ec64db265210bc4d/lib/vehicle-status.ts

### Production file
User indicates:
- “Här är URL:en till den fil som är i prod: `@PerIncheckad/nextjs-boilerplate/files/lib/vehicle-status.ts`”
  - (This is a GitHub UI reference; successor should open the `main` branch version and compare against PR branch.)

---

## 1) High-level requirement (what must work)

For any regnr, `/status` should display:

### 1.1 Vehicle info (Fordonsinformation)
Best-effort merge of:
- nybil_inventering: brand/model, equipment, storage, sale info, tankstatus, etc.
- vehicles table (Bilkontroll): supplemental fields where nybil lacks
- latest checkin: “bilen står nu”, odometer, hjultyp, etc.
- legacy damages: salutatum when missing elsewhere

### 1.2 Damages (Skador)
A unified list:
- BUHS “legacy” damages via `get_damages_by_trimmed_regnr`
- damages table entries (from check/nybil delivery etc)
- checkin_damages (documented/not_found + media, positions) should *enrich* the canonical damage list

Rules:
- Avoid duplicates (notably ZAG53Y scenario: BUHS + checkin damage rendered twice)
- Media folder parsing must be correct (notably GEU29F scenario)

### 1.3 History (Historik)
Must include:
- checkins: each checkin event with details and linked damages
- nybil registration event (if exists) with delivery info & nybil damages
- BUHS damage events not represented via a checkin damage (should show “Ej dokumenterad i Incheckad” only when truly not documented)

### 1.4 “Senaste händelser”
Should show a mix of latest checkin(s)/events, not only BUHS damage date.

---

## 2) Verified test cases & expected outcomes

These were the three primary acceptance test regnrs used during debugging:

### NGE97D (critical: crash reproducer)
Expected (based on real “Incheckad” emails / prior working /check behavior):
- BUHS legacy damage exists (damage_date 2025-08-29) with text “Repa - Repa stöt vä ba under skylt”
- There are checkins (count observed = 2 earlier)
- There is a not_found / checkin_damage handling message (example text seen in /check context): “Gick ej att dokumentera: … (Maciej)”
- `/status` must show checkins in “Senaste händelser” and in Historik
- BUHS damage should be marked as handled via checkin_damage status (not show as undoc-only BUHS)

Actual outcome in PR #224 (repeated):
- `getVehicleStatus crashed` with TDZ before building checkin history
- UI falls back to BUHS-only
- “Senaste händelser” shows only BUHS damage
- Historik missing checkin events or reduced to BUHS-only

### ZAG53Y (dedupe)
Expected:
- **Skador (1)**, not 2
- BUHS event should display that it was documented later, e.g. “Rapporterad i BUHS (Dokumenterad 2025-12-22)”
- Media should work from checkin_damages, not create duplicates

Observed earlier:
- Skador were sometimes duplicated: BUHS + checkin-damage as two separate cards

### GEU29F (media folder parsing + structure)
Expected:
- Damage text should use structured positions (Skadetyp – Placering – Position) from checkin_damages user_positions
- Media URLs must use full folder path after `/damage-photos/` up to last `/`, not only first segment
- History should not incorrectly mark documented damages as “Ej dokumenterad i Incheckad”

Observed earlier:
- Folder extraction bug: only first segment captured (`GEU29F`) instead of full nested folder path
- Structure missing or media links failing

---

## 3) Core blocker: TDZ crash (the “Cannot access 'ee' before initialization”)

### 3.1 Symptom
User repeatedly sees in preview console:

```
getVehicleStatus crashed 
{
  regnr: 'NGE97D',
  stage: 'build_vehicle_data:check_source',
  error: "Cannot access 'ee' before initialization",
  stack: "ReferenceError: Cannot access 'ee' before initialization\n
    at x (https://.../app/status/page-bd92e8b18554cfe5.js:1:7208)\n
    at async https://.../app/status/page-bd92e8b18554cfe5.js:1:36900"
}
```

Notes:
- The `ee` identifier is from minified output; it may vary (`v`, `x`, `ce`, `ee`, etc). This is normal.
- The stable signal is:
  - error type: **ReferenceError (TDZ)**
  - stage: **`build_vehicle_data:check_source`** (or earlier variants `checkins_source`)
  - regnr: NGE97D

### 3.2 Consequence
To keep the UI from being totally blank, the code introduced “graceful degradation” (try/catch) that returns BUHS-only data. This results in:
- missing checkin history
- missing not_found/documented status mapping
- “Matchning misslyckades – data kan vara ofullständig” message shown in the damage section (at least once during iterations)

### 3.3 Proven: data is not missing
During earlier debugging with added `console.log('getVehicleStatus debug', ...)`, NGE97D showed:
- `legacyDamagesCount: 1`
- `checkinsCount: 2`
- `vehicleCount: 0` (sometimes)
Additionally, in DevTools Network, the RPC response for `get_damages_by_trimmed_regnr` contained the expected BUHS row.

Therefore the issue is not RPC/DB emptiness but client-side runtime crash during processing/building.

---

## 4) “Big refactor” pitfalls encountered
At one point Copilot attempted a “shared path” refactor to avoid TDZ by moving logic out of source-specific blocks. This caused repeated build failures:

### 4.1 Syntax error build failure
Vercel error:
- `Expected ';', '}' or <eof>` in `lib/vehicle-status.ts` around ~1129  
Root cause: orphaned object properties / braces / duplicate return.

### 4.2 Duplicate identifier build failure
Later Vercel error:
- `damageRecords is defined multiple times`
- `damageCounts redefined here`
Cause: Copilot inserted new blocks without removing old ones.

### 4.3 Recovery action taken
Copilot later “reverted to a known-working state” (mentioned commit 345ebc2) to restore green build.

Despite green build, the **TDZ crash persisted**.

---

## 5) Concrete code observations in `lib/vehicle-status.ts` (commit 726fdd2…)
The provided file is long; the critical observation for successor is:

### 5.1 There is a large `if (source === 'checkins') { ... }` branch
This branch:
- constructs `vehicle` from latest checkin + legacySaludatum
- builds `damageRecords` from:
  - `legacyDamages` (BUHS)
  - `damages` table
- builds `historyRecords` from checkins
- fetches damage counts from `checkin_damages` **only to count type='new'** for avvikelser
- matches damages to checkins by comparing `damage.datum` with checkin date (YMD)

Important limitations / correctness issues:
- It does **not** fetch and use full `checkin_damages` objects to enrich damage status (documented/not_found) for BUHS damages.
- BUHS-only damages in this branch get `sourceInfo: 'Källa: BUHS\nReg. nr har aldrig checkats in ...'` which is wrong when checkins exist.
- It attempts to infer which damages belong to a checkin by date equality, which is fragile and does not represent documented older BUHS damages well.
- This branch is also where stage markers were pointing in earlier iterations (`build_vehicle_data:check_source` etc).

### 5.2 In the non-checkins branch, history is built from checkins but still does not map BUHS to checkin_damages
In the general branch:
- `damageRecords` built from legacyDamages + damages table (with a date-based “skip duplicates” using `legacyDamageKeys`)
- History: checkins are added and matchedDamages are attached by date
- BUHS history events are added for legacy damages not shown in checkins (again based on `damagesShownInCheckins` keyed by damageRecord.id)

Again, lacking key feature:
- A true mapping between BUHS damage and checkin_damage documented/not_found, and then using that mapping to:
  - mark BUHS as documented later
  - avoid duplicates
  - attach media folders for documented older damages

---

## 6) Most likely root cause of TDZ (and why it’s hard)
TDZ ReferenceErrors inside Next.js minified bundles usually come from:
- a `let/const` variable referenced before initialization within the same scope due to refactor + closures
- duplicate or shadowed declarations
- circular imports or client/server boundary issues

Attempted fix:
- `normalizeDamageType` was moved out of `app/api/...` into `lib/normalizeDamageType.ts` to avoid importing route code into shared lib.  
This was correct hygiene but did not solve TDZ.

Current state:
- TDZ persists, stage markers identify vehicle-building block.  
Successor should locate where `stage = 'build_vehicle_data:check_source'` is set (if still present in PR branch) and rewrite that entire block with:
- no inline callbacks using variables declared later
- no repeated const declarations
- ideally extracted to pure helper functions in separate modules, each with straightforward local variables.

---

## 7) Recommended recovery plan for successor (deterministic)

### Phase 1 — Make the crash impossible
1) Ensure `getVehicleStatus()` is wrapped in a top-level try/catch *only to prevent blank UI*, but do not accept BUHS-only as final behavior.
2) Remove stage-based crash points by rewriting vehicle-building from check/checkins.
3) Add stable logging that proves which commit is deployed (Vercel commit SHA if available), to avoid “are we running latest deploy?” confusion.

### Phase 2 — Correct data modeling: use `checkin_damages` as truth for documentation
Implement a clear pipeline:

**Data fetch**
- Fetch checkins
- Fetch all `checkin_damages` for those checkins, including:
  - `type` (`new` | `documented` | `not_found`)
  - any folder/media info
  - damage description (text/positions)
  - relation to BUHS (e.g. stored BUHS text or mapping key; depends on schema)

**Mapping**
- Build `buhsDamageKey` for each legacy damage using the same function as /check uses:
  - `getLegacyDamageText(d)` (or a canonical key)
- Build `checkinDamageKey` similarly from `checkin_damages` rows (documented/not_found likely store BUHS-derived text)
- Match BUHS → checkin_damage:
  - Guard: do not match empty or too-short texts (avoid `includes('')`)
  - Track used IDs to prevent multiple BUHS mapping to one checkin_damage
- Once matched:
  - BUHS damage record’s `sourceInfo` should be updated to “Rapporterad i BUHS (Dokumenterad <date>)” or “Gick ej att dokumentera …”
  - BUHS damage history should be replaced by checkin history item; do not also show separate BUHS-only entry
  - Media folder from checkin_damage should attach to BUHS record when documented and has media

**Dedupe**
- If a checkin_damage is used to annotate a BUHS record, do not render it as a separate damage card.

### Phase 3 — Re-validate acceptance cases
- NGE97D: checkin history present, no crash, not_found visible, BUHS marked handled
- ZAG53Y: Skador (1), BUHS documented later displayed
- GEU29F: full media folder path, structured positions displayed, history status correct

---

## 8) Notes about environment / tooling issues encountered
- Incognito testing of “View deployment” was problematic (magic link input couldn’t be typed). Testing was done in normal Chrome with hard reload instead.
- Multiple deploy URLs exist per commit; confusion about whether preview runs latest commit occurred. Logging commit SHA was requested as a mitigation.

---

## 9) What to hand to “new bot” / engineer (actionable summary)

**You are inheriting:**
- A PR attempting to merge all damage sources and show in `/status`
- A persistent runtime TDZ crash that blocks NGE97D from showing checkins/history
- Known functional acceptance expectations (NGE97D, ZAG53Y, GEU29F)
- A file (`lib/vehicle-status.ts`) that has been repeatedly edited; prefer a clean rewrite of the problematic vehicle-building block rather than incremental patching.

**First thing to do:**
- Get a local reproduction with source maps to identify the exact TS line(s) for the TDZ crash.
- Rewrite the `check_source`/checkins vehicle-building code in a minimal helper function to eliminate TDZ.
- Then implement proper checkin_damages-based mapping/dedupe rather than date-based matching.

---

## Appendix A — The exact error string (as seen by user, 2026-01-05)
```
23-09bf37dd3d34cb81.js:1 getVehicleStatus crashed 
{regnr: 'NGE97D', stage: 'build_vehicle_data:check_source', error: "Cannot access 'ee' before initialization", stack: "ReferenceError: Cannot access 'ee' before initiali…hunks/app/status/page-bd92e8b18554cfe5.js:1:36900"}
```
