# 3.2D-4D — Nybil retirement-readiness

Datum: 2026-08-18

## Syfte

Fastställa om de historiska Nybil-aliasfälten kan förberedas för fysisk retirement utan att ännu droppa någon kolumn eller göra Production-DML.

## Låsta principer

- Ingen syntetisk Production-write eller write-probe.
- Ingen historisk backfill.
- Ingen kolumndrop i detta steg.
- Ingen station-/identity-mappning genom antaganden.
- `hjul_till_forvaring` behandlas separat eftersom samma namn fortfarande ingår i notifieringskontraktet.

## Legacy-kolumner

Följande historiska kolumner i `public.nybil_inventering` omfattas:

- `ankomstdatum`
- `bilmodell`
- `monterade_dack`
- `hjul_till_forvaring`
- `hjul_forvaring_station`
- `kompressor`

Kanoniska motsvarigheter:

- `registreringsdatum`
- `modell`
- `hjultyp`
- `hjul_ej_monterade`
- `hjul_forvaring_ort`
- `dackkompressor`

## Read-only DB-preflight efter 3.2D-4C

Live Production innehåller 195 Nybil-rader.

För samtliga sex aliaspar är mismatch-count 0.

Dependency-preflight visar 0 direkta registrerade view- och function-dependencies på de sex legacy-kolumnerna.

Detta bekräftar att DB-läsarna som tidigare blockerade retirement har flyttats till kanoniska fält i 3.2D-4B.

## App-/repo-kontrakt

Efter 3.2D-4C genererar Nybil helpern inte längre:

- `bilmodell`
- `hjul_forvaring_station`

3.2D-4A hade redan stoppat genereringen av:

- `ankomstdatum`
- `monterade_dack`
- `kompressor`

`hjul_till_forvaring` finns fortsatt i notifieringsflödet och får därför inte klassas som en ren DB-alias enbart utifrån kolumnnamnet.

## Event-gated verifiering

Efter merge av 3.2D-4C fanns vid första read-only kontrollen 0 nya riktiga `nybil_inventering`-rader.

Det innebär att skrivstoppet för de fem rena DB-aliasen ännu inte kan verifieras mot ett verkligt post-4C write-event.

Status: PENDING EVIDENCE, inte FAIL.

Ingen syntetisk write får skapas för att forcera verifieringen.

## Retirement-klassificering

### Kandidater efter nästa riktiga post-4C Nybil-write

Följande fem kolumner är tekniskt nära retirement, men fysisk DROP får inte göras innan ett riktigt nytt write-event visar att de förblir tomma medan kanoniska fält fylls korrekt:

- `ankomstdatum`
- `bilmodell`
- `monterade_dack`
- `hjul_forvaring_station`
- `kompressor`

### Separat spår

`hjul_till_forvaring` kräver separat notifierings-/API-kontraktsinventering innan fysisk retirement kan övervägas.

## GO-kriterier för framtida fysisk retirement

En legacy-kolumn får först gå vidare till separat DROP-PR när samtliga följande är uppfyllda:

1. 0 aktiva repo-runtime-läsare.
2. 0 aktiva repo-runtime-skrivare.
3. 0 DB view/function/trigger-dependencies.
4. 0 verifierade externa/API/export/notifieringskonsumenter, eller explicit migrerat kontrakt.
5. Minst ett riktigt post-migrations-write visar korrekt kanoniskt värde och inget nytt legacy-värde.
6. Ingen historisk evidens eller affärsinformation går förlorad av själva kolumndroppen.
7. Ny preflight körs omedelbart före DROP.

## Aktuell slutsats

3.2D-4D ger ännu inte GO för fysisk DROP.

Fem rena DB-alias är strukturellt förberedda men väntar på ett riktigt post-4C Nybil-write-event. `hjul_till_forvaring` är fortsatt BLOCKED av separat notifieringskontrakt.

Nästa säkra handling är därför read-only verifiering efter nästa riktiga Nybil-registrering. Därefter kan varje kandidat bedömas individuellt för fysisk retirement.
