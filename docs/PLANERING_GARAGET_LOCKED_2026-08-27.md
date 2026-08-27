# Planering + Garaget — låst slutdokumentation

**Datum:** 2026-08-27  
**Status:** LOCKED  
**Production-bas:** `045bcca8dff4de4e88a9a906a8e72b309b212953`  
**Senast verifierad Production:** Vercel READY, `/planning` HTTP 200, `/garage` HTTP 200, inga error/fatal runtime-loggar vid kontroll.

## 1. Syfte och källordning

Detta dokument låser den aktuella Production-verkligheten för Planering + Garaget efter PR #448.

Vid konflikt gäller följande källordning:

1. faktisk Production-kod och Production-databas,
2. senare explicit låsta verksamhetsbeslut,
3. detta dokument,
4. äldre analyser, handover-dokument och historiska planer.

Äldre material får inte användas som byggorder om det strider mot senare Production eller senare låsta beslut.

## 2. Låst verksamhetslogik

### Planering

Planering är verksamhetens yta för framtida vagnparksbeslut. Följande beslutstyper hålls separata:

- `BEHOV` → `behov_count`
- `UTÖKNING` → `utok_count`
- `MINSKNING` → `minskning_count`
- `BESTÄLLT` → `ordered_count`

`SALU` är beslutsstöd och källa till information. SALU får inte automatiskt skapa, minska, netta eller ändra BESTÄLLT eller övriga planeringsbeslut.

Individuella ERSÄTT-beslut är explicita användarbeslut och ska inte härledas automatiskt från SALU.

### BESTÄLLT

BESTÄLLT är ett explicit sparat verksamhetsbeslut per period, modell och station.

BESTÄLLT kan exporteras till Excel/CSV. Exporten innehåller endast sparade BESTÄLLT och får inte automatiskt nettas mot SALU.

### Planering → Garaget

Överföringen är ett explicit handslag.

Det finns ingen automatisk överföring från BESTÄLLT till Garaget. Planering visar i stället verifierbart:

- BESTÄLLT,
- hur många individuella Garage-objekt som materialiserats,
- hur många som återstår.

Grundrelationen är:

`KVAR = max(0, BESTÄLLT - I GARAGET)`

Garage-objekt som skapas från Planering ska bära spårbarhet via `source_kind = PLANERING`, `source_planning_cell_id` och stabilt `source_planning_unit_no`.

## 3. Garaget — låst kontrakt

Garaget hanterar individuella operativa Garage-objekt. Ett Garage-objekt kan komma från bland annat MANUELL, PLANERING, SALU eller LAGER1, men källan är spårbarhet och får inte skriva om källsystemets historik.

### Riktning

Garage-riktning är explicit:

- `IN` = utveckla / in eller tillbaka i operation,
- `UT` = avveckla / ut ur operation.

Riktning får inte infereras automatiskt från källa eller orsak.

### Order- och bekräftelsestatus

Bekräftelsestatus är explicit och använder den befintliga modellen:

- `PLANERAD`
- `BESTALLD`
- `AVROPAD`
- `AVVAKTAR_BEKRAFTELSE`
- `BEKRAFTAD`

Statusändringar ska vara explicita. Systemet får inte automatiskt hoppa mellan statusar eller sätta order-/avrops-/leveransdatum som följd av ett annat statusfält.

### Transportstatus

Transportstatus är explicit:

- `EJ_BOKAD`
- `TRANSPORTBOKAD`
- `PA_VAG`

Faktisk ANKOMST är Layer 1-verklighet och får inte ersättas av en manuellt satt Garage-status.

### Garaget → Ny bil

Garaget kan lämna över ett individuellt objekt till Ny bil. Överlämningen ska vara spårbar via Garage-objektets identitet och Ny bil-postens källreferens. Överlämningen får inte förvanska tidigare källhistorik.

## 4. UI-struktur som är låst

Planering är grupperad i arbetsordningen:

`Beslutsstöd → Beslut → Handslag`

Garaget är grupperat i:

`Överlämningar → Orderflöde → Kontrollpunkter → Garage-objekt`

Båda arbetsytorna har tydlig sektionshierarki och ankarnavigering för långa arbetsflöden. Denna UI-struktur ändrar inte verksamhetssemantiken.

## 5. Verifierad teknisk leverans

Planering + Garaget byggdes och låstes genom följande sekvens:

- #438 — säkrare planning save + draft recovery
- #439 — SALU-överblick
- #440 — explicit ERSÄTT-beslut per bil
- #441 — beslutsmatris per modell/station
- #442 — gemensam planeringsmånad
- #443 — härdning av ERSÄTT-beslut
- #444 — BESTÄLLT i Planering och SALU-överblick
- #445 — Excel-export av BESTÄLLT
- #446 — verifierbart BESTÄLLT → Garaget-handslag
- #447 — tydligt Garage-orderflöde och statuskontroll
- #448 — slutlig UI/layout-refinement

PR #448 är mergad i Production-bas `045bcca8dff4de4e88a9a906a8e72b309b212953`.

## 6. Verifierad Production-data vid låsning

Vid kontroll efter #448 fanns:

- 6 rader i `fleet_planning_cells`,
- `ordered_count = 0` på samtliga 6 rader,
- 1 rad i `garage_items`,
- det Garage-objektet hade `source_kind = LAGER1`, inte PLANERING.

Det finns därför ännu inget verkligt Production-case där ett sparat BESTÄLLT har materialiserats till Garaget.

Ingen artificiell BESTÄLLT-post ska skapas i Production enbart för test.

## 7. Kvarvarande verksamhetsacceptans

Den tekniska leveransen är färdig och Production-verifierad. Slutlig verksamhetsacceptans av handslaget väntar på första riktiga BESTÄLLT.

Acceptanssekvensen är låst till:

`BESTÄLLT 1 → sparat i Planering → KVAR 1 → explicit hämtning till Garaget → exakt 1 Garage-objekt → I GARAGET 1 → KVAR 0 → korrekt källa och full spårbarhet.`

Acceptansen ska göras på verklig verksamhetsdata, inte på konstruerad Production-data.

## 8. Uttryckligen inte del av detta lås

Detta dokument innebär inte att följande har införts:

- automatisk beställning från SALU,
- automatisk nettning SALU ↔ BESTÄLLT,
- automatisk materialisering Planering → Garaget,
- automatiska status- eller datumhopp i Garaget,
- ny ekonomisk/Kistan-logik,
- förändring av Layer 1-verklighet,
- konstruerad Production-testdata.

## 9. Ändringsregel efter låsning

Planering + Garaget betraktas nu som låst bas.

Nya ändringar ska göras som nya separata beslut och PR:er. De får inte tyst ändra ovanstående kontrakt. Om verksamhetslogiken ändras ska detta dokument uttryckligen ersättas eller uppdateras i samma förändringskedja.
