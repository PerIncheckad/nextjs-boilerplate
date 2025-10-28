# Incheckad — E‑postlänkar och Media-visare: Arkitektur och Återuppbyggnad (2025‑10‑28)

Detta dokument är en komplett, självbärande specifikation för hur e‑postlänkar till media byggs och hur media‑visaren fungerar. Det kan användas för att återuppbygga lösningen från scratch i en ny miljö eller av en ny utvecklare/bot.

Innehåll
1. Översikt
2. Filkarta och huvudkomponenter
3. Supabase-projekt: Storage och policys
4. Mappstruktur och namngivning
5. Media-visaren: renderingslogik och navigation
6. Kommentarer: kommentar.txt-hantering
7. Publika URL:er och nedladdning
8. API för mejl: siteUrl-detektering och länkskapande
9. URL-kodning av stig (segmentvis encoding)
10. Inloggning och magiska länkar (nuvarande vs planerad auto-redirect)
11. Miljövariabler och secrets
12. End-to-end-flöden (E2E)
13. Testchecklistor (smoke + regression)
14. Vanliga fel och felsökning
15. Rollback-strategi
16. Appendix: Kodskisser

---

## 1) Översikt

- Vid incheckning laddas bilder/kommentarer till Supabase Storage (bucket: `damage-photos`) enligt en strikt mappkonvention.
- Ett server-side API (`app/api/notify/route.ts`) genererar två mejl, med länkar “Visa media 🔗” som pekar till webbens mediasidor under `/media/...`.
- Media-visaren (Next.js App Router) renderar mappinnehåll, klickbara mappar, förhandsvisningar och visar `kommentar.txt`.

Målkriterier
- Alla mejllänkar pekar till produktionsdomänen: `https://www.incheckad.se/media/<stig>`.
- Stigar är robust URL‑kodade segmentvis.
- Media-visaren visar samma struktur som i Storage; mappar är klickbara och breadcrumbs fungerar.
- Kommentarer i `kommentar.txt` renderas med radbrytningar.
- Bilder kan öppnas i ny flik (full storlek).

---

## 2) Filkarta och huvudkomponenter

- Media
  - `app/media/[...path]/page.tsx`: wrapper som säkrar inloggning och renderar MediaViewer.
  - `app/media/[...path]/media-viewer` (komponent/filnamn i repo): listar, detekterar mappar/filer, breadcrumbs, kommentarvisning.

- Incheckning (form)
  - `app/check/page.tsx`: wrapper med `LoginGate`.
  - `app/check/form-client.tsx`: stor UI‑komponent; innehåller stationer, bakgrund, sektioner, upload, submit.

- Inloggning
  - `components/LoginGate.tsx`: OTP (magisk länk), whitelist, sign-in flöde.

- E‑post
  - `app/api/notify/route.ts`: bygger HTML, skapar länkar; skickar via Resend.

- Konfiguration/uppslag
  - `data/stationer.json`, `lib/stations.ts`: stationsdata och dropdowns.

---

## 3) Supabase-projekt: Storage och policys

Bucket
- Namn: `damage-photos`
- Visibility: Public

Policies (Public Read)
- Tillåt SELECT/GET över objekt i bucketen (publik läsning) för att möjliggöra direktlänkar/thumbnail och publicUrl.
- Uppladdning sker via applikationens autentiserade session och/eller service role (server-side) beroende på flow.

Övrigt
- Inga RLS‑tabeller krävs för ren storage-läsning. Tänk på att Public bucket exponeras — bygg länkar endast till korrekta pathar.

---

## 4) Mappstruktur och namngivning

Konvention i `damage-photos`:
```
<REG>/
  <REG-YYYYMMDD>/
    <sektion>/
      kommentar.txt
      <bilder...>
```

Exempel
- `WXC37P/WXC37P-20251028/rekond-utvandig-per/kommentar.txt`
- `WXC37P/WXC37P-20251028/rekond-utvandig-per/WXC37P-20251028-kl-08-16_rekond_1.png`

Sektionernas namn speglar UI-sektioner (rekond-utvandig-per, husdjur-per, rökning-per, etc.).

---

## 5) Media-visaren: renderingslogik och navigation

Routing
- App Router fångar allt under `/media/[...path]`.
- `export const dynamic = 'force-dynamic'` används för att säkra färska listningar.

Listning och mappdetektion
- Applikationen hämtar listning via Supabase Storage `list` på prefix som motsvarar aktuell stig.
- Mappdetektion: poster där `file.id === null` (metadata från Storage) betraktas som “folder” och renderas som klickbara kakor/tiles.
- För mappar byggs nästa stig genom att lägga till mappnamnet på den aktuella stigdelen och länka till `/media/<joined path>`.

Breadcrumbs
- Breadcrumbs skapas genom successiv hopslagning av stigdels-arrayen; varje mellanled är klickbart, sista segmentet visas som text.

---

## 6) Kommentarer: kommentar.txt-hantering

- Vid detekterad fil med exakt namn `kommentar.txt` i en löv‑mapp:
  - Hämtas med `supabase.storage.from('damage-photos').download(fullPath)`.
  - `await data.text()` läses in och renderas i ett expanderbart textblock med CSS `white-space: pre-wrap` för radbrytningar.

---

## 7) Publika URL:er och nedladdning

- För bild/video genereras publik URL via:
  ```ts
  supabase.storage.from('damage-photos').getPublicUrl(fullPath)
  ```
- Bilder renderas med klickbar länk (`target="_blank"`) för fullstor bild.
- Video (om aktuellt) renderas med `<video controls src={publicUrl}>`.

---

## 8) API för mejl: siteUrl-detektering och länkskapande

Fil: `app/api/notify/route.ts`

Domänval (`siteUrl`)
Prioritet:
1. `process.env.NEXT_PUBLIC_SITE_URL` (i prod: `https://www.incheckad.se`)
2. Härledd från request (`x-forwarded-proto` + `host`) eller `new URL(request.url).origin`
3. Fallback: `https://www.incheckad.se` (OBS: aldrig en Vercel‑preview här)

Länkskapande
- Funktion `createStorageLink(folderPath)`:
  - Om `folderPath` finns → returnera `${siteUrl}/media/${encodePathSegments(folderPath)}`
  - Annars `null`
- Alla “Visa media 🔗”-länkar i mejl använder denna funktion.

---

## 9) URL-kodning av stig (segmentvis encoding)

Viktigt: Koda varje del mellan snedstreck, inte hela strängen i ett svep.

```ts
function encodePathSegments(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
```

Exempel
- `rekond-utvändig-per` → `rekond-utv%C3%A4ndig-per`
- `B/S Helsingborg` → `B%2FS%20Helsingborg` (snedstreck i namn kräver specialhantering; undvik helst i katalognamn)

---

## 10) Inloggning och magiska länkar

Nuvarande
- `LoginGate` begär OTP med `emailRedirectTo` som pekar mot produktion (`NEXT_PUBLIC_SITE_URL` eller fallback) → länken i mejlet landar på prod.
- För preview‑test byter man idag domän manuellt genom att kopiera `#access_token=...`‑URL och byta domänen.

Planerad förbättring (ej aktiv i denna release)
- Skicka `?next=<window.location.origin>` när man begär OTP.
- På prod efter verifiering: om `next` finns och `#access_token` finns → auto‑redirect till `next` och behåll hela hash-fragmentet (inloggad på preview utan manuell editering).
- Kräver liten ändring i `LoginGate` och att previewdomänen tillåts/hanteras korrekt.

---

## 11) Miljövariabler och secrets

Obligatoriska
- `NEXT_PUBLIC_SITE_URL=https://www.incheckad.se`
- `NEXT_PUBLIC_SUPABASE_URL=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...` (klient)
- `SUPABASE_SERVICE_ROLE_KEY=...` (server)
- `RESEND_API_KEY=...`
- `BILKONTROLL_MAIL=...` (mottagare för Bilkontroll)
- `HUVUDSTATION_MAIL=per@incheckad.se` (eller annan)
- `TEST_MAIL=...` (om satt: används som fallback, nyttigt under test)

Valfria (för framtida allowlist via env)
- `NEXT_PUBLIC_ALLOWED_EMAILS="anna@ex.se, kalle@ex.se"`

---

## 12) End-to-end-flöden (E2E)

Flöde: Incheckning → media → mejl
1. Användare fyller `/check`, laddar upp bild(er) och skriver kommentar.
2. Appen laddar upp till `damage-photos/<REG>/<REG-YYYYMMDD>/<sektion>/...` (skapar kataloger implicit).
3. API `/api/notify` tar emot payload, bygger två mejl.
4. Varje sektion med uppladdningar får en “Visa media 🔗”-länk till motsvarande mapp.
5. Mottagare klickar länken → `/media/<stig>` → Media‑visaren listar filer + kommentar.

Flöde: Navigering i Media
- Klick på mappkarta → djupare stig.
- Breadcrumbs för snabb återgång.
- I löv‑mapp: `kommentar.txt` klickas upp; bilder öppnas i ny flik.

---

## 13) Testchecklistor

Smoke (prod)
- Gör fejkad incheckning.
- Verifiera 2 mejl (Huvudstation, Bilkontroll).
- Klicka alla “Visa media 🔗” → rätt domän, inga 404.
- Kontrollera att `kommentar.txt` syns och bilder kan öppnas i ny flik.

Regression (media)
- Mappar klickbara på alla nivåer.
- Breadcrumbs korrekta.
- Mixed content (text/bild/video) renderar utan krasch.

---

## 14) Vanliga fel och felsökning

- 404 i mejl:
  - Kontrollera att länkar börjar med `https://www.incheckad.se`.
  - Kontrollera segmentvis encoding (å/ä/ö, mellanslag).
  - Säkerställ att korresponderande katalog finns i Storage.

- Länk pekar mot Vercel‑preview:
  - Kolla `NEXT_PUBLIC_SITE_URL` i miljön.
  - Kolla fallback i koden (ska aldrig vara preview).

- Ingen bild/kommentar i mapp:
  - Bekräfta uppladdning vid submit (nätverkslogg) och kontrollera i Supabase.

---

## 15) Rollback-strategi

- Om mejl börjar peka fel igen:
  1) Verifiera `NEXT_PUBLIC_SITE_URL`.
  2) Återställ `resolveSiteUrl` i `route.ts` till fallback `https://www.incheckad.se`.
  3) Återinför segmentvis encoding i länkbyggaren om den skulle saknas.

- Om media‑visaren slutar lista mappar:
  - Återställ folderdetektering via `file.id === null` och klickbara `Link` runt folder tiles.
  - Säkerställ `export const dynamic = 'force-dynamic'` i `app/media/[...path]/page.tsx`.

---

## 16) Appendix: Kodskisser

SiteUrl (server)
```ts
function resolveSiteUrl(req: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl;

  // För Vercel/Next serverless
  try {
    const u = new URL(req.url);
    if (u.origin) return u.origin;
  } catch {}

  return 'https://www.incheckad.se';
}
```

Segmentvis encoding
```ts
const encodePathSegments = (path: string) =>
  path.split('/').map(encodeURIComponent).join('/');
```

Skapa mejllänk
```ts
const createStorageLink = (siteUrl: string, folderPath?: string | null) =>
  folderPath ? `${siteUrl}/media/${encodePathSegments(folderPath)}` : null;
```

Kommentarhämtning
```ts
const { data, error } = await supabase.storage
  .from('damage-photos')
  .download(fullPathToKommentarTxt);
const text = data ? await data.text() : '';
```
