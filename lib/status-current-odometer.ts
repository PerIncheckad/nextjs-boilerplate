import type { StatusReadModelSourceData } from './status-read-model-source';

export type CurrentOdometerSource = 'nybil' | 'incheckning' | 'ankomst' | 'status';

export type CurrentOdometerObservation = {
  value: number;
  timestamp: string;
  source: CurrentOdometerSource;
  actor: string;
};

type StatusRow = Record<string, unknown>;

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asTimestamp(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  return Number.isNaN(new Date(text).getTime()) ? null : text;
}

function asOdometer(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  const text = asText(value);
  if (!text || !/^\d+$/.test(text)) return null;

  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function humanizeEmail(value: string): string {
  if (!value.includes('@')) return value;

  const localPart = value.split('@')[0] || '';
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

  return words.length ? words.join(' ') : value;
}

function actor(row: StatusRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = asText(row[key]);
    if (value) return humanizeEmail(value);
  }
  return 'Okänd';
}

function chooseLater(
  current: CurrentOdometerObservation | null,
  candidate: CurrentOdometerObservation | null,
): CurrentOdometerObservation | null {
  if (!candidate) return current;
  if (!current) return candidate;

  return new Date(candidate.timestamp).getTime() > new Date(current.timestamp).getTime()
    ? candidate
    : current;
}

function observation(
  value: unknown,
  timestampValue: unknown,
  source: CurrentOdometerSource,
  observedBy: string,
): CurrentOdometerObservation | null {
  const odometer = asOdometer(value);
  const timestamp = asTimestamp(timestampValue);
  if (odometer === null || !timestamp) return null;

  return {
    value: odometer,
    timestamp,
    source,
    actor: observedBy,
  };
}

/**
 * Resolve Status current odometer from legitimate verified observations.
 *
 * Business contract:
 * NYBIL baseline -> later verified observations -> latest observation in time
 * is the current fact. Source records are only read; no history is rewritten.
 */
export function resolveCurrentOdometer(
  sourceData: StatusReadModelSourceData,
): CurrentOdometerObservation | null {
  let current: CurrentOdometerObservation | null = null;

  const nybil = sourceData.nybil;
  if (nybil) {
    const baselineValue = asOdometer(nybil.matarstallning_aktuell)
      ?? asOdometer(nybil.matarstallning_inkop);
    const baselineTimestamp = asTimestamp(nybil.created_at)
      ?? asTimestamp(nybil.registreringsdatum);

    current = chooseLater(
      current,
      observation(
        baselineValue,
        baselineTimestamp,
        'nybil',
        actor(nybil, 'fullstandigt_namn', 'registrerad_av'),
      ),
    );
  }

  for (const checkin of sourceData.checkins) {
    if (asText(checkin.status) !== 'COMPLETED') continue;

    current = chooseLater(
      current,
      observation(
        checkin.odometer_km,
        checkin.completed_at,
        'incheckning',
        actor(checkin, 'checker_name', 'checker_email', 'user_email'),
      ),
    );
  }

  for (const arrival of sourceData.arrivals) {
    current = chooseLater(
      current,
      observation(
        arrival.odometer_km,
        arrival.created_at,
        'ankomst',
        actor(arrival, 'checker_name', 'checker_email', 'user_email'),
      ),
    );
  }

  for (const edit of sourceData.vehicleEdits) {
    if (asText(edit.field_name) !== 'matarstallning') continue;

    current = chooseLater(
      current,
      observation(
        edit.new_value,
        edit.edited_at,
        'status',
        actor(edit, 'edited_by'),
      ),
    );
  }

  return current;
}
