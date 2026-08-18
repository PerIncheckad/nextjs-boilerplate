// Delade konstanter som används på flera ställen i appen

// Lista över bilmärken som kan väljas i /nybil och /status-editering.
// "Annat" är alltid sist och triggar ett fritextfält i UI.
export const BILMARKEN = ['BMW', 'Citroen', 'Ford', 'KIA', 'MB', 'MG', 'Opel', 'Peugeot', 'Renault', 'SEAT', 'VW', 'Annat'];

// Drivmedel-alternativ (lagras som strängar i databasen, visas oförändrade i UI).
// Legacy-värdet 'El (full)' kan finnas i gamla rader — hanteras av displayBransletyp() i vehicle-status.ts.
export const FUEL_TYPES = {
  BENSIN: 'Bensin',
  DIESEL: 'Diesel',
  HYBRID_BENSIN: 'Hybrid (bensin)',
  HYBRID_DIESEL: 'Hybrid (diesel)',
  EL_FULL: '100% el',
} as const;

// Lista (för dropdowns och validering).
export const FUEL_TYPE_OPTIONS = [
  FUEL_TYPES.BENSIN,
  FUEL_TYPES.DIESEL,
  FUEL_TYPES.HYBRID_BENSIN,
  FUEL_TYPES.HYBRID_DIESEL,
  FUEL_TYPES.EL_FULL,
];

// Växellåda-alternativ.
export const VAXEL_OPTIONS = ['Automat', 'Manuell'];

// Hjultyp-alternativ (däck som sitter på bilen).
// Verifierat i produktion (2026-04-24): endast dessa två värden finns i checkins.hjultyp + nybil_inventering.hjultyp.
export const HJULTYP_OPTIONS = ['Sommardäck', 'Vinterdäck'];

// Förvaringsorter — används i /nybil och /status-editering för Hjulförvaring, Reservnyckel,
// Laddkablar, Instruktionsbok och COC. För Instruktionsbok och COC kan även 'I bilen' väljas;
// det hanteras lokalt i respektive UI-komponent (är inte en ort i geografisk mening).
export const ORTER = ['Falkenberg', 'Halmstad', 'Helsingborg', 'Lund', 'Malmö', 'Trelleborg', 'Varberg', 'Ängelholm'];

//
// Operativt platskontrakt
//
// ORTER är huvudorter. STATIONER är de detaljstationer som användaren väljer i
// Check, Ankomst och Nybil. HUVUDSTATIONER innehåller befintliga externa ID:n
// för planerad station/salustation. Värdena är beteendebevarande från de tre
// tidigare lokala listorna.
export const STATIONER: Readonly<Record<string, readonly string[]>> = {
  Falkenberg: ['Falkenberg'],
  Halmstad: ['BVH (Hedin multi)', 'Flyget Halmstad', 'FORD Halmstad', 'KIA Halmstad', 'MB Halmstad'],
  Helsingborg: ['B/S Klippan', 'BMW Helsingborg', 'Euromaster Helsingborg', 'FORD Helsingborg', 'HBSC Helsingborg', 'KIA Helsingborg', 'MB Helsingborg', 'S. Jönsson', 'Transport Helsingborg'],
  Lund: ['B/S Lund', 'FORD Lund', 'Hedin Lund', 'P7 Revinge'],
  Malmö: ['FORD Malmö', 'Hedbergs Malmö', 'Hedin Automotive Burlöv', 'Malmö Automera', 'MB Malmö', 'Mechanum', 'Sturup', 'Werksta Malmö Hamn', 'Werksta St Bernstorp'],
  Trelleborg: ['Trelleborg'],
  Varberg: ['Autoklinik (Sällstorp)', 'Finnveden plåt', 'FORD Varberg', 'MB Varberg', 'Varberg multi (Hedin)'],
  Ängelholm: ['Flyget Ängelholm', 'FORD Ängelholm', 'Mekonomen Ängelholm'],
};

export const HUVUDSTATIONER = [
  { name: 'Falkenberg', id: 282 },
  { name: 'Halmstad', id: 274 },
  { name: 'Helsingborg', id: 170 },
  { name: 'Lund', id: 406 },
  { name: 'Malmö', id: 166 },
  { name: 'Trelleborg', id: 283 },
  { name: 'Varberg', id: 290 },
  { name: 'Ängelholm', id: 171 },
] as const;

export const DEFAULT_HUVUDSTATION_ADDRESS = 'per@incheckad.se';

export const HUVUDSTATION_EMAIL_BY_ORT: Readonly<Record<string, string>> = {
  Helsingborg: 'helsingborg@incheckad.se',
  Ängelholm: 'helsingborg@incheckad.se',
  Varberg: 'varberg@incheckad.se',
  Malmö: 'malmo@incheckad.se',
  Trelleborg: 'trelleborg@incheckad.se',
  Lund: 'lund@incheckad.se',
  Halmstad: 'halmstad@incheckad.se',
  Falkenberg: 'falkenberg@incheckad.se',
};

export function getHuvudstationRecipients(ort: string | null | undefined): string[] {
  const recipients = [DEFAULT_HUVUDSTATION_ADDRESS];
  const stationSpecificEmail = ort ? HUVUDSTATION_EMAIL_BY_ORT[ort] : undefined;

  if (stationSpecificEmail && !recipients.includes(stationSpecificEmail)) {
    recipients.push(stationSpecificEmail);
  }

  return recipients;
}
