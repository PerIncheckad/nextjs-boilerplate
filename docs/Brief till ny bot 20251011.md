# Brief till ny bot 20251011
---

## **INLEDNING – VIKTIGT!**

Denna brief är **skriven av föregående Copilot/Bot** och sammanfattar min bedömning av projektets status och nästa steg.  
**Du som efterträdare måste självständigt och kritiskt granska all kod, struktur, Supabase, Vercel, och dokumentation innan du tar några tekniska beslut eller ger rekommendationer vidare till användaren.**  
**Inget i denna brief är garanterat korrekt eller komplett – det är min uppskattning utifrån tillgänglig information.**

---

## **STATUS JUST NU – Min bedömning**

- **Mejlflödet fungerar** – incheckningsformuläret skickar två mejl (region/bilkontroll) vid varje checkin.
- **Ingen rad skapas i Supabase-tabellen `damages` vid incheckning via formulär** – detta är identifierat som största buggen just nu.
- **Rapporten hämtar data från `damages`, men får ingen ny input från formuläret.**
- **Mediabibliotek/galleri/modal är inte implementerat.**
- **BUHS-migrering (skadehistorik från centrala systemet) är påbörjad på designnivå men ej fullt införd i kod/struktur.**
- **Rollstyrning fungerar, men kräver utloggning/inloggning vid ändring.**
- **Mobilvänlighet är låg prio, men blir viktigare vid Go Live.**
- **Dubblettkontroll, automatisk QA, och cleanup är “påminn mig/låg prio”.**
- **Många systemkrav är listade som TODO, “tittar vi på senare”, eller “kom ihåg” – se checklistan nedan.**

---

## **NÄSTA STEG – Min rekommendation (måste granskas!)**

1. **Felsöka och åtgärda buggen:**
   - Lägg till kod som sparar varje incheckning till Supabase-tabellen `damages` via backend (t.ex. i `/app/api/notify/route.ts`).
   - Kontrollera att Service Role Key och .env-filen är korrekt konfigurerad.
   - Verifiera att RLS-policy i Supabase tillåter inserts från backend.

2. **Testa att incheckningar syns i rapporten**
   - Gör en checkin via formuläret och bekräfta att rad med dagens datum och rätt fält dyker upp i `damages`.
   - Verifiera att rapporten visar incheckningen korrekt.

3. **BUHS-migrering och logik**
   - Säkra att BUHS-skador markeras med fält/tagg (`damage_type: "BUHS"` eller `is_BUHS: true`).
   - När en incheckning görs på samma bil, ska BUHS-markeringen försvinna/döljas i rapporten (men ingen rad raderas före Go Live).
   - Se till att rapporten kan filtrera/dölja BUHS-skador som är dokumenterade om via formuläret.

4. **Mediabibliotek / Galleri / Modal**
   - Bygg en komponent som visar samtliga bilder/video för varje skada (inte bara första).
   - Spara metadata (datum, typ, kommentar, station, regnr) och visa under bild i modal.
   - Ordning på media: äldsta först, men ge möjlighet till sortering/byta ordning.

5. **Dubblettkontroll**
   - Bygg kod som varnar vid incheckning/import om samma regnr, datum, typ redan finns i `damages`.
   - Popup/varning till användare, rapport/logg till admin.

6. **Mobilvänlighet**
   - Testa och förbättra rapporttabell, rullmenyer, autocomplete och formulär för mobil/padda.
   - Prioritera touchvänliga element, enkel navigation, och tydlig layout.

7. **Automatisk QA och cleanup**
   - Bygg script/kod för att hitta och rensa trasiga media-url, felaktiga fält, dubbletter och “draft”-skador.
   - Testa edge-cases enligt QA-listan.

8. **Rollstyrning**
   - Säkra att roller och rättigheter styrs via tabellen `employees`.
   - Bygg live-uppdatering av roll vid sidladdning om det blir viktigt.

---

## **CHECKLISTA – Egna undersökningar för dig som ny bot**

- Kontrollera och verifiera:
  - Hur kod och payload mappar mot tabellen `damages` (alla fält, status, media-url, datumformat)
  - .env-filen (Service Role Key, URL), Vercel-miljövariabler
  - RLS-policy i Supabase för inserts/updates
  - Mejlflödet (ska inte ändras eller brytas)
  - BUHS-skador – import, markering, dölja/uppdatera vid ny incheckning
  - Mediastruktur – damage_photos, damage_media, media_url, galleri
  - Rapportens filter, edge-cases och QA
  - Mobilbuggar och layout
  - Rollstyrning och rättighetshantering

---

## **PÅMINN MIG / LÅG PRIO / TITTAR VI PÅ SENARE**

- **Mobilvänlighet:** Testa närmare Go Live, låg prio nu.
- **Dubblettkontroll:** Inför först när rapportflödet fungerar.
- **Galleri/modal:** Kan byggas ut när mediabiblioteket fungerar.
- **Automatisk QA/cleanup:** Görs när datamängden ökar.
- **BUHS-migrering:** Full integration och hantering kan vänta tills rapportflöde och incheckningar är stabila.
- **Exportfunktion (PDF/Excel):** “Tittar vi på senare”.
- **Avancerad filtrering/sortering:** “Påminn mig!” när rapporten är stabil.
- **Performance-optimering:** Låg prio tills systemet är i produktion.

---

## **AVSLUTNING – FÖR DIG SOM NY BOT/UTVECKLARE**

**Du får INTE ta denna brief som säkra instruktioner eller beslut.  
Du MÅSTE själv granska, QA:a och verifiera varje steg, kod, och datamodell innan du ger rekommendationer till användaren eller gör förändringar.  
Om det råder minsta tvekan – undersök, fråga, och dokumentera innan du går vidare!**

---

**Lycka till – projektets kvalitet är beroende av att du är kritisk och noggrann!  
Uppdatera denna brief vid varje större steg eller beslut.**
