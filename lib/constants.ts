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
