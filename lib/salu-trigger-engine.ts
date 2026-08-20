import { saluFlagDate } from './salu-core';
import type { SaluEscalationStatus } from './salu-core';

export type SaluTriggerEvent =
  | 'SALU_FLAG_CREATED'
  | 'SALU_T10_ESCALATED'
  | 'SALU_T0_PASSED';

export type SaluTriggerAction = {
  type: SaluTriggerEvent;
  eventKey: string;
  saludatum: string;
};

export type SaluTriggerEvaluation = {
  actions: SaluTriggerAction[];
  requiresCatchUpPolicy: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid ISO date: ${value}`);
  const result = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    result.getUTCFullYear() !== Number(match[1]) ||
    result.getUTCMonth() !== Number(match[2]) - 1 ||
    result.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return result;
}

function formatIsoDate(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function addDays(isoDate: string, days: number): string {
  const value = parseIsoDate(isoDate);
  value.setUTCDate(value.getUTCDate() + days);
  return formatIsoDate(value);
}

function compareDates(left: string, right: string): number {
  return Math.sign(parseIsoDate(left).getTime() - parseIsoDate(right).getTime());
}

function eventKey(type: SaluTriggerEvent, saludatum: string): string {
  return `${type}:${saludatum}`;
}

export function evaluateSaluTriggers(input: {
  today: string;
  saludatum: string;
  hasActiveFlag: boolean;
  activeFlagEscalation?: SaluEscalationStatus;
  emittedEventKeys?: Iterable<string>;
}): SaluTriggerEvaluation {
  const emitted = new Set(input.emittedEventKeys ?? []);
  const actions: SaluTriggerAction[] = [];
  const t30 = saluFlagDate(input.saludatum);
  const t10 = addDays(input.saludatum, -10);

  if (!input.hasActiveFlag) {
    if (input.today === t30) {
      const key = eventKey('SALU_FLAG_CREATED', input.saludatum);
      if (!emitted.has(key)) {
        actions.push({ type: 'SALU_FLAG_CREATED', eventKey: key, saludatum: input.saludatum });
      }
      return { actions, requiresCatchUpPolicy: false };
    }

    return {
      actions,
      requiresCatchUpPolicy: compareDates(input.today, t30) > 0,
    };
  }

  if (compareDates(input.today, input.saludatum) >= 0) {
    if (input.activeFlagEscalation === 'PASSERAD') {
      return { actions, requiresCatchUpPolicy: false };
    }

    const key = eventKey('SALU_T0_PASSED', input.saludatum);
    if (!emitted.has(key)) {
      actions.push({ type: 'SALU_T0_PASSED', eventKey: key, saludatum: input.saludatum });
    }
    return { actions, requiresCatchUpPolicy: false };
  }

  if (compareDates(input.today, t10) >= 0) {
    if (input.activeFlagEscalation === 'T10' || input.activeFlagEscalation === 'PASSERAD') {
      return { actions, requiresCatchUpPolicy: false };
    }

    const key = eventKey('SALU_T10_ESCALATED', input.saludatum);
    if (!emitted.has(key)) {
      actions.push({ type: 'SALU_T10_ESCALATED', eventKey: key, saludatum: input.saludatum });
    }
  }

  return { actions, requiresCatchUpPolicy: false };
}

export function daysBetween(left: string, right: string): number {
  return Math.round((parseIsoDate(right).getTime() - parseIsoDate(left).getTime()) / DAY_MS);
}
