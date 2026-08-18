# Arkitektur och komponenter

> **Aktuell teknisk takeover-baseline:** [TECHNICAL_TAKEOVER_BASELINE_2026-08-18.md](../TECHNICAL_TAKEOVER_BASELINE_2026-08-18.md). Äldre wiki-sidor kan innehålla historiska antaganden och ska inte ensamma användas som drift- eller säkerhetskälla.

## Översikt

- Next.js `16.3.1` (App Router, `proxy.ts`)
- React / React DOM `19.2.8`
- TypeScript med strict typecheck och build-blockering vid typfel
- Supabase för Auth, Storage och PostgreSQL
- Resend för e-post
- Vercel för preview och Production
- ESLint 9 + Next-konfiguration som permanent CI-grind

## Runtime- och säkerhetskedja

Den kritiska kedjan är:

`användare → LoginGate → klient → /api → proxy.ts → verifyApiUser → route/legacy-handler → service role → Supabase`

### UI-auth

`components/LoginGate.tsx` använder Supabase-session och samma centraliserade accessmodell som servern.

Godkänd användare är i nuläget antingen:

- e-post i `lib/access-control.ts`, eller
- en matchande rad i `employees` där `is_active = true`.

Detta är en accessmodell, inte full RBAC. Roll-/processbehörighet kräver separat verksamhets- och säkerhetsbeslut.

### Server-API

- `proxy.ts` verifierar alla `/api/*` utom `/api/health`.
- Bearer-token verifieras i `lib/server-auth.ts` mot Supabase Auth.
- Verifierad identitet förs vidare i `x-invisto-user-id` och `x-invisto-user-email`.
- Centrala write-routes gör servern auktoritativ för audit-identitet innan legacy-handler körs.
- Flera routes använder fortsatt Supabase service role. Den kan arbeta utanför RLS, vilket gör server-authgränsen till en kritisk invariant.

Nya API-routes får inte skapa parallella, oskyddade service-role-vägar.

## Media

Två avsiktligt olika media-ytor finns:

- `/media/...` — intern/inloggningsskyddad visning.
- `/public-media/...` — publik visning för länkar som skickas i e-post.

Supabase-bucketen `damage-photos` är publik enligt befintlig design. Innehåll som placeras i den publika flödeskedjan ska därför behandlas som publicerbart material.

## Nyckelkomponenter

- `app/check/...` — incheckningsflöde.
- `app/nybil/...` — nybilsinventering.
- `app/ankomst/...` — ankomstflöde.
- `app/status/...` — fordonsstatus och historik/edit-funktioner.
- `app/rapport/...` — rapportering.
- `app/api/notify/route.ts` — auth/audit-wrapper för incheckningsnotifiering och persistens; befintlig affärslogik ligger i `legacy-handler.ts`.
- `app/api/notify-arrival/route.ts` — auth/audit-wrapper för Ankomst.
- `app/api/vehicle-edits/route.ts` — auth/audit-wrapper för statusändringar.
- `app/api/damage-comments/route.ts` — auth/audit-wrapper för skadekommentarer.
- `lib/access-control.ts` — central whitelist.
- `lib/server-auth.ts` — server-side token- och accessverifiering.
- `lib/api-auth-client.ts` — injicerar Bearer-token för skyddade same-origin API-anrop.
- `proxy.ts` — Next 16 servergräns för `/api`.

## Datakällor

Historiskt centrala källor omfattar bland annat:

| Tabell/källa | Beskrivning | Exempel på användning |
|---|---|---|
| `vehicles` | fordonsdata/Bilkontroll-import | `/status`, fordonsuppslag |
| `damages` | konsoliderad skadehistorik | `/status`, `/check` |
| `nybil_inventering` | nybilsregistreringar | `/status`, `/nybil` |
| `checkins` | incheckningshistorik | `/status`, `/check`, rapport |
| `checkin_damages` | skador per incheckning | historik/statistik |
| RPC `get_damages_by_trimmed_regnr` | legacy/BUHS-uppslag | `/status`, `/check` |

Databasbeskrivningar i wikin är historiskt värdefulla men ska revalideras mot verkligt schema i **Steg 3 — datamodell/databas** innan schema-cleanup eller migrationsbeslut.

## CI och deploy

Den obligatoriska GitHub Actions-jobben `typecheck` kör:

1. `npm ci`
2. TypeScript
3. ESLint
4. säkerhetsregression
5. Production build
6. byggd Next-runtime-smoke

Vercel-preview/Production är fortsatt deploygrind. Repository-ruleset `Protect main` ska kräva PR, `typecheck / GitHub Actions` och `Vercel / Vercel` före merge.

## Kända avgränsningar

- ingen full RBAC;
- ingen bred legacy-refaktorering av `any`/React hook-skuld;
- ingen full write-E2E mot isolerad Supabase-testmiljö ännu;
- service-role-baserad serverlogik är bevarad bakom authgränsen;
- databasnormalisering, BUHS-ID/mappning och legacyfält ligger i Steg 3.

Se takeover-baselinen för full riskklassning och nästa revisionsordning.
