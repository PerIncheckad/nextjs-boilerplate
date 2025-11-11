# Root-cause SQL checklist for /check “Befintliga skador”

Syfte: Bevisa, med 100% säkerhet, varför skador dokumenterade i /check inte visas som “Befintliga skador” vid nytt uppslag (ex. WJB01P).

Instruktioner
- Kör nedanstående steg i Supabase SQL Editor (mot den databas där /check kör i produktion).
- Som testregnr används 'WJB01P'. Byt vid behov.
- Där det står “KÖR OCH KOPIERA RESULTAT” – spara resultatet till efterträdaren (eller för egen analys).

Notera
- Queries är skrivna för Postgres/Supabase.
- De är avsedda att vara icke-destruktiva (endast SELECT/inspection).

---

## 0) Snabb sanity-check (miljö)

```sql
-- Vilken DB och användare kör vi mot?
SELECT current_database() AS db, current_user AS db_user;

-- Aktiva scheman i sökvägen
SHOW search_path;
```

---

## 1) Hitta relevanta tabeller och vyer

KÖR OCH KOPIERA RESULTAT

```sql
-- Kandidater: tabeller & vyer i public relaterade till skador, check, buhs, nybil, bilfakta
SELECT
  table_schema,
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name ILIKE '%skad%'      -- skador
    OR table_name ILIKE '%damage%' -- ev. engelska namn
    OR table_name ILIKE '%buhs%'   -- BUHS-import
    OR table_name ILIKE '%check%'  -- checkflöde
    OR table_name ILIKE '%nybil%'  -- nybil
    OR table_name ILIKE '%fakta%'  -- bilfakta
    OR table_name ILIKE '%kontroll%'
    OR table_name ILIKE '%invent%'
  )
ORDER BY table_type, table_name;
```

För kolumner (identifiera `regnr` och ev. status/source-tänk):

KÖR OCH KOPIERA RESULTAT

```sql
-- Kolumninventering för ovan identifierade kandidater
SELECT
  c.table_name,
  c.column_name,
  c.data_type
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name   = c.table_name
WHERE c.table_schema = 'public'
  AND (
    c.table_name ILIKE '%skad%'
    OR c.table_name ILIKE '%damage%'
    OR c.table_name ILIKE '%buhs%'
    OR c.table_name ILIKE '%check%'
    OR c.table_name ILIKE '%nybil%'
    OR c.table_name ILIKE '%fakta%'
    OR c.table_name ILIKE '%kontroll%'
    OR c.table_name ILIKE '%invent%'
  )
ORDER BY c.table_name, c.ordinal_position;
```

---

## 2) Finn alla tabeller/vyer som har kolumnen “regnr”

KÖR OCH KOPIERA RESULTAT

```sql
SELECT
  c.table_schema,
  c.table_name,
  t.table_type
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name   = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name = 'regnr'
ORDER BY t.table_type, c.table_name;
```

---

## 3) Auto-generera SELECTs för WJB01P mot “skad%”-tabeller som har regnr

Detta genererar exakta SELECT-kommandon du kan kopiera och köra ett–och–ett.

KÖR OCH KOPIERA RESULTAT

```sql
SELECT format(
  '/* %I.%I */ SELECT * FROM %I.%I WHERE UPPER(TRIM(regnr)) = %L LIMIT 200;',
  c.table_schema, c.table_name, c.table_schema, c.table_name, 'WJB01P'
) AS sql_to_run
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name   = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name = 'regnr'
  AND (c.table_name ILIKE '%skad%' OR c.table_name ILIKE '%damage%')
  AND t.table_type IN ('BASE TABLE','VIEW')
ORDER BY c.table_name;
```

Kör de genererade SELECT-satserna och samla resultat. Viktigt: notera om rader finns i någon tabell som verkar vara “check-skador” respektive BUHS-/staging-tabell.

---

## 4) Kontrollera om det finns en vy för “befintliga skador”

KÖR OCH KOPIERA RESULTAT

```sql
-- Finn vyer som troligen används för att exponera befintliga skador
SELECT table_schema, table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND (
    table_name ILIKE 'v%skad%'     -- t.ex. v_befintliga_skador
    OR table_name ILIKE '%befint%'
    OR table_name ILIKE '%exist%'
  )
ORDER BY table_name;
```

Om du hittar en kandidatvy (ex. v_befintliga_skador), hämta dess definition:

KÖR OCH KOPIERA RESULTAT

```sql
-- Byt 'v_befintliga_skador' nedan till faktiskt namn från föregående query
SELECT
  'public.v_befintliga_skador' AS view_name,
  pg_get_viewdef('public.v_befintliga_skador'::regclass, true) AS view_sql;
```

Testa vyn mot WJB01P:

KÖR OCH KOPIERA RESULTAT

```sql
-- Byt vy-namn om nödvändigt
SELECT *
FROM public.v_befintliga_skador
WHERE UPPER(TRIM(regnr)) = 'WJB01P';
```

---

## 5) RLS‑policies som kan blockera SELECT/INSERT

KÖR OCH KOPIERA RESULTAT

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  permissive,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    tablename ILIKE '%skad%' OR tablename ILIKE '%damage%' OR
    tablename ILIKE '%buhs%' OR tablename ILIKE '%check%'
  )
ORDER BY tablename, policyname;
```

---

## 6) Leta efter kolumner som ofta styr filtrering (status/källa/tidsstämplar)

Identifiera potentiella filterkolumner:

KÖR OCH KOPIERA RESULTAT

```sql
-- Timestamp- och status-/källkolumner i skadetabeller
SELECT
  c.table_name,
  c.column_name,
  c.data_type
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND (c.table_name ILIKE '%skad%' OR c.table_name ILIKE '%damage%')
  AND (
    c.data_type ILIKE '%timestamp%' OR
    c.data_type ILIKE '%date%' OR
    c.column_name IN ('status','state','source','kalla','källa','typ','type')
  )
ORDER BY c.table_name, c.ordinal_position;
```

När du vet vilka tabeller/kolumner som finns, kör manuellt (byt tabell-/kolumnnamn):

KÖR OCH KOPIERA RESULTAT

```sql
-- EXEMPEL: byt tabell/kolumnnamn enligt din miljö
SELECT
  UPPER(TRIM(regnr)) AS regnr_norm,
  source,
  status,
  COUNT(*) AS rows_count
FROM public.check_skador -- byt till faktiskt tabellnamn
WHERE UPPER(TRIM(regnr)) = 'WJB01P'
GROUP BY 1,2,3
ORDER BY 2,3;
```

---

## 7) Regnr-normalisering – upptäck dolda tecken/whitespace

Auto‑generera SELECTs som visar längder och byteinnehåll för regnr i skadetabeller:

KÖR OCH KOPIERA RESULTAT

```sql
SELECT format(
  '/* %I.%I */ SELECT regnr, length(regnr) AS len, octet_length(regnr) AS bytes, encode(regnr::bytea, ''escape'') AS raw FROM %I.%I WHERE regnr ILIKE %L LIMIT 50;',
  c.table_schema, c.table_name, c.table_schema, c.table_name, '%WJB01P%'
) AS sql_to_run
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name   = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name = 'regnr'
  AND (c.table_name ILIKE '%skad%' OR c.table_name ILIKE '%damage%')
  AND t.table_type IN ('BASE TABLE','VIEW')
ORDER BY c.table_name;
```

Kör de genererade statementen och kontrollera att `length(regnr)` och `octet_length(regnr)` ser rimliga ut samt att `raw` inte innehåller oväntade tecken.

---

## 8) Finn ev. RPC/SQL-funktioner som används av /check

KÖR OCH KOPIERA RESULTAT

```sql
SELECT
  n.nspname  AS schema,
  p.proname  AS function_name,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    p.proname ILIKE '%skad%' OR
    p.proname ILIKE '%damage%' OR
    p.proname ILIKE '%buhs%' OR
    p.proname ILIKE '%check%'
  )
ORDER BY p.proname;
```

Om /check använder en RPC för “befintliga skador”, kör den funktionen för 'WJB01P' och kopiera resultatet.

---

## 9) Triggers som kan påverka lagring/promotion

KÖR OCH KOPIERA RESULTAT

```sql
SELECT
  tg.tgname        AS trigger_name,
  tg.tgrelid::regclass AS on_table,
  tg.tgfoid::regproc   AS function_name,
  tg.tgenabled     AS enabled
FROM pg_trigger tg
WHERE NOT tg.tgisinternal
  AND tg.tgrelid::regclass::text ILIKE 'public.%'
ORDER BY on_table, trigger_name;
```

---

## 10) (Valfritt) Snabb vy‑prototyp för union (använd EJ i produktion än)

Om analys visar att vy saknar “check-skador”, här är en referens att jämföra mot (justera tabell- och kolumnnamn):

```sql
-- EXEMPEL-REFERENS, ÄNDRA TABELL/KOLUMN innan användning:
CREATE OR REPLACE VIEW public.v_befintliga_skador_ref AS
SELECT
  UPPER(TRIM(regnr)) AS regnr,
  skade_typ,
  position,
  NULLIF(TRIM(beskrivning),'') AS beskrivning,
  'BUHS'::text AS source,
  skapat_tid,
  'aktiv'::text AS status
FROM public.buhs_skador_staging
UNION ALL
SELECT
  UPPER(TRIM(regnr)) AS regnr,
  skade_typ,
  position,
  NULLIF(TRIM(beskrivning),'') AS beskrivning,
  'CHECK'::text AS source,
  skapat_tid,
  CASE WHEN status IN ('ny','aktiv') THEN 'aktiv' ELSE status END AS status
FROM public.check_skador
WHERE status IS DISTINCT FROM 'inaktiv';
```

Testa ref‑vy mot WJB01P för att se om den visar korrekt union:

```sql
SELECT * FROM public.v_befintliga_skador_ref WHERE regnr = 'WJB01P';
```

---

## 11) Tolka resultaten (vad du letar efter)

- Finns rader för 'WJB01P' i den tabell där /check sparar nya skador?
  - JA: Skrivning fungerar.
  - NEJ: Felsök insert/RLS.
- Returnerar “befintliga-skador”-vyn (eller SELECTen som UI använder) rader för 'WJB01P'?
  - JA men UI visar inget → klientfiltrering/caching.
  - NEJ → vy/SELECT missar källan (union/filter/normalisering).
- Avvikande `regnr`-tecken/whitespace?
  - Åtgärda normalisering konsekvent (UPPER(TRIM), ta bort mellanrum).

Samla alla SQL-resultat och ge till efterträdaren för slutlig root-cause-klassning och fix.

---