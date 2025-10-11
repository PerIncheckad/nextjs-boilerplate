# Svar: Spara till Supabase damages, behörigheter, BUHS-logik

---

## **1. Lägga till kod för att spara en rad i tabellen damages vid incheckning**

- **Du kan lägga till en explicit insert med Supabase JS SDK** – det finns ingen generell helper-funktion, men du kan skapa en om du vill.
    - Exempel (i /app/check/page.tsx eller valfri backend):
      ```typescript
      import { createClient } from '@supabase/supabase-js'
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      await supabase.from('damages').insert({
        regnr: payload.regnr,
        damage_type: payload.damage_type,
        damage_date: payload.damage_date,
        media_url: payload.media_url,
        status: "complete",
        // ...övriga fält
      })
      ```
- **Obligatoriska fält för rapporten ska fungera:**
    - `regnr` (registreringsnummer)
    - `damage_type` (t.ex. "BUHS", "buckla", "repig", etc)
    - `damage_date` (ISO-format, t.ex. "2025-10-11T12:34:56.000Z")
    - `status` ("complete" för att synas i rapporten)
    - `media_url` (om bild finns, annars null)
    - Övriga fält som används i rapporten: kommentar, anteckning, station_id, region, etc.
- **Mappning:**  
    - Mappar payload-fält till samma namn i damages:
      ```typescript
      {
        regnr: payload.regnr,
        damage_type: payload.damage_type,
        damage_date: payload.damage_date,
        media_url: payload.media_url,
        status: payload.status || "complete",
        // ...
      }
      ```
- **Tänk på:**
    - Sätt alltid `status` till `"complete"` om du vill att raden ska synas i rapporten direkt.
    - Sätt `media_url` till första bildens url om du har bilder.
    - Var noga med tidzon/ISO-format på datum (`damage_date`). Använd t.ex. `new Date().toISOString()`.
    - Ingen kodändring behövs i mejlflödet `/app/api/notify/route.ts` om du bara vill lägga till inserts till Supabase.

---

## **2. Skriva till Supabase från backend**

- **Du måste använda Supabase Service Role Key** (privilegierad nyckel för inserts/updates från backend).
    - Sätt i `.env.local` (lokalt) och i Vercel/Netlify som miljövariabel.
- **Om du har tillgång till projektet/Vercel:**  
    - Kolla i Vercel "Environment Variables" – oftast finns redan `SUPABASE_SERVICE_ROLE_KEY` och `SUPABASE_URL`.
    - Om inte, be projektägaren om nyckeln (finns i Supabase-projektet under Settings → API → Service Role Key).
- **.env-fil ska innehålla:**
    ```
    SUPABASE_URL=https://<din-projekt-id>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJ...
    ```
    - **OBS:** Service Role Key ska ALDRIG finnas i frontend-koden, bara backend!

---

## **3. “Permission denied” eller “RLS policy” fel**

- **Om du får “Permission denied” eller “RLS policy” error:**
    - Det betyder att Row Level Security (RLS) i Supabase blockerar insert/update.
    - **Du måste antingen:**
        - Logga in som admin med Service Role Key.
        - Ändra RLS-policy i Supabase (under Table → Security → Policies).
    - **Råd:**  
        - Kolla om du använder rätt nyckel i backend.
        - Se Supabase dashboard → Table → Policies för tabellen `damages`.
    - **För att se om inserts går igenom:**
        - Testa direkt i Supabase SQL editor eller via kod.
        - Verifiera i dashboard att raden dyker upp.

---

## **4. Spara “clean” incheckningar (inga skador)**

- **Ja, du kan spara en rad i damages även om ingen skada finns** (t.ex. “clean” incheckning).
    - Sätt t.ex. `damage_type: "clean"` eller liknande och ev. en kommentar (“Inga skador”).
    - **Sådana rader syns i rapporten** och kan användas för statistik.
    - Det är ofta önskvärt att ha dem med för att visa “skadefri” incheckning.

---

## **5. BUHS-logik (Biluthyrarens Skadeanmälan)**

- **BUHS-skador** ska markeras med ett eget fält, t.ex. `damage_type: "BUHS"` eller en tagg/boolean `is_BUHS: true`.
- **Vid import:**  
    - Sätt `damage_type: "BUHS"` eller `is_BUHS: true` på BUHS-skador.
- **När en incheckning görs på samma bil:**
    - **BUHS-markeringen ska försvinna när en ny incheckning är skapad och godkänd/skadan är åtgärdad.**
        - Du kan antingen:
            - Uppdatera raden i Supabase (`is_BUHS: false`) eller
            - Dölja raden i rapporten (filtrera bort `is_BUHS: true` om det finns en ny incheckning med samma regnr).
            - Alternativt skapa en ny rad och sätta BUHS till “false” på den gamla.
- **Rekommendation:**  
    - Hantera BUHS som en egen fält/tagg i damages.
    - Vid incheckning på samma regnr, loopa igenom BUHS-skador och antingen uppdatera/dölja dem.

---

**Säg till om du vill ha kodexempel för insert/update för BUHS, RLS-policy eller media!**
