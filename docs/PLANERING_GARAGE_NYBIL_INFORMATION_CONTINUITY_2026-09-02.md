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
5. När Nybil sparas lagras Nybils mottagningsbild och den exakta `source_garage_item_id`.
6. Samma transaktion kvitterar Garage-objektet och Garage-källraden fryses enligt det tidigare låsta handoff-kontraktet.

## Vad som speglas

Nybils ordinarie fält förifylls där de redan finns:

- registreringsnummer
- bilmärke när det kan härledas från Planerings modellregister
- modell
- planerad station

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

- **Garage-raden** = den upstream-bild som lämnades in i mottagningen. Den fryses efter exakt handoff.
- **Nybil-raden** = den aktuella mottagningsbild som operatören verifierade/sparade.

Skillnaden mellan dem kan därmed granskas utan att historien skrivs om.

`source_garage_item_id` är den exakta proveniensen. Reg.nr-matchning används inte som ersättning för ett handslag.

## Fail closed

En Nybil-registrering som startats från ett exakt Garage-objekt får inte sparas om upstream-källbilden inte kunde läsas in. Systemet ska då kräva omladdning / ny hämtning från Garaget i stället för att tyst tappa tidigare inmatad information.

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

## Tekniska delar i denna implementation

- `app/api/garage/nybil-handoff/route.ts` exponerar hela relevanta upstream-källbilden samt modellregistrets bilmärke.
- `app/nybil/garage-prefill-bridge.tsx` förifyller ordinarie Nybil-fält.
- `app/nybil/garage-upstream-context.tsx` visar och tillåter redigering av övrig upstream-information.
- `lib/nybil-api-client.ts` bär med den redigerade mottagningsbilden vid Nybil-sparning och stoppar sparning om Garage-källbilden saknas.
- `migrations/20260902112000_nybil_upstream_information_continuity.sql` ger `nybil_inventering` egna mottagningskolumner för upstream-informationen.
- `tests/planning-garage-nybil-information-continuity-v1.test.ts` låser kontraktet mot regression.

## Production

Ingen Production-ändring är gjord genom detta dokument. Migration och applikationskod ska gå genom PR, CI och separat Production-verifiering före status **PRODUCTION-VERIFIERAT**.
