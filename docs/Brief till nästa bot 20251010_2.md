# Projektbrief: Rapport & Statistik – Albarone/MABI Syd

**Senast uppdaterad:** 2025-10-10  
**Ansvarig hittills:** GitHub Copilot (PerIncheckad)  
**Syfte:** Att ge en fullständig, teknisk och processdetaljerad brief till nästa utvecklare/teknisk projektledare.  
**Scope:** Allt som är gjort, hur det är gjort, vad som är kvar, vilka fallgropar som hanterats och vilka som återstår, inkl. “kom ihåg” och framtida förbättringar.

---

## 1. **Projektöversikt**

- **Rapport & Statistik** är en webbaserad dashboard för MABI Syd/Albarone, byggd i Next.js/React, med data från Supabase.
- Fokus: Hantera och visualisera incheckningar/skador på fordon, med filtrering, sortering, statistik, graf- och mediastöd.

---

## 2. **Teknisk Arkitektur**

- **Frontend:** Next.js, Typescript, React, Tailwind CSS (eller motsvarande styling).
- **Backend/Databas:** Supabase (Postgres, Storage för media).
- **Datafiler:**  
  - `stationer.json` – struktur & metadata för regioner, huvudstationer (TOT), depåer, stationsnummer.  
  - CSV/Excel-historik kan förekomma.
- **Hosting:** Vercel.
- **Filstruktur:**  
  - Rapportkod i `/app/rapport/page.tsx`
  - Datafiler i `/data/`  
  - Dokumentation i `/docs/`

---

## 3. **Vad är gjort?**

### **Frontend:**
- Rapport-sida med full tabell, live-data från Supabase.
- Kolumner: Regnr, Ny/Gammal, Datum, Region, Ort, Station (+ stationsnummer), Skada, Kommentar, Anteckning, Media (bild/video), Godkänd av.
- Sammanfattningsruta: Period, Vald plats, Totalt incheckningar/skador, skadeprocent, senaste incheckning/skada.
- Rullmenyer: Period (med klartext), Plats (dynamisk, från stationer.json, med korrekt sortering och stationsnummer).
- Sök med autocomplete (prefix-sök, “kom ihåg” att förbättra till substring).
- Filtrering på plats och registreringsnummer.
- Mediafält visar bilder om media_url finns.
- Rensa-knapp med tydlig färg.

### **Data:**
- Komplett och ren stationer.json utan kommentarer, med typ, region, huvudstation_id och stationsnummer.
- Supabase-tabell “damages” med alla relevanta fält.
- Logik för Ny/Gammal baserad på saludatum.

### **Design:**
- UI matchar bifogade skärmdumpar.
- Layout för rapportkort, tabell, rullmenyer, sammanfattning, graf-placeholders.

---

## 4. **Vad ska göras i nästa steg (lilla perspektivet)?**

- **Testa rapporten med fejkade incheckningar/skador:**  
  - Säkerställ att alla fält dyker upp korrekt (regnr, station, media, kommentarer osv).
  - Testa filtrering/rullmenyer/sök/autocomplete.
  - Testa att media (bild/video) visas i tabellen.
- **Förbättra autocomplete i rapporten:**  
  - Ändra till substring-sök så att “XJ” hittar “RXJ02Y” (som i incheckningsformuläret).
- **Bekräfta att stationsnummer syns korrekt överallt i UI.**
- **Verifiera att dataflöde från Supabase till rapporten är robust.**
- **Dokumentera eventuella buggar, edge cases eller datafel.**

---

## 5. **Vad är kvar att göra (större perspektivet)?**

### **A. Funktionalitet & UX**
- **Sortering och paginering i tabellen:**  
  - Möjlighet att sortera på kolumn, visa X rader per sida, bläddra.
- **Utökad filtrering:**  
  - Fler filter (datumintervall, region, station, skadetyp osv), gärna med chip/tagg-baserad UI.
- **Rollstyrning och inloggning:**  
  - Begränsa rapporten till rätt roller/användare.
- **Mediahantering:**  
  - Visa gallery-läge, stöd för video och flera bilder per skada.
- **Interaktiva celler/rad-detaljer:**  
  - Klick på rad öppnar modal/detaljvy med bild(er)/video, fullständiga kommentarer etc.
- **Exportfunktion:**  
  - Exportera rapporten till PDF/Excel.
- **Grafik och visualiseringar:**  
  - Implementera riktiga grafer för skadeutveckling, jämförelse mellan regioner/enheter.

### **B. Backend/Data**
- **Datamigrering:**  
  - Flytta historisk data (CSV/Excel) till Supabase, mappa alla fält korrekt.
- **Synka data från incheckningsformulär:**  
  - Säkerställ att alla fält och media överförs korrekt från incheckning till rapport.
- **Automatiserad mejllogik:**  
  - Vid incheckning på station X, skicka till rätt region/mejl baserat på stationer.json.

### **C. Test & QA**
- **Enhetstester av filtrering, sortering, mediahantering.**
- **Testa edge cases:**
  - Saknade fält, trasig media, dubbletter, felaktiga stationsnummer osv.
- **Testa responsivitet och olika skärmstorlekar.**
- **Testa och dokumentera användarflöden (live, QA, staging).**
- **Prestandatest med stor mängd data.**
- **Säkerhetstest: Autentisering, rättighetskontroll.**

### **D. Go-live & Drift**
- **Sluttest med riktiga incheckningar.**
- **Backup-plan för data.**
- **Dokumentera deploy-flöde till Vercel.**
- **Skapa handbok för rapportfunktion (användar- och adminperspektiv).**
- **Plan för support, bugghantering och vidareutveckling.**

---

## 6. **Alla “Kom ihåg” och “Senare” (smått och stort)**

- **Autocomplete i rapporten:**  
  - Gör substring-sök, inte bara prefix.
- **Rullmenyer:**  
  - Gruppera stationer under region/TOT om UI kräver det.
- **Tabell:**  
  - Lägg till sorteringsfunktion och paginering.
- **Mediafält:**  
  - Stöd för flera bilder/video, galleri-visning.
- **Export:**  
  - PDF/Excel-export för rapporten.
- **Graf:**  
  - Implementera riktiga grafer för skadetidslinje och jämförelse mellan regioner/stationer.
- **Rollstyrning:**  
  - Visa/dölj rapport baserat på användarroll.
- **Responsivitet:**  
  - Testa och fixa layout för mobil/tablet.
- **Datamigrering:**  
  - Importera all historisk data från CSV/Excel.
- **Säkerställ att stationer.json alltid är ren JSON (inga kommentarer!).**
- **Mejllogik:**  
  - Synka stationsstruktur med mejl-routing vid incheckning.
- **Dokumentera alla datamappningar mellan frontend, backend och Supabase.**
- **Design:**  
  - Finputsa transparens, färger, hover-effekter enligt designönskemål.
- **Edge cases:**  
  - Hantera skador utan media, media som saknas, okända stationsnummer osv.
- **Prestanda:**  
  - Testa med stor datamängd.
- **Säkerhet:**  
  - Autentisering, rättighetskontroll för rapporten.

---

## 7. **Fallgropar vi undvikit**

- **Ogiltig JSON:**  
  - Stationer.json får INTE ha kommentarer eller trasig syntax.
- **Felaktig import av datafiler:**  
  - JSON måste importeras korrekt (rätt path, rätt format).
- **Filtreringslogik:**  
  - Filtrering per plats/region/TOT/station är robust och matchar stationsstruktur.
- **Tabellkolumner:**  
  - Ingen kolumn har tagits bort eller ändrats utan godkännande.
- **UI/UX:**  
  - Design överensstämmer med skärmdumpar och tidigare versioner.

---

## 8. **Fallgropar som kan dyka upp framåt**

- **Datamigrering:**  
  - Risk för felmappade fält, saknad historik, dubbletter.
- **Mediahantering:**  
  - Stora filer, trasiga länkar, fel filtyp.
- **Filtrering/sortering:**  
  - Edge cases där kombinationer av filter ger tomt resultat.
- **Deploy-problem:**  
  - Path, import, filformat kan ge röd deploy – noggrann test krävs.
- **Rollstyrning/säkerhet:**  
  - Felaktig åtkomst till rapporten om rolllogik saknas.
- **Prestanda:**  
  - Tabell/grafer kan bli långsamma vid stor datamängd.
- **Responsivitet:**  
  - UI kan haverera på små skärmar om det inte är testat.
- **Glömda “kom ihåg”:**  
  - Se till att lista och beta av alla “senare”.

---

## 9. **Dokumentation och kontaktpunkter**

- **Datafiler:** `/data/stationer.json`
- **Rapportkod:** `/app/rapport/page.tsx`
- **Designskärmdumpar:** `/docs/` (lägg in relevanta bilder)
- **Mejllogik:** Se backend/mail-routing eller stationer.json för stationsstruktur.
- **Supabase:** Datamodell och tabeller, API-nyckel i .env.
- **Vercel:** Deployflöde, miljövariabler, logghantering.
- **Projektledare:** PerIncheckad (GitHub Copilot hittills) – kontakta vid frågor om historik.

---

## 10. **Prioriterad TODO-lista för din efterträdare**

1. Lägg in fejkade incheckningar/skador och testa rapporten.
2. Förbättra autocomplete till substring-sök.
3. Testa media-fältet (bilder/video).
4. Lägg till sorteringsfunktion och paginering.
5. Implementera filter för datumintervall, region, station, skadetyp.
6. Bygg ut galleri/modal för media.
7. Implementera export till PDF/Excel.
8. Lägg till rollstyrning och rättigheter.
9. Migrera historisk data till Supabase.
10. Implementera riktiga grafer.
11. Testa och QA hela rapporten.
12. Förbered go-live med backup och supportplan.

---

**Lycka till – alla detaljer, “kom ihåg”, fallgropar och TODOs finns här!  
Denna brief är din tekniska handbok hela vägen till produktion.**
