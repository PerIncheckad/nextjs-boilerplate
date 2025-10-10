# Projekt: Incheckad.se - Utvecklings- och Designbrief

---

## **Översikt**

Detta dokument är en fullständig och teknisk brief för dig som tar över utvecklingen av incheckad.se (Albarone AB, MABI Syd).  
Här beskrivs både nuvarande status och planerade/förväntade funktioner, designprinciper, datahantering och tester.

---

## **1. Mål och Scope**

- **Syfte:**  
  Digitalisera och effektivisera incheckning, rapportering och skadehantering för hyrbilar inom MABI Syd.
- **Användargrupper:**  
  Incheckare, stationchefer, regionchefer, admin/utvecklare.
- **Kärnflöden:**  
  - Inloggning med Supabase Auth (magisk länk)
  - Incheckning av bil (formulär, skador, bilder, checklistor)
  - Rapport & statistik (skador, incheckningar, filtrering, grafer)
  - Adminfunktioner (framtida)

---

## **2. Teknisk Miljö**

- **Frontend:** Next.js, Typescript, CSS (globals.css), React hooks, SSR.
- **Backend/DB:** Supabase för auth, lagring, buckets (bilder), tabeller (skador, incheckningar, stationsstruktur).
- **Deployment:** Vercel (production), miljövariabler för Supabase-url, anon-key (se Vercel dashboard).
- **Bildhantering:** Supabase Storage Buckets, access via url.

---

## **3. Filstruktur (exempel, se skärmdump!)**

- `/app/page.tsx`                → Startsida, inloggning, knappar.
- `/app/rapport/page.tsx`         → Rapport & Statistik.
- `/app/check/page.tsx`           → Incheckningsflöde.
- `/app/check/form-client.tsx`    → Incheckningsformulär/komponenter.
- `/components/LoginGate.tsx`     → Inloggningsskydd/logik.
- `/app/globals.css`              → All global och sid-specifik CSS.
- `/lib/supabase.ts`              → Supabase-klient.

---

## **4. Nuvarande Designprinciper**

- **Startsida:**  
  - MABI-logga centrerad, luftigt överst.
  - Knappar: Ny incheckning, Fortsätt påbörjad, Rapport. Blocket ska vara centrerat horisontellt men med margin-top så att det hamnar nedanför loggan.
  - Footer med copyright.
- **Inloggning:**  
  - Snygg, centrerad "card" utan logga, med tydliga fält.  
  - Efter e-post, visa "Tack!" och "Du kan nu stänga denna flik."
  - Magisk länk ska ta användare till startsidan `/`.
- **Rapport/Statistik:**  
  - MABI-loggan högt upp, block under.
  - Rapportkortet har rubrik, divider, sammanfattning (vänsterställd).
  - Sammanfattning visar: Totalt incheckningar, Totalt skador, Skadeprocent, Senaste incheckning (med "kl. {klockslag}"), Senaste skada (med "kl. {klockslag}").
  - Filter med två rullgardiner:  
    - **Vald period:** ["Innevarande kalenderår", "Innevarande kalendermånad, År", "Innevarande vecka", "YTD", "Rullande 7 dagar", "Rullande 30 dagar", "Rullande år"]
      - Perioder ska visas i klartext (exempel: "2025", "Oktober 2025", "v. 41, 6–12 okt").
    - **Vald plats:** ["MABI Syd TOTAL", "Region Syd", "Region Mitt", "Region Nord", samt alla huvudstationer enligt tabell]
      - **Huvudstationer** = stationer vars namn börjar med "Huvudstation" (t.ex. "Huvudstation Malmö Jägersro", "Huvudstation Lund", etc.)
      - **OBS:** Aldrig visa "Huvudstation" som text i rullmenyn, bara stationens namn.
  - Sökfält för reg.nr, versaler, med "Sök" och "Rensa".
  - Grafer: Placeholder nu, men period/plats måste framgå tydligt i grafen. (Plan: spara som PNG/PDF.)
  - Tabell:
    - Kolumner: Regnr, Ny/gammal, Datum, Region, Ort, Station, Skada, Kommentar, Anteckning, Media, Godkänd av.
    - "Ny/gammal" (inte "Ny/Gammal") – både rubrik och cell.
    - Datumkolumn bred nog för datum + "kl. {klockslag}" på samma rad.
    - Region/Ort/Station: Platt design, ljusblå (#e4f1fb) på celler, lite mörkare (#cbe4f6) på header.
    - Skada: Svart text, hierarki med pilar.
    - Kommentar: Vänsterställd, brödtext.
    - Godkänd av: Vänsterställd.
    - Allt vertikalt centrerat utom kommentar/brödtext.

---

## **5. Datahantering & Supabase**

- **Tabeller:**  
  - `employees` (email, is_active)
  - `stations` (namn, station_id, huvudstation_id)  
    - **Huvudstationer:** stationer där namn börjar med "Huvudstation".
    - **Region:** Syd/Mitt/Nord (det finns tre regioner!)
    - **Ort:** Ort som stationen tillhör.
  - `checkins` (regnr, datum, klockslag, incheckare/godkänd av, station, ort, region, skador, anteckning, media)
  - `damages` (regnr, skadetyper, position, beskrivning, foto-url, kommentar, godkänd av)
- **Buckets:**  
  - `damage-photos` (bilder per regnr, per station)
- **Miljövariabler i Vercel:**  
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - (Ev. mail/varning-adresser för notify)

---

## **6. Funktionalitet och arbetsordning**

### **Kortsiktiga förbättringar:**
1. **Slutgiltig design på rapporten (se ovan)**
2. **Dynamisk platsmeny utifrån stations-tabellen**
3. **Rätt filtrering/funktion i tabell (period, plats, regnr)**
4. **Grafer med period/plats i klartext**
5. **Exportera graf/tabelldata som PNG/PDF**

### **Långsiktiga förbättringar:**
- **Adminpanel för hantering av stationsstruktur, användare, behörigheter**
- **Avancerad filtrering/sortering direkt i tabell**
- **Automatisk mailutskick till regionchefer vid nya skador**
- **Full historik/loggning av skador per fordon**
- **Integration mot Bilkontroll-fil (matcha regnr, visa "okänt"/"inga skador inlagda")**
- **Mobilvänlig design**
- **Performance-optimering**

---

## **7. Fallgropar & Testning**

- **Filtrering:**  
  - Rätt logik för period/plats (måste matcha tabellens data, inte visa tomma rader)
  - Regnr-sökning: visa tydligt om regnr ej finns eller om inga skador finns
- **Design:**  
  - Färgnyanser och platthet i tabellen (ingen skuggning på celler, rätt blå toner)
  - Vertikal och horisontell centrering
  - Undvik att text/fält radbryts på konstiga ställen
- **Data:**  
  - Huvudstationer korrekt identifierade (enligt stations-tabellen)
  - Tre regioner, inte två!
  - Inga dubbletter i platsmenyn
- **Auth:**  
  - Inloggning måste fungera, magisk länk landar på startsidan
  - "Tack!" och "Du kan nu stänga denna flik." syns efter inloggning
- **Testning:**  
  - UI-test: alla kolumner syns korrekt, ingen extra padding, rätt färg och alignment
  - Funktionstest: filtrering/rullmenyer/sök fungerar som förväntat
  - Export: graf/tabelldata kan laddas ned som PNG/PDF (när klart)
  - API-test mot Supabase: rätt data hämtas och visas

---

## **8. Att tänka på för vidareutveckling**

- **All kod ska vara modulär och tydligt kommenterad**
- **Behåll nuvarande designprinciper, men var beredd på att ta emot nya skärmdumpar/instruktioner**
- **Testa alltid mot produktion på Vercel innan deploy**
- **Var noga med att inte råka ta bort fungerande kod vid CSS-ändringar**
- **Kommunicera tydligt om någon design eller datafråga är oklar innan arbete påbörjas**
- **Dokumentera alla större ändringar och beslut i en dev-logg**

---

## **9. "Påminn mig"/"Kanske senare"/Funderingar**

**Se även appendix.md!**  
Här är alla punkter som är “påminn mig”, “kanske senare”, “jag funderar på”, osv (se detaljerad lista i appendix):

- Export av grafer/tabelldata som PNG/PDF (med tydlig period/plats)
- Avancerad filtrering/sortering i tabell
- Mobilvänlig design och testning
- Adminpanel för datamodell/roller
- Automatiska mail/varningar vid skador/incheckningar
- Integration med Bilkontroll-fil (matcha regnr, visa status)
- Full historik/loggning av skador per fordon/station
- Performance-optimering med thumbnails/bucket-struktur
- Visa bild/video-metadata vid hovring
- “Bränna in” metadata i bilder (vid export/server-side)
- Roller/behörighetsstyrning för olika användare
- Dev-logg och dokumentationsfil
- Feedback/support i appen

---

**Dagens datum: 2025-10-10**