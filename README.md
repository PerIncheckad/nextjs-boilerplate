# Incheckad – Next.js app

Detta repo innehåller Incheckads Next.js-applikation för fordonsincheckningar, skadehantering och notifieringar.

> **Aktuell teknisk takeover-baseline (2026-08-18):** [docs/TECHNICAL_TAKEOVER_BASELINE_2026-08-18.md](docs/TECHNICAL_TAKEOVER_BASELINE_2026-08-18.md). Använd den tillsammans med aktuell kod när äldre wiki-/handover-material skiljer sig från dagens system.

## Snabböversikt
- Frontend: Next.js `16.3.1` (App Router) + React `19.2.8`
- Auth/Storage/DB: Supabase (public bucket: `damage-photos`)
- E-post: Resend
- Hosting: Vercel (preview kan skyddas av Vercel Authentication)
- Server-API: `/api/*` skyddas server-side via `proxy.ts` + Supabase-verifiering; `/api/health` är undantag
- Media-visning:
  - Intern route: `/media/...` (kräver inloggning)
  - Publik route: `/public-media/...` (ingen inloggning – används i e-post)

## Kom igång (lokalt)
1. Klona repot och installera exakt dependency-graf från lockfilen:
   ```bash
   npm ci
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
   npm run dev
   ```

## Lokala kvalitetskontroller

```bash
npm run typecheck
npm run lint
npm run test:regression
npm run build
npm run test:security-runtime
```

`test:security-runtime` förutsätter en byggd app och använder samma dummy-miljöprincip som CI när det körs som del av den obligatoriska GitHub Actions-grinden.

## Miljövariabler
| Nyckel | Beskrivning |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key (klient) |
| SUPABASE_SERVICE_ROLE_KEY | Service Role (server, API) |
| RESEND_API_KEY | Resend API Key för e-post |
| NEXT_PUBLIC_SITE_URL | Bas-URL (prod/preview). Om ej angiven så byggs dynamiskt från request |

## Deploy
- Preview: Vercel (kan vara skyddad av Vercel Authentication)
- Production: [incheckad.se](https://www.incheckad.se)
- `main` ska ändras via PR och required checks ska vara gröna före merge.
- Den permanenta `typecheck`-jobben kör install, TypeScript, ESLint, säkerhetsregression, production build och byggd Next-runtime-smoke.

Notera att Vercel-skydd i preview ligger "framför" hela deploymenten – även publika routes. För att testa publika länkar i en skyddad preview måste du vara inloggad i Vercel eller använda en uttryckligen avsedd testkonfiguration. I produktion krävs ingen app-inloggning för `/public-media`.

## Publik media – design
- E-postlänkar pekar till `/public-media/<REGNR>/<mapp>/...`
- Samma galleri-UI som `/media`, men utan LoginGate
- Breadcrumbs bevarar kontexten (stannar i `/public-media`)
- Bucket `damage-photos` är publik; åtkomst till publikt innehåll ska därför behandlas som avsiktlig publicering

## Notifieringar (e-post)
- API: `app/api/notify/route.ts`
- Route-wrapper verifierar server-side användare/audit-identitet innan befintlig affärslogik körs i `legacy-handler.ts`
- Bygger HTML (svenskt UI), inkluderar media-länkar när det finns faktiska filer
- Serverlogg skriver sammanfattningar för felsökning i Vercel Logs

## Databas – snabbguide
Se Wiki för historiska detaljer och takeover-baselinen för aktuell revisionsstatus. Databasstrukturen ska revalideras i **Steg 3 — datamodell/databas** innan schema-cleanup eller normalisering.

Historiskt centrala tabeller/källor omfattar bland annat:
- `public.damages` – skadehistorik, inklusive legacy/BUHS och användarskapade skador
- `public.checkins` – incheckningar
- `public.checkin_damages` – skador kopplade till incheckningar/statistik
- `public.nybil_inventering` – nybilsinventering
- `public.vehicles` – fordonsdata

## Vanliga säkra kontroller
- `npm run typecheck` → inga TypeScript-fel
- `npm run lint` → inga nya/ökade blockerande ESLint-träffar
- `npm run test:regression` → authgräns/accesskontrakt
- `npm run build` + `npm run test:security-runtime` → byggd Next-runtime och API-säkerhets-smoke
- Öppna e-postlänk till `/public-media/...` i inkognito → ska fungera utan app-inloggning
- Serverlogg i Vercel → filtrera på berörd route vid felsökning

Undvik riskfyllda write-probes mot Production eller preview som kan dela Production-Supabase. Större write-ändringar ska verifieras med isolerad testdata/testmiljö eller uttryckligen kontrollerat testobjekt.

## Support & felsökning
- Preview kan kräva Vercel-inloggning utöver appens egen auth
- Skyddade `/api/*` ska utan giltig Bearer-token svara med authfel; `/api/health` är uttryckligt offentligt undantag
- Loggar: Vercel → Logs → filtrera på route (t.ex. `/api/notify`)
- Vid konflikt mellan äldre wiki/handover och aktuell kod: börja i takeover-baselinen och verifiera mot Production innan förändring

## Länkar
- Produktion: [incheckad.se](https://www.incheckad.se)
- Teknisk takeover-baseline: [docs/TECHNICAL_TAKEOVER_BASELINE_2026-08-18.md](docs/TECHNICAL_TAKEOVER_BASELINE_2026-08-18.md)
- Arkitektur: [docs/wiki/Architecture.md](docs/wiki/Architecture.md)
- PR-process: [docs/wiki/Contributing.md](docs/wiki/Contributing.md)

Mer historiska detaljer finns i Wiki.
