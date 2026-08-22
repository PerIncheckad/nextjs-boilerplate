export type StatusDataPayload = {
  nybil: unknown | null;
  vehicle: unknown[];
  damages: unknown[];
  legacyDamages: unknown[];
  checkins: unknown[];
  arrivals: unknown[];
  vehicleEdits: unknown[];
  damageComments: unknown[];
  checkinDamages: unknown[];
};

type StatusDataResponse = {
  data?: StatusDataPayload;
  error?: string;
};

export async function fetchStatusData(regnr: string): Promise<StatusDataPayload> {
  const response = await fetch(`/api/status-data?regnr=${encodeURIComponent(regnr)}`);
  const payload = await response.json() as StatusDataResponse;

  if (!response.ok || !payload.data) {
    throw new Error(payload.error || 'Kunde inte hämta statusdata');
  }

  return payload.data;
}
