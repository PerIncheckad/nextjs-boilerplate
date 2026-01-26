/**
 * Mapping for Swedish damage type names
 * Maps UPPERCASE_UNDERSCORE format to Swedish display format with proper characters
 */
export const SWEDISH_DAMAGE_TYPE_MAP: Record<string, string> = {
  'FALGSKADA_SOMMARHJUL': 'Fälgskada sommarhjul',
  'FALGSKADA_VINTERHJUL': 'Fälgskada vinterhjul',
  'OVRIGT': 'Övrigt',
  'OVRIG_SKADA': 'Övrig skada',
  'DACKSKADA': 'Däckskada',
  'DACKSKADA_SOMMAR': 'Däckskada sommarhjul',
  'DACKSKADA_VINTER': 'Däckskada vinterhjul',
  'SKRAPAD_FALG': 'Skrapad fälg',
  'INVANDIG_SKADA': 'Invändig skada',
  'HOJDLEDSSKADA': 'Höjdledsskada',
  'SKRAPAD_OCH_BUCKLA': 'Skrapad och buckla',
  'JACK': 'Jack',
  'REPA': 'Repa',
  'REPOR': 'Repor',
  'BUCKLA': 'Buckla',
  'STENSKOTT': 'Stenskott',
  'SPRICKA': 'Spricka',
  'LACK': 'Lack',
  'SKRAPAD': 'Skrapad',
};

/**
 * Format damage type with Swedish characters
 * @param damageType - Damage type in UPPERCASE_UNDERSCORE format
 * @returns Formatted damage type with Swedish characters
 */
export function formatDamageTypeSwedish(damageType: string): string {
  if (!damageType) return 'Okänd';
  
  // First check if we have an exact mapping
  const upperType = damageType.toUpperCase();
  if (SWEDISH_DAMAGE_TYPE_MAP[upperType]) {
    return SWEDISH_DAMAGE_TYPE_MAP[upperType];
  }
  
  // Fallback: convert UPPERCASE_UNDERSCORE → Title Case
  return damageType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
