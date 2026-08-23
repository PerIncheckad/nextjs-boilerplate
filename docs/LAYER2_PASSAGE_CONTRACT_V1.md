# Layer 2.3 — Passage / blockering v1

## Syfte

Passage avgör om nästa processtillstånd får öppnas. Den är en readiness-gate ovanpå verifierade Layer 2-objekt och får inte skapa eller skriva om verksamhetssanning.

## Princip

En passage är **READY** endast när samtliga aktiva krav är upplösta enligt respektive kontrakt.

- HANDOFF: `VERIFIED` eller legitimt `CANCELLED`
- CHECKPOINT: `GODKAND` eller `EJ_RELEVANT`
- saknat kravobjekt blockerar
- `REQUESTED`, `HANDED_OVER`, `RECEIVED`, `ACCEPTED`, `COMPLETED` blockerar en handoff-baserad passage
- `VANTAR` och `AVVIKELSE` blockerar en checkpoint-baserad passage

## Arkitektur

`passage_definitions` beskriver den versionerade gaten och dess målstatus.

`passage_requirements` beskriver vilka handoffs/checkpoints som måste vara upplösta.

`evaluate_routine_passage(...)` är read-only och returnerar `ready`, strukturerade blockeringsorsaker och kravstatus.

`assert_routine_passage_ready(...)` är en strikt gate som avbryter om readiness inte är uppfylld.

Ingen funktion i L2.3 muterar `salu_flags`, Layer 1-perioder, checkpoints eller handoffs.

## Första vertikalfall

`SALU_FINAL_ASSESSMENT v1`

Målstatus: `SLUTBEDÖMNING`

Krav:
1. `SALU_TO_PLANERING v1` upplöst
2. `SALU_TO_INKOP v1` upplöst

Denna gate säger endast om SALU **får** gå vidare. Den källägda SALU-transitionen förblir separat.

## Avgränsning

- ingen Layer 1-write
- ingen automatisk SALU-statusändring
- ingen process/routine instance-modell
- ingen RBAC/mandatmodell
- ingen SLA/timer
- ingen Kistan
