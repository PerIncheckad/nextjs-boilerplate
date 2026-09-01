# GARAGE / NY BIL — HISTORISK ÖVERLAPP

Datum: 2026-09-01  
Status: LÅST TEKNISKT KONTROLLKONTRAKT

## Syfte

Skilja verkliga aktiva Garage-bilar som fortfarande väntar på mottagning i Nybil från äldre Garage/Nybil-överlapp där registreringsnumret redan finns i verifierad Nybil-historik men dagens exakta `source_garage_item_id`-handslag saknas.

## Princip

Reg.nr-matchning bevisar att samma registreringsnummer finns i båda källorna. Den bevisar **inte** att ett historiskt Garage→Nybil-handslag faktiskt genomfördes.

Därför gäller:

- ingen automatisk backfill av `source_garage_item_id`
- ingen automatisk backfill av `handed_off_nybil_id`
- ingen automatisk backfill av `handed_off_at`
- ingen omskrivning av äldre Nybil-rader
- ingen Layer 1-write

## Read-only klassificering

När en aktiv UTVECKLA / IN-rad har reg.nr som redan finns i Nybil klassificeras endast tidsrelationen:

### `BEFORE_GARAGE`

Nybil-raden skapades före Garage-objektets `created_at`.

UI: **Historisk Ny bil före Garage**.

Detta är tydligt historisk överlapp och kan inte vara ett dagens atomiska Garage→Nybil-handslag eftersom Nybil-raden redan fanns när Garage-objektet materialiserades.

### `AFTER_GARAGE`

Nybil-raden skapades efter eller samtidigt med Garage-objektets `created_at`, men saknar exakt `source_garage_item_id`.

UI: **Ny bil efter Garage · koppling saknas**.

Tidsordningen är förenlig med ett möjligt operativt samband men bevisar inte sambandet. Ingen automatisk kvittens får därför skapas.

### `UNKNOWN`

Tidsrelationen kan inte fastställas säkert från tillgängliga timestamps.

UI: **Redan i Ny bil · tidsrelation okänd**.

## Production-observation 2026-09-01

Vid kontrollen fanns 20 aktiva Planering-origin UTVECKLA / IN med reg.nr:

- 9 saknade Nybil-rad och var verkliga kandidater för **Hämta bilen från Garaget** i Nybil
- 11 fanns redan i Nybil utan Garage-kvittens
- av dessa 11 var 8 Nybil-rader äldre än Garage-materialiseringen
- 3 Nybil-rader var senare än Garage-materialiseringen men saknade exakt källkoppling
- 0 var atomiskt kvitterade via `handed_off_nybil_id`

Observationen är ett ögonblicksfoto och ska inte behandlas som permanent antal.

## Verksamhetskonsekvens

Garage-panelens kontrolltal ska inte längre klumpa ihop historisk överlapp med verkliga väntande bilar.

Dagens korrekta arbetsmängd för Nybil är endast de rader som:

1. är aktiva UTVECKLA / IN,
2. har reg.nr,
3. inte är kvitterade,
4. inte redan finns i Nybil.

Historisk överlapp visas separat som kontrollinformation och får inte skapa nytt mottagningsarbete eller falsk historisk kvittens.

## Låst slutsats

**Befintlig Nybil-historik är verifierad verklighet. Saknad historisk processlänk är ett separat datakvalitetsfaktum. Tidsordning får användas för klassificering, aldrig som bevis för ett handslag som inte finns sparat.**
