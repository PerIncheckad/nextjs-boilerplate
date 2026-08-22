export type AllowedPlatesResponse = {
  data?: string[];
  error?: string;
};

export async function fetchAllowedPlates(): Promise<string[]> {
  const response = await fetch('/api/allowed-plates');
  const payload = await response.json() as AllowedPlatesResponse;

  if (!response.ok) {
    throw new Error(payload.error || 'Kunde inte hämta registreringsnummer');
  }

  return Array.isArray(payload.data) ? payload.data : [];
}
