export type StatusDataPayload = {
  nybil: any | null;
  vehicle: any[];
  damages: any[];
  legacyDamages: any[];
  checkins: any[];
  arrivals: any[];
  vehicleEdits: any[];
  damageComments: any[];
  checkinDamages: any[];
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
