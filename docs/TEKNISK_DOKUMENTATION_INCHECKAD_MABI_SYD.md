# Teknisk Dokumentation – Incheckad.se / MABI Syd

---

## Innehållsförteckning

1. **Översikt och syfte**
2. **Datamodell & tabellstruktur**
   - vehicles (bilkontroll)
   - damages (skador)
   - damage_media (bilder/video)
3. **Roller och behörighet**
4. **Importflöde: bilkontroll & skador**
   - Format, steg-för-steg, edge-cases
   - Städning av testdata
5. **Skade-ID och dublett-hantering**
6. **UI/UX-flöde: rapport, galleri, detaljer**
   - Sökning, filtrering, navigation
   - Interaktiva celler, metadata, export
7. **Edge-cases och felhantering**
8. **Testdata: fejkade incheckningar & städning**
9. **Rekommendationer för vidareutveckling**

---

## 1. Översikt och Syfte

Systemet digitaliserar incheckning och skadehantering för MABI Syd (Albarone AB, franchise inom MABI Sverige).  
Data och rapporter hålls “utanför” centrala MABI – detta är MABI Syds eget system.

Kärnflöden:
- Inloggning via Supabase Auth
- Formulär för incheckning av bil, dokumentation av skador, rekond, media
- Rapportvy & galleri för skador, filtrering, export
- Automatisk mail till rätt mottagare
- Roller: incheckare, bilkontroll, admin, biluthyrare

---

## 2. Datamodell & Tabellstruktur

### vehicles (bilkontroll)
- **Syfte:** Innehåller *alla* bilar i MABI Syds vagnpark
- **Importkälla:** Bilkontroll-filen (csv från Excel)
- **Viktiga kolumner:**  
  - regnr (text, unik per bil)
  - brand (text, kan vara tom)
  - model (text, kan vara tom)
  - wheel_storage_location (text, kan vara tom)
  - created_at, updated_at (timestamp)
  - [ev. fler fält enligt Supabase-tabell]

### damages (skador)
- **Syfte:** Registrerar *alla* dokumenterade skador (både nya och befintliga)
- **Importkälla:** Skadefilen (csv från Excel), samt incheckningsformulär
- **Viktiga kolumner:**  
  - id (uuid, unikt skade-ID, genereras backend)
  - regnr (text, indexerad)
  - saludatum (date, kan vara tom)
  - damage_date (date, skade-datum)
  - damage_type_raw (text, skadebeskrivning)
  - note_customer (text, ev. kundens beskrivning)
  - note_internal (text, intern kommentar)
  - vehiclenote (text, extra/övrig info)
  - status (text: draft/complete)
  - region, ort, station_namn, station_id, huvudstation_id (text)
  - inchecker_name, inchecker_email (text)
  - created_at, updated_at (timestamp)
  - [ev. fler fält enligt Supabase-tabell]

### damage_media (bilder/video)
- **Syfte:** Kopplar bilder/video till skador
- **Viktiga kolumner:**  
  - id (uuid)
  - damage_id (uuid, FK till damages.id)
  - url (text)
  - type (image/video)
  - comment (text)
  - created_at

- **Buckets:**  
  - `damage_photos` – lagrar bilder/video kopplat till skador

---

## 3. Roller och Behörighet

| Roll           | Formulär | Rapport | Galleri/Skada | Admin-panel |
|----------------|----------|---------|---------------|------------|
| Incheckare     | Ja       | Nej     | Endast egna/länk | Nej  |
| Bilkontroll    | Nej      | Ja      | Ja            | Nej        |
| Biluthyrare    | Nej      | Nej     | Ja, via länk  | Nej        |
| Admin          | Ja       | Ja      | Ja            | Ja         |

- **Incheckare:** Fyller i formulär, ser endast egna/länkade skador.
- **Bilkontroll:** Full access till rapporten; filtrerar, söker, och exporterar.
- **Biluthyrare:** Ser endast galleriet för skada via länk i mail.
- **Admin:** Full access överallt.

---

## 4. Importflöde: Bilkontroll & Skador

### Bilkontroll-fil (vehicles)
- **Format:** csv (minst: regnr, brand, model, wheel_storage_location)
- **Import:**  
  1. Öppna Supabase web UI
  2. Gå till tabellen `vehicles`
  3. Välj “Import csv”
  4. Matcha kolumner (“map fields”)
  5. Kontrollera att inga dubletter finns på regnr
  6. Tomma fält är ok; kod hanterar “Ingen information”

### Skadefil (damages)
- **Format:** csv (minst: regnr, saludatum, damage_date, damage_type_raw, note_customer, note_internal, vehiclenote)
- **Import:**  
  1. Öppna Supabase web UI
  2. Gå till tabellen `damages`
  3. Välj “Import csv”
  4. Matcha kolumner (“map fields”)
  5. Kontrollera att skade-ID genereras (om ej, kontakta utvecklare)
  6. Tomma fält är ok; kod hanterar “Ingen information”
  7. Media laddas separat till bucket `damage_photos` och kopplas via `damage_media`

#### Städning av testdata inför Go Live

- Alla testincheckningar och fejkade skador ska tas bort från `damages`, `damage_media`, och ev. buckets innan produktion.  
  - Kan göras via Supabase web UI (delete rows) eller script.
  - Kontrollera att mailadresser för test är borttagna.
- Testbilar i `vehicles` tas bort eller markeras.
- Samtliga bucket-filer med “test”/”fejk” ska raderas.
- Gör backup av all data innan städning!

---

## 5. Skade-ID och Dublett-hantering

- **Unikt skade-ID:** Alla skador får ett unikt uuid (damage.id)
- **Dublett-hantering:**  
  - Kombinera regnr, damage_date, damage_type_raw för att varna vid liknande skada:
    > “OBS! Skadan liknar en tidigare registrerad skada på denna bil. Säkerställ att detta är en ny skada!”
  - Ingen automatisk merge. Flera skador på samma ställe är ok.
  - Backend + import-script kan bygga in extra logik om behov uppstår.

---

## 6. UI/UX-flöde: Rapport, Galleri, Detaljer

- **Rapport-tabell:**  
  - Default: visar endast bilar med dokumenterade skador (en rad per skada)
  - Sökning/regnr: om inget skada finns, visa all info + “Inga kända skador”
  - Filtrering: period, plats, typ, status, region, m.fl.
  - Sortering: standard senaste skadan överst; justeras vid sortering
  - Paginering: default 25 rader/sida, valbart 50/100/500

- **Interaktiva celler:**  
  - Klick på regnr: visar alla skador för bilen (ny vy/modal)
  - Klick på skada: visar galleri + metadata (popup/modal)
  - Hover: visar tooltip med datum, incheckare, plats
  - Tumnaglar laddas direkt i popup/modal
  - Obegränsat antal bilder/video per skada

- **Navigation:**  
  - Enkel “tillbaka”-funktion till rapporten från galleri/detaljvy

- **Rollstyrning:**  
  - Rapporten öppen endast för Bilkontroll/Admin
  - Biluthyrare ser bara galleri via länk
  - Incheckare har ingen rapportaccess

- **Export:**  
  - PDF/PNG-export av tabell och graf – framtida feature

---

## 7. Edge-cases och Felhantering

- **Regnr ej i bilkontrollfilen:**  
  - Varning i formulär: “Är du säker?”
  - Incheckning kan slutföras ändå
  - Skickas med i mail till Bilkontroll: “Reg.nr saknas i Bilkontroll-filen”

- **Befintliga skador:**  
  - Dokumenteras via formuläret
  - När dokumenterade: tas bort från inventeringslistan, syns under reg.nr

- **Tomma fält:**  
  - Kod hanterar och visar “Ingen information” vid saknad data

---

## 8. Testdata: Fejkade incheckningar & Städning

- **Test innan Go Live:**  
  - Fyll formuläret med fejkade incheckningar/skador/rekond etc
  - Testa med tomma, fulla, och edge-case-fält
  - Kontrollera mailflöde, rapport, galleri, rollhantering
- **Städning:**  
  - Radera alla testincheckningar/skador från Supabase-tabeller och buckets
  - Kontrollera att inga testmailadresser/bilar finns kvar
  - Backup all data innan städning!

---

## 9. Rekommendationer för Vidareutveckling

- **Automatisering:**  
  - Bygg stöd för automatisk import av skadefil/bilkontrollfil när IT-lösning finns
- **Rollstyrning:**  
  - Utveckla dynamisk rollhantering via tabellen `employees` i Supabase
- **UI/UX:**  
  - Följ modern praxis för navigation, modal/popup, galleri
  - Testa på mobil, desktop, olika roller
- **Export:**  
  - Bygg PDF/PNG-export enligt Appendix
- **Monitoring:**  
  - Sätt upp monitorering/loggning av fel, mail, dataflöden
- **Changelog:**  
  - Dokumentera alla större ändringar i README/changelog

---

*Uppdaterad: 2025-10-10*  
För frågor, kontakta Per Andersson, Albarone AB (MABI Syd).
