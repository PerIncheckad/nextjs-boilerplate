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

### Dygnsdeb — aktuell observation

Av de 83 materialiserade Planering-objekten saknade 28 individuell dygnsdeb vid kontrollen. Samtliga dessa hör till modeller där `planning_vehicle_models.daily_rate` också saknade standardvärde. Det är alltså inte en bruten källkoppling i handslaget.

Nuvarande kontrakt tillåter att första explicita dygnsdeb som sätts på ett Planering-origin Garage-objekt etablerar modellens standardvärde om sådan saknas och fyller andra tomma Garage-rader för samma modell. Befintliga individuella icke-tomma värden ska inte skrivas över.

## Fortsatt användning

Nya beslut och förändringar för Planering + Garaget ska läggas till här som separata punkter när de fastställs eller verifieras.

Det låsta dokumentet `PLANERING_GARAGET_LOCKED_2026-08-27.md` beskriver en tidigare bas och ska läsas historiskt där senare Production-kod eller senare explicit låsta beslut avviker.
