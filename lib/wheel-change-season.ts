export type WheelSeasonType = 'WINTER' | 'SUMMER';
export type WheelType = 'Vinterdäck' | 'Sommardäck';
export type WheelEligibility = 'REQUIRES_CHANGE' | 'ALREADY_CORRECT' | 'SALU_EXEMPT' | 'UNKNOWN_WHEEL_STATUS';

export type WheelSeason = {
  type: WheelSeasonType;
  key: string;
  targetWheelType: WheelType;
  startDate: string;
  endDate: string;
  saluExemptStart: string;
  saluExemptEnd: string;
};

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function winterSeason(startYear: number): WheelSeason {
  return {
    type: 'WINTER',
    key: `WINTER_${startYear}`,
    targetWheelType: 'Vinterdäck',
    startDate: isoDate(startYear, 10, 1),
    endDate: isoDate(startYear + 1, 4, 15),
    saluExemptStart: isoDate(startYear, 10, 1),
    saluExemptEnd: isoDate(startYear, 12, 5),
  };
}

export function summerSeason(year: number): WheelSeason {
  return {
    type: 'SUMMER',
    key: `SUMMER_${year}`,
    targetWheelType: 'Sommardäck',
    startDate: isoDate(year, 3, 31),
    endDate: isoDate(year, 5, 31),
    saluExemptStart: isoDate(year, 4, 1),
    saluExemptEnd: isoDate(year, 6, 5),
  };
}

function stockholmDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function operationalWheelSeason(now: Date): { season: WheelSeason; active: boolean } {
  const today = stockholmDate(now);
  const year = Number(today.slice(0, 4));
  const currentSummer = summerSeason(year);
  const currentWinter = today >= isoDate(year, 10, 1) ? winterSeason(year) : winterSeason(year - 1);

  // Business windows overlap 31 Mar-15 Apr. The campaign that started most recently
  // is operationally current, so summer takes precedence from 31 March.
  if (today >= currentSummer.startDate && today <= currentSummer.endDate) {
    return { season: currentSummer, active: true };
  }
  if (today >= currentWinter.startDate && today <= currentWinter.endDate) {
    return { season: currentWinter, active: true };
  }

  if (today < currentSummer.startDate) return { season: currentSummer, active: false };
  if (today < isoDate(year, 10, 1)) return { season: winterSeason(year), active: false };
  return { season: winterSeason(year), active: true };
}

export function normalizeWheelType(value: string | null | undefined): WheelType | null {
  const normalized = value?.trim().toLocaleLowerCase('sv-SE');
  if (!normalized) return null;
  if (normalized === 'vinterdäck' || normalized === 'vinterdack' || normalized === 'vinter') return 'Vinterdäck';
  if (normalized === 'sommardäck' || normalized === 'sommardack' || normalized === 'sommar') return 'Sommardäck';
  return null;
}

export function classifyWheelEligibility(
  season: WheelSeason,
  currentWheelType: string | null | undefined,
  currentSaluDate: string | null | undefined,
): WheelEligibility {
  const wheelType = normalizeWheelType(currentWheelType);
  if (!wheelType) return 'UNKNOWN_WHEEL_STATUS';
  if (wheelType === season.targetWheelType) return 'ALREADY_CORRECT';
  if (currentSaluDate && currentSaluDate >= season.saluExemptStart && currentSaluDate <= season.saluExemptEnd) {
    return 'SALU_EXEMPT';
  }
  return 'REQUIRES_CHANGE';
}
