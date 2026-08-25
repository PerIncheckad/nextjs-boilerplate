export type TowerExportItem = {
  regnr: string;
  station: string | null;
  state: string | null;
  stateStartedAt: string | null;
  downtimeReason: string | null;
  attention: string[];
  ownerFunctions: string[];
  actionStatus: string | null;
  deadlineAt: string | null;
  overdue: boolean;
  waitingVerification: boolean;
  nextSteps: string[];
};

function neutralizeSpreadsheetFormula(text: string): string {
  return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value == null ? '' : neutralizeSpreadsheetFormula(String(value));
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildTowerCsv(items: TowerExportItem[], generatedAt: string): string {
  const header = [
    'generated_at',
    'regnr',
    'station',
    'state',
    'state_started_at',
    'downtime_reason',
    'attention',
    'owner_functions',
    'action_status',
    'deadline_at',
    'overdue',
    'waiting_verification',
    'next_steps',
  ];

  const rows = items.map((item) => [
    generatedAt,
    item.regnr,
    item.station,
    item.state,
    item.stateStartedAt,
    item.downtimeReason,
    item.attention.join(' | '),
    item.ownerFunctions.join(' | '),
    item.actionStatus,
    item.deadlineAt,
    item.overdue,
    item.waitingVerification,
    item.nextSteps.join(' | '),
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => csvCell(value)).join(','))
    .join('\n');
}
