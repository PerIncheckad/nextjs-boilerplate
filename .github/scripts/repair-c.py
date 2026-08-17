from pathlib import Path

path = Path('lib/vehicle-status.ts')
text = path.read_text()
old = "  is_unmatched_buhs?: boolean; // True if this is an unmatched BUHS damage\n  // Skadekommentar(er), nyast först\n"
new = "  is_unmatched_buhs?: boolean; // True if this is an unmatched BUHS damage\n  _stableKey?: string; // Internal deterministic merge/debug key already emitted by runtime\n  // Skadekommentar(er), nyast först\n"
count = text.count(old)
if count != 1:
    raise SystemExit(f'DamageRecord _stableKey type insertion: expected 1 match, found {count}')
path.write_text(text.replace(old, new, 1))
print('Repair C patch applied successfully')
