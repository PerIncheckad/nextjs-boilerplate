# Planering + Garaget — beslut och förändringar

**Status:** LÖPANDE BESLUTSLOGG  
**Syfte:** Samla verksamhetsbeslut, ändringar, acceptanser och öppna frågor för Planering + Garaget utan att en enskild punkt blir styrande för hela området.

## Princip

Planering + Garaget består av flera separata verksamhetsbeslut, tekniska förändringar, kontrollpunkter och acceptanser.

Ingen enskild acceptans — inklusive BESTÄLLT → Garaget — ska ensam användas som definition av nuläge, prioritering eller fortsatt byggordning.

Varje ny punkt ska bedömas i sitt eget sammanhang och mot aktuell Production-verklighet, senare låsta verksamhetsbeslut och övriga beroenden i Planering + Garaget.

## Registrerad punkt — BESTÄLLT → Garaget

BESTÄLLT → Garaget är en av flera beslutspunkter i området.

### Historisk Production-observation 2026-08-29

En tidigare kontroll visade:

- 20 planeringsrader med `ordered_count > 0`
- totalt 48 BESTÄLLT
- 0 Garage-objekt med `source_kind = PLANERING`

Detta var ett giltigt ögonblicksfoto då, men är inte längre aktuellt nuläge.

### Senare låst förändring — KLAR materialiserar Planering till Garaget

Senare Production-kod har ändrat handslaget:

- Planering markerad `KLAR` materialiserar automatiskt individuella Garage-objekt för sparat BESTÄLLT.
- Materialiseringen använder stabil `source_planning_cell_id` + `source_planning_unit_no` och hoppar över redan materialiserade enheter.
- Planeringsperioden följer med till Garaget.
- Planering-origin sätts till `UTVECKLA / IN` och Garaget öppnas i samma period och IN-kontext.
- Avropsdatum sätts vid handslaget.
- Dygnsdeb hämtas från modellregistret när modellstandard finns. Om modellstandard saknas kan första explicita dygnsdeb i Garaget etablera modellstandard och fylla övriga tomma syskonrader utan att skriva över individuella värden.

Det manuella importsteget från Planering är därmed ersatt av statusövergången `KLAR`.

### Aktuell Production-observation 2026-08-29 efter senare förändringar

Färsk kontroll av Production visar för period `2026-08`:

- planeringsstatus: `KLAR`
- 43 planeringsrader med `ordered_count > 0`
- totalt 83 BESTÄLLT
- 83 Garage-objekt med `source_kind = PLANERING`
- 83 unika kombinationer av `source_planning_cell_id + source_planning_unit_no`
- 0 Garage-objekt utan källreferens
- 0 Garage-objekt utan avropsdatum
- samtliga 83 materialiserade Planering-objekt har riktning `IN`

Det betyder vid kontrolltillfället:

`BESTÄLLT 83 / I GARAGET 83 / KVAR 0`

Materialisering och källspårbarhet för Planering → Garaget är därmed Production-verifierade med riktig verksamhetsdata. Detta är inte samma sak som att alla efterföljande operativa steg i Garaget är verksamhetsaccepterade.

### Dygnsdeb — historisk observation

Av de 83 materialiserade Planering-objekten saknade 28 individuell dygnsdeb vid kontrollen 2026-08-29. Samtliga dessa hörde till modeller där `planning_vehicle_models.daily_rate` också saknade standardvärde. Det var alltså inte en bruten källkoppling i handslaget.

## Registrerad punkt 2026-09-01 — modellstandard för Dygnsdeb och Hålltid

Senare låst verksamhetsregel ersätter den äldre formuleringen att Hålltid enbart är ett fordonsnivåvärde.

För både **Dygnsdeb** och **Hålltid** gäller nu:

- samma stabila `model_code` har samma modellstandard
- Planering känner igen modellen och visar modellstandarden automatiskt
- modellstandarden sparas i `planning_vehicle_models`
- Planering → Garaget materialiserar modellens aktuella Dygnsdeb och Hålltid
- om modellstandard saknas kan första explicita värdet på en Planering-origin Garage-bil etablera standarden och fylla endast tomma syskonrader för samma `model_code`
- när modellstandard redan finns är en senare ändring på en enskild Garage-bil en fordonsunik override
- befintliga individuella icke-tomma värden skrivs aldrig över automatiskt

Tillåtna Hålltid-värden är 4, 6, 9, 12, 18 och 24 månader.

### Production-verifiering 2026-09-01

Före permanent migration visade Production:

- 83 aktiva Planering-origin Garage-rader
- 25 saknade Dygnsdeb
- 83 saknade Hålltid

Ett rollback-baserat acceptanstest kördes på de sju Planering-origin Garage-rader som delar stabil modellidentitet `MB:CLA`.

Det första testet hittade en trigger-depth-lucka: modellstandarden etablerades men endast startbilen fylldes. Implementationen ändrades därför innan Production-migration så att första Garage-värdet själv fyller tomma syskon för samma `model_code`.

Det korrigerade testet verifierade:

1. första explicita Dygnsdeb/Hålltid etablerade modellstandard
2. alla sju tomma syskonrader fick samma standard
3. en senare individuell ändring på en av de sju bilarna blev en override
4. den individuella overriden ändrade inte modellstandarden
5. all testdata och tillfällig DDL rullades tillbaka

Den permanenta migrationen `planning_model_defaults_rate_holding` applicerades därefter i Production.

Efter migrationen verifierades att ingen osäker backfill genomförts:

- fortfarande 83 aktiva Planering-origin Garage-rader
- fortfarande 25 utan Dygnsdeb
- fortfarande 83 utan Hålltid
- `planning_vehicle_models.holding_period_months` finns
- modelltriggern och Garage-triggern för standard/override-kontraktet är aktiva
- `MB:CLA` har fortsatt tom modellstandard tills verksamheten anger ett verkligt värde

Det låsta detaljkontraktet finns i `GARAGE_MODEL_DEFAULTS_RATE_HOLDING_2026-09-01.md`.

## Registrerad punkt 2026-09-01 — Nybil hämtar från Garaget

Det senare låsta flödet är:

`Planering → Garaget → Nybil`

Garaget fyller bilen fram till fysisk ankomst. Nybil initierar mottagningen genom **Hämta bilen från Garaget**. Valet bär exakt `garage_item_id`; först lyckad Nybil-sparning får databasen atomiskt kvittera Garage-raden. Garaget pushar inte bilen och befintlig Nybil-historik får inte dubbelregistreras.

Detaljkontrakt: `NYBIL_FETCH_FROM_GARAGE_2026-09-01.md`.

## Registrerad kontrollpunkt 2026-09-01 — historisk Garage/Nybil-överlapp

Production-kontroll efter införandet av Nybil-hämtning visade att aktiva UTVECKLA / IN-rader med reg.nr måste delas i verkliga väntande bilar och äldre överlapp.

Vid kontrolltillfället fanns:

- 20 aktiva Planering-origin UTVECKLA / IN med reg.nr
- 9 utan Nybil-rad, alltså verkliga kandidater för Nybil-hämtning
- 11 med befintlig Nybil-rad men utan dagens exakta Garage-kvittens
- av de 11 hade 8 Nybil skapad före Garage-objektets materialisering
- 3 hade Nybil skapad efter Garage-objektets materialisering men saknade `source_garage_item_id`

Låst teknisk kontrollregel:

- tidsordning får klassificera överlapp som `BEFORE_GARAGE`, `AFTER_GARAGE` eller `UNKNOWN`
- tidsordning får aldrig användas som bevis för ett handslag
- ingen historisk `source_garage_item_id`, `handed_off_nybil_id` eller `handed_off_at` får backfillas automatiskt
- Garage-panelen ska visa överlappen separat från verkliga väntande Nybil-bilar

Detaljkontrakt: `GARAGE_NYBIL_HISTORICAL_OVERLAP_2026-09-01.md`.

## Fortsatt användning

Nya beslut och förändringar för Planering + Garaget ska läggas till här som separata punkter när de fastställs eller verifieras.

Det låsta dokumentet `PLANERING_GARAGET_LOCKED_2026-08-27.md` beskriver en tidigare bas och ska läsas historiskt där senare Production-kod eller senare explicit låsta beslut avviker.
