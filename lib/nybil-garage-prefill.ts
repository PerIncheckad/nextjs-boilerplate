import { HUVUDSTATIONER } from './constants';

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('sv-SE');
}

export function resolvePlannedStationName(
  plannedStation: string | null | undefined,
  stationDisplayName: string | null | undefined,
): string | null {
  for (const candidate of [plannedStation, stationDisplayName]) {
    const value = candidate?.trim();
    if (!value) continue;

    const numeric = Number(value);
    if (Number.isInteger(numeric)) {
      const byId = HUVUDSTATIONER.find((station) => station.id === numeric);
      if (byId) return byId.name;
    }

    const byName = HUVUDSTATIONER.find((station) => normalized(station.name) === normalized(value));
    if (byName) return byName.name;
  }
  return null;
}

type SelectOption = {
  value: string;
  label: string;
};

export function resolveBrandPrefill(
  brand: string | null | undefined,
  options: readonly SelectOption[],
): { selectValue: string | null; customValue: string | null } {
  const value = brand?.trim();
  if (!value) return { selectValue: null, customValue: null };

  const exact = options.find((option) => normalized(option.value) === normalized(value) || normalized(option.label) === normalized(value));
  if (exact) return { selectValue: exact.value, customValue: null };

  const other = options.find((option) => normalized(option.value) === 'annat' || normalized(option.label) === 'annat');
  if (!other) return { selectValue: null, customValue: null };

  return { selectValue: other.value, customValue: value };
}
