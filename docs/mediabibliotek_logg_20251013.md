# INcheckad.se - Mediabibliotek/Galleri/Modal - Logg & Designbeslut
**Dokumenterad av Copilot och PerIncheckad, 2025-10-13**

---

## Syfte
Detta dokument sammanfattar alla beslut, krav, designval och speciallogik kring mediabibliotek/galleri/modalen i INcheckad.se-projektet (MABI Syd).  
Syftet är att ge full transparens och teknisk detaljnivå för nuvarande och framtida utvecklare/bottar.

---

## Funktionalitet & Flöde
### Mediabibliotek/galleri/modalen:
- Visning:
  - En skada i taget visas i modalen/galleriet.
  - Användaren kan bläddra mellan “Senaste skada/skador” och “Historiska skador” via pilar eller lista.
  - För varje skada visas:
    - Alla bilder/video som laddats upp via formuläret för just denna skada.
    - Metadata under varje bild/video:  
      **[reg.nr], tidpunkt, skadekategori, station** (i exakt denna ordning).
    - Samma metadata visas som tooltip vid hovring (för extra pedagogik).
  - Rubriker:
    - Senaste skada:  
      “[reg.nr] - Senaste skada: [skadetyp] - [skadedatum]”
    - Historiska skador:  
      “[reg.nr] - [skadetyp] - [skadedatum]”
  - Miniatyrer/tumnaglar ska vara minst 50% större än nuvarande version.
- Skadefri incheckning:
  - Modal visas med texten “Inga bilder/skador.” (ingen symbol eller bock behövs).
- Rollstyrning:
  - Admin/bilkontroll: Full tillgång, kan bläddra genom alla skador (senaste + historiska) för varje reg.nr.
  - Biluthyrare: Kan endast se skador för det reg.nr som länken i mejlet avser, inte bläddra mellan reg.nr.
  - Incheckare: Har inte tillgång till galleriet.  
    - Men: Fundering/önskemål finns att incheckare ska kunna se bilder på befintliga skador i formuläret, för jämförelse vid inspektion. (Ska utredas och designas separat.)

---
## Speciallogik & Edge Cases
- BUHS:
  - Ingen BUHS-bild kommer att importeras eller visas i galleriet.
  - BUHS används endast som markering för skador som finns i centrala systemet men ännu ej dokumenterats via vårt formulär.
  - När en skada dokumenteras via formuläret, byter den status från “Finns endast i BUHS” till “Befintlig skada” och visas med vår metadata och bild(er).
- Metadata “bränning”:
  - Vid eventuell framtida export/download av bild ska metadata (reg.nr, tidpunkt, skadekategori, station) “brännas in” på bilden, tydligt och läsbart.
  - Denna funktion är inte en del av första versionen av mediabiblioteket, men är dokumenterad som önskemål.
- Rubriker och ordning:
  - Metadata och rubrik alltid på svenska, alltid tydligt kopplad till aktuell skada och reg.nr.
- Exportfunktion:
  - Ingen exportfunktion för bilder i galleriet/modalen (användare kan spara via högerklick).
  - Exportfunktion ska byggas för grafer/tabellvyn.

---
## UI/UX-principer
- Enkelhet:
  - UI ska vara så enkelt och logiskt som möjligt.
  - Det ska alltid vara tydligt vilket reg.nr och vilken skada som visas.
  - Bläddring mellan skador och bilder sker intuitivt, med pilar/lista.
- Visuell feedback:
  - Sorteringslogik i tabellen ska göras om, med visuellt tydlig markering av vald sortering (t.ex. ikon, färg på rubrik).
- Responsivitet:
  - Galleri/modal ska fungera på både desktop och mobil.
- Pedagogik:
  - Metadata både under bild och som tooltip.

---
## Plan framåt (tekniska steg)
1. Bygg UI-komponenter för modal/galleri:
   - Modal öppnas direkt vid klick på bild/video i tabellen.
   - En skada i taget visas, med full metadata och bild(er).
   - Tydliga rubriker (“Senaste skada”, “Historiska skador”) med skadedatum.
   - Tumnaglar minst 50% större.
2. Implementera bläddring mellan skador:
   - För admin/bilkontroll: bläddra mellan alla skador för reg.nr.
   - För biluthyrare: visa endast skador för aktuellt reg.nr (via länk).
3. Implementera metadata-visning:
   - Metadata under varje bild/video och som tooltip vid hovring.
4. Hantera skadefri incheckning:
   - Modal visar texten “Inga bilder/skador.”
5. Se över sortering i tabellen:
   - Gör sortering tydligt markerad visuellt.
6. Dokumentera och utvärdera incheckares ev. rätt att se bilder på befintliga skador i formuläret.
7. Testa och QA:
   - Testa galleri/modal på både desktop och mobil.
   - QA enligt edge-case-lista.
8. Planera och dokumentera “metadata-bränning” för framtida export/download av bilder.

---
## Kommentarer
- Alla punkter ovan är förankrade med PerIncheckad och dokumenterade för framtida utvecklare/bottar.
- Vid minsta osäkerhet kring flöde, design eller specialfall ska bot/utvecklare fråga Per innan implementation.
- Denna logg kompletterar övriga dokument i /docs och är “source of truth” för mediabibliotek/galleri/modalen tills vidare.

---
Senast uppdaterad: 2025-10-13  
Kontakt: PerIncheckad / Copilot