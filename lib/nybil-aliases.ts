export type NybilCanonicalAliasFields = {
  modell: unknown;
  registreringsdatum: unknown;
  hjultyp: unknown;
  hjul_ej_monterade: unknown;
  hjul_forvaring_ort: unknown;
  dackkompressor: unknown;
};

/**
 * Compatibility shim retained to keep the Nybil form diff narrow while the
 * legacy database aliases are retired. It must not generate DB alias fields.
 */
export function withNybilLegacyAliases<T extends NybilCanonicalAliasFields>(data: T) {
  return data;
}
