# Utvecklingslogg och arbetsbrief – projekt Incheckad rapport/galleri

## **1. Arbetsprinciper & krav från kund (PerIncheckad)**

- **Inga antaganden/gissningar:**  
  Varje kod/förändring utgår alltid från aktuell kodbas. Inget får ändras “på chans” eller baserat på förväntningar.
- **Alltid fråga först:**  
  Allt som påverkar UI, logik, färger, typsnitt, avstånd, etc. måste godkännas av PerIncheckad innan det genomförs.
- **Leverans av hela filer:**  
  Vid kodändring levereras alltid hela, komplett fil för enkel ersättning. Kodsnuttar används endast när kunden begär det.
- **UI-ändringar:**  
  Endast på begäran och alltid efter godkännande. Ingen design eller layout får ändras utan explicit godkännande.

---

## **2. Hittills genomförda steg (2025-10-13)**

### **A. Grundfunktionalitet**
- **Rapportsida (`app/rapport/page.tsx`)**
  - Tabell med skador, sortering, filtrering, export, statistik.
  - Kolumn “Bild/video” med tumnagel (bild/video), modal öppnas vid klick.
  - Kolumn “Anteckning (Intern)” borttagen – endast “Anteckning” visas.
  - Kolumnnamn “Media” ändrat till “Bild/video”.

- **Galleri-komponent**
  - Ursprungligen testad som separat komponent ovanför tabellen; visade sig vara fel UX på rapportsidan, togs bort enligt feedback.

### **B. Modal/galleri**
- **MediaModal-komponent**
  - Kan stängas med Esc och kryss.
  - Bläddringspilar om flera bilder per skada.
  - Lightbox för helskärmsbild.
  - Metadata och anteckning syns under bild.
  - Incheckare syns längst ner i modal.
  - Modal öppnas från tumnagel i tabellen eller via klick på reg.nr (för samtliga skador för den bilen).

### **C. UI/UX**
- **Centrering och layout**
  - Modal: Bild och metadata-blocket centrerade horisontellt i modal, metadata vänsterställd inom blocket.
  - Tumnagel i tabell 50% större än tidigare (nu ca 48x48px).
  - Logga återställd till större storlek, avstånd till rapport/statistik-blocket minskat.
  - Bakgrundsbild och “block” bakom tabellen/transparens: Bakgrundsbild har opacity ~0.19, block bakom tabell har opacity ~0.92.
- **Klockslag**
  - Visas i tabellen och modal endast om data finns. För BUHS-skador (där tid saknas) visas endast datum.
  - Framtida: Särskilj “dokumentationsdatum” (incheckning) och “skadedatum” i UI.

---

## **3. Aktuella punkter att justera/färdigställa**

### **A. Akuta fixar**
- [ ] **Säkerställ att tumnagelkolumnen “Bild/video” alltid visas, med rätt storlek (48x48px).**
- [ ] **När modal öppnas från tumnagel: bläddra mellan alla bilder för just den skadan, visa anteckning för skadan.**
- [ ] **Klockslag:** Visa endast där det finns; för BUHS-skador visas bara datum.
- [ ] **Centrering:** Modal – bild och metadata-blocket ska centreras i modal. Metadata ska vara vänsterställd inom blocket.
- [ ] **Transparens:** Säkerställ att bakgrundsbild och block bakom tabell har rätt opacity (bakgrundsbild ~0.19, block ~0.92).
- [ ] **Logga:** Återställ storlek (minst 220px bredd), minska avståndet till blocket.

### **B. Kommande/förbättringar (“Kom ihåg!”)**
- [ ] **Särskilj “dokumentationsdatum” (incheckning) och “skadedatum”** i UI (både tabell och modal) – viktigt för användarens förståelse.
- [ ] **Stöd för flera bilder/video per skada** – bygg ut datamodellen så att fler mediafiler kan kopplas till varje skada.
- [ ] **Galleri-sida:** Utveckla separat bildfokuserad sida för visuell översikt och bläddring.
- [ ] **Rollstyrning:** Dynamisk hantering av roll (admin, bilkontroll, biluthyrare, incheckare) för rätt visning och behörighet.
- [ ] **Exportfunktion:** Möjliggör export av rapportdata till Excel/CSV.
- [ ] **Filter/sök i galleri och rapport:** Förbättra filtrering, sök och sortering.
- [ ] **Mobilanpassning & responsiv design:** Säkerställ att rapport och modal fungerar på mobil och surfplatta.

---

## **4. Arbetsmetod (för efterträdare)**

1. **All kod utgår från aktuell kodbas – ingen gissning.**
2. **Alla UI-/logikändringar ska alltid fråga och godkännas av PerIncheckad innan genomförande.**
3. **Kund vill alltid ha hela filer för enkel ersättning – aldrig delvis, utom på uttrycklig begäran.**
4. **All dokumentation och “kom ihåg”-punkter ska samlas i `/docs` för att underlätta överlämning.**
5. **Vid osäkerhet: fråga alltid kunden innan du agerar.**

---

## **5. TODO-lista (uppdateras löpande)**

- [ ] **Genomför aktuella fixar enligt punkt 3A ovan.**
- [ ] **Samla förbättringar och “kom ihåg”-punkter i backlog.**
- [ ] **Dokumentera alla beslut och kodändringar i denna logg.**
- [ ] **Informera PerIncheckad om alla större och mindre förändringar innan deploy.**
- [ ] **Vid överlämning: lämna denna logg som brief till nästa utvecklare.**

---

## **6. Kontakt & ansvar**

- **Ansvarig beställare:** PerIncheckad (kund, produktägare, UX-beslutsfattare)
- **Nuvarande utvecklare/assistent:** GitHub Copilot
- **Nästa utvecklare:** Ta del av denna logg och arbeta enligt ovanstående arbetsprinciper!
