# GARAGET — HISTORISK NYBIL-ÖVERLAPP SKA INTE VARA AKTIVT ARBETE

Datum: 2026-09-02
Status: LÅST TEKNISKT ARBETSYTEKONTRAKT

## Bakgrund

Efter att det exakta Garage → Nybil-handslaget införts finns tre olika kategorier bland UTVECKLA / IN-rader med reg.nr:

1. verkligt aktiva Garage-bilar som ännu inte finns i Nybil,
2. exakt atomiskt kvitterade Garage-bilar,
3. äldre historiska överlapp där reg.nr redan finns i Nybil men dagens exakta `source_garage_item_id` / `handed_off_nybil_id` saknas.

Kategori 2 avslutas redan genom det låsta freeze-kontraktet.
Kategori 3 är inte ett bevisat handslag och får därför aldrig backfillas eller märkas som kvitterad.

## Låst arbetsyteregel

En aktiv Garage-arbetsyta ska inte visa en UTVECKLA / IN-rad som aktivt arbete när samma normaliserade reg.nr redan finns i `nybil_inventering`.

Detta är en **read-model-/arbetsyteisolering**, inte en datamigration och inte en historisk rekonstruktion.

Det innebär:

- den generella Garage-listan visar inte historisk Nybil-överlapp som aktiv UTVECKLA,
- den operativa Garageöversikten räknar inte historisk Nybil-överlapp som aktiv `UTVECKLA`,
- den separata `Garage → Ny bil`-kontrollen fortsätter visa överlappen och klassificera tidsrelationen,
- ingen `source_garage_item_id` backfillas,
- ingen `handed_off_nybil_id` backfillas,
- ingen `handed_off_at` backfillas,
- ingen Garage-rad fryses enbart på grund av reg.nr-match,
- AVVECKLA / UT påverkas inte av denna regel.

## Production-observation 2026-09-02

Read-only kontroll visade bland UTVECKLA / IN med reg.nr:

- 2 exakta atomiska handoffar, båda Planering-origin,
- 12 historiska Nybil-överlapp utan exakt handoff,
  - 9 `BEFORE_GARAGE`, varav 8 Planering-origin och 1 Lager1-origin,
  - 3 `AFTER_GARAGE`, samtliga Planering-origin,
- 15 Planering-origin utan Nybil-post.

De 15 utan Nybil-post är verkliga aktiva kandidater för dagens Nybil-hämtning.
De 12 historiska överlappen ska vara synliga som kontroll/historik men inte som nytt operativt UTVECKLA-arbete.

## Viktig avgränsning

Reg.nr-match betyder fortfarande endast att bilen redan finns i Nybil. Den bevisar inte att ett historiskt Garage → Nybil-handslag skett.

Den tidigare låsta principen kvarstår:

**Tidsordning och reg.nr får användas för klassificering och arbetsyteavgränsning, aldrig för att fabricera en historisk kvittens.**
