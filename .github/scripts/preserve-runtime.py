from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

# /check: preserve the pre-existing optional getPublicUrl error branch via a type-only cast.
path = Path('app/check/form-client.tsx')
text = path.read_text()
old = """      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (!data?.publicUrl) {
"""
new = """      const { data, error: urlError } = supabase.storage.from(BUCKET).getPublicUrl(path) as {
        data: { publicUrl: string };
        error?: unknown;
      };
      if (urlError) {
        console.error(`Failed to get public url for ${path} (attempt ${attempt}/${MAX_RETRIES}):`, urlError);

        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
          continue;
        }

        throw new Error('Fel vid uppladdning. Vänligen försök igen.');
      }

      if (!data?.publicUrl) {
"""
text = replace_once(text, old, new, 'check getPublicUrl runtime preservation')
path.write_text(text)

# /nybil: preserve the existing error/fallback behavior and make position fallback explicit.
path = Path('app/nybil/form-client.tsx')
text = path.read_text()
old = """      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      if (!data?.publicUrl) {
        console.error(`Error getting public URL for ${path}`);
"""
new = """      const { data, error: urlError } = supabase.storage.from(bucket).getPublicUrl(path) as {
        data: { publicUrl: string };
        error?: unknown;
      };
      if (urlError || !data?.publicUrl) {
        console.error(`Error getting public URL for ${path}:`, urlError);
"""
text = replace_once(text, old, new, 'nybil getPublicUrl runtime preservation')
text = replace_once(
    text,
    "          const rawPositioner = (damage.damageType && pos.carPart && getDamagePositions(damage.damageType, pos.carPart));",
    "          const rawPositioner = damage.damageType && pos.carPart ? getDamagePositions(damage.damageType, pos.carPart) : [];",
    'nybil position fallback',
)
path.write_text(text)

# lib/damages: keep the original query shape; solve the stale inferred type without fetching new runtime data.
path = Path('lib/damages.ts')
text = path.read_text()
text = replace_once(
    text,
    ".select('regnr, bilmarke, modell, hjul_forvaring_ort, hjul_forvaring_spec, hjul_forvaring, saludatum, bransletyp')",
    ".select('regnr, bilmarke, modell, hjul_forvaring_ort, hjul_forvaring_spec, hjul_forvaring, saludatum')",
    'damages nybil select baseline',
)
text = replace_once(
    text,
    '  const finalBransletyp = nybilData?.bransletyp || vehicleBransletyp || null;',
    "  const finalBransletyp = (nybilData as { bransletyp?: string | null } | null)?.bransletyp || vehicleBransletyp || null;",
    'damages nybil bransletyp type-only access',
)
path.write_text(text)

# lib/vehicle-status: the raw storage fields were already absent from the runtime object.
# Make those legacy type members optional instead of adding new return data.
path = Path('lib/vehicle-status.ts')
text = path.read_text()
old_type_block = """    hjulforvaring: string;
    hjulForvaringOrt: string;
    hjulForvaringSpec: string;
    reservnyckelForvaring: string;
    extranyckelForvaringOrt: string;
    extranyckelForvaringSpec: string;
    laddkablarForvaring: string;
    laddkablarForvaringOrt: string;
    laddkablarForvaringSpec: string;
    instruktionsbokForvaring: string;
    instruktionsbokForvaringOrt: string;
    instruktionsbokForvaringSpec: string;
    cocForvaring: string;
    cocForvaringOrt: string;
    cocForvaringSpec: string;
"""
new_type_block = """    hjulforvaring: string;
    hjulForvaringOrt?: string;
    hjulForvaringSpec?: string;
    reservnyckelForvaring: string;
    extranyckelForvaringOrt?: string;
    extranyckelForvaringSpec?: string;
    laddkablarForvaring: string;
    laddkablarForvaringOrt?: string;
    laddkablarForvaringSpec?: string;
    instruktionsbokForvaring: string;
    instruktionsbokForvaringOrt?: string;
    instruktionsbokForvaringSpec?: string;
    cocForvaring: string;
    cocForvaringOrt?: string;
    cocForvaringSpec?: string;
"""
text = replace_once(text, old_type_block, new_type_block, 'nybilFullData raw storage type optionality')
old_runtime_block = """    hjulForvaringOrt: nybilData.hjul_forvaring_ort || '---',
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
text = replace_once(text, old_runtime_block, '', 'nybilFullData added runtime storage fields')
path.write_text(text)

print('Runtime-preservation cleanup applied successfully')
