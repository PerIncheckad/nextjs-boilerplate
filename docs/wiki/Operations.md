# Drift, loggar och incidenter

## Operativ checklista – snabb
1. E‑postlänkar öppnas i inkognito → ska fungera utan login
2. Breadcrumbs i galleri → ska stanna inom `/public-media`
3. "Nya skador" med nätverksfel → submit blockerad, tydligt fel och scroll
4. Vercel Logs:
   - Filtrera Route: `/api/notify`
   - Sök: `Media counts received`, `CHECKIN INSERT OK`, `BUHS DAMAGE INSERT OK`, `SKIPPED`

## Testläge (dryRun)
- Lägg till `?dryRun=1` i URL:en på sidan `/check` innan du skickar formuläret.
- Effekt: mejl skickas, men inga rader skrivs till `public.checkins`, `public.checkin_damages` eller `public.damages`.
- API‑svaret innehåller `{ ok: true, dryRun: true }`.

## Vercel Logs
- Project → Logs → filtrera på Route
- Preview: tänk på att Vercel Authentication skyddar hela deployen (kräver Vercel‑login)

## Vanliga fel
- 404 på `/public-media` i prod innan merge → förväntat
- Preview kräver login → Vercel‑skydd

## Rollback
- Vercel Instant Rollback, alternativt revert PR
- Data dupliceras inte pga idempotens + unika index

## Säkerhet
- `/media` är skyddad
- `/public-media` är publik (endast galleri, bucket är publik)
- Ingen känslig data i public-media‑UI
