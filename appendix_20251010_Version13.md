# Appendix: Framtida funktioner, funderingar och specialkrav (Incheckad.se)

---

## **1. Export och dokumentation**

- **Export av grafer och rapporter som PNG/PDF**
  - Möjlighet att ladda ned graf eller rapport som bild eller PDF.
  - Period och plats (filter) ska vara tydligt synliga i den exporterade filen.

---

## **2. Filtrering, sortering och platslogik**

- **Avancerad filtrering/sortering**
  - Möjlighet att sortera och filtrera tabell på datum, region, station, typ av skada, godkänd av, etc.
  - Kombinera filter på period, plats och reg.nr.

- **Dynamisk platsmeny**
  - Bygg platsmenyn automatiskt utifrån Supabase-tabellen.
  - Endast regioner (Syd, Mitt, Nord) och huvudstationer (stationer vars namn börjar med "Huvudstation Malmö...", "Huvudstation Lund", osv).
  - Aldrig visa “Huvudstation” som rubrik.

---

## **3. Mobil och UI-anpassning**

- **Mobilvänlig design**
  - Alla vyer (startsida, rapport, incheckning, admin) ska fungera på mobil och surfplatta.
  - Testa UI på olika skärmstorlekar.

---

## **4. Admin, roller och behörigheter**

- **Adminpanel**
  - Hantera stationer, regioner, orter, användare och rättigheter.
  - Skapa/redigera/ta bort huvudstationer och regioner.
  - Styr datavisning utifrån roll (incheckare, admin, regionchef, m.fl).

---

## **5. Bild- och videohantering**

- **Visa metadata vid hovring**
  - Vid “hover” över bild/video i rapporten ska metadata (tidpunkt, incheckare, reg.nr, station, etc) visas som tooltip eller popup.
- **Bränna in metadata i bilder**
  - Fundera på att “bränna in” metadata direkt i bildernas pixlar (synligt för ögat).  
    - Exempel: Reg.nr, tidpunkt, station nederst i bilden.
    - Kan göras via server-side bildbehandling vid upload/export.

---

## **6. Integration och automatisering**

- **Bilkontroll-fil**
  - Vid reg.nr-sökning:  
    - Visa “Okänt reg.nr” om reg.nr ej finns i Bilkontroll-filen.
    - Visa “Inga skador inlagda” om reg.nr finns men inga skador är dokumenterade.
  - Automatisk synk mot Bilkontroll-registret.

- **Mailutskick och notifikationer**
  - Automatisk mail till regionchef vid incheckning/skada/varning.
  - Möjlighet att konfigurera mottagare och innehåll.

---

## **7. Historik, performance och loggning**

- **Historik och loggning**
  - Full historik/loggning av skador per fordon och station.
  - Visa rapporter för tidigare perioder.

- **Performance**
  - Snabba laddtider, även med stor datamängd.
  - Bilddata optimerad med thumbnails och bucket-struktur.

- **Dev-logg och dokumentation**
  - Håll en utvecklingslogg för beslut, buggar, större ändringar.

---

## **8. Testning och kvalitetssäkring**

- **Testscenarier**
  - UI-test: alla kolumner syns korrekt, rätt färgnyanser, ingen extra padding.
  - Funktionstest: filtrering, export, mobil, roller, mail, metadata.
  - API-test mot Supabase: rätt data hämtas och visas.

- **Fallgropar**
  - Platsmenyn: se till att den alltid visar rätt regioner och huvudstationer.
  - Regnr-sök: visa tydliga statusmeddelanden.
  - Bild/metadata: undvik att metadata försvinner vid export/download.

---

## **Hur hantera .md-filer mellan bottar?**

- Markdown-filer som skapas här kan laddas ned eller kopieras direkt.
- **Bästa sättet:**  
  1. Ladda ned .md-filen från Copilot.
  2. Spara i repo/filstruktur, t.ex. `/docs/appendix_20251010.md` eller `/project-brief_20251010.md`.
  3. Dela via GitHub, Supabase bucket, eller som text till nästa bot.
- **Alternativ:**  
  - Kopiera innehållet till txt-fil och klistra in i nästa konversation.
  - Ladda upp till Supabase Storage om ni har gemensam bucket för dokumentation.
  - Använd som README eller dokumentationsfil i projektet.

---

## **Tips till nästa bot/utvecklare**

- Gå igenom både brief och appendix innan start.
- Stäm av mot skärmdumpar, tabeller och bucket-struktur.
- Fråga alltid om prioritering på “kanske senare”-punkter innan implementation.
- Dokumentera nya beslut och “funderingar” löpande.

---

**Dagens datum: 2025-10-10**