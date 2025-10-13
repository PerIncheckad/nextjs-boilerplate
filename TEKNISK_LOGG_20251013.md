# Teknisk Logg & Arkitekturbeslut - 2025-10-13

Detta dokument sammanfattar tekniska slutsatser, arkitekturbeslut och kodningsplaner som fastställdes den 2025-10-13. Syftet är att skapa en tydlig och framtidssäkrad referenspunkt för projektets vidare utveckling.

## 1. Layout och Styling för Rapport-sidan

- **Slutsats:** All huvudsaklig layout och styling för rapportsidan (`/app/rapport`) är centraliserad i filen `app/rapport/page.tsx`.
- **Teknisk implementation:**
    - Justeringar av sidans bakgrund (transparens, färg), den vita "kort"-komponenten som omger tabellen, samt avstånd mellan logotyp och rubriker ska göras i `<style jsx global>`-blocket i `app/rapport/page.tsx`.
    - Specifika CSS-klasser att justera är bland annat `.background-img`, `.rapport-card` och `.rapport-logo-centered`.

## 2. Arkitekturbeslut: Hantering av Skadestatus ("Ny/gammal")

- **Problem:** Logiken för att avgöra om en skada är "Ny", "Gammal (från BUHS)" eller "Endast i BUHS (ej dokumenterad)" är komplex och kan leda till bräcklig kod om den beräknas "i farten".
- **Beslut:** En ny kolumn, förslagsvis med namnet `damage_status`, ska läggas till i `damages`-tabellen i Supabase.
- **Teknisk implementation:**
    - Kolumnen `damage_status` ska vara av typen `TEXT` och kan anta ett av följande tre värden:
        1.  `'buhs_pending'`: För en skada importerad från BUHS som ännu **inte** har dokumenterats manuellt i formuläret. **Visas som: "Endast i BUHS"**.
        2.  `'buhs_documented'`: För en BUHS-skada som **har** dokumenterats manuellt. **Visas som: "Gammal"**.
        3.  `'new'`: För en helt ny skada som skapats direkt i formuläret. **Visas som: "Ny"**.
    - **Motivering:** Detta skapar en "single source of truth" för skadans livscykel, vilket gör koden robust, underhållbar, performant och enkel att bygga vidare på (t.ex. för filtrering och statistik).
    - **Åtgärd:** Backend-logiken för formuläret måste uppdateras för att sätta korrekt status när en skada sparas.

## 3. Buggfix: Felaktigt klockslag i Media-modalen

- **Problem:** All media i modalen visar klockslaget `02:00`.
- **Slutsats:** Felet beror på en felaktig tidszonskonvertering. Supabase lagrar tidsstämplar i UTC. När JavaScript-funktionen `toLocaleTimeString()` anropas i svensk tidszon (UTC+1/UTC+2) konverteras midnatt (00:00 UTC) felaktigt.
- **Teknisk lösning:** Vid formatering av datum/tid från Supabase måste tidszonsinformationen hanteras korrekt. Detta kan göras genom att antingen explicit ange tidszon eller använda ett bibliotek som `date-fns-tz` för mer robust hantering. Logik ska även säkerställa att klockslag döljs för skador där det inte är relevant (t.ex. `buhs_pending`-skador).

## 4. Datamappning och korrigeringar för Rapport-tabellen

### 4.1. Kolumnstruktur
Tabellen i `RapportTable.tsx` ska renderas med följande kolumner och datakällor:

| Kolumnrubrik | Datakälla (`damages`-tabellen) | Notering |
| :--- | :--- | :--- |
| `Regnr` | `regnr` | |
| `Ny/gammal` | `damage_status` (ny kolumn) | Se avsnitt 2. |
| `Datum` | `damage_date` | |
| `Region` | `ort` | Se punkt 4.2 nedan. |
| `Ort` | `ort` | |
| `Station` | `station_namn` | |
| `Skada` | `damage_type_raw` | |
| `Anteckning` | `notering` | Ska ej ändras. |
| `Bild/video` | `damage_media` (första bilden) | Tumnagel som återinförs. |

### 4.2. Datakorrigering för "Region"
- **Problem:** Fältet `damages.region` i databasen innehåller felaktig data (ortsnamn istället för regionnamn).
- **Lösning:** En "översättningsfunktion" (`mapOrtToRegion`) ska implementeras på klient-sidan.
- **Teknisk implementation:**
    - Funktionen ska mappa ett `ort`-namn till korrekt region (`Syd`, `Mitt`, `Norr`).
    - Källan för denna mappningslogik har identifierats i filen `app/check/page.tsx` och ska återanvändas.

## 5. Datamappning för Media-modalen (`MediaModal.tsx`)
- **Slutsats:** En mappningsfunktion (`mapToMediaItem`) krävs för att transformera data från Supabase (`damages` och `damage_media`) till det format som `MediaModal`-komponenten förväntar sig.
- **Teknisk implementation:**

  ```typescript
  // Exempel på mappningslogik
  function mapToMediaItem(damage: Damage, media: SupabaseMedia): MediaItem {
    return {
      url: media.media_url,
      type: media.media_type,
      metadata: {
        // ... (mappning enligt tidigare specifikation)
        damageType: damage.damage_type_raw || "--",
        station: damage.station_namn || damage.station_id || "--",
        damageDate: damage.damage_date ? new Date(damage.damage_date).toLocaleDateString("sv-SE") : undefined,
        // etc.
      }
    };
  }
  ```

---
*Detta dokument ska ses som den gällande tekniska planen från och med 2025-10-13.*