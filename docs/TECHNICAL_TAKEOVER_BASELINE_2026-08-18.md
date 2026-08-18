# Invisto / Incheckad — teknisk takeover-baseline

**Datum:** 2026-08-18  
**Stabiliseringsbas:** `main` på `bd95f477f8e9b48a82d3257c6220e4f1263e6a0e` före denna dokumentations-PR  
**Produktionsdomän:** `https://www.incheckad.se`  
**Princip:** **behålla → reparera → ta bort → addera**

Detta dokument är den tekniska överlämningsbasen efter Steg 2.1–2.5. Det beskriver vad som är verifierat, vilka skydd som är permanenta och vilken skuld som medvetet lämnas till nästa revisionsfas. Dokumentet är inte ett påstående om att process-, databas- eller produktdesign är färdig.

## 1. Slutbedömning för stabiliseringsfasen

Plattformen bedöms som **tekniskt övertagbar och tillräckligt stabil för kontrollerad fortsatt utveckling**.

Det innebär:

- den tidigare kritiska server-API-exponeringen är stängd;
- TypeScript-fel kan inte längre passera build genom ignore-inställning;
- dependency-grafen har migrerats till Next 16 / React 19 och senaste verifierade `npm audit` är 0 fynd;
- ESLint är en permanent kvalitetsgrind;
- en obligatorisk regressions- och byggd runtime-smoke finns i CI;
- ordinarie Vercel-deploy är fortsatt del av leveransgrinden.

Det innebär **inte**:

- att full RBAC finns;
- att alla legacy-typer/hook-varningar är reparerade;
- att datamodellen är normaliserad;
- att alla write-flöden är E2E-testade mot en isolerad testdatabas;
- att äldre wiki-/handover-dokument automatiskt är aktuell sanning.

Inom Steg 2:s scope finns inget kvarvarande verifierat **rött stoppfynd** som kräver att fortsatt utveckling fryses. Kvarvarande tekniska risker är dokumenterade nedan som kontrollerad skuld.

## 2. Runtime- och stackbaseline

Aktuell teknisk huvudstack:

- Next.js `16.3.1` (App Router, `proxy.ts`-konvention)
- React / React DOM `19.2.8`
- TypeScript med strict kontroll och `ignoreBuildErrors: false`
- Supabase för Auth, PostgreSQL och Storage
- Resend för e-post
- Vercel för preview och Production
- ESLint 9 + `eslint-config-next` 16.3.1

### Säkerhetskedja

Den kritiska serverkedjan ska förstås som:

`användare → LoginGate → autentiserad klient-fetch → /api → proxy.ts → verifyApiUser → route/legacy-handler → service role → Supabase`

Viktiga egenskaper:

1. `LoginGate` är UI-gate och använder Supabase-session.
2. Klienten injicerar Bearer-token på same-origin `/api/*` utom `/api/health`.
3. `proxy.ts` verifierar alla `/api/*` utom `/api/health` server-side.
4. `verifyApiUser` verifierar Supabase-token och tillåter användaren om e-post finns i central whitelist **eller** `employees.is_active` är sann.
5. Verifierad identitet skickas vidare i serverheaders (`x-invisto-user-id`, `x-invisto-user-email`).
6. Centrala write-wrappers skriver över klientlevererade audit-identiteter med verifierad användares e-post innan legacy-logiken körs.
7. Flera routes använder fortfarande Supabase service role. Service role kan arbeta utanför RLS; därför är server-API-gränsen en kritisk invariant och får inte kringgås.

`/public-media` är avsiktligt publik för länkar i e-post. `/media` är intern/inloggningsskyddad. Publik media ska därför behandlas som en uttrycklig publiceringsyta, inte som intern lagring.

## 3. Permanent leverans- och CI-grind

Den permanenta GitHub Actions-jobben heter fortsatt `typecheck` och kör i ordning:

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run test:regression`
5. `npm run build`
6. `npm run test:security-runtime`

Runtime-smoken startar den faktiskt byggda Next-servern med dummy-konfiguration och verifierar bland annat:

- `401` + `Authentication required` för centrala skyddade API-routes utan token;
- `200` för `/api/health`;
- att centrala app-routes kan renderas i byggd runtime.

Repository-ruleset **Protect main** verifierades manuellt under stabiliseringen och ska behållas som operativ kontroll: PR krävs, required checks omfattar `typecheck / GitHub Actions` och `Vercel / Vercel`, branch ska vara uppdaterad före merge, force-push och deletion är blockerade. Ingen bypass-lista ska användas utan uttryckligt governance-beslut.

## 4. Vad som reparerades i Steg 2

### 2.1 — server-API, access och audit-identitet

PR #306, merge `ea0aa9c1f1b541653ea95c20a31f6945a5544287`.

- server-side autentisering infördes för `/api/*` utom health;
- Supabase-session skickas som Bearer-token från klienten;
- central accesskontroll etablerades;
- servern blev auktoritativ för centrala auditfält;
- befintlig service-role-baserad affärslogik behölls bakom säkerhetsgränsen;
- Production verifierades read-only: direkt skyddad route utan token gav `Authentication required`.

### 2.2 — TypeScript/build-stabilisering

PR #308, merge `4b773ecda7a5f2df1ef70b7be1452ac25154a735`.

- baseline: 105 TypeScript-fel i 7 filer;
- resultat: 0 TypeScript-fel i strict typecheck;
- `npm run typecheck` och permanent GitHub Actions-gate infördes;
- `typescript.ignoreBuildErrors` sattes till `false`;
- runtime-kontrakt reparerades utan avsedd affärslogikändring.

### 2.3A — kritisk dependency-patch

PR #312, merge `e3783a57c0444c43232ba7cefa4fc1095b66d0ae`.

- `npm audit`: 10 fynd (9 high + 1 critical) → 2 high + 0 critical;
- kritisk Next/middleware-relaterad dependency-risk stängdes utan major-migrering.

### 2.3B — frameworkmigrering

PR #313, merge `dc4c7911b272573ac3f76db03d31fd180ad3fd77`.

- Next 14 / React 18 → Next `16.3.1` / React `19.2.8`;
- `middleware.ts` migrerades till `proxy.ts` med authlogiken bevarad;
- senaste verifierade dependency-audit efter migreringen: **0 fynd**;
- byggd Next-runtime verifierade att skyddad API-route fortsatt gav 401 utan token;
- Production custom domain verifierades read-only efter merge.

### 2.4 — ESLint/kodkvalitetsgrind

PR #314, merge `ceeacc724375ef690d60d2959bef79eea1bf6e4b`.

- baseline: 170 errors + 64 warnings i 24 filer;
- säkra blockerare reparerades;
- befintlig legacy-skuld i fyra error-regler frystes med `eslint-suppressions.json` i stället för massrefaktorering;
- ESLint-resultat efter stabilisering: **0 errors, 64 warnings**;
- nya/ökade error-träffar ska blockera lint.

Viktigt: suppression betyder **kontrollerad skuld**, inte att underliggande legacy-kod är omskriven.

### 2.5 — automatiserat regressionsskydd

PR #315, merge `bd95f477f8e9b48a82d3257c6220e4f1263e6a0e`.

- permanent kodnivåtest av authgräns och whitelist;
- permanent production build i required CI-jobb;
- permanent byggd Next-runtime-smoke;
- inga nya dependencies;
- inga riktiga Supabase-anrop eller write probes i testsviten.

## 5. Produktionsverifiering som ingår i basen

Följande har verifierats under stabiliseringen:

- Vercel Production grön på låsta merge-commits;
- custom production domain blockerar skyddad `/api/vehicle-info` utan Bearer-token;
- startsida, `/check`, `/rapport` och `/status` har manuellt smoke-testats efter stabiliseringsändringarna;
- `/status` kräver normal app-inloggning innan användaren kommer in;
- CI:s byggda Next-runtime verifierar centrala routes utan att skriva mot Production-data.

Ingen riskfylld write-probe har använts som del av stabiliseringen.

## 6. Kvarvarande teknisk skuld och risk

### A. Write-E2E saknar isolerad testmiljö — GUL

Centrala write-routes är kodgranskade och deras auth/audit-wrapper är testad, men fulla affärswrites har inte automatiserats E2E mot isolerad Supabase-testdata. Preview kan dela Production-resurser och ska därför inte användas för destruktiva verifieringar.

**Konsekvens:** framtida större ändringar i Check, Nybil, Ankomst, Status-edit eller notifieringspersistens bör kompletteras med en uttryckligt isolerad testdatabas/testprojekt eller ett kontrollerat testobjekt.

### B. Service role är fortsatt en högprivilegierad servermekanism — GUL

Detta är avsiktligt bevarat för att inte riva fungerande affärslogik. Nya API-routes får inte skapa en parallell väg runt `proxy.ts` / `verifyApiUser`.

### C. Ingen full RBAC — GUL

Accessmodellen är whitelist eller aktiv `employees`-post. Den skiljer inte robust mellan roller/behörighetsnivåer för olika processer. Ny rollmodell ska inte smygas in som kodstädning; den kräver ett verksamhetsbeslut.

### D. Legacy lint/type-skuld — GUL

`eslint-suppressions.json` innehåller befintliga träffar, främst `no-explicit-any` samt vissa React hook-regler. De 64 warnings är fortfarande synliga. Reparera inkrementellt när berörd kod ändå ändras; gör inte en bred cleanup som samtidigt riskerar processlogik.

### E. Datamodell och identifierare — GUL / Steg 3

Appen har historiskt vuxit med flera tabeller, vyer, RPC:er, `regnr`-baserade joins/fallbacks och legacyfält. Särskilt BUHS-skador har en känd ID-/matchningsfråga där kommentarskoppling inte säkert kan skapas om en RPC-rad inte kan mappas till korrekt `damages.id`.

Databasnormalisering, FK-strategi, identifierare och legacyfält hör till Steg 3 och ska inte lösas genom gissning i UI-koden.

### F. Hårdkodad special-/testlogik — GUL

Registreringsnummer som `GEU29F` förekommer både i dokumentation/test och i viss applikationslogik. Hårdkodade historiska specialfall ska inventeras separat och klassificeras som **behåll / reparera / ta bort** innan de rensas.

`LoginGate` innehåller dessutom en exakt, äldre security-preview-origin för OTP-flöde. Den påverkar inte normal Production-magic-link men är teknisk restskuld som kan tas bort först när ingen operativ preview är beroende av den.

### G. Dokumentation och gamla handover-issues — GUL

Äldre wiki och issues är värdefull historik men inte automatiskt aktuell sanning. Exempelvis beskriver `docs/wiki/OVERVIEW.md` fortfarande Next 14 och äldre driftantaganden.

Öppna handover-issues måste därför revalideras innan de behandlas som backlog:

- #118: datalagring/checklist-destillat — relevant kandidat för Steg 3-utvärdering;
- #119: historisk handover med flera TODOs — använd som evidens, inte direkt körplan;
- #138: blandar ett gammalt checkin-regressionsläge med framtida Nybil-krav — måste jämföras mot dagens Production innan åtgärd;
- #45: historisk hotfix-handover — inte aktuell merge-checklista.

## 7. Operativa regler efter takeover

1. Ändringar ska gå via fokuserad PR; merge endast när required checks är gröna.
2. `typecheck`-jobbet och Vercel-checken får inte kringgås för att få igenom en förändring.
3. Nya `/api/*`-vägar ska som standard ligga bakom samma serververifierade authgräns. `/api/health` är uttryckligt undantag.
4. Klientdata får inte vara auktoritativ källa för audit-identitet när servern kan härleda användaren från verifierad session.
5. Ingen `npm audit fix --force` eller major dependency-migrering utan separat analys och regression.
6. Ingen bred refaktorering av stora legacyfiler bara för kosmetisk kodkvalitet.
7. Inga destruktiva Production-write-tester utan uttrycklig testplan/testdata.
8. Databasschema, RLS, views, RPC, FKs och identifierare ska granskas samlat i Steg 3 innan cleanup/drop/migrering.
9. Vid konflikt mellan gammal wiki/handover och aktuell kod + verifierad Production gäller aktuell verifierad baseline tills motsatsen är bevisad.

## 8. Nästa steg — Steg 3: datamodell/databas

Steg 3 ska börja med inventering och evidens, inte schemaändring.

Ordning:

1. **Behålla:** identifiera tabeller, vyer, RPC:er, constraints, historik och fält som bär verkligt verksamhetsvärde.
2. **Reparera:** hitta brutna/otydliga relationer, identifierare, RLS/view-säkerhet, BUHS-mappning, `regnr`-normalisering och data-kontrakt mellan app och DB.
3. **Ta bort:** först efter verifierad oanvändning och migrations-/rollbackplan klassificera legacyfält, dubbla källor och död struktur.
4. **Addera:** först därefter nya FK:er, kanoniska modeller, event/process-stöd eller annan struktur som behövs för den framtida verksamhetskedjan.

Första DB-arbetet får **inte** vara att droppa eller massmigrera tabeller. Målet är en verifierad nulägeskarta som skyddar historik, evidens och fungerande processdata.

## 9. Takeover-konklusion

Steg 2 har flyttat systemet från **funktionellt men tekniskt riskfyllt att ta över** till **kontrollerbart och tekniskt övertagbart med kända gula skulder**.

Den fortsatta revisionslinjen är därför:

**behålla → reparera → ta bort → addera**

Nästa revisionspunkt är **Steg 3 — datamodell/databas**, inte ny funktionsutveckling eller bred kodstädning.
