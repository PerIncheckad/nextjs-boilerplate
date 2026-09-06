import type { StatusReadModelSourceData } from './status-read-model-source';

export type CurrentLocationSource = 'nybil' | 'incheckning' | 'ankomst' | 'status';

export type CurrentLocationObservation = {
  city: string;
  station: string;
  timestamp: string;
  source: CurrentLocationSource;
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

export function serializeCurrentLocation(city: string, station: string): string {
  return `${city.trim()} / ${station.trim()}`;
}

export function parseStoredCurrentLocation(value: unknown): { city: string; station: string } | null {
  const text = asText(value);
  if (!text) return null;

  const separator = ' / ';
  const separatorIndex = text.indexOf(separator);
  if (separatorIndex <= 0) return null;

  const city = text.slice(0, separatorIndex).trim();
  const station = text.slice(separatorIndex + separator.length).trim();
  if (!city || !station) return null;

  return { city, station };
}

function observation(
  cityValue: unknown,
  stationValue: unknown,
  timestampValue: unknown,
  source: CurrentLocationSource,
  observedBy: string,
): CurrentLocationObservation | null {
  const city = asText(cityValue);
  const station = asText(stationValue);
  const timestamp = asTimestamp(timestampValue);
  if (!city || !station || !timestamp) return null;

  return {
    city,
    station,
    timestamp,
    source,
    actor: observedBy,
  };
}

function chooseLater(
  current: CurrentLocationObservation | null,
  candidate: CurrentLocationObservation | null,
): CurrentLocationObservation | null {
  if (!candidate) return current;
  if (!current) return candidate;

  return new Date(candidate.timestamp).getTime() > new Date(current.timestamp).getTime()
    ? candidate
    : current;
}

/**
 * Resolve current physical location from legitimate verified observations.
 *
 * Business contract:
 * NYBIL baseline -> later verified observations -> latest observation in time
 * is the current fact. A Status correction is only a location observation; it
 * does not create Check-in, RENTAL, AVAILABLE or any other process state.
 */
export function resolveCurrentLocation(
  sourceData: StatusReadModelSourceData,
): CurrentLocationObservation | null {
  let current: CurrentLocationObservation | null = null;

  const nybil = sourceData.nybil;
  if (nybil) {
    current = chooseLater(
      current,
      observation(
        nybil.plats_aktuell_ort,
        nybil.plats_aktuell_station,
        asTimestamp(nybil.created_at) ?? asTimestamp(nybil.registreringsdatum),
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
        asText(checkin.current_city) ?? asText(checkin.current_ort),
        checkin.current_station,
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
        arrival.current_city,
        arrival.current_station,
        arrival.created_at,
        'ankomst',
        actor(arrival, 'checker_name', 'checker_email', 'user_email'),
      ),
    );
  }

  for (const edit of sourceData.vehicleEdits) {
    if (asText(edit.field_name) !== 'current_location') continue;

    const storedLocation = parseStoredCurrentLocation(edit.new_value);
    if (!storedLocation) continue;

    current = chooseLater(
      current,
      observation(
        storedLocation.city,
        storedLocation.station,
        edit.edited_at,
        'status',
        actor(edit, 'edited_by'),
      ),
    );
  }

  return current;
}
