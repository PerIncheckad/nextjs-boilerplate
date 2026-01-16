# Drift, loggar och incidenter

## Operativ checklista – snabb
1. E‑postlänkar öppnas i inkognito → ska fungera utan login
2. Breadcrumbs i galleri → ska stanna inom `/public-media`
3. "Nya skador" med nätverksfel → submit blockerad, tydligt fel och scroll
4. Vercel Logs:
   - Filtrera Route: `/api/notify`
   - Sök: `Media counts received`, `CHECKIN INSERT OK`, `BUHS DAMAGE INSERT OK`, `SKIPPED`

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


---

## CSV-import:     BUHS Skadedata

**Fullständig guide:** `CSV-import-skador - gör så här. md`

### Snabbversion

1. **Importera CSV** → Supabase Table Editor → `mabi_damage_data_raw_new`
2. **Kör dedup-SQL** - Ta bort exakta dubbletter
3. **Kör upsert-SQL** - Importera till `damages` med unik `legacy_damage_source_text`
4. **Synka `damages_external`** - TRUNCATE + INSERT från `damages WHERE source='BUHS'`
5. **Verifiera** - Kör verifieringsfrågor (antal, senaste import, inga dubbletter)
6. **Testa** - Öppna `/check` med ett regnr från CSV: en

**Frekvens:** Vid behov (när BUHS-data uppdateras)

**Senaste import:**  
- **Datum:** 2026-01-16
- **Resultat:** 143 nya + 346 uppdaterade
- **Totalt BUHS-skador:** 727

**Viktig constraint:** `ux_damages_regnr_legacy_text` kräver unik text per (regnr, legacy_damage_source_text)
- CSV-import löser detta genom att bygga:    `'buhs_csv_import|datum|typ|notering'`
- Se `database-constraints.md` för detaljer
