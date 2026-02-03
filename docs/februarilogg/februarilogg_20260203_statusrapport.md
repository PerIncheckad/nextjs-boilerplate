# Statusrapport (förarbete) – 2026‑02‑03
**Ägare:** PerIncheckad  
**Författare:** GitHub Copilot  
**Syfte:** Sammanfatta läst material, nulägesförståelse hittills, och vad som återstår innan kodändring.

---

## 1) Vad som är läst (klart)
### /docs/wiki – samtliga filer
- Architecture.md  
- Check-in-flow.md  
- Contributing.md  
- CSV-import.md  
- CSV-import-skador - gör så här.md  
- Database.md  
- Home.md  
- Media-and-email.md  
- OVERVIEW.md  
- Operations.md  
- csv-import-dubbel-rad.md  
- database-constraints.md  
- css-layout-gotchas.md  
- troubleshooting.md  

### /docs – konversationer lästa hittills (ur 202601)
- handoff 20260107.md  
- handover 20260108.md  
- Konversation med bot 20260113‑20260114_1  
- Konversation med bot 20260113‑20260114_3  
- Konversation med bot 20260116‑20260119_2  
- Konversation med bot 20260123_1  
- Konversation med bot 20260123_2  
- Konversation med bot 20260123_3  
- Konversation med bot 20260123_4  
- Copilot resonerar 20260123.txt  

---

## 2) Vad som återstår (måste läsas innan kodarbete)
### /docs – 202601‑filer som ännu inte är lästa
**(hela listan från PerIncheckad, ej klar ännu):**
- Konversation med bot (fail) 20260127‑20260202  
- Konversation med bot 20260126‑20260127_4  
- Konversation med bot 20260126‑20260127_3  
- Konversation med bot 20260126‑20260127_2  
- Konversation med bot 20260126‑20260127_1  
- Konversation med bot (fail) 20260123‑20260126_3  
- Konversation med bot (fail) 20260123‑20260126_2  
- Konversation med bot (fail) 20260123‑20260126_1  
- Konversation med bot (fail) 20260122  
- Konversation med bot (fail) 20260120‑20260121_3  
- Konversation med bot (fail) 20260120‑20260121_2  
- Konversation med bot (fail) 20260120‑20260121_1  
- Konversation med bot 20260119‑20260120_2  
- Konversation med bot 20260119‑20260120_1  
- Konversation med bot 20260116‑20260119_1  
- Konversation med bot 20260115‑20260116_4  
- Konversation med bot 20260115‑20260116_3  
- Konversation med bot 20260115‑20260116_2  
- Konversation med bot 20260115‑20260116_1  
- Konversation med bot 20260114‑20260115_2  
- Konversation med bot 20260114‑20260115_1  
- Konversation med bot 20260113‑20260114_2  
- Konversation med bot 20260109‑20260112_4  
- Konversation med bot 20260109‑20260112_3  
- Konversation med bot 20260109‑20260112_2  
- Konversation med bot 20260109‑20260112_1  
- Konversation med bot (fail) 20260107‑20260108  
- Konversation med bot 20260105‑20260107  
- Konversation med bot (fail) 20251223‑20260105_3  
- Konversation med bot (fail) 20251223‑20260105_2  
- Konversation med bot (fail) 20251223‑20260105_1  

---

## 3) Nulägesförståelse (preliminär, baserat på läst material)
> OBS: Detta är *preliminärt* och får ej användas för kodändringar innan alla konversationer är lästa.

### A) Systemets dataflöde (enligt wiki)
- `/check` skriver till: `checkins`, `checkin_damages`, `damages`
- `/status` hämtar från: `checkins`, `checkin_damages`, `damages`, `damages_external` (via RPC)
- `/check` faktaruta hämtar BUHS via `get_damages_by_trimmed_regnr` (damages_external)

### B) Kända problemtyper (återkommande i historiken)
- Matchning BUHS ↔ checkin_damages misslyckar → skador saknas i HISTORIK.
- Formatering av skadetyper (svenska tecken) faller bort om fel fält används (damage_type vs damage_type_raw).
- Hanterade BUHS‑skador visas felaktigt som “ej hanterade”.
- /status bryts ofta av små ändringar p.g.a. bristfällig dokumentation + bräcklig matchlogik.

### C) Viktiga begrepp (från Database.md)
- `legacy_damage_source_text` är central för BUHS‑matchning och dedup.
- `normalizeTextForMatching()` och `normalizeDamageTypeForKey()` används för BUHS ↔ checkin_damages.
- `checkinWhereDocumented` är **runtime‑fält** och styr HISTORIK‑visning; fel antal markerade skador ⇒ fel UI.

---

## 4) Rekommendation hittills
- **Ingen kodändring** förrän samtliga 202601‑konversationer är lästa.
- Därefter: systematiskt kodgenomläsning av `lib/vehicle-status.ts`, `lib/damages.ts`, `app/status/form-client.tsx`, `app/check/form-client.tsx`, `app/api/vehicle-info/route.ts`, `app/api/notify/route.ts` m.fl.
- Därefter: SQL‑verifiering (en fråga per box).

---

## 5) Nästa steg (nästa rapport ska innehålla)
- Slutförd läsning av *alla* 202601‑konversationer.
- Exakta, verifierade fel i nuläget (inkl. reproducerbara testfall).
- Exakta SQL‑frågor (en per box).
- Kodområden som behöver ändras (med referens till funktioner).

---

**Status:** Förarbete pågår, inga antaganden, inga kodändringar.
