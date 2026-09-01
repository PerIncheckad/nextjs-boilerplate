# Garage holding period v1

Status: **SUPERSEDED 2026-09-01**

Den äldre formuleringen att `holding_period_months` enbart är ett fordonsnivåvärde är ersatt av det senare låsta kontraktet:

`docs/GARAGE_MODEL_DEFAULTS_RATE_HOLDING_2026-09-01.md`

Aktuell regel:

- samma stabila modellidentitet har samma modellstandard för Hålltid
- Planering känner igen modellen och fyller standarden automatiskt
- en enskild Garage-bil får därefter ha en manuell fordonsunik override
- befintliga individuella icke-tomma värden skrivs inte över automatiskt
- tillåtna värden är 4, 6, 9, 12, 18 eller 24 månader

UI-beslutet från v1 kvarstår: Hålltid visas efter Dygnsdeb i UTVECKLA / IN och planerad leverans visas inte i IN-vyn. Befintlig leveransdata är inte borttagen och AVVECKLA / UT påverkas inte av detta dokument.
