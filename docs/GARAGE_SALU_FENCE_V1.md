# Garage SALU fence v1

Locked 2026-09-06.

- The legacy manual `POST /api/garage/salu-sources` path is operationally closed.
- Garage no longer exposes the manual "Hämta från SALU" UI.
- Future SALU ingress is only the verified `STÄNGD + SÄLJAS -> Garage UT` handoff implemented by `materialize_salu_saljas_to_garage_ut_v1`.
- AVVECKLA is not started automatically by this handoff.
- Historical Garage/SALU data is not rewritten or backfilled.
