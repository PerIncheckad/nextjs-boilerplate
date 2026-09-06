const NON_ACTIONABLE_WHEEL_STORAGE_VALUES = new Set([
  '?',
  'FINNS EJ',
  'FINNS INTE',
  'INGA HJUL',
  'SAKNAS',
  'OKLAR',
  'OKLART',
  'OKÄND',
  'OKÄNT',
  'SÅLD',
]);

export function normalizeWheelStorageValue(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ').toLocaleUpperCase('sv-SE') ?? '';
  return normalized || null;
}

export function isActionableWheelStorage(value: string | null | undefined): boolean {
  const normalized = normalizeWheelStorageValue(value);
  return Boolean(normalized && !NON_ACTIONABLE_WHEEL_STORAGE_VALUES.has(normalized));
}
