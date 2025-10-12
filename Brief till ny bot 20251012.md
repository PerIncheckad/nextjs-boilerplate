# Systembrief: Incheckad / MABI Syd – Status, kodstruktur och roadmap

## Sammanfattning av projektstatus (2025-10-12)

Den här briefen sammanfattar all teknisk funktionalitet, struktur, speciallogik och kosmetiska önskemål i projektet. Den är avsedd att användas av en bot eller utvecklare som tar över – och ska ge full insyn i nuvarande läge, historik, och plan framåt.

---

## Arkitektur & Teknik

- **Frontend:** Next.js (React)
- **Backend/API:** Next.js API routes (`/app/api/notify/route.ts`)
- **Databas:** Supabase (PostgreSQL)
- **Auth & Hosting:** Vercel
- **Mail:** Resend (transaktionsmail)
- **Rapportering:** `/app/rapport/page.tsx` visar statistik och rapporttabell

---

## Viktig kodstruktur

### API: Incheckning och skador (`/app/api/notify/route.ts`)
- Tar emot payload från formulär.
- Skickar två mail (region, bilkontroll) via Resend.
- Sparar varje incheckning/skada till Supabase-tabellen `damages` med korrekt fältmappning.
- Fältet `notering` används för den generella kommentaren från längst ner i formuläret.

### Supabase: Tabellstruktur

Viktiga kolumner i `damages`:
- `regnr`, `damage_date`, `region`, `ort`, `station_namn`, `damage_type`, `car_part`, `position`, `description`, `status`, `inchecker_name`, `media_url`, `notering` (generell kommentar), `created_at`, `updated_at`, `saludatum`, `damage_type_raw`, `note_internal` m.fl.

- **Notera:** Endast `notering` (generell kommentar) ska synas direkt i rapporttabellen. Specifika skade-kommentarer hör till detaljvy/modal.

### Rapport/Statistik (`/app/rapport/page.tsx`)
- Hämtar och visar skador från Supabase.
- Sorterar default på skadedatum (senaste överst), alla kolumner är sorteringsbara.
- Sök/autocomplete för reg.nr, döljs automatiskt vid vald reg.nr.
- Kolumner: Regnr, Ny/gammal, Datum, Region, Ort, Station, Skada, **Anteckning** (från längst ner i formuläret), Media, Godkänd av.
- Kolumnen "Anteckning (intern)" ska inte synas i tabellen.
- BUHS-logik: Om skadan kommer från BUHS (inte via formulär) visas texten "Detta är info från BUHS. Ännu ej dokumenterad i formuläret." i kolumnen Ny/gammal. Så fort skadan hanteras via formulär byts detta till "Ny" eller "Gammal" enligt saludatum/skadedatum.
- Kommentar per skada visas endast i detaljvy/modal (ej i tabellen).

---

## Speciallogik / Hantering av klurigheter

- **Region-fält:** Mappas alltid till "Syd", "Mitt" eller "Norr" enligt stationsdata. Aldrig ortens namn!
- **Insert till Supabase:** Se till att rätt fältnamn används och att kolumner finns skapade.
- **Schema-cache:** Vid ändringar i Supabase-tabellen, kan API:et behöva några minuter innan den känner av nya kolumner.
- **Felhantering:** Loggar till Vercel för debug, t.ex. vid insert-fel eller felaktig payload.
- **Dark mode i mail:** Mejlen är nu svåra att läsa i dark mode. Tidigare fungerade detta med "hård" CSS. Detta ska fixas – kom ihåg att stämma av med Per innan deploy.
- **Kosmetiska önskemål:** 
  - Luft ovanför logga och mellan block och copyright.
  - Bakgrundsbilden på rapportsidan ska ha samma inställning som startsidan, med aningen mindre transparens. Rapportblocket ska vara ljusgrått med marginell transparens, så att blocket syns tydligt mot bakgrunden.
  - Avståndet mellan loggan och rapport/statistik-blocket ska minskas något vid tillfälle.
  - Rubrik: "Ny/gammal" (inte "Ny/Gammal").
  - BUHS-logik enligt ovan.

---

## Kommande steg / Roadmap

1. **Galleri/Modal för skada/media:** Visa och bläddra bland bilder/video för varje skada i rapporten. Miniatyr visas i tabell, modal öppnas vid klick.
2. **Designfixar:** Se kosmetiska önskemål ovan.
3. **Mail dark mode:** Återställ/förbättra CSS för att mejlen alltid är läsbara, även i dark mode. Konsultera tidigare kod om osäker.
4. **Detaljvy/modal:** Visa skade-kommentarer, metadata och media per skada.
5. **Fälthantering:** Vid framtida schemaändringar, synka kod och Supabase-tabell, och invänta schema-cache.
6. **Rapportfunktioner:** Lägg till tidslinje/graf, skadeprocentjämförelse, exportfunktion etc.

---

## Potentiella fallgropar

- Felaktig mapping av region/skadetyp/kommentar kan leda till missvisande statistik.
- Saknade kolumner i Supabase leder till insert-fel (se loggar).
- Gör alltid schemaändringar i Supabase innan kodändringar som använder nya fält.
- Kontrollera alltid att dark mode i mail är korrekt – test både ljust och mörkt.
- Synka UI-fixar med Per innan deploy – små ändringar kan ha stor påverkan på användarupplevelse.

---

## Kontakt och kommunikation

- Per är produktägare och har sista ordet kring UI/UX, funktionalitet och stabilitet.
- Önskemål, kosmetiska fixar och speciallogik ska alltid stämmas av med Per före deploy.
- All kod, data och roadmap finns i detta repo och i denna brief.

---

## Kom-ihåg / TODO

- Galleri/modal för bild och media.
- Luft och transparens i UI (bakgrund och rapportblock).
- Dark mode i mail.
- BUHS-logik och status i tabell.
- Rapportfunktioner och export.
- Synka kod och schema vid ändringar.
- Stäm av med Per före deploy.

---

**Denna brief är komplett till och med 2025-10-12. Läs alltid denna och chatthistoriken innan du tar över projektet!**