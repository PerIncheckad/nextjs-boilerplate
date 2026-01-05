// lib/normalizeDamageType.ts

/**
 * Normalizes Swedish damage type labels to standardized codes.
 * 
 * Tire/Wheel damages are grouped under parent_code='TIRE_WHEEL'.
 * All other damage types are sanitized to uppercase codes with spaces→underscores.
 */

export type NormalizedDamageType = {
  typeCode: string;
  parentCode: string | null;
};

// Mapping for tire/wheel related damages (grouped under TIRE_WHEEL)
const TIRE_WHEEL_MAPPING: Record<string, string> = {
  'Däckskada': 'DACKSKADA',
  'Däckskada sommarhjul': 'DACKSKADA_SOMMAR',
  'Däckskada vinterhjul': 'DACKSKADA_VINTER',
  'Fälgskada sommarhjul': 'FALGSKADA_SOMMARHJUL',
  'Fälgskada vinterhjul': 'FALGSKADA_VINTERHJUL',
  'Skrapad fälg': 'SKRAPAD_FALG',
  'Punktering': 'PUNKTERING',
};

/**
 * Normalizes a damage type string to a standardized code.
 * 
 * @param damageType - The raw damage type string (e.g., "Däckskada", "Repa")
 * @returns Object with typeCode and parentCode (null if not in a group)
 */
export function normalizeDamageType(damageType: string | null | undefined): NormalizedDamageType {
  if (!damageType || typeof damageType !== 'string') {
    return { typeCode: 'UNKNOWN', parentCode: null };
  }

  const trimmed = damageType.trim();

  // Check if it's a tire/wheel damage
  if (TIRE_WHEEL_MAPPING[trimmed]) {
    return {
      typeCode: TIRE_WHEEL_MAPPING[trimmed],
      parentCode: 'TIRE_WHEEL',
    };
  }

  // For all other types, sanitize to uppercase with underscores
  // Replace Swedish characters: Å→A, Ä→A, Ö→O, å→a, ä→a, ö→o
  const sanitized = trimmed
    .replace(/Å/g, 'A')
    .replace(/Ä/g, 'A')
    .replace(/Ö/g, 'O')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '_') // Replace any remaining special chars with underscore
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Trim underscores from start/end

  return {
    typeCode: sanitized || 'UNKNOWN',
    parentCode: null,
  };
}
