export type NybilCanonicalAliasFields = {
  modell: unknown;
  registreringsdatum: unknown;
  hjultyp: unknown;
  hjul_ej_monterade: unknown;
  hjul_forvaring_ort: unknown;
  dackkompressor: unknown;
};

/**
 * Preserve the separate Nybil notifier compatibility field that still shares a
 * legacy database name. Canonical fields remain the source values.
 */
export function withNybilLegacyAliases<T extends NybilCanonicalAliasFields>(data: T) {
  return {
    ...data,
    hjul_till_forvaring: data.hjul_ej_monterade,
  };
}
