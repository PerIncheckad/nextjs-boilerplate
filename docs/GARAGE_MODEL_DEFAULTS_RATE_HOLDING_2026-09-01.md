# INCHECKAD – Garage modellstandarder för Dygnsdeb och Hålltid

Datum: 2026-09-01
Status: LÅST VERKSAMHETS- OCH TEKNIKKONTRAKT

## 1. Grundregel

Samma stabila modellidentitet ska ha samma modellstandard för:

- Dygnsdeb
- Hålltid

Planering ska därför känna igen modellens stabila `model_code` och automatiskt återanvända modellens sparade standardvärden.

Detta är standardvärden, inte ett förbud mot avvikelse på en enskild bil.

## 2. Modellstandard och fordonsunik override

För både Dygnsdeb och Hålltid gäller:

1. `planning_vehicle_models` äger modellstandarden.
2. Planering visar modellstandarden och användaren kan ändra den manuellt.
3. När Planering markeras KLAR och BESTÄLLT materialiseras till Garaget följer modellens aktuella standardvärden med till varje ny Garage-rad.
4. Om en befintlig Planering-origin Garage-rad saknar värdet kan en ny modellstandard fylla den tomma raden.
5. En befintlig individuell icke-tom Garage-rad skrivs inte över automatiskt. Den kan vara en avsiktlig fordonsunik override.
6. En användare kan ändra Dygnsdeb eller Hålltid manuellt på en enskild bil i Garaget.

## 3. Första explicita värdet i Garaget

Om en Planering-origin bil saknar modellstandard och användaren anger ett första explicit värde i Garaget:

- värdet etablerar modellstandarden om sådan saknas
- övriga tomma aktiva Planering-origin Garage-rader med samma stabila `model_code` fylls
- redan satta individuella värden lämnas orörda

När modellstandarden redan finns blir en senare ändring på en enskild Garage-rad endast en fordonsunik override.

## 4. Dygnsdeb

Dygnsdeb är en planeringsparameter per modell med möjlighet till individuell fordonsavvikelse.

Planering ska automatiskt visa sparad modellstandard och använda den i Planering → Garaget-handslaget.

## 5. Hålltid

Hålltid följer samma modell som Dygnsdeb.

Tillåtna standardvärden är:

- 4 månader
- 6 månader
- 9 månader
- 12 månader
- 18 månader
- 24 månader

Planering ska automatiskt visa sparad modellstandard och använda den i Planering → Garaget-handslaget.

## 6. Ingen osäker backfill

Införandet får inte gissa en modellstandard från flera historiska fordonsvärden om det inte är säkert vilket värde som är standard och vilket som är en individuell override.

Befintliga individuella värden bevaras.

Tom modellstandard förblir tom tills verksamheten anger eller säkert etablerar den.

## 7. Stabil modellidentitet

Automatiken ska följa `model_code`, inte ett fritt visningsnamn.

Det betyder att samma modell kan visas med ett operativt namn i en planeringscell men modellstandarderna följer den stabila modellidentiteten i `planning_vehicle_models`.

## 8. Ersätter äldre formulering

Dokumentationen `docs/garage-holding-period-v1.md` beskrev Hålltid som enbart ett fordonsnivåvärde. Den formuleringen är SUPERSEDED av detta senare låsta beslut.

Hålltid är nu uttryckligen:

**modellstandard + tillåten fordonsunik override**, på samma sätt som Dygnsdeb.

## 9. Acceptans

Före merge/Production ska följande verifieras:

1. Modellregistret kan lagra `daily_rate` och `holding_period_months`.
2. Planering visar och kan spara båda modellstandarderna.
3. Ny Planering → Garaget-materialisering kopierar båda standarderna.
4. Ny modellstandard fyller endast tomma befintliga Planering-origin Garage-rader.
5. Befintlig individuell icke-tom rad skrivs inte över.
6. Första explicita Garage-värdet kan etablera saknad modellstandard.
7. När modellstandard redan finns förblir senare enskild Garage-ändring en override.
8. Hålltid accepterar endast 4/6/9/12/18/24 månader.

## 10. Låst sammanfattning

**Lika modell = samma standard för Dygnsdeb och Hålltid. Planering känner igen modellen och fyller automatiskt. En enskild bil får därefter ändras manuellt utan att den individuella avvikelsen skrivs över av automatik.**
