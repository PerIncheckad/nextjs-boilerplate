# NYBIL HÄMTAR FRÅN GARAGET

Datum: 2026-09-01
Status: LÅST VERKSAMHETS- OCH TEKNIKKONTRAKT

## Verksamhetsflöde

Planering → Garaget → Nybil.

Planering och Garaget fyller bilen med kända planerings- och inköpsfakta fram till fysisk ankomst. När bilen anländer startar mottagningen i **Nybil** genom att användaren hämtar den aktuella bilen från Garaget.

Det finns ingen separat NYBIL-parkering i Garaget och Garaget ska inte pusha bilen in i Nybil.

## Nybil hämtar

På Nybil-ytan visas aktiva UTVECKLA / IN-bilar som:
- har reg.nr,
- inte redan är kvitterade till Nybil,
- inte redan finns i verifierad Nybil-historik.

Användaren väljer **Hämta**. Valet bär exakt `garage_item_id` vidare till Nybil-formuläret.

## Förifyllning och verifiering

Kända överlappande Garage-fakta får förifyllas, exempelvis:
- reg.nr,
- modell,
- planerad station.

Garage-fakta som saknar motsvarande Nybil-fält dupliceras inte. De finns kvar via den exakta källkopplingen `source_garage_item_id`.

Faktisk mottagningsplats, utrustning, skick, hjul, nycklar, dokumentation, media och övriga Nybil-kontrollpunkter verifieras i Nybil och ska inte infereras från Planering eller Garaget.

## Kvittens

Att välja en bil i Nybil är **inte** en överlämning. Bilen är endast hämtad som arbetsunderlag.

Först när Nybil-registreringen sparas framgångsrikt med rätt `source_garage_item_id` får databastriggern atomiskt:
1. verifiera att Garage-objektet är UTVECKLA / IN,
2. verifiera samma reg.nr,
3. skapa Nybil-raden,
4. sätta `garage_items.handed_off_nybil_id`,
5. sätta `handed_off_at`.

Misslyckas Nybil-sparningen ska Garaget inte kvitteras.

## Dubbelregistreringsskydd

Bilar som redan finns i Nybil får inte erbjudas som nya kandidater. Historiska Nybil-rader utan senare Garage-kvittens backfillas inte automatiskt.

## UI-kontrakt

**Garaget:** visar att bilen väntar på mottagning i Nybil. Ingen knapp ska pusha bilen till Nybil.

**Nybil:** visar `Hämta bilen från Garaget`, sökning och explicit `Hämta` för verkliga kandidater.

## Sammanfattning

**Garaget äger arbetet fram till fysisk ankomst. När bilen anländer hämtar Nybil bilen från Garaget. Nybil verifierar den faktiska bilen och först lyckad sparning kvitterar Garaget och för bilens verifierade information vidare.**
