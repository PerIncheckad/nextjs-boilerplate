from pathlib import Path

path = Path('lib/vehicle-status.ts')
text = path.read_text()

old = "export type DamageRecord = {\n  id: string;\n"
new = "export type DamageRecord = {\n  id: string | number;\n"
if text.count(old) != 1:
    raise SystemExit(f'DamageRecord id type: expected 1 match, found {text.count(old)}')
text = text.replace(old, new, 1)

old = 'id: String(entry.id),'
if text.count(old) != 2:
    raise SystemExit(f'entry id conversion: expected 2 matches, found {text.count(old)}')
text = text.replace(old, 'id: entry.id,')

old = 'commentsByDamageId.has(damage.id)'
if text.count(old) != 2:
    raise SystemExit(f'comments map has: expected 2 matches, found {text.count(old)}')
text = text.replace(old, 'commentsByDamageId.has(damage.id as string)')

old = 'commentsByDamageId.get(damage.id)'
if text.count(old) != 2:
    raise SystemExit(f'comments map get: expected 2 matches, found {text.count(old)}')
text = text.replace(old, 'commentsByDamageId.get(damage.id as string)')

path.write_text(text)
print('Damage ID runtime preservation applied successfully')
