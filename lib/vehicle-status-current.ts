import {
  getVehicleStatus as getLegacyVehicleStatus,
  formatDateTime,
  type VehicleStatusResult,
} from './vehicle-status';
import { getLatestStatusReadModelSourceData } from './status-read-model-source';
import { resolveCurrentOdometer, type CurrentOdometerSource } from './status-current-odometer';
import { resolveCurrentLocation, type CurrentLocationSource } from './status-current-location';

export * from './vehicle-status';

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function dateOnly(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().split('T')[0];
}

function odometerSourceLabel(source: CurrentOdometerSource): string {
  switch (source) {
    case 'nybil':
      return 'nybil';
    case 'incheckning':
      return 'incheckning';
    case 'ankomst':
      return 'ankomst';
    case 'status':
      return 'Status';
  }
}

function locationSourceLabel(source: CurrentLocationSource): string {
  switch (source) {
    case 'nybil':
      return 'nybil';
    case 'incheckning':
      return 'incheckning';
    case 'ankomst':
      return 'ankomst';
    case 'status':
      return 'Status';
  }
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

  const currentOdometer = resolveCurrentOdometer(sourceData);
  if (currentOdometer) {
    vehicle.matarstallning = `${currentOdometer.value} km`;
    vehicle.matarstallningKalla = `${odometerSourceLabel(currentOdometer.source)} ${formatDateTime(currentOdometer.timestamp)} av ${currentOdometer.actor}`;
  }

  const currentLocation = resolveCurrentLocation(sourceData);
  if (currentLocation) {
    vehicle.bilenStarNu = `${currentLocation.city} / ${currentLocation.station} (${locationSourceLabel(currentLocation.source)} ${formatDateTime(currentLocation.timestamp)} av ${currentLocation.actor})`;
  }

  return { ...result, vehicle };
}
