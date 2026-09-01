# INCHECKAD – Hjulskifte Production-acceptans

Datum: 2026-09-01
Status: TEKNISKT SLUTACCEPTERAD I PRODUCTION
Bas: main `96087d6f4f14255b0efb9101fcd6c4edfe418bcc`

## 1. Syfte

Detta dokument skiljer mellan vad som är tekniskt verifierat i Production och vad som återstår som vanlig verksamhetsanvändning.

Ingen permanent testdata har skapats. Fullflödet verifierades i en transaktion som avsiktligt avslutades med rollback efter lyckat test.

## 2. Production-status

- #520 är mergad och Vercel Production = SUCCESS.
- #521 är mergad och Vercel Production = SUCCESS.
- #522 dokumenterade första Production-acceptansen.
- Production-funktionen `get_wheel_change_candidate_source()` använder senaste manuella `vehicle_edits.hjultyp` före senaste COMPLETED Check-in.
- Historiska Check-in-rader skrivs inte om.
- `/status?reg=<REGNR>` normaliserar regnumret och hämtar bilen direkt.

## 3. Aktuell vinterpopulation

För WINTER_2026 visade Production-underlaget vid kontrollen:

- 259 bilar med `REQUIRES_CHANGE`
  - 56 med registrerad Nybil-förvaring
  - 116 med legacy-förvaring i `vehicles.wheel_storage_location`
  - 87 med saknad hjulförvaring
- 198 med redan korrekt vinterhjul
- 95 SALU-undantagna
- 2 med `UNKNOWN_WHEEL_STATUS`
- 1 såld kandidat, `BMP08Z`, exkluderas från Hjulskifte
- 0 verkliga skapade Hjulskifte-rader för `WINTER_2026`

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

Status och Hjulskifte använder samma operativa princip:

1. senaste icke-tomma manuella `vehicle_edits.hjultyp`
2. senaste COMPLETED Check-in `checkins.hjultyp`
3. saknas båda => UNKNOWN

Vid införandet fanns 0 kandidatbilar med manuell hjultyp-edit. Migrationen ändrade därför ingen befintlig Production-klassning direkt.

## 6. Verifierad hjulförvaring

Förvaringskällan är separat från bilens station:

1. senaste manuella edit av `hjul_forvaring_ort` / `hjul_forvaring_spec`
2. `nybil_inventering`
3. legacy `vehicles.wheel_storage_location`
4. annars SAKNAS

Production har en befintlig manuell förvaringsedit på SDH20Y (`Malmö - hylla 3`), vilket verifierar att edit-lagret är aktivt i den gemensamma datamodellen.

## 7. Fullt rollback-baserat Production-test

Ett fullständigt tekniskt acceptanstest genomfördes på en verklig aktuell vinterkandidat, `FGD62S`.

Före testet var bilen:

- `Sommardäck`
- aktuell vinterkandidat
- verifierad hjulförvaring `Malmö - Sonax tvätthall`
- inget befintligt `WINTER_2026`-ärende

Testet kördes i en enda databastransaktion och verifierade följande ordning:

1. `create_garage_wheel_change_for_vehicle()` skapade ett ärende i `KRAVS`.
2. `garage_wheel_changes.location` blev exakt `Malmö - Sonax tvätthall`.
3. checkpointens `source_context.wheelStorageLocation` innehöll samma snapshot.
4. CREATED-eventets snapshot innehöll samma location.
5. `vehicle_journey_events.payload.wheelStorageLocation` innehöll samma snapshot.
6. statusövergång `KRAVS → BOKAD` passerade med bokad tid.
7. statusövergång `BOKAD → PAGAENDE` passerade.
8. statusövergång `PAGAENDE → KLAR` passerade.
9. `completed_at` sattes vid KLAR.
10. exakt fyra wheel-change-events skapades för skapande/statuskedjan.
11. ett nytt försök att skapa Hjulskifte för samma `regnr + WINTER_2026` blockerades med `Hjulskifte finns redan för bilen och säsongen` även efter KLAR.

Efter samtliga kontroller kastades en avsiktlig `ACCEPTANCE_PASS_ROLLBACK`-signal för att rulla tillbaka hela transaktionen.

Efter rollback verifierades explicit:

- 0 test-hjulskiften kvar
- 0 test-events kvar
- 0 test-checkpoints kvar
- 0 test-journey-events kvar

Ingen permanent Production-data skapades eller ändrades av acceptanstestet.

## 8. Säsongsgrind

Den ordinarie API-vägen för säsongsbaserat Hjulskifte kontrollerades separat.

Före aktiv säsong:

- `operationalWheelSeason(new Date())` måste vara `active = false`
- säsongsbaserad POST returnerar HTTP 409 med `Hjulskiftesäsongen har inte startat ännu`
- RPC för att skapa säsongsärendet anropas inte
- UI visar FÖRHANDSVY och exponerar inte `Starta`

Databasmotorn kunde därför fulltestas nu utan att den verkliga användarvägen öppnades före verksamhetens säsongsstart.

## 9. Slutlig acceptansmatris

| Kontroll | Status | Bevis / kommentar |
| --- | --- | --- |
| Modern registrerad hjulförvaring | PASS | 56 REQUIRES_CHANGE använder Nybil-förvaring |
| Legacy-fallback utan stationsinferens | PASS | 116 REQUIRES_CHANGE använder legacy-förvaring |
| Saknad förvaring separeras | PASS | 87 REQUIRES_CHANGE saknar förvaring och går till worklist |
| `Ange förvaring` går till rätt Status-bil | PASS | `/status?reg=<REGNR>` förladdar och hämtar bilen |
| Manuell hjultyp kan lösa UNKNOWN | PASS | #521 precedence aktiv i Production |
| UNKNOWN infereras inte | PASS | AZH62Z och ESN24G kvarstår korrekt UNKNOWN |
| Såld bil exkluderas | PASS | BMP08Z identifieras som såld kandidat |
| Start snapshotar aktuell hjulförvaring | PASS | Verifierat på FGD62S i rollback-test |
| Checkpoint snapshot | PASS | Verifierat på FGD62S |
| CREATED-event snapshot | PASS | Verifierat på FGD62S |
| Journey-event snapshot | PASS | Verifierat på FGD62S |
| `KRAVS → BOKAD → PAGAENDE → KLAR` | PASS | Full kedja verifierad på FGD62S |
| `completed_at` vid KLAR | PASS | Verifierat |
| Audit-eventkedja | PASS | 4 events verifierade |
| Samma bil kan inte startas igen samma säsong | PASS | Dubblettförsök efter KLAR blockerades |
| Säsongsstart före 1 oktober blockerad | PASS | API-grind + UI FÖRHANDSVY verifierad |
| Ingen testdata kvar efter acceptanstest | PASS | 0/0/0/0 verifierat efter rollback |

## 10. Vad som återstår

Det finns ingen känd teknisk blockerare kvar i Hjulskifteflödet.

Återstående aktiviteter är verksamhetsdata och drift:

- verklig hjultyp måste anges när AZH62Z och ESN24G faktiskt verifierats
- saknad hjulförvaring måste kompletteras manuellt där verksamheten känner den verkliga platsen
- när kampanjen öppnar används det redan tekniskt verifierade flödet i skarp drift

Detta är inte väntande teknisk acceptans.

## 11. Slutsats

Hjulskifte är tekniskt slutaccepterat i Production.

Kedjan `verifierad hjultyp → registrerad hjulförvaring → skapande → snapshot → BOKAD → PAGAENDE → KLAR → permanent same-season-spärr` är verifierad mot Production-schemat och Production-funktionerna utan att lämna testdata efter sig.

Grundprincipen är fortsatt låst: **saknad källa ska bli synligt arbete, aldrig infererad sanning.**
