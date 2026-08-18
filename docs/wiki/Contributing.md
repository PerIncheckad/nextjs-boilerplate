# Contributing & PR-process

> Se även [teknisk takeover-baseline 2026-08-18](../TECHNICAL_TAKEOVER_BASELINE_2026-08-18.md).

## Grundprincip

Arbeta i små, fokuserade PR:er enligt:

**behålla → reparera → ta bort → addera**

Stabil fungerande affärslogik, data och historik ska skyddas före cleanup eller nyutveckling.

## Branch & PR

- Arbeta på separat branch; inga avsiktliga direktändringar på `main`.
- Håll PR:en avgränsad till ett tekniskt eller funktionellt syfte.
- Beskriv syfte, risk, avgränsning och verifiering.
- Blanda inte dependency-major, databasmigrering, processändring och bred refaktorering i samma PR.
- Merge endast när required checks är gröna och PR-diffen är förstådd.

Repository-ruleset **Protect main** ska kräva PR samt statuschecks `typecheck / GitHub Actions` och `Vercel / Vercel`. Branch ska vara uppdaterad före merge; force-push och deletion ska förbli blockerade.

## Obligatorisk CI-grind

Jobben `typecheck` kör i ordning:

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run test:regression`
5. `npm run build`
6. `npm run test:security-runtime`

En PR ska inte mergas genom att stänga av en regel, ta bort test eller kringgå buildgrinden bara för att få grönt resultat.

## Testplan i PR-beskrivningen

Ange:

- vilka routes/flöden som påverkas;
- vilka kontrakt som ska förbli oförändrade;
- automatiska tester som täcker ändringen;
- eventuell manuell smoke;
- om data skrivs, exakt testdata/testmiljö och cleanup/rollback;
- vilka delar som **inte** verifierats.

## Säkerhetsregler för API

- Nya `/api/*`-routes ska som standard skyddas av befintlig `proxy.ts` / `verifyApiUser`-kedja. `/api/health` är uttryckligt undantag.
- Klientlevererad e-post/användaridentitet får inte behandlas som serververifierad audit-identitet.
- Service-role-logik ska ligga bakom serververifierad accessgräns.
- Skyddade same-origin API-anrop ska använda den etablerade autentiserade klient-fetchen.

## Production och data

- Gör inte riskfyllda write probes mot Production eller preview som kan dela Production-Supabase.
- För större write-förändringar: använd isolerad testdatabas/testprojekt eller uttryckligen kontrollerat testobjekt.
- Databasschema, RLS, views, RPC, FKs och legacyfält ska inte massändras utan separat datamodellrevision och rollbackplan.

## Kodkvalitet

- TypeScript-fel är blockerande.
- ESLint-error är blockerande.
- Befintliga legacy-suppressions är teknisk skuld, inte tillstånd att skapa nya träffar.
- 64 kända warnings från stabiliseringsbasen ska repareras inkrementellt när berörd kod ändå ändras.
- Undvik bred `any`-/React-hook-refaktorering utan funktionsspecifik regressionstäckning.

## Dependency-ändringar

- Ingen `npm audit fix --force`.
- Major framework/dependency-upgrade ska göras som egen, avgränsad migration med TypeScript, lint, audit, production build, runtime-smoke och Vercel verifierade.

## Dokumentation och historik

Äldre wiki/issue-handover kan vara historiskt värdefulla men är inte automatiskt aktuell sanning. Vid konflikt ska aktuell kod, verifierad Production och den tekniska takeover-baselinen vägas högre tills äldre krav har revaliderats.
