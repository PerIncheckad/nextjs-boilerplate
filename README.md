# Incheckad – Next.js app

Detta repo innehåller Incheckads Next.js‑applikation för fordonsincheckningar, skadehantering och notifieringar.

## Snabböversikt
- Frontend: Next.js (App Router)
- Auth/Storage: Supabase (public bucket: `damage-photos`)
- E‑post: Resend
- Hosting: Vercel (preview är skyddat av Vercel Authentication)
- Media‑visning:
  - Intern route: `/media/...` (kräver inloggning)
  - Publik route: `/public-media/...` (ingen inloggning – används i e‑post)

## Kom igång (lokalt)
1. Klona repot och installera:
   ```bash
   pnpm install
   # eller
   npm install
   ```
2. Skapa `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Fyll i:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (endast för server/route)
   - `RESEND_API_KEY`
   - `NEXT_PUBLIC_SITE_URL` (valfritt – annars härleds från request)

3. Starta:
   ```bash
   pnpm dev
   # eller
   npm run dev
   ```

## Miljövariabler
| Nyckel | Beskrivning |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key (klient) |
| SUPABASE_SERVICE_ROLE_KEY | Service Role (server, API) |
| RESEND_API_KEY | Resend API Key för e‑post |
| NEXT_PUBLIC_SITE_URL | Bas-URL (prod/preview). Om ej angiven så byggs dynamiskt från request |

## Deploy
- Preview: Vercel (skyddad av Vercel Authentication om "Standard Protection" är aktiv)
- Production: [incheckad.se](https://www.incheckad.se)

Notera att Vercel‑skydd i preview ligger "framför" hela deploymenten – även publika routes. För att testa publika länkar i preview måste du logga in i Vercel (eller tillfälligt stänga av skyddet på just den deployen). I produktion krävs ingen inloggning för `/public-media`.

## Publik media – design
- E‑postlänkar pekar till `/public-media/<REGNR>/<mapp>/...`
- Samma galleri‑UI som `/media`, men utan LoginGate
- Breadcrumbs bevarar kontexten (stannar i `/public-media`)
- Bucket `damage-photos` är publik; åtkomst styrs av route‑nivå

## Notifieringar (e‑post)
- API: `app/api/notify/route.ts`
- Bygger HTML (svenskt UI), inkluderar "(Visa media 🔗)" endast när det finns faktiska filer
- Mottagare:
  - Bilkontroll: lista (t.ex. `per@incheckad.se`, `latif@incheckad.se`)
  - Huvudstation: dynamisk lista via ort‑karta (Helsingborg m.fl.)
- Serverlogg: skriver sammanfattningar (media counts m.m.) i Vercel Logs

## Databas – snabbguide
Se Wiki för detaljer. Kort:
- `public.damages` – normaliserar både "nya" skador och dokumenterade BUHS‑skador
- `public.checkins` – en rad per incheckning
- `public.checkin_damages` – en rad per position för nya skador (statistik)
- Index/idempotens:
  - Unika index för (regnr, legacy_damage_source_text) och `legacy_loose_key`
  - `legacy_loose_key` = `REGNR|original_damage_date` (låser dokumenterad BUHS även om legacy‑text ändras)

## Unified Damage Model
`lib/damages.ts` implementerar en unified damage model som kombinerar:
- **BUHS-skador** (externa/legacy från RPC)
- **Dokumenterade BUHS** (inventerade via /check-formuläret)
- **Nya skador** (användarskapade vid incheckning)

UI-logik:
- "Befintliga skador att hantera" visas endast när `hasUndocumentedBUHS === true`
- När alla BUHS är dokumenterade döljs sektionen automatiskt
- "Nya skador" visas alltid (oavsett BUHS-status)

Se Wiki → Database.md för detaljer om matchningsstrategi och idempotens.

## Vanliga tester
- Öppna e‑postlänk till `/public-media/...` i inkognito → ska fungera utan inloggning
- Breadcrumb "uppåt" i inkognito → ska stanna inom `/public-media`
- Uppladdningsfel → blockerar submit, tydligt fel, scrollar till sektion
- Serverlogg i Vercel → sök "Media counts received" eller "CHECKIN INSERT OK"

## Support & felsökning
- Preview kräver Vercel‑inloggning (inte app‑inloggning) när deployment security är på
- 404 på `/public-media` i prod innan merge är förväntat
- Loggar: Vercel → Logs → filtrera på route (t.ex. `/api/notify`)

## Länkar
- Produktion: [incheckad.se](https://www.incheckad.se)
- Publik media (exempel): `/public-media/REGNR/...`

Mer detaljer i Wiki.
