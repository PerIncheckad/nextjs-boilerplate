export type SaluControlMode = 'AUTO' | 'MANUELL';
export type SaluEscalationStatus = 'NORMAL' | 'T10' | 'PASSERAD';

export type SaluAutoRule = {
  id: string;
  version: number;
  make: string;
  months: number;
  modelTokens?: string[];
  priority?: number;
  active?: boolean;
};

export type SaluAutoMatch = {
  ruleId: string;
  ruleVersion: number;
  matchedMake: string;
  matchedModelTokens: string[];
  monthsApplied: number;
  saludatum: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(value: string): Date {
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`Invalid ISO date: ${value}`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));

  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${value}`);
  }

  return result;
}

function formatIsoDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysInMonth(year: number, zeroBasedMonth: number): number {
  return new Date(Date.UTC(year, zeroBasedMonth + 1, 0)).getUTCDate();
}

export function addCalendarMonths(isoDate: string, months: number): string {
  if (!Number.isInteger(months)) {
    throw new Error('Calendar months must be an integer');
  }

  const source = parseIsoDate(isoDate);
  const sourceDay = source.getUTCDate();
  const targetMonthIndex = source.getUTCMonth() + months;
  const targetYear = source.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const targetDay = Math.min(sourceDay, daysInMonth(targetYear, targetMonth));

  return formatIsoDate(new Date(Date.UTC(targetYear, targetMonth, targetDay)));
}

export function lifecycleDay(nyDate: string, date: string): number {
  const start = parseIsoDate(nyDate).getTime();
  const current = parseIsoDate(date).getTime();
  const difference = Math.round((current - start) / DAY_MS);

  if (difference < 0) {
    throw new Error('Lifecycle date cannot be before NY date');
  }

  return difference + 1;
}

export function stillestandSaluDays(slutbedomningDate: string, closedDate: string): number {
  const start = parseIsoDate(slutbedomningDate).getTime();
  const end = parseIsoDate(closedDate).getTime();
  const difference = Math.round((end - start) / DAY_MS);

  if (difference < 0) {
    throw new Error('STÄNGD cannot be before SLUTBEDÖMNING');
  }

  return difference;
}

export function normalizeSaluTokenText(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLocaleUpperCase('sv-SE')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizedText(value: string): string {
  return normalizeSaluTokenText(value).join(' ');
}

function ruleMatches(rule: SaluAutoRule, make: string, modelTokens: Set<string>): boolean {
  if (rule.active === false || normalizedText(rule.make) !== normalizedText(make)) {
    return false;
  }

  const requiredTokens = (rule.modelTokens ?? []).flatMap(normalizeSaluTokenText);
  return requiredTokens.every((token) => modelTokens.has(token));
}

export function selectSaluAutoRule(
  make: string,
  model: string,
  rules: SaluAutoRule[],
): SaluAutoRule | null {
  const modelTokens = new Set(normalizeSaluTokenText(model));
  const matches = rules.filter((rule) => ruleMatches(rule, make, modelTokens));

  if (matches.length === 0) {
    return null;
  }

  return [...matches].sort((left, right) => {
    const leftSpecificity = (left.modelTokens ?? []).flatMap(normalizeSaluTokenText).length;
    const rightSpecificity = (right.modelTokens ?? []).flatMap(normalizeSaluTokenText).length;

    if (leftSpecificity !== rightSpecificity) {
      return rightSpecificity - leftSpecificity;
    }

    const priorityDifference = (right.priority ?? 0) - (left.priority ?? 0);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const ruleIdDifference = left.id.localeCompare(right.id);
    if (ruleIdDifference !== 0) {
      return ruleIdDifference;
    }

    return right.version - left.version;
  })[0];
}

export function calculateAutoSaludatum(input: {
  nyDate: string;
  make: string;
  model: string;
  rules: SaluAutoRule[];
}): SaluAutoMatch | null {
  const rule = selectSaluAutoRule(input.make, input.model, input.rules);
  if (!rule) {
    return null;
  }

  if (!Number.isInteger(rule.months) || rule.months <= 0) {
    throw new Error(`Invalid month count for SALU rule ${rule.id}`);
  }

  return {
    ruleId: rule.id,
    ruleVersion: rule.version,
    matchedMake: rule.make,
    matchedModelTokens: rule.modelTokens ?? [],
    monthsApplied: rule.months,
    saludatum: addCalendarMonths(input.nyDate, rule.months),
  };
}

export function saluFlagDate(saludatum: string): string {
  const date = parseIsoDate(saludatum);
  date.setUTCDate(date.getUTCDate() - 30);
  return formatIsoDate(date);
}

export function saluEscalationStatus(today: string, saludatum: string): SaluEscalationStatus {
  const current = parseIsoDate(today).getTime();
  const target = parseIsoDate(saludatum).getTime();
  const daysUntil = Math.round((target - current) / DAY_MS);

  if (daysUntil <= 0) {
    return 'PASSERAD';
  }

  if (daysUntil <= 10) {
    return 'T10';
  }

  return 'NORMAL';
}
