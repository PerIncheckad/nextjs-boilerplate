export const SALU_SLA_CODES = [
  'SALU_T30_START',
  'SALU_T10_ESCALATION',
  'SALU_T0_ESCALATION',
  'SALU_DECISION_REMINDER',
] as const;

export type SaluSlaCode = (typeof SALU_SLA_CODES)[number];

export function saluMilestoneDate(saludatum: Date, offsetDays: number): Date {
  const next = new Date(saludatum.getTime());
  next.setUTCDate(next.getUTCDate() + offsetDays);
  return next;
}

export function nextDecisionReminder(flagCreatedAt: Date, cycle: number): Date {
  if (!Number.isInteger(cycle) || cycle < 1) {
    throw new Error('Reminder cycle must be a positive integer');
  }
  const next = new Date(flagCreatedAt.getTime());
  next.setUTCDate(next.getUTCDate() + cycle * 10);
  return next;
}
