# INCHECKAD – Hjulskifte operativt kontrakt

Datum: 2026-09-01
Status: LÅST VERKSAMHETS- OCH TEKNIKKONTRAKT

## 1. Grundprincip

Bilen och hjulen är två separata operativa verkligheter.

Bilen kan flyttas mellan stationer och hyras ut från andra stationer. Hjulen flyttas normalt inte samtidigt. Därför får Hjulskifte aldrig härleda eller anta hjulens förvaringsplats från bilens:

- aktuella ort eller station
- huvudstation / hemmastation
- Bilkontrollansvar
- senaste uthyrningsstation
- BUHS stationskombination

Hjulskifte ska använda den hjulförvaring som faktiskt är registrerad i INCHECKAD.

## 2. Huvudstation, Bilkontroll och hjulförvaring

Huvudstation/Bilkontroll beskriver regionalt ägande och ansvar för bilen. Det är inte samma sak som var hjulen finns.

Exempel på BUHS-format: `274/290` eller `166-274` kan beskriva bilens hemmastation respektive en annan operativ station. Den informationen får inte användas som bevis för hjulförvaring.

Hjulförvaring är ett separat manuellt styrt faktum.

## 3. Källprioritet för hjulförvaring

Aktuell hjulförvaring läses med följande prioritet:

1. Senaste manuella ändring i `vehicle_edits`
   - `hjul_forvaring_ort`
   - `hjul_forvaring_spec`
2. Registrerad förvaring i `nybil_inventering`
   - `hjul_forvaring_ort`
   - `hjul_forvaring_spec` / äldre `hjul_forvaring`
3. Legacy fallback i `vehicles.wheel_storage_location`
4. Saknas alla verifierade värden är förvaringen **SAKNAS**.

Ingen station, ort eller annan fordonsposition får användas som fallback.

## 4. Hjulskiftesbehov

Säsongsbedömningen av om en bil behöver Hjulskifte är separat från förvaringen.

Den befintliga logiken gäller fortsatt för:

- aktuell hjultyp från senaste färdigställda Check-in
- säsongsregel
- SALU-undantag
- såld bil
- permanent idempotens per bil och säsong
- UNKNOWN när hjultyp inte är verifierad

Hjulförvaring får inte påverka om bilen objektivt behöver andra hjul. Den påverkar om arbetet är operativt komplett att starta.

## 5. Worklist – Hjulförvaring saknas (#520)

En bil som:

- har `REQUIRES_CHANGE`
- inte redan har ett öppet Hjulskifte för aktuell säsong
- saknar verifierad hjulförvaring

ska visas i en separat arbetslista: **Hjulförvaring saknas**.

Raden visar minst:

- registreringsnummer
- aktuell hjultyp
- senaste Check-in
- `Hjulförvaring: Saknas`
- åtgärden `Ange förvaring`

`Ange förvaring` öppnar Status för exakt registreringsnummer via `/status?reg=<REGNR>`.

Förvaringen registreras i befintligt Status-flöde. Ingen ny datatabell eller parallell sanning skapas.

När förvaringen har sparats och Hjulskifte uppdateras ska bilen automatiskt lämna worklisten och visas bland bilar som är operativt redo för Hjulskifte.

## 6. Start av Hjulskifte

En bil utan verifierad hjulförvaring ska inte presenteras i den ordinarie startbara Hjulskifte-listan.

När ett säsongsbaserat Hjulskifte startas för en bil med registrerad hjulförvaring snapshotas den aktuella förvaringen till:

- `garage_wheel_changes.location`
- checkpointens `source_context`
- skapelseeventets snapshot
- vehicle journey-eventets payload

Snapshoten beskriver vad som var registrerat när arbetet startades. Senare manuella ändringar i den globala hjulförvaringen skriver inte om historiken för ett redan startat ärende.

## 7. Saknad hjulstatus

Saknad hjulstatus är en annan typ av osäkerhet än saknad hjulförvaring och ska hållas separat.

Om aktuell hjultyp saknas blir bilen `UNKNOWN_WHEEL_STATUS` och får inte automatiskt klassas som `REQUIRES_CHANGE`.

Princip: **saknad källa = UNKNOWN, aldrig infererad sanning.**

## 8. Vad systemet uttryckligen inte får göra

Hjulskifte får inte:

- anta att bilens aktuella station är hjulförvaring
- anta att huvudstation eller Bilkontrollstation är hjulförvaring
- flytta hjulförvaring automatiskt när bilen flyttas
- skapa en förvaringsplats från BUHS stationsfält
- ersätta saknad förvaring med en gissning
- skriva om historisk förvaring på ett redan startat Hjulskifte när global Status senare ändras

## 9. Production-acceptans

Följande fall ska verifieras i Production innan Hjulskifte betraktas som slutligt accepterat:

1. Bil med modern manuellt registrerad hjulförvaring visas med korrekt plats.
2. Bil med endast legacy-fallback visar det registrerade legacy-värdet utan stationsinferens.
3. Bil utan förvaring visas i `Hjulförvaring saknas` och inte i ordinarie startlista.
4. `Ange förvaring` öppnar rätt bil i Status.
5. Efter sparad förvaring och uppdatering lämnar bilen worklisten och blir operativt startbar.
6. Ändrad hjulförvaring vinner över äldre grundvärde.
7. Startat Hjulskifte snapshotar aktuell förvaring i ärendet och auditkedjan.
8. Såld bil tas inte in som kandidat.
9. Redan hanterad bil samma säsong kan inte startas igen.
10. Bil med saknad hjultyp ligger kvar som UNKNOWN och blandas inte ihop med saknad förvaring.

## 10. Databild vid införandet

Vid införandet av registrerad hjulförvaring i Hjulskifte fanns 259 vinterkandidater med `REQUIRES_CHANGE` i Production-underlaget:

- 56 med modern registrerad INCHECKAD-förvaring
- 116 med äldre registrerad fallback
- 87 utan förvaringsuppgift

Siffrorna är en ögonblicksbild från införandet, inte en permanent flotta eller ett framtida kravvärde.

## 11. Relaterade ändringar

- #514 – permanent ett Hjulskifte per bil och säsong
- #515 – SALU cutoff-korrigering
- #516 – sålda bilar exkluderas
- #517 – separat UNKNOWN-hjulstatus
- #518 – tidigare stationshärledning; den semantiken ersattes senare eftersom bilens station inte bevisar hjulförvaring
- #519 – Hjulskifte använder registrerad hjulförvaring och snapshotar den vid start
- #520 – separat operativ worklist för saknad hjulförvaring

## 12. Låst sammanfattning

**Bilen kan flytta sig. Hjulen ligger normalt kvar. INCHECKADs manuellt registrerade hjulförvaring är därför den operativa sanningen för Hjulskifte. Saknas den ska systemet visa ett arbete att utföra – inte hitta på en plats.**
