# INCHECKAD – Hjulskifte UNKNOWN-resolution

Datum: 2026-09-01
Status: TEKNISKT OCH OPERATIVT TILLÄGG TILL HJULSKIFTE-KONTRAKTET

## Syfte

Göra `UNKNOWN_WHEEL_STATUS` operativt lösbar utan att Hjulskifte infererar hjultyp.

## Verifierad lucka före ändringen

Status visar aktuell hjultyp med följande prioritet:

1. senaste manuella `vehicle_edits` för `field_name = 'hjultyp'`
2. senaste färdigställda Check-in
3. Nybil/äldre källor enligt Status read-model

Hjulskiftes kandidat-read-model läste däremot endast `checkins.hjultyp` från senaste färdigställda Check-in. Därför kunde en korrekt manuell hjultyp som sparades i Status visas korrekt i Status men fortfarande lämna Hjulskifte som UNKNOWN.

## Låst källregel

För Hjulskiftes aktuella hjultyp gäller nu:

1. senaste manuella `vehicle_edits.hjultyp`, om ett verifierat icke-tomt värde finns
2. annars `hjultyp` från senaste `COMPLETED` Check-in
3. saknas båda är resultatet UNKNOWN

Systemet får inte gissa hjultyp från säsong, bilmodell, tidigare historik, station eller hjulförvaring.

## Operativ åtgärd

Bilar med `UNKNOWN_WHEEL_STATUS` visas fortsatt separat från `REQUIRES_CHANGE`.

Varje UNKNOWN-rad får åtgärden `Verifiera hjultyp`, som öppnar Status för exakt reg.nr via:

`/status?reg=<REGNR>`

Användaren verifierar och sparar faktisk hjultyp i det befintliga Status-flödet. Efter uppdatering av Hjulskifte ska den manuella korrigeringen vinna över den äldre saknade Check-in-uppgiften.

Bilen klassas därefter normalt enligt säsongsregeln som antingen:

- `REQUIRES_CHANGE`
- `ALREADY_CORRECT`
- `SALU_EXEMPT`

Ingen automatisk klassning görs innan hjultypen är verifierad.

## Production-fakta före ändringen

Vid kontroll 2026-09-01 fanns exakt två senaste färdigställda Check-ins utan hjultyp:

- AZH62Z – senaste Check-in 2025-12-03
- ESN24G – senaste Check-in 2025-12-02

Ingen av dem hade ännu någon manuell `hjultyp`-edit.

Kontrollen visade även att 0 av kandidatbilarna hade en befintlig manuell hjultyp-edit. Införandet ändrar därför ingen befintlig Production-klassning vid migrationstillfället; det etablerar den korrekta precedence-regeln för framtida manuella verifieringar.

## Tekniska ändringar

- `get_wheel_change_candidate_source()` kompletteras med senaste `vehicle_edits` för `hjultyp`.
- senaste manuella icke-tomma värde prioriteras över senaste Check-in.
- UNKNOWN-tabellen länkar direkt till rätt bil i Status.
- regressionstest låser både UI-länken och source precedence.

## Avgränsning

Ingen ändring görs av:

- säsongsdatum
- SALU-regel
- såld-logik
- hjulförvaring
- station
- same-season-idempotens
- Garage-processens statusövergångar
- befintliga Check-in-rader

## Acceptans

1. AZH62Z och ESN24G ligger kvar som UNKNOWN tills faktisk hjultyp registreras.
2. `Verifiera hjultyp` öppnar rätt reg.nr i Status.
3. Sparad manuell hjultyp blir den aktuella hjultypen i Hjulskifte efter uppdatering.
4. Bilen lämnar UNKNOWN och klassas enligt den vanliga säsongsregeln.
5. Ingen historisk Check-in skrivs om.

## Princip

**Manuell verifiering får korrigera den aktuella sanningen. Historiken skrivs inte om. Saknas verifierad hjultyp förblir resultatet UNKNOWN.**
