export type NybilCanonicalAliasFields = {
  modell: unknown;
  registreringsdatum: unknown;
  hjultyp: unknown;
  hjul_ej_monterade: unknown;
  hjul_forvaring_ort: unknown;
  dackkompressor: unknown;
};

/**
 * Preserve Nybil's legacy database aliases from one canonical mapping point.
 *
 * The canonical fields remain the source values. This helper only mirrors them
 * to the legacy columns that are still written today; it does not add business
 * logic or choose between conflicting values.
 */
export function withNybilLegacyAliases<T extends NybilCanonicalAliasFields>(data: T) {
  return {
    ...data,
    bilmodell: data.modell,
    ankomstdatum: data.registreringsdatum,
    monterade_dack: data.hjultyp,
    hjul_till_forvaring: data.hjul_ej_monterade,
    hjul_forvaring_station: data.hjul_forvaring_ort,
    kompressor: data.dackkompressor,
  };
}
