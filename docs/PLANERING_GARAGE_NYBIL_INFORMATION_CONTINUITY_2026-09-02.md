# Planering → Garaget → Nybil: informationskontinuitet

Datum: 2026-09-02  
Status: **LÅST IMPLEMENTATIONSKONTRAKT – PR / CI FÖRE PRODUCTION**

## Beslut

Information som redan har matats in i Planering eller Garaget ska inte behöva matas in igen när bilen går vidare till Nybil.

Grundregeln är:

> **Skriv en gång → spegla vidare → tillåt ändring/komplettering → bevara källan → nästa steg får aktuell information.**

Detta är ett informationskontinuitetskontrakt. Det ersätter inte ansvarsväxlingen mellan modulerna.

## Ansvarskedja

1. **Planering** etablerar planeringsbeslut och modell-/stationsgrund.
2. **Garaget** äger den individuella bilen fram till fysisk ankomst och kompletterar aktuell anskaffnings-/leveransinformation.
3. **Nybil** hämtar exakt Garage-objekt via `garage_item_id` och får med sig den aktuella upstream-bilden.
4. Operatören får ändra eller komplettera information i Nybil när verkligheten avviker från tidigare uppgift.
5. När Nybil sparas lagras Nybils mottagningsbild, den exakta `source_garage_item_id` och den Garage-version (`updated_at`) som faktiskt hämtades.
6. Samma transaktion kontrollerar att Garage-raden inte har ändrats sedan hämtningen, kvitterar Garage-objektet och fryser Garage-källraden enligt tidigare låst handoff-kontrakt.

## Vad som speglas

Nybils ordinarie fält förifylls där de redan finns:

- registreringsnummer
- bilmärke när det kan härledas från Planerings modellregister
- modell
- planerad station

Planerings stationskod översätts explicit till Nybils huvudstationsnamn genom det befintliga huvudstationsregistret, exempelvis `166 → Malmö`, `170 → Helsingborg`, `274 → Halmstad`. Ingen fri stationsinferens används.

Om Planering innehåller ett bilmärke som inte finns i Nybils fasta bilmärkeslista används `Annat` och det exakta upstream-märket fylls i som fritext. Därmed tappas exempelvis ett verifierat Planeringsvärde som `NISSAN` inte bort.

Följande Garage-/Planeringskontext följer dessutom med som redigerbar mottagningsbild i Nybil:

- planeringsperiod
- planeringsorsak
- leverantör
- orderreferens
- VIN
- käll-reg.nr
- saluort
- dygnsdeb
- hålltid
- beställningsdatum
- avropsdatum
- bekräftelsestatus
- transportstatus
- planerat leveransdatum
- planerings-/Garage-notering

## Redigering

Ett ärvt värde är en **utgångspunkt**, inte ett skrivskydd.

Om exempelvis Garaget säger:

- planerad station = 166
- leverantör = Mercedes
- dygnsdeb = 1 250
- hålltid = 12 månader

så visas dessa värden i Nybil. Operatören kan korrigera den information som ska vara aktuell i Nybils mottagningsbild.

Nybils ordinarie verifierade fält har företräde framför upstream-defaults vid sparning. Detta innebär att ett värde som operatören faktiskt ändrar i Nybil inte skrivs tillbaka till Garaget.

## Historik och källa

Det finns två separata bilder efter lyckad handoff:

- **Garage-raden** = den upstream-bild som faktiskt lämnades in i mottagningen. Den fryses efter exakt handoff.
- **Nybil-raden** = den aktuella mottagningsbild som operatören verifierade/sparade.

Skillnaden mellan dem kan därmed granskas utan att historien skrivs om.

`source_garage_item_id` är den exakta proveniensen. Reg.nr-matchning används inte som ersättning för ett handslag.

## Versionsfence

Nybil lagrar den `garage_items.updated_at` som gällde när den exakta Garage-raden hämtades. Vid Nybil INSERT låser databasen samma Garage-rad och jämför aktuell `updated_at` med `source_garage_updated_at`.

Om Garage-raden har ändrats under tiden stoppas Nybil-save. Operatören måste då ladda om och hämta aktuell Garage-information igen.

Detta förhindrar att Nybil sparar en äldre källbild samtidigt som en nyare Garage-rad fryses som om den hade varit den överlämnade bilden.

## Fail closed

En Nybil-registrering som startats från ett exakt Garage-objekt får inte sparas om upstream-källbilden eller dess versionsstämpel inte kunde läsas in. Serverfel vid läsning av planeringsstation, planeringscell eller modellregister behandlas också som fel; systemet får inte tyst fortsätta med en ofullständig källbild.

## Oförändrade tidigare beslut

Denna implementation ändrar inte följande låsta regler:

- Nybil initierar hämtningen från Garaget.
- Endast exakt `garage_item_id` är giltig källa.
- Garaget kvitteras först efter lyckad Nybil INSERT.
- Exakt handoff fryser Garage-raden som historik.
- Historiska reg.nr-överlapp fabricerar aldrig en handoff.
- Ingen separat `NYBIL`-parkering skapas i Garaget.
- Layer 1 importeras eller uppfinns inte i Garage-handslaget.
- Fordonsunika overrides får avvika från modellstandard.
- Faktisk mottagningsplats och övriga kontrollpunkter verifieras i Nybil och sätts inte av Garaget.

## Tekniska delar i denna implementation

- `app/api/garage/nybil-handoff/route.ts` exponerar hela relevanta upstream-källbilden, Garage-versionen samt modellregistrets bilmärke och failar stängt vid källfel.
- `lib/nybil-garage-prefill.ts` mappar planeringsstation till Nybils huvudstationsnamn och hanterar okända bilmärken utan informationsförlust.
- `app/nybil/garage-prefill-bridge.tsx` förifyller ordinarie Nybil-fält.
- `app/nybil/garage-upstream-context.tsx` visar och tillåter redigering av övrig upstream-information samt bevarar den hämtade Garage-versionen separat från redigerbara värden.
- `lib/nybil-api-client.ts` bär med den redigerade mottagningsbilden och Garage-versionen vid Nybil-sparning och stoppar sparning om källbild/version saknas.
- `migrations/20260902112000_nybil_upstream_information_continuity.sql` ger `nybil_inventering` egna mottagningskolumner och ett DB-lås som stoppar stale Garage-handoff.
- `tests/planning-garage-nybil-information-continuity-v1.test.ts` låser stationsmappning, okänt bilmärke, fail-closed och versionsfence mot regression.

## Production

Ingen Production-ändring är gjord genom detta dokument. Migration och applikationskod ska gå genom PR, CI och separat Production-verifiering före status **PRODUCTION-VERIFIERAT**.
