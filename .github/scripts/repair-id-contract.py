from pathlib import Path

# lib/damages.ts: checkin_damages.id is UUID; consolidated damages can originate from legacy numeric BUHS or UUID damages.
path = Path('lib/damages.ts')
text = path.read_text()
repls = [
    ('  id?: number;\n  type:', '  id?: string;\n  type:', 'CheckinDamageData.id'),
    ('  id: number;\n  text: string;', '  id: number | string;\n  text: string;', 'ConsolidatedDamage.id'),
    ('    id: number;\n    type:', '    id: string;\n    type:', 'HandledDamageInfo.id'),
    ('        id: handled.id || 0,', "        id: handled.id || '',", 'handled id fallback'),
    ('  const matchedHandledIds = new Set<number>();', '  const matchedHandledIds = new Set<string>();', 'matchedHandledIds'),
]
for old, new, label in repls:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    text = text.replace(old, new, 1)
path.write_text(text)

# app/check/form-client.tsx: db_id mirrors ConsolidatedDamage.id.
path = Path('app/check/form-client.tsx')
text = path.read_text()
old = '  db_id: number;\n'
if text.count(old) != 1:
    raise SystemExit(f'ExistingDamage.db_id: expected 1 match, found {text.count(old)}')
path.write_text(text.replace(old, '  db_id: number | string;\n', 1))

print('UUID contract repair applied successfully')
