# INCHECKAD – Hjulskifte Production-acceptans

Datum: 2026-09-01
Status: DELVIS VERIFIERAD I PRODUCTION
Bas: main `23dfe92bf8437e2359c5a786072d8e9076a6eabb` efter PR #521

## 1. Syfte

Detta dokument skiljer mellan vad som är tekniskt och datamässigt verifierat i Production nu och vad som måste vänta på verklig verksamhetsdata eller aktiv hjulskiftesäsong.

Ingen testdata ska skapas enbart för att få en grön acceptans.

## 2. Production-status för #520 och #521

- #520 är mergad och Vercel Production = SUCCESS.
- #521 är mergad och Vercel Production = SUCCESS.
- Production-funktionen `get_wheel_change_candidate_source()` använder senaste manuella `vehicle_edits.hjultyp` före senaste COMPLETED Check-in.
- Historiska Check-in-rader skrivs inte om.
- `/status?reg=<REGNR>` normaliserar regnumret och hämtar bilen direkt.

## 3. Aktuell vinterpopulation

För WINTER_2026 visar Production-underlaget:

- 259 bilar med `REQUIRES_CHANGE`
  - 56 med registrerad Nybil-förvaring
  - 116 med legacy-förvaring i `vehicles.wheel_storage_location`
  - 87 med saknad hjulförvaring
- 198 med redan korrekt vinterhjul
- 95 SALU-undantagna
- 2 med `UNKNOWN_WHEEL_STATUS`
- 1 såld kandidat, `BMP08Z`, exkluderas från Hjulskifte
- 0 skapade Hjulskifte-rader för `WINTER_2026`

Siffrorna är en ögonblicksbild och inte en permanent flottstorlek.

## 4. UNKNOWN

De två kvarvarande UNKNOWN-bilarna är:

- AZH62Z – senaste COMPLETED Check-in 2025-12-03 – Helsingborg / MB Helsingborg
- ESN24G – senaste COMPLETED Check-in 2025-12-02 – Malmö / MB Malmö

För båda saknas verifierad hjultyp i samtliga kontrollerade INCHECKAD-källor:

- senaste och övriga Check-in-rader
- `nybil_inventering`
- `vehicles`
- `vehicle_edits.hjultyp`

De ska därför ligga kvar som UNKNOWN tills någon manuellt verifierar faktisk hjultyp i Status.

## 5. Verifierad hjultyp-precedence

Status och Hjulskifte använder nu samma operativa princip:

1. senaste icke-tomma manuella `vehicle_edits.hjultyp`
2. senaste COMPLETED Check-in `checkins.hjultyp`
3. saknas båda => UNKNOWN

Vid införandet fanns 0 kandidatbilar med manuell hjultyp-edit. Migrationen ändrade därför ingen befintlig Production-klassning direkt.

## 6. Verifierad hjulförvaring

Förvaringskällan är fortsatt separat från bilens station:

1. senaste manuella edit av `hjul_forvaring_ort` / `hjul_forvaring_spec`
2. `nybil_inventering`
3. legacy `vehicles.wheel_storage_location`
4. annars SAKNAS

Production har en befintlig manuell förvaringsedit på SDH20Y (`Malmö - hylla 3`), vilket verifierar att edit-lagret är aktivt i den gemensamma datamodellen.

## 7. Acceptansmatris

| Kontroll | Status | Bevis / kommentar |
| --- | --- | --- |
| Modern registrerad hjulförvaring visas som källa | PASS – DATA | 56 REQUIRES_CHANGE använder Nybil-förvaring |
| Legacy-fallback utan stationsinferens | PASS – DATA | 116 REQUIRES_CHANGE använder legacy-förvaring |
| Saknad förvaring separeras | PASS – DATA + KOD | 87 REQUIRES_CHANGE saknar förvaring och ska till worklist |
| `Ange förvaring` går till rätt Status-bil | PASS – KOD | `/status?reg=<REGNR>` förladdar och hämtar bilen |
| Manuell hjultyp kan lösa UNKNOWN | PASS – TEKNIK | #521 precedence finns i Production; ingen verklig edit ännu |
| UNKNOWN infereras inte | PASS – DATA | AZH62Z och ESN24G ligger kvar eftersom verifierad hjultyp saknas |
| Såld bil exkluderas | PASS – DATA | BMP08Z identifieras som såld kandidat och ska exkluderas |
| Samma bil kan inte startas två gånger samma säsong | PASS – KONTRAKT | DB/API-idempotens från #514; 0 verkliga WINTER_2026-rader ännu |
| Start snapshotar aktuell hjulförvaring | PASS – KONTRAKT / EJ VERKLIGT CASE | Kod och migration låser snapshot; verkligt säsongscase saknas |
| Full kedja `hjultyp → förvaring → Starta → ärende → KLAR` | VÄNTAR | Kräver aktiv säsong och verkligt verksamhetscase |

## 8. Medvetna blockerare

### 8.1 Verklig hjultyp krävs

AZH62Z och ESN24G får inte korrigeras från antagande. Verklig monterad hjultyp måste verifieras manuellt innan Status-edit görs.

### 8.2 Säsongen är inte aktiv

Den operativa vinterkampanjen startar 1 oktober. Före säsongsstart ska systemet vara i FÖRHANDSVY och inte erbjuda säsongsstart av Hjulskifte.

Därför ska inget artificiellt Production-case skapas 2026-09-01 enbart för att testa Starta/KLAR.

## 9. Nästa verksamhetsacceptans

När verklig hjultyp är känd för AZH62Z eller ESN24G:

1. öppna bilen via `Verifiera hjultyp`
2. registrera verklig hjultyp i Status
3. uppdatera Hjulskifte
4. verifiera att bilen lämnar UNKNOWN och klassas enligt säsongsregeln

När vinterkampanjen är aktiv och första riktiga bilen ska hanteras:

1. verifiera hjultyp
2. verifiera registrerad hjulförvaring
3. Starta Hjulskifte
4. kontrollera snapshot av förvaring i ärende och auditkedja
5. genomför statusflödet
6. markera KLAR
7. verifiera att samma bil inte kan startas igen för WINTER_2026

## 10. Slutsats

Hjulskifte är tekniskt Production-grönt genom #521 och de identifierade osäkerheterna är nu uttryckligen synliga i stället för infererade.

Kvarvarande acceptans är inte ett känt kodfel. Den är beroende av två verkliga verksamhetsfakta: faktisk hjultyp på UNKNOWN-bilarna och ett legitimt Hjulskifte efter att säsongen blivit aktiv.
