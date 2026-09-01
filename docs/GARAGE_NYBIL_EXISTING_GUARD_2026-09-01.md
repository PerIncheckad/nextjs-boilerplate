# INCHECKAD – Garage → Ny bil: skydd mot dubbel registrering

Datum: 2026-09-01
Status: LÅST OPERATIVT OCH TEKNISKT KONTRAKT

## 1. Bakgrund

UTVECKLA / IN representerar en konkret Garage-disposition. När bilen fått ett verkligt registreringsnummer kan den lämnas vidare till Ny bil.

Garage → Ny bil-handslaget är fortsatt låst till:

- Garage-riktning `IN`
- känt reg.nr
- samma reg.nr i Garage och Ny bil
- exakt `source_garage_item_id` för nya handslag
- Ny bil-write-through etablerar/verifierar Layer 1-verkligheten

Garage får inte själv skapa ANKOMST eller skriva om Layer 1.

## 2. Production-observation 2026-09-01

Efter #524 fanns 12 aktiva Planering-origin UTVECKLA / IN-objekt med reg.nr.

Av dessa hade:

- 8 redan en befintlig `nybil_inventering`-post med samma reg.nr
- 8 redan en öppen Layer 1-period av typ `AVAILABLE` med källa `NYBIL`
- 0 av de 8 äldre Ny bil-posterna `source_garage_item_id`
- 0 Garage-objekt `handed_off_nybil_id`
- 4 reg.nr saknade ännu Ny bil-post: `XJB83X`, `TDB33C`, `SJP07S`, `JC23Y`

De 8 äldre Ny bil-posterna är legitim Production-historik. De får inte backfillas eller skrivas om enbart för att den senare Garage-kedjan nu finns.

## 3. Låst regel

Om ett aktivt UTVECKLA / IN-objekt har reg.nr och samma reg.nr redan finns i Ny bil:

- Garaget ska visa **Redan i Ny bil**
- användaren ska inte erbjudas **Till Ny bil**
- direkt försök att öppna Garage → Ny bil-handslaget ska blockeras med 409
- befintlig Ny bil-post ska inte ändras
- Garage-objektets historiska kvittensfält ska inte backfillas automatiskt

Om reg.nr inte finns i Ny bil och Garage-objektet inte redan är kvitterat:

- **Till Ny bil** är tillåtet
- den befintliga atomiska `source_garage_item_id`-kedjan används
- Ny bil-triggern verifierar samma reg.nr och kvitterar `handed_off_nybil_id`

## 4. Tre operativa lägen

Garage → Ny bil-panelen skiljer därför på:

1. **Till Ny bil** – fysisk bil med reg.nr som ännu inte finns i Ny bil.
2. **Redan i Ny bil** – reg.nr finns redan som verifierad Ny bil-historik men äldre rad saknar Garage-källreferens.
3. **Överlämnad** – ett senare korrekt Garage → Ny bil-handslag är atomiskt kvitterat.

Detta skiljer historisk sanning från ny processkvittens utan att förvanska någon av dem.

## 5. Ingen backfill

Denna förändring innehåller:

- ingen SQL-migration
- ingen databasbackfill
- ingen uppdatering av äldre `nybil_inventering`
- ingen uppdatering av äldre `garage_items.handed_off_nybil_id`
- ingen ändring av Layer 1

Det är ett read/guard-kontrakt ovanpå befintlig Production-sanning.

## 6. Grundprincip

**Ny bil finns redan = använd den verifierade sanningen och skapa inte en ny. Saknad gammal processlänk får inte användas som skäl att duplicera verkligheten eller skriva om historien.**
