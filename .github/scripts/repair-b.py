from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)


# CHECK: make the existing dynamic setter boundary explicit and remove one falsey-union inference.
path = Path('app/check/form-client.tsx')
text = path.read_text()
old = 'updater(damages => damages.map(d =>'
count = text.count(old)
if count != 4:
    raise SystemExit(f'check updater damages callbacks: expected 4, found {count}')
text = text.replace(old, 'updater((damages: any[]) => damages.map((d: any) =>')
old = 'updater(prev => prev.map(d =>'
count = text.count(old)
if count != 2:
    raise SystemExit(f'check updater prev callbacks: expected 2, found {count}')
text = text.replace(old, 'updater((prev: any[]) => prev.map((d: any) =>')
text = replace_once(
    text,
    "const rawPositioner = (damageType && pos.carPart && getDamagePositions(damageType || '', pos.carPart));",
    "const rawPositioner = damageType && pos.carPart ? getDamagePositions(damageType, pos.carPart) : [];",
    'check rawPositioner guard',
)
path.write_text(text)


# VEHICLE STATUS: align declared types with UUID/raw-null contracts already used by runtime code.
path = Path('lib/vehicle-status.ts')
text = path.read_text()
text = replace_once(
    text,
    '  id?: number;\n  checkin_id: string;',
    '  id?: string;\n  // Optional legacy compatibility only; current documented checkin_damages schema has no damage_id.\n  damage_id?: string | null;\n  checkin_id: string;',
    'CheckinDamageData id contract',
)
count = text.count('new Set<number>()')
if count != 2:
    raise SystemExit(f'matchedCheckinDamageIds sets: expected 2, found {count}')
text = text.replace('new Set<number>()', 'new Set<string>()')

text = replace_once(
    text,
    '  checkinWhereDocumented?: number | null; // checkin_id where this damage was documented',
    '  checkinWhereDocumented?: string | null; // UUID checkin_id where this damage was documented',
    'DamageRecord checkinWhereDocumented type',
)
text = replace_once(
    text,
    '    legacy_damage_source_text?: string;\n    damageDate?: string;',
    '    legacy_damage_source_text?: string | null;\n    damageDate?: string;',
    'History BUHS legacy text nullability',
)
text = replace_once(
    text,
    '    checkinWhereDocumented?: number | null; // checkin_id where this BUHS damage was documented',
    '    checkinWhereDocumented?: string | null; // UUID checkin_id where this BUHS damage was documented',
    'History BUHS checkin UUID type',
)

text = replace_once(
    text,
    '      checkin?: any | null;\n    };',
    '      checkin?: any | null;\n      documentedBy?: string | null;\n      documentedDate?: string | null;\n    };',
    'first DamageEntry metadata',
)
text = replace_once(
    text,
    '    checkin?: any | null;\n  };',
    '    checkin?: any | null;\n    documentedBy?: string | null;\n    documentedDate?: string | null;\n  };',
    'second DamageEntry metadata',
)

text = replace_once(
    text,
    "    laddniva_vid_leverans: 'Laddnivå vid leverans',\n    saludatum: 'Saludatum',\n    salu_station: 'Salustation',",
    "    laddniva_vid_leverans: 'Laddnivå vid leverans',\n    salu_station: 'Salustation',",
    'duplicate saludatum display name',
)

text = replace_once(
    text,
    "console.log('[DEBUG LRA75R] Legacy damages from RPC:', legacyDamages.map(d => ({",
    "console.log('[DEBUG LRA75R] Legacy damages from RPC:', legacyDamages.map((d: LegacyDamage) => ({",
    'legacy damage debug callback type',
)

count = text.count('folder = entry.folder;')
if count != 4:
    raise SystemExit(f'entry.folder assignments: expected 4, found {count}')
text = text.replace('folder = entry.folder;', 'folder = entry.folder || undefined;')

count = text.count('id: entry.id,')
if count != 2:
    raise SystemExit(f'DamageRecord entry ids: expected 2, found {count}')
text = text.replace('id: entry.id,', 'id: String(entry.id),')

marker = "    cocForvaring: (nybilData?.coc_forvaring_ort || nybilData?.coc_forvaring_spec)\n      ? [nybilData.coc_forvaring_ort, nybilData.coc_forvaring_spec].filter(Boolean).join(' - ')\n      : '---',\n"
addition = """    cocForvaring: (nybilData?.coc_forvaring_ort || nybilData?.coc_forvaring_spec)
      ? [nybilData.coc_forvaring_ort, nybilData.coc_forvaring_spec].filter(Boolean).join(' - ')
      : '---',
    hjulForvaringOrt: nybilData.hjul_forvaring_ort || '---',
    hjulForvaringSpec: nybilData.hjul_forvaring_spec || nybilData.hjul_forvaring || '---',
    extranyckelForvaringOrt: nybilData.extranyckel_forvaring_ort || '---',
    extranyckelForvaringSpec: nybilData.extranyckel_forvaring_spec || '---',
    laddkablarForvaringOrt: nybilData.laddkablar_forvaring_ort || '---',
    laddkablarForvaringSpec: nybilData.laddkablar_forvaring_spec || '---',
    instruktionsbokForvaringOrt: nybilData.instruktionsbok_forvaring_ort || '---',
    instruktionsbokForvaringSpec: nybilData.instruktionsbok_forvaring_spec || '---',
    cocForvaringOrt: nybilData.coc_forvaring_ort || '---',
    cocForvaringSpec: nybilData.coc_forvaring_spec || '---',
"""
text = replace_once(text, marker, addition, 'nybilFullData raw storage fields')

path.write_text(text)
print('Repair B patch applied successfully')
