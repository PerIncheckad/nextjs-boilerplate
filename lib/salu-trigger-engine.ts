import { saluFlagDate } from './salu-core';
import type { SaluEscalationStatus } from './salu-core';

export type SaluTriggerEvent =
  | 'SALU_FLAG_CREATED'
  | 'SALU_DECISION_REMINDER_DUE'
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

function eventKey(type: Exclude<SaluTriggerEvent, 'SALU_DECISION_REMINDER_DUE'>, saludatum: string): string {
  return `${type}:${saludatum}`;
}

function decisionReminderEventKey(flagId: string, cycle: number): string {
  return `SALU_DECISION_REMINDER_DUE:${flagId}:${cycle}`;
}

export function evaluateSaluTriggers(input: {
  today: string;
  saludatum: string;
  hasActiveFlag: boolean;
  activeFlagId?: string;
  activeFlagCreatedDate?: string;
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

  if (input.activeFlagId && input.activeFlagCreatedDate) {
    const elapsedDays = daysBetween(input.activeFlagCreatedDate, input.today);
    const cycle = Math.floor(elapsedDays / 10);
    if (cycle >= 1) {
      const key = decisionReminderEventKey(input.activeFlagId, cycle);
      if (!emitted.has(key)) {
        actions.push({
          type: 'SALU_DECISION_REMINDER_DUE',
          eventKey: key,
          saludatum: input.saludatum,
        });
      }
    }
  }

  if (compareDates(input.today, input.saludatum) >= 0) {
    if (input.activeFlagEscalation !== 'PASSERAD') {
      const key = eventKey('SALU_T0_PASSED', input.saludatum);
      if (!emitted.has(key)) {
        actions.push({ type: 'SALU_T0_PASSED', eventKey: key, saludatum: input.saludatum });
      }
    }
    return { actions, requiresCatchUpPolicy: false };
  }

  if (
    compareDates(input.today, t10) >= 0 &&
    input.activeFlagEscalation !== 'T10' &&
    input.activeFlagEscalation !== 'PASSERAD'
  ) {
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
