# Teknisk Dokumentation: E-postnotiser vid Incheckning

**Datum:** 2025-10-23
**Författare:** GitHub Copilot
**Ämne:** Beskrivning av arbetsflödet för e-postnotiser från incheckningsformuläret.

## 1. Översikt

Detta dokument beskriver den tekniska implementationen för hur e-postnotiser genereras och skickas när en användare slutför en incheckning av ett fordon. Syftet är att ge en tydlig bild av dataflödet, vilka komponenter som är inblandade och vilka vanliga fallgropar som bör undvikas vid framtida underhåll eller vidareutveckling.

Systemet är byggt kring två kärnkomponenter:
1.  **`app/check/form-client.tsx`**: Ett React-formulär (klient-sida) som samlar in all data.
2.  **`app/api/notify/route.ts`**: En Next.js API-route (server-sida) som tar emot datan, bygger e-postmeddelanden och skickar dem med [Resend](https://resend.com/).

## 2. Dataflöde och Komponenternas Ansvar

Arbetsflödet är linjärt och kan beskrivas i tre steg: Insamling, Paketering och Leverans.

### Steg 1: Insamling (`form-client.tsx`)

-   **Ansvar:** Att samla in all information från användaren via olika fält, val och checklistor.
-   **Logik:** All data lagras i React `useState`-variabler. En `useMemo`-hook, `finalPayloadForUI`, aggregerar kontinuerligt all state till ett stort, nästlat JSON-objekt. Denna nästlade struktur är logiskt organiserad (t.ex. all rekond-data under ett `rekond`-objekt, all skadedata under `damages`, etc.).

### Steg 2: Paketering (`form-client.tsx`)

-   **Ansvar:** Att paketera det insamlade dataobjektet för att skickas till API:et.
-   **Logik:** När användaren klickar på "Slutför incheckning" anropas funktionen `confirmAndSubmit`. Denna funktion gör följande:
    1.  Den tar det färdiga `finalPayloadForUI`-objektet.
    2.  Den slår in detta objekt i ett "kuvert" som API:et förväntar sig. Strukturen på detta "kuvert" är **den definierade datakontrakten** mellan frontend och backend:
        ```typescript
        const requestBody = {
          region: 'Syd', // Eller annan region
          subjectBase: 'XJA61K - Malmö / Ford Malmö', // Dynamiskt ämne
          meta: finalPayloadForUI // Hela det nästlade dataobjektet
        };

        notifyCheckin(requestBody); // Skickar till API:et
        ```

### Steg 3: Leverans (`route.ts`)

-   **Ansvar:** Att ta emot datapaketet, bygga HTML för två separata e-postmeddelanden (Huvudstation och Bilkontroll) och skicka dem.
-   **Logik:**
    1.  `POST`-funktionen i `route.ts` tar emot `requestBody`.
    2.  Den packar upp paketet: `const { meta: payload, subjectBase, region } = fullRequestPayload;`. Variabeln `payload` innehåller nu hela den nästlade datastrukturen från formuläret.
    3.  **Viktigt:** API:et förlitar sig **direkt** på den nästlade strukturen. Det finns ingen "adapter" eller översättningslogik.
    4.  Funktionerna `buildHuvudstationEmail(payload, ...)` och `buildBilkontrollEmail(payload, ...)` anropas. Inuti dessa funktioner hämtas data direkt från den nästlade strukturen, t.ex. `payload.varningslampa.lyser` eller `payload.rekond.behoverRekond`.
    5.  De färdiga HTML-strängarna skickas med `resend.emails.send()`.
    6.  `Promise.all()` används för att säkerställa att servern inväntar att alla e-postanrop har slutförts.

## 3. Fallgropar och Bästa praxis (LÄS DETTA FÖRE ÄNDRING)

Historiskt sett har de flesta problemen i detta system uppstått på grund av en osynk mellan datastrukturen som skickas från `form-client.tsx` och den struktur som `route.ts` förväntar sig.

### Fallgrop #1: Det Tysta Felet (Den Gyllene Regeln)

**Den gyllene regeln är: Datakontraktet mellan `form-client.tsx` och `app/api/notify/route.ts` måste alltid vara synkroniserat.**

Om du ändrar ett fältnamn i `finalPayloadForUI` i `form-client.tsx`, **måste** du omedelbart uppdatera `build...Email`-funktionerna i `route.ts` för att reflektera denna ändring.

**Exempel på vad som gick fel tidigare:**
-   I formuläret ändrades `varningslampa` från att vara `true/false` till att vara ett objekt: `{ lyser: true, beskrivning: '...' }`.
-   API:et uppdaterades inte och försökte fortfarande läsa den gamla, platta egenskapen `payload.varningslampa`.
-   Resultatet blev `undefined`. Detta orsakade ingen serverkrasch. Istället skapades ett e-postmeddelande med tomma fält, vilket Resend (eller e-postklienter) ignorerade eller filtrerade bort. **Felet var helt tyst.**

**Felsökningstips:**
Om e-post slutar fungera, gör följande:
1.  Gå till `app/api/notify/route.ts`.
2.  Högst upp i `POST`-funktionen, lägg till: `console.log(JSON.stringify(fullRequestPayload, null, 2));`
3.  Gör en ny incheckning i formuläret.
4.  Kontrollera serverloggarna (t.ex. i Vercel). Jämför den loggade JSON-strukturen med den data som `buildHuvudstationEmail` och `buildBilkontrollEmail` försöker läsa. Eventuella avvikelser är orsaken till felet.

### Fallgrop #2: Mapp- och filnamn (`slugify`)

-   **Problem:** Filnamn och undermappar för uppladdade bilder skapades med gemener, trots att registreringsnumret var i versaler.
-   **Orsak:** Funktionen `slugify` i `form-client.tsx` användes för att skapa sökvägs-säkra strängar. Denna funktion konverterar allt till gemener som en del av sin process. När hela mapp- eller filnamnet (inklusive reg.nr) kördes genom `slugify`, blev allt gemener.
-   **Lösning:** I `confirmAndSubmit`-funktionen används nu `normalizedReg` (som redan är i versaler) direkt vid konstruktion av sökvägar. `slugify` används endast på de delar av namnet som innehåller fritext (t.ex. skadetyp eller incheckarens namn) för att undvika ogiltiga tecken. Var medveten om detta om du ändrar logiken för filnamn.

### Sammanfattning för framtida utvecklare

Varje gång du:
-   **Lägger till ett nytt fält** i formuläret som ska inkluderas i mejlen...
-   **Byter namn på ett fält** i `finalPayloadForUI`...
-   **Ändrar datatypen** för ett fält (t.ex. från boolean till objekt)...

...**måste du omedelbart öppna `app/api/notify/route.ts` och uppdatera e-postbyggarna (`buildHuvudstationEmail` och `buildBilkontrollEmail`) så att de matchar den nya strukturen.** Om du inte gör det är risken stor att e-postleveransen tyst slutar fungera.
