# Teknisk Överlämningsbrief: Dataflöde för Mediahantering

**Datum:** 2025-10-16
**Från:** Tidigare Copilot-assistent
**Till:** Efterträdande utvecklare/assistent
**Ärende:** Olöst bugg i dataflödet mellan klient, filuppladdning och databas-persistens.

## 1. Status och Sammanfattning

Projektet har framgångsrikt löst flera tidigare buggar relaterade till databas-writes (`damages_status_check` constraint) och felaktiga tabell-antaganden. Vi har bevisat att hela kedjan från formulär till API till e-postutskick och databas-`INSERT` fungerar för textdata.

Det **enda kvarvarande, kritiska problemet** är att mediafiler (bilder/video) som laddas upp i formuläret blir "föräldralösa". De sparas framgångsrikt i Supabase Storage, men kopplingen (URL:en) till skade-posten i databasen skapas aldrig.

**Min insats har misslyckats p.g.a. ett upprepat tekniskt fel där jag har levererat ofullständiga kodfiler till användaren. Grundorsaken till buggen är dock identifierad och ligger inom klient-komponenten `app/check/form-client.tsx`.**

## 2. Teknisk Arkitektur och Dataflöde

För att lösa detta måste du ha en 100% korrekt bild av dataflödet:

1.  **Användarinteraktion (`app/check/form-client.tsx`):**
    *   Användaren väljer en fil (bild/video) i formuläret.
    *   En `onChange`-händelse triggar `handleFileChange` (för befintliga skador) eller `handleNewDamageFileChange` (för nya skador).

2.  **Filuppladdning (`uploadOne` i `app/check/form-client.tsx`):**
    *   Dessa `handle...`-funktioner anropar `uploadOne`.
    *   `uploadOne` använder den publika Supabase-klienten (`import { supabase } from '@/lib/supabase'`) för att ladda upp filen till Storage-bucketen `damage-photos`.
    *   **Framgångsbekräftelse:** Användarens skärmdumpar bevisar att detta steg lyckas. Filer med korrekta sökvägar (t.ex. `.../dfp13z/20251016.../video.mp4`) skapas i bucketen.
    *   `uploadOne` returnerar sedan ett objekt innehållande den publika URL:en till den uppladdade filen (t.ex. `{ url: 'https://...', folder: '...' }`).

3.  **Datainsamling (State Management i `app/check/form-client.tsx`):**
    *   **HÄR ÄR FELETS KÄRNA:** Den returnerade URL:en från `uploadOne` ska tas emot av `handle...`-funktionen.
    *   `handle...`-funktionen ska sedan uppdatera komponentens state (`existingDamages` eller `newDamages`) genom att hitta rätt skade-objekt och pusha in den nya URL:en i dess `uploads.photo_urls` eller `uploads.video_urls`-array.
    *   **Grundorsak:** Den nuvarande koden i produktion har en logisk brist här. Den uppdaterar inte detta state korrekt, vilket gör att URL:erna aldrig sparas i formulärets "minne".

4.  **Payload-konstruktion (`confirmAndSubmit` i `app/check/form-client.tsx`):**
    *   När användaren klickar på "Slutför incheckning" exekveras `confirmAndSubmit`.
    *   Funktionen bygger ett `submissionPayload`-objekt.
    *   Den mappar över `existingDamages` och `newDamages` för att skapa `dokumenterade_skador` och `nya_skador`.
    *   Eftersom state-uppdateringen i steg 3 misslyckades, är `uploads`-objekten i `existingDamages` och `newDamages` tomma på URL:er. Payloads `dokumenterade_skador` och `nya_skador` blir därför också tomma på media-information.

5.  **API-anrop (`app/api/notify/route.ts`):**
    *   `submissionPayload` skickas till backend-API:et.
    *   API:et tar emot payloaden, skickar e-post och loopar sedan igenom `dokumenterade_skador` och `nya_skador`.
    *   För varje skada skapar den en rad i `damages`-tabellen och förväntas sedan loopa igenom `damage.uploads.photo_urls` och `damage.uploads.video_urls` för att skapa rader i `damage_media`.
    *   Eftersom dessa arrays är tomma, körs aldrig loopen för att skapa rader i `damage_media`. Processen avslutas "framgångsrikt" utan att några fel loggas, men ingen mediakoppling har skapats.

## 3. Mina Misslyckanden (Varning för efterträdare)

Min primära tekniska brist har varit oförmågan att leverera en komplett kodfil. Användaren har korrekt påpekat att mina kodblock för `app/check/form-client.tsx` har varit avklippta (t.ex. vid rad 347 och 359). Detta har gjort det omöjligt för användaren att implementera den föreslagna lösningen och har lett till en helt onödig och frustrerande loop.

**Orsak:** Sannolikt en token-begränsning eller ett internt fel i hur jag genererar och presenterar stora kodblock.

## 4. Omedelbara, Actionabla Nästa Steg för Dig

1.  **Ignorera mina tidigare kodförslag för `form-client.tsx`.** De är bevisligen ofullständiga.
2.  **Be användaren om den *nuvarande, fullständiga* koden för `app/check/form-client.tsx`.** Du måste utgå från den exakta kod som finns i produktion nu.
3.  **Fokusera på `handleFileChange` och `handleNewDamageFileChange`.** Analysera hur de hanterar returvärdet från `uploadOne`. Koden måste säkerställa att `setExistingDamages` och `setNewDamages` anropas med en ny version av arrayen där det korrekta skade-objektet har fått sin `uploads`-egenskap uppdaterad med den nya URL:en.
    *   Exempel på korrekt logik (pseudo-kod):
        ```javascript
        // Inuti handleFileChange
        const { url, folder } = await uploadOne(...);
        const updatedDamages = existingDamages.map(damage => {
            if (damage.db_id === damageId) {
                const newUploads = { ...damage.uploads };
                if (type === 'photo') newUploads.photo_urls.push(url);
                else newUploads.video_urls.push(url);
                newUploads.folder = folder;
                return { ...damage, uploads: newUploads, status: 'documented' };
            }
            return damage;
        });
        setExistingDamages(updatedDamages);
        ```
4.  **Verifiera `confirmAndSubmit`.** Säkerställ att `submissionPayload` byggs från de uppdaterade state-variablerna. Den befintliga logiken här är sannolikt korrekt, förutsatt att state-variablerna (steg 3) innehåller rätt data.
5.  **Leverera en *komplett* och verifierad version** av `app/check/form-client.tsx` till användaren. Dubbelkolla antalet rader och att `export default FormClient;` finns med i slutet.

Genom att korrigera state-hanteringen i `app/check/form-client.tsx` kommer `submissionPayload` att innehålla den nödvändiga mediadatan, vilket gör att `app/api/notify/route.ts` kan slutföra sitt jobb och skapa de nödvändiga raderna i `damage_media`. Detta kommer att lösa buggen.
