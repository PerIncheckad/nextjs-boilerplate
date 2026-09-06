import { fetchStatusData } from './status-data-client';

type StatusRow = Record<string, unknown>;

export type StatusReadModelSourceData = {
  nybil: StatusRow | null;
  vehicle: StatusRow[];
  damages: StatusRow[];
  legacyDamages: StatusRow[];
  checkins: StatusRow[];
  arrivals: StatusRow[];
  vehicleEdits: StatusRow[];
  damageComments: StatusRow[];
  checkinDamages: StatusRow[];
  saluState: StatusRow | null;
  currentWheelFact: StatusRow | null;
};

const latestByRegnr = new Map<string, StatusReadModelSourceData>();

function normalizeRegnr(value: string): string {
  return value.toUpperCase().trim().replace(/\s/g, '');
}

function isStatusRow(value: unknown): value is StatusRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRows(value: unknown[], field: string): StatusRow[] {
  if (!value.every(isStatusRow)) {
    throw new Error(`Ogiltig statusdata: ${field}`);
  }
  return value;
}

function requireOptionalRow(value: unknown | null, field: string): StatusRow | null {
  if (value === null) return null;
  if (!isStatusRow(value)) throw new Error(`Ogiltig statusdata: ${field}`);
  return value;
}

export function getLatestStatusReadModelSourceData(regnr: string): StatusReadModelSourceData | null {
  return latestByRegnr.get(normalizeRegnr(regnr)) ?? null;
}

export async function fetchStatusReadModelSourceData(regnr: string): Promise<StatusReadModelSourceData> {
  const payload = await fetchStatusData(regnr);

  if (payload.nybil !== null && !isStatusRow(payload.nybil)) {
    throw new Error('Ogiltig statusdata: nybil');
  }

  const data: StatusReadModelSourceData = {
    nybil: payload.nybil,
    vehicle: requireRows(payload.vehicle, 'vehicle'),
    damages: requireRows(payload.damages, 'damages'),
    legacyDamages: requireRows(payload.legacyDamages, 'legacyDamages'),
    checkins: requireRows(payload.checkins, 'checkins'),
    arrivals: requireRows(payload.arrivals, 'arrivals'),
    vehicleEdits: requireRows(payload.vehicleEdits, 'vehicleEdits'),
    damageComments: requireRows(payload.damageComments, 'damageComments'),
    checkinDamages: requireRows(payload.checkinDamages, 'checkinDamages'),
    saluState: requireOptionalRow(payload.saluState, 'saluState'),
    currentWheelFact: requireOptionalRow(payload.currentWheelFact, 'currentWheelFact'),
  };

  latestByRegnr.set(normalizeRegnr(regnr), data);
  return data;
}
