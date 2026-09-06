import {
  getVehicleStatus as getLegacyVehicleStatus,
  formatDateTime,
  type VehicleStatusResult,
} from './vehicle-status';
import { getLatestStatusReadModelSourceData } from './status-read-model-source';

export * from './vehicle-status';

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function dateOnly(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().split('T')[0];
}

function actorName(checkin: Record<string, unknown>): string {
  return asText(checkin.checker_name)
    || asText(checkin.checker_email)
    || asText(checkin.user_email)
    || 'Okänd';
}

/**
 * Status current-fact overlay.
 *
 * The legacy read-model still builds immutable source history. This wrapper only
 * replaces fields in the current vehicle image where a later canonical read
 * model already exists, so source records and history remain untouched.
 */
export async function getVehicleStatus(regnr: string): Promise<VehicleStatusResult> {
  const result = await getLegacyVehicleStatus(regnr);
  if (!result.found || !result.vehicle) return result;

  const sourceData = getLatestStatusReadModelSourceData(regnr);
  if (!sourceData) return result;

  const vehicle = { ...result.vehicle };

  const currentWheelType = asText(sourceData.currentWheelFact?.wheel_type);
  if (currentWheelType) {
    vehicle.hjultyp = currentWheelType;
  }

  const currentSaludatum = asText(sourceData.saluState?.current_saludatum);
  if (currentSaludatum) {
    vehicle.saludatum = dateOnly(currentSaludatum);
  }

  const latestCheckin = sourceData.checkins[0];
  if (latestCheckin) {
    const timestamp = asText(latestCheckin.completed_at) || asText(latestCheckin.created_at);
    const city = asText(latestCheckin.current_city) || asText(latestCheckin.current_ort);
    const station = asText(latestCheckin.current_station);

    if (timestamp && city && station) {
      vehicle.bilenStarNu = `${city} / ${station} (${formatDateTime(timestamp)} av ${actorName(latestCheckin)})`;
    }
  }

  return { ...result, vehicle };
}
