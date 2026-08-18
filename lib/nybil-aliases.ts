export type NybilCanonicalAliasFields = {
  modell: unknown;
  registreringsdatum: unknown;
  hjultyp: unknown;
  hjul_ej_monterade: unknown;
  hjul_forvaring_ort: unknown;
  dackkompressor: unknown;
};

/**
 * Preserve the Nybil legacy database aliases that still have live compatibility
 * dependencies. Canonical fields remain the source values.
 */
export function withNybilLegacyAliases<T extends NybilCanonicalAliasFields>(data: T) {
  return {
    ...data,
    bilmodell: data.modell,
    hjul_till_forvaring: data.hjul_ej_monterade,
    hjul_forvaring_station: data.hjul_forvaring_ort,
  };
}
