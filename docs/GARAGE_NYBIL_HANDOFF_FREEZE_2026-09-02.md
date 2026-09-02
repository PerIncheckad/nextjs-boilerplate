# GARAGE → NYBIL: FRYS EFTER KVITTERAT HANDSLAG

Datum: 2026-09-02
Status: LÅST VERKSAMHETS- OCH TEKNIKKONTRAKT

## Princip

Garaget äger bilen fram till fysisk ankomst och lyckad Nybil-registrering.

När Nybil sparas med exakt `source_garage_item_id` och det atomiska handslaget sätter `garage_items.handed_off_nybil_id` + `handed_off_at`, upphör Garage-objektet att vara aktivt arbete.

Efter kvittens gäller:
- Garage-raden bevaras som historik
- den visas inte i den aktiva Garage-listan
- den räknas inte som aktiv `UTVECKLA` i Garageöversikten
- den får inte redigeras, omplaneras, byta riktning eller få modellstandarder påförda
- Nybil äger den verifierade fortsättningen

## Avgränsning

Detta gäller endast exakt atomiskt kvitterade Garage-objekt där `handed_off_nybil_id` faktiskt är satt.

Historiska överlapp där bilen finns i Nybil men Garage saknar exakt kvittens påverkas inte och får inte behandlas som kvitterade.

## Databasskydd

Första kvittensen får endast sättas från det nästlade Nybil INSERT-triggerflödet. Efter att `handed_off_nybil_id` är satt är Garage-raden permanent fryst för senare UPDATE.

Modellstandard för Dygnsdeb/Hålltid får endast fylla Garage-rader som fortfarande har `handed_off_nybil_id is null`.

## Sammanfattning

**Exakt Nybil-kvittens avslutar Garage-arbetet utan att radera historiken.**
