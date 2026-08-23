# Layer 2.2 – HANDSLAGET v1

## Verksamhetsdefinition

Handslaget är kontrollpunkten mellan två processtillstånd. Det ska göra övergången verifierbar och svara på:

- har det som skulle ske faktiskt skett?
- är objektet/processen i rätt tillstånd?
- kan nästa steg starta?
- finns en avvikelse?
- vem måste agera om något saknas?

Ett skickat mejl eller ett `...HANDOFF_REQUESTED`-event är därför inte ett färdigt handslag.

## Livscykel

`REQUESTED -> HANDED_OVER -> RECEIVED -> ACCEPTED -> COMPLETED -> VERIFIED`

`CANCELLED` är terminalt och kräver orsak.

Semantik:

- `REQUESTED` – källprocessen har begärt en överlämning.
- `HANDED_OVER` – avsändande funktion har uttryckligen lämnat över.
- `RECEIVED` – mottagande funktion har kvitterat mottagande.
- `ACCEPTED` – mottagande funktion har accepterat ansvar för nästa aktivitet.
- `COMPLETED` – den ansvarade aktiviteten är rapporterad utförd.
- `VERIFIED` – utförandet är verifierat enligt handoff-definitionens verifieringsregel.
- `CANCELLED` – handslaget har avbrutits med spårbar orsak.

## Source-of-truth

Handslaget äger inte Layer 1-fakta och får inte skriva om fordonsresans operativa verklighet.

Ett handslag verifierar processövergången kring fakta. Det är en Layer 2-post.

## Datakontrakt

### `handoff_definitions`

Versionsstyrd definition med:

- rutin
- avsändande funktion
- mottagande funktion
- verifieringssätt
- blockerande/icke blockerande

### `handoffs`

Aktuell projektion för ett konkret handslag med:

- bil/regnr
- källsystem/källobjekt/källpost
- status
- tidsstämplar och aktörer för varje steg
- evidens

### `handoff_events`

Append-only historik. Den aktuella raden i `handoffs` är endast projektionen.

## Första vertikala fall: SALU

Befintliga SALU-events:

- `SALU_PLANERING_HANDOFF_REQUESTED`
- `SALU_INKOP_HANDOFF_REQUESTED`

materialiserar framåt två generella handslag:

- `SALU_TO_PLANERING`
- `SALU_TO_INKOP`

Ingen historisk backfill görs. Befintliga SALU-events skrivs inte om.

## Passage

Ett blockerande handslag är inte passerat förrän det är `VERIFIED` eller legitimt `CANCELLED`.

Den fulla generella passagemotorn byggs separat i L2.3. L2.2 etablerar endast den handoff-signal som L2.3 ska kunna använda.

## Avgränsning

L2.2 innehåller inte:

- Layer 1-state writes
- process/routine-state duplication
- RBAC/mandatkontroll
- SLA/timer för handslag
- operativ cockpit
- Kistan
- historisk SALU-backfill
