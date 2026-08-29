# Planering + Garaget — beslut och förändringar

**Status:** LÖPANDE BESLUTSLOGG  
**Syfte:** Samla verksamhetsbeslut, ändringar, acceptanser och öppna frågor för Planering + Garaget utan att en enskild punkt blir styrande för hela området.

## Princip

Planering + Garaget består av flera separata verksamhetsbeslut, tekniska förändringar, kontrollpunkter och acceptanser.

Ingen enskild acceptans — inklusive BESTÄLLT → Garaget — ska ensam användas som definition av nuläge, prioritering eller fortsatt byggordning.

Varje ny punkt ska bedömas i sitt eget sammanhang och mot aktuell Production-verklighet, senare låsta verksamhetsbeslut och övriga beroenden i Planering + Garaget.

## Registrerad punkt — BESTÄLLT → Garaget

BESTÄLLT → Garaget är en av flera beslutspunkter i området.

Den tidigare låsta verksamhetsacceptansen för handslaget är fortfarande relevant:

`BESTÄLLT → sparat i Planering → KVAR → explicit hämtning till Garaget → individuella Garage-objekt → I GARAGET → KVAR minskar → korrekt källa och full spårbarhet.`

Men denna acceptans ska inte behandlas som nästa automatiska byggorder eller som den enda kvarvarande frågan i Planering + Garaget.

### Aktuell Production-observation 2026-08-29

Vid kontroll fanns riktiga sparade BESTÄLLT i Production:

- 20 planeringsrader med `ordered_count > 0`
- totalt 48 BESTÄLLT
- 0 Garage-objekt med `source_kind = PLANERING`

Det betyder vid kontrolltillfället:

`BESTÄLLT 48 / I GARAGET 0 / KVAR 48`

Detta är en Production-observation, inte ett beslut om att materialisera någon särskild rad.

Riktning, orsak och faktisk hämtning till Garaget ska fortsatt vara explicita verksamhetsbeslut och får inte gissas eller automatiseras.

## Fortsatt användning

Nya beslut och förändringar för Planering + Garaget ska läggas till här som separata punkter när de fastställs eller verifieras.

Det låsta dokumentet `PLANERING_GARAGET_LOCKED_2026-08-27.md` fortsätter beskriva den tidigare låsta basen. Denna fil kompletterar den basen med senare beslut och förändringar.
