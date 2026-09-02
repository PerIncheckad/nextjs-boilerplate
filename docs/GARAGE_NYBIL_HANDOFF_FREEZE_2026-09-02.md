# GARAGE → NYBIL: FRYS EFTER KVITTERAT HANDSLAG

Datum: 2026-09-02
Status: LÅST VERKSAMHETS- OCH TEKNIKKONTRAKT · PRODUCTION-VERIFIERAT

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

## Production-acceptans 2026-09-02

PR #528 mergades till `main` som `8733c0b2be0b6910542a4eb341ec4cd28c0a5eec`. Vercel Production blev READY innan databasmigrationen applicerades.

Migrationen `freeze_garage_after_nybil_handoff` applicerades därefter permanent i Production.

Verifierat efter migration:
- `garage_items_nybil_handoff_freeze` finns och är aktiv
- `guard_garage_item_nybil_handoff_freeze()` finns
- 27 UTVECKLA / IN-rader med reg.nr fanns i ögonblicksbilden
- 25 av dessa var fortfarande aktiva efter exakt handoff-filter
- 2 hade ett verkligt atomiskt Nybil-handslag och är därför avslutade som aktivt Garage-arbete
- de två verifierade handslagen var `MJB56N` och `JJD01N`
- båda hade exakt samma `garage_item_id` i Garage och `source_garage_item_id` i Nybil
- `handed_off_at` var identisk med respektive Nybil-rads `created_at`

Rollback-probe före permanent migration verifierade dessutom:
1. direkt manuell sättning av Nybil-kvittens blockerades
2. nästlad Nybil-triggerkvittens tilläts
3. `handed_off_at` sattes
4. senare UPDATE av den kvitterade Garage-raden blockerades
5. all probe-data och tillfällig DDL rullades tillbaka

Historiska överlapp kontrollerades separat efter migrationen. Då fanns 12 aktiva IN-rader där reg.nr redan fanns i Nybil men exakt Garage-kvittens saknades: 9 med Nybil före Garage-materialisering och 3 med Nybil efter Garage-materialisering. Ingen av dessa hade `source_garage_item_id`; ingen automatisk backfill genomfördes.

Antalen ovan är Production-ögonblicksbilder och ska inte användas som framtida statiska verksamhetstal.

## Sammanfattning

**Exakt Nybil-kvittens avslutar Garage-arbetet utan att radera historiken. Historisk närhet eller samma reg.nr är inte en kvittens.**
